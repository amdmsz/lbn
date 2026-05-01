import crypto from "node:crypto";
import {
  OperationModule,
  OperationTargetType,
  Prisma,
  type OutboundCallProvider,
  type OutboundCallSessionStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessCustomerModule,
  canCreateCallRecord,
  getCustomerScope,
} from "@/lib/auth/access";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import {
  isRuntimeProviderEnabled,
  resolveOutboundCallRuntimeConfig,
  type ResolvedOutboundCallRuntimeConfig,
} from "@/lib/outbound-calls/config";
import {
  maskPhoneForAudit,
  normalizeDialedPhone,
} from "@/lib/outbound-calls/metadata";
import {
  createCallActionEvent,
  createServerCallCorrelationId,
  findStartedOutboundCallByCorrelationId,
  isCallActionEventUniqueConflict,
  normalizeCallCorrelationId,
  parseCallClientEventAt,
  recordCallActionEventBestEffort,
  type CallActionName,
} from "@/lib/calls/call-action-audit";
import { createOutboundCallProviderAdapter } from "@/lib/outbound-calls/providers";
import {
  resolveOutboundRecordingImportRuntime,
  upsertOutboundCallRecordingFromWebhook,
} from "@/lib/outbound-calls/recording-import";

export type OutboundCallActor = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

type HeaderBag = Headers | Record<string, string | string[] | undefined>;

const startOutboundCallSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户信息。"),
  correlationId: z.string().trim().max(191).optional(),
  clientEventAt: z.string().trim().optional(),
  triggerSource: z.string().trim().max(80).optional(),
});

const terminalStatuses = new Set<OutboundCallSessionStatus>([
  "ENDED",
  "FAILED",
  "CANCELED",
]);

const statusRank: Record<OutboundCallSessionStatus, number> = {
  REQUESTED: 1,
  PROVIDER_ACCEPTED: 2,
  RINGING: 3,
  ANSWERED: 4,
  ENDED: 5,
  FAILED: 5,
  CANCELED: 5,
};

function toJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function getHeader(headers: HeaderBag, key: string) {
  if (headers instanceof Headers) {
    return headers.get(key);
  }

  const value = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNonNegativeInt(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function parseDateOrNow(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function safeJsonParse(rawBody: string) {
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error("Webhook JSON 格式不正确。");
  }
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

function createWebhookEventId(
  provider: OutboundCallProvider,
  payload: Record<string, unknown>,
) {
  return `webhook_${provider.toLowerCase()}_${crypto
    .createHash("sha256")
    .update(stableJsonStringify(payload))
    .digest("hex")
    .slice(0, 32)}`;
}

function normalizeProvider(value: string): OutboundCallProvider | null {
  const provider = value.trim().toUpperCase();
  return provider === "MOCK" || provider === "FREESWITCH" || provider === "CUSTOM_HTTP"
    ? provider
    : null;
}

function normalizeWebhookStatus(value: unknown): OutboundCallSessionStatus | null {
  const text = String(value ?? "").trim().toUpperCase();

  if (!text) {
    return null;
  }

  if (text.includes("CANCEL")) {
    return "CANCELED";
  }

  if (
    text.includes("FAIL") ||
    text.includes("ERROR") ||
    text.includes("BUSY") ||
    text.includes("REJECT") ||
    text.includes("NO_ANSWER") ||
    text.includes("NO ANSWER") ||
    text.includes("NOANSWER") ||
    text.includes("CHANUNAVAIL") ||
    text.includes("CONGESTION")
  ) {
    return "FAILED";
  }

  if (
    text.includes("HANGUP") ||
    text.includes("ENDED") ||
    text.includes("COMPLETE") ||
    text === "END"
  ) {
    return "ENDED";
  }

  if (text.includes("ANSWER") || text.includes("BRIDGE")) {
    return "ANSWERED";
  }

  if (text.includes("RING") || text.includes("PROGRESS")) {
    return "RINGING";
  }

  if (text.includes("ACCEPT") || text === "OK" || text === "REQUESTED") {
    return "PROVIDER_ACCEPTED";
  }

  return null;
}

function appendRawEvent(
  current: Prisma.JsonValue | null,
  nextEvent: Record<string, unknown>,
) {
  const events = Array.isArray(current) ? current : [];
  const eventId = asNonEmptyString(nextEvent.eventId);

  if (
    eventId &&
    events.some(
      (item) =>
        item &&
        typeof item === "object" &&
        asNonEmptyString((item as Record<string, unknown>).eventId) === eventId,
    )
  ) {
    return {
      events,
      duplicate: true,
    };
  }

  return {
    events: [...events.slice(-49), nextEvent],
    duplicate: false,
  };
}

function verifySecretTimingSafe(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifyWebhookSecret(input: {
  headers: HeaderBag;
  rawBody: string;
  secret: string;
  toleranceSeconds: number;
  requireSignedTimestamp: boolean;
}) {
  const authorization = getHeader(input.headers, "authorization");

  if (!input.requireSignedTimestamp && authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();

    if (verifySecretTimingSafe(token, input.secret)) {
      return;
    }
  }

  const timestamp = getHeader(input.headers, "x-lbn-cti-timestamp");
  const signature = getHeader(input.headers, "x-lbn-cti-signature");

  if (!timestamp || !signature) {
    throw new Error("Webhook 缺少签名。");
  }

  const timestampMs = Number.parseInt(timestamp, 10) * 1000;

  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > input.toleranceSeconds * 1000
  ) {
    throw new Error("Webhook 签名时间戳已过期。");
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex")}`;

  if (!verifySecretTimingSafe(signature, expected)) {
    throw new Error("Webhook 签名不正确。");
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function isTruthyEnv(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function requiresSignedWebhookSecret() {
  return (
    isProductionRuntime() &&
    !isTruthyEnv(process.env.OUTBOUND_CALL_ALLOW_BEARER_WEBHOOK_SECRET)
  );
}

async function resolveActorTeamId(actor: OutboundCallActor) {
  if (actor.teamId !== undefined) {
    return actor.teamId ?? null;
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

async function resolveOutboundSeat(input: {
  salesId: string;
  provider: OutboundCallProvider;
}) {
  const [sales, binding] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.salesId },
      select: {
        id: true,
        username: true,
        name: true,
        teamId: true,
      },
    }),
    prisma.outboundCallSeatBinding.findFirst({
      where: {
        userId: input.salesId,
        provider: input.provider,
      },
      select: {
        id: true,
        seatNo: true,
        extensionNo: true,
        displayNumber: true,
        routingGroup: true,
        enabled: true,
      },
    }),
  ]);

  if (!sales) {
    throw new Error("当前销售账号不存在，无法发起外呼。");
  }

  if (binding && !binding.enabled) {
    throw new Error("当前销售的 CTI 坐席已被禁用。");
  }

  const defaultSeatNo = sales.username.trim();
  const seatNo = binding?.seatNo.trim() || defaultSeatNo;

  if (!seatNo) {
    throw new Error("当前销售账号缺少可用坐席号。");
  }

  return {
    sales,
    binding: binding ?? null,
    seatNo,
    source: binding ? "binding" : "username",
  } as const;
}

function assertOutboundStartRuntimeReady(
  config: ResolvedOutboundCallRuntimeConfig,
): asserts config is ResolvedOutboundCallRuntimeConfig & {
  provider: OutboundCallProvider;
} {
  if (!config.enabled || !isRuntimeProviderEnabled(config.provider)) {
    throw new Error("外呼 CTI 尚未启用。");
  }

  if (config.provider !== "MOCK" && !config.gatewayBaseUrl) {
    throw new Error("CTI Gateway Base URL 未配置。");
  }

  if (
    config.provider !== "MOCK" &&
    config.recordOnServer &&
    config.recordingImportMode === "WEBHOOK_URL" &&
    !config.webhookBaseUrl
  ) {
    throw new Error("外呼录音回调地址未配置，无法保证服务端录音归档。");
  }
}

function shouldAdvanceStatus(
  current: OutboundCallSessionStatus,
  next: OutboundCallSessionStatus | null,
) {
  if (!next) {
    return false;
  }

  if (terminalStatuses.has(current)) {
    return false;
  }

  return statusRank[next] >= statusRank[current];
}

export async function startOutboundCall(
  actor: OutboundCallActor,
  rawInput: z.input<typeof startOutboundCallSchema>,
) {
  if (!canAccessCustomerModule(actor.role)) {
    throw new Error("当前角色无权访问客户模块。");
  }

  if (!canCreateCallRecord(actor.role)) {
    throw new Error("当前角色不能发起外呼。");
  }

  const parsed = startOutboundCallSchema.parse(rawInput);
  const correlationId =
    normalizeCallCorrelationId(parsed.correlationId) ??
    createServerCallCorrelationId("crm-outbound");
  const clientEventAt = parseCallClientEventAt(parsed.clientEventAt);
  const triggerSource = parsed.triggerSource?.trim() || null;
  const actorTeamId = await resolveActorTeamId(actor);
  const customerScope = getCustomerScope(actor.role, actor.id, actorTeamId);

  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
  }

  const config = await resolveOutboundCallRuntimeConfig();
  assertOutboundStartRuntimeReady(config);

  const customer = await prisma.customer.findFirst({
    where: {
      id: parsed.customerId,
      ...customerScope,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      ownerId: true,
      owner: {
        select: {
          id: true,
          teamId: true,
        },
      },
    },
  });

  if (!customer) {
    throw new Error("客户不存在，或你无权访问该客户。");
  }

  await assertCustomerNotInActiveRecycleBin(prisma, customer.id);

  if (actor.role === "SALES" && customer.ownerId !== actor.id) {
    await recordCallActionEventBestEffort({
      action: "call.intent_rejected",
      actorId: actor.id,
      correlationId,
      callMode: "crm-outbound",
      customerId: customer.id,
      salesId: actor.id,
      clientEventAt,
      failureCode: "OWNER_FORBIDDEN",
      failureMessage: "销售只能拨打自己负责的客户。",
      description: `外呼请求被拒绝：${customer.name}`,
      metadata: { triggerSource },
    });

    throw new Error("销售只能拨打自己负责的客户。");
  }

  if (!customer.phone.trim()) {
    await recordCallActionEventBestEffort({
      action: "call.intent_rejected",
      actorId: actor.id,
      correlationId,
      callMode: "crm-outbound",
      customerId: customer.id,
      salesId: customer.ownerId ?? actor.id,
      clientEventAt,
      failureCode: "MISSING_PHONE",
      failureMessage: "客户没有可拨打号码。",
      description: `外呼请求被拒绝：${customer.name}`,
      metadata: { triggerSource },
    });

    throw new Error("客户没有可拨打号码。");
  }

  const provider = config.provider;
  const salesId = actor.role === "SALES" ? actor.id : customer.ownerId ?? actor.id;
  const outboundSeat = await resolveOutboundSeat({
    salesId,
    provider,
  });
  const seatBinding = outboundSeat.binding;
  const teamId = outboundSeat.sales.teamId ?? customer.owner?.teamId ?? actorTeamId;

  const callTime = new Date();
  const dialedNumber = normalizeDialedPhone(customer.phone, config.dialPrefix);
  const seatNo = outboundSeat.seatNo;
  const displayNumber =
    seatBinding?.displayNumber ?? config.defaultDisplayNumber ?? null;
  const routingGroup =
    seatBinding?.routingGroup ?? config.defaultRoutingGroup ?? null;
  const adapter = createOutboundCallProviderAdapter(provider, config);

  await recordCallActionEventBestEffort({
    action: "call.intent_requested",
    actorId: actor.id,
    correlationId,
    callMode: "crm-outbound",
    customerId: customer.id,
    salesId,
    clientEventAt,
    description: `外呼请求：${customer.name}`,
    metadata: { triggerSource },
  });

  const existingStartedCall = await findStartedOutboundCallByCorrelationId({
    correlationId,
    customerId: customer.id,
    salesId,
  });

  if (existingStartedCall) {
    return {
      sessionId: existingStartedCall.id,
      callRecordId: existingStartedCall.callRecordId,
      provider: existingStartedCall.provider,
      providerCallId: existingStartedCall.providerCallId,
      status: existingStartedCall.status,
      correlationId,
      idempotent: true,
    };
  }

  let created: { id: string; callRecordId: string };

  try {
    created = await prisma.$transaction(async (tx) => {
    const callRecord = await tx.callRecord.create({
      data: {
        customerId: customer.id,
        salesId,
        callTime,
        durationSeconds: 0,
      },
      select: { id: true },
    });

    const session = await tx.outboundCallSession.create({
      data: {
        callRecordId: callRecord.id,
        customerId: customer.id,
        salesId,
        teamId,
        seatBindingId: seatBinding?.id ?? null,
        provider,
        dialedNumber,
        displayNumber,
        seatNo,
        status: "REQUESTED",
        requestedAt: callTime,
        rawEventsJson: toJson([
          {
            type: "requested",
            at: callTime.toISOString(),
            actorId: actor.id,
          },
        ]),
      },
      select: {
        id: true,
        callRecordId: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "outbound_call.requested",
        targetType: OperationTargetType.OUTBOUND_CALL_SESSION,
        targetId: session.id,
        description: `CRM 外呼发起：${customer.name} (${maskPhoneForAudit(customer.phone)})`,
        afterData: toJson({
          sessionId: session.id,
          callRecordId: callRecord.id,
          customerId: customer.id,
          salesId,
          teamId,
          provider,
          seatNo,
          seatNoSource: outboundSeat.source,
          displayNumber,
          dialedNumberMasked: maskPhoneForAudit(dialedNumber),
          codec: config.codec,
          recordOnServer: config.recordOnServer,
        }),
      },
    });

    await createCallActionEvent(tx, {
      action: "call.intent_authorized",
      dedupeKey: `start:crm-outbound:${correlationId}`,
      actorId: actor.id,
      correlationId,
      callMode: "crm-outbound",
      customerId: customer.id,
      salesId,
      callRecordId: callRecord.id,
      outboundSessionId: session.id,
      clientEventAt,
      description: `外呼请求已授权：${customer.name}`,
      metadata: {
        triggerSource,
        teamId,
        provider,
        seatNo,
        seatNoSource: outboundSeat.source,
      },
    });

    await createCallActionEvent(tx, {
      action: "call.provider_requested",
      actorId: actor.id,
      correlationId,
      callMode: "crm-outbound",
      customerId: customer.id,
      salesId,
      callRecordId: callRecord.id,
      outboundSessionId: session.id,
      clientEventAt,
      description: `外呼已提交 CTI Gateway：${customer.name}`,
      metadata: {
        triggerSource,
        teamId,
        provider,
        seatNo,
        displayNumber,
        dialedNumberMasked: maskPhoneForAudit(dialedNumber),
        codec: config.codec,
        recordOnServer: config.recordOnServer,
      },
    });

    return session;
    });
  } catch (error) {
    if (isCallActionEventUniqueConflict(error)) {
      const existing = await findStartedOutboundCallByCorrelationId({
        correlationId,
        customerId: customer.id,
        salesId,
      });

      if (existing) {
        return {
          sessionId: existing.id,
          callRecordId: existing.callRecordId,
          provider: existing.provider,
          providerCallId: existing.providerCallId,
          status: existing.status,
          correlationId,
          idempotent: true,
        };
      }
    }

    throw error;
  }

  try {
    const result = await adapter.startOutboundCall({
      sessionId: created.id,
      callRecordId: created.callRecordId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      dialedNumber,
      salesId,
      seatNo,
      extensionNo: seatBinding?.extensionNo ?? null,
      displayNumber,
      routingGroup,
      codec: config.codec,
      recordOnServer: config.recordOnServer,
      webhookBaseUrl: config.webhookBaseUrl,
    });
    const acceptedAt = new Date();
    const nextStatus = result.initialStatus;

    await prisma.$transaction(async (tx) => {
      await tx.outboundCallSession.update({
        where: { id: created.id },
        data: {
          providerCallId: result.providerCallId,
          providerTraceId: result.providerTraceId,
          status: nextStatus,
          ringingAt: nextStatus === "RINGING" ? acceptedAt : undefined,
          answeredAt: nextStatus === "ANSWERED" ? acceptedAt : undefined,
          failureCode: nextStatus === "FAILED" ? "PROVIDER_FAILED" : null,
        },
        select: { id: true },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.CALL,
          action:
            nextStatus === "FAILED"
              ? "outbound_call.provider_failed"
              : "outbound_call.provider_accepted",
          targetType: OperationTargetType.OUTBOUND_CALL_SESSION,
          targetId: created.id,
          description:
            nextStatus === "FAILED"
              ? "CTI Gateway 已拒绝本次外呼。"
              : "CTI Gateway 已接收本次外呼。",
          afterData: toJson({
            sessionId: created.id,
            callRecordId: created.callRecordId,
            provider,
            providerCallId: result.providerCallId,
            providerTraceId: result.providerTraceId,
            status: nextStatus,
          }),
        },
      });

      await createCallActionEvent(tx, {
        action:
          nextStatus === "FAILED"
            ? "call.provider_failed"
            : "call.provider_accepted",
        actorId: actor.id,
        correlationId,
        callMode: "crm-outbound",
        customerId: customer.id,
        salesId,
        callRecordId: created.callRecordId,
        outboundSessionId: created.id,
        clientEventAt,
        failureCode: nextStatus === "FAILED" ? "PROVIDER_FAILED" : null,
        failureMessage:
          nextStatus === "FAILED" ? "CTI Gateway 已拒绝本次外呼。" : null,
        description:
          nextStatus === "FAILED"
            ? "CTI Gateway 已拒绝本次外呼。"
            : "CTI Gateway 已接收本次外呼。",
        metadata: {
          provider,
          providerCallId: result.providerCallId,
          providerTraceId: result.providerTraceId,
          status: nextStatus,
        },
      });
    });

    return {
      sessionId: created.id,
      callRecordId: created.callRecordId,
      provider,
      providerCallId: result.providerCallId,
      status: nextStatus,
      correlationId,
      idempotent: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "CTI Gateway 调用失败。";

    await prisma.$transaction(async (tx) => {
      await tx.outboundCallSession.update({
        where: { id: created.id },
        data: {
          status: "FAILED",
          failureCode: "START_FAILED",
          failureMessage: message,
          endedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.CALL,
          action: "outbound_call.start_failed",
          targetType: OperationTargetType.OUTBOUND_CALL_SESSION,
          targetId: created.id,
          description: "CRM 外呼发起失败。",
          afterData: toJson({
            sessionId: created.id,
            callRecordId: created.callRecordId,
            provider,
            failureMessage: message,
          }),
        },
      });

      await createCallActionEvent(tx, {
        action: "call.provider_failed",
        actorId: actor.id,
        correlationId,
        callMode: "crm-outbound",
        customerId: customer.id,
        salesId,
        callRecordId: created.callRecordId,
        outboundSessionId: created.id,
        clientEventAt,
        failureCode: "START_FAILED",
        failureMessage: message,
        description: "CRM 外呼发起失败。",
        metadata: {
          provider,
          failureMessage: message,
        },
      });
    });

    throw new Error(`外呼发起失败：${message}`);
  }
}

function parseWebhookEvent(provider: OutboundCallProvider, payload: Record<string, unknown>) {
  const eventId =
    asNonEmptyString(payload.eventId) ??
    asNonEmptyString(payload.id) ??
    asNonEmptyString(payload.eventUuid) ??
    createWebhookEventId(provider, payload);
  const providerCallId =
    asNonEmptyString(payload.providerCallId) ??
    asNonEmptyString(payload.callId) ??
    asNonEmptyString(payload.uniqueId) ??
    asNonEmptyString(payload.uuid);
  const status = normalizeWebhookStatus(
    payload.status ?? payload.event ?? payload.callStatus ?? payload.state,
  );
  const eventAt = parseDateOrNow(
    payload.eventAt ?? payload.timestamp ?? payload.time ?? payload.createdAt,
  );

  return {
    provider,
    eventId,
    sessionId:
      asNonEmptyString(payload.sessionId) ??
      asNonEmptyString(payload.correlationId) ??
      asNonEmptyString(payload.crmSessionId),
    callRecordId:
      asNonEmptyString(payload.callRecordId) ??
      asNonEmptyString(payload.crmCallRecordId),
    providerCallId,
    providerTraceId:
      asNonEmptyString(payload.providerTraceId) ??
      asNonEmptyString(payload.traceId) ??
      asNonEmptyString(payload.requestId),
    status,
    eventAt,
    durationSeconds: asNonNegativeInt(
      payload.durationSeconds ?? payload.billsec ?? payload.duration,
    ),
    failureCode:
      asNonEmptyString(payload.failureCode) ??
      asNonEmptyString(payload.hangupCause),
    failureMessage:
      asNonEmptyString(payload.failureMessage) ??
      asNonEmptyString(payload.message) ??
      asNonEmptyString(payload.reason),
    recordingUrl:
      asNonEmptyString(payload.recordingUrl) ??
      asNonEmptyString(payload.recordUrl) ??
      asNonEmptyString(payload.url),
    recordingPath:
      asNonEmptyString(payload.recordingPath) ??
      asNonEmptyString(payload.recordingFilePath) ??
      asNonEmptyString(payload.recordingFile),
    recordingStorageKey:
      asNonEmptyString(payload.recordingStorageKey) ??
      asNonEmptyString(payload.storageKey),
    recordingExternalId:
      asNonEmptyString(payload.recordingExternalId) ??
      asNonEmptyString(payload.recordingId) ??
      asNonEmptyString(payload.uniqueId),
    recordingMimeType:
      asNonEmptyString(payload.recordingMimeType) ??
      asNonEmptyString(payload.mimeType) ??
      asNonEmptyString(payload.contentType),
    recordingCodec:
      asNonEmptyString(payload.recordingCodec) ??
      asNonEmptyString(payload.codec),
    rawCdrJson: payload.cdr ?? payload.rawCdr ?? null,
  };
}

function hasRecordingLocation(event: ReturnType<typeof parseWebhookEvent>) {
  return Boolean(
    event.recordingStorageKey || event.recordingPath || event.recordingUrl,
  );
}

function shouldImportRecordingFromWebhook(
  event: ReturnType<typeof parseWebhookEvent>,
  nextStatus: OutboundCallSessionStatus,
) {
  if (!hasRecordingLocation(event)) {
    return false;
  }

  if (nextStatus !== "ENDED" && nextStatus !== "ANSWERED") {
    return false;
  }

  return event.durationSeconds === null || event.durationSeconds > 0;
}

function shouldExpectServerRecordingFromWebhook(input: {
  recordOnServer: boolean;
  nextStatus: OutboundCallSessionStatus;
  durationSeconds?: number | null;
}) {
  return (
    input.recordOnServer &&
    input.nextStatus === "ENDED" &&
    (input.durationSeconds ?? 0) > 0
  );
}

function getWebhookCallAction(
  status: OutboundCallSessionStatus | null,
): CallActionName | null {
  switch (status) {
    case "PROVIDER_ACCEPTED":
      return "call.provider_accepted";
    case "RINGING":
      return "call.provider_ringing";
    case "ANSWERED":
      return "call.provider_answered";
    case "ENDED":
      return "call.provider_ended";
    case "CANCELED":
      return "call.provider_canceled";
    case "FAILED":
      return "call.provider_failed";
    case "REQUESTED":
    default:
      return null;
  }
}

function inferCallResultCodeFromOutboundFailure(input: {
  failureCode?: string | null;
}) {
  const code = input.failureCode?.trim().toUpperCase();

  if (!code) {
    return null;
  }

  if (["CUSTOMER_NO_ANSWER", "NOANSWER", "NO_ANSWER", "NO ANSWER"].includes(code)) {
    return "NOT_CONNECTED";
  }

  if (
    ["CUSTOMER_BUSY", "CUSTOMER_REJECTED", "BUSY", "REJECTED"].includes(code)
  ) {
    return "HUNG_UP";
  }

  if (["INVALID_NUMBER", "UNALLOCATED_NUMBER", "CHANUNAVAIL"].includes(code)) {
    return "INVALID_NUMBER";
  }

  return null;
}

export async function handleOutboundCallWebhook(input: {
  provider: string;
  headers: HeaderBag;
  rawBody: string;
}) {
  const provider = normalizeProvider(input.provider);

  if (!provider) {
    throw new Error("外呼 Provider 不受支持。");
  }

  const config = await resolveOutboundCallRuntimeConfig();
  const requireWebhookSecret =
    config.requireWebhookSecret || isProductionRuntime();

  if (requireWebhookSecret) {
    if (!config.secret) {
      throw new Error("外呼 Webhook 密钥未配置。");
    }

    verifyWebhookSecret({
      headers: input.headers,
      rawBody: input.rawBody,
      secret: config.secret,
      toleranceSeconds: config.webhookTimestampToleranceSeconds,
      requireSignedTimestamp: requiresSignedWebhookSecret(),
    });
  }

  const payload = safeJsonParse(input.rawBody);
  const event = parseWebhookEvent(provider, payload);
  const filters: Prisma.OutboundCallSessionWhereInput[] = [];

  if (event.sessionId) {
    filters.push({ id: event.sessionId });
  }

  if (event.callRecordId) {
    filters.push({ callRecordId: event.callRecordId });
  }

  if (event.providerCallId) {
    filters.push({ provider, providerCallId: event.providerCallId });
  }

  if (filters.length === 0) {
    throw new Error("Webhook 缺少可关联的 sessionId、callRecordId 或 providerCallId。");
  }

  const session = await prisma.outboundCallSession.findFirst({
    where: { OR: filters },
    select: {
      id: true,
      callRecordId: true,
      provider: true,
      providerCallId: true,
      providerTraceId: true,
      status: true,
      ringingAt: true,
      answeredAt: true,
      endedAt: true,
      durationSeconds: true,
      rawEventsJson: true,
      customerId: true,
      salesId: true,
      teamId: true,
      callRecord: {
        select: {
          result: true,
          resultCode: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!session) {
    return {
      handled: false,
      status: "IGNORED",
      message: "未找到可关联的外呼会话。",
    };
  }

  const appended = appendRawEvent(session.rawEventsJson, {
    eventId: event.eventId,
    providerCallId: event.providerCallId,
    status: event.status,
    at: event.eventAt.toISOString(),
    payload,
  });
  const shouldSetStatus = shouldAdvanceStatus(session.status, event.status);
  const nextStatus: OutboundCallSessionStatus =
    shouldSetStatus && event.status ? event.status : session.status;
  const endedAt =
    nextStatus && terminalStatuses.has(nextStatus) && !session.endedAt
      ? event.eventAt
      : undefined;
  const durationSeconds =
    event.durationSeconds ?? session.durationSeconds ?? undefined;
  const shouldImportRecording = shouldImportRecordingFromWebhook(
    event,
    nextStatus,
  );
  const serverRecordingExpected = shouldExpectServerRecordingFromWebhook({
    recordOnServer: config.recordOnServer,
    nextStatus,
    durationSeconds,
  });
  const recordingLocationMissing =
    serverRecordingExpected && !hasRecordingLocation(event);
  const webhookAction = getWebhookCallAction(event.status);
  const recordingImportRuntime = shouldImportRecording
    ? await resolveOutboundRecordingImportRuntime()
    : null;
  const inferredFailedResultCode =
    nextStatus === "FAILED" &&
    !session.callRecord.resultCode &&
    !session.callRecord.result
      ? inferCallResultCodeFromOutboundFailure({
          failureCode: event.failureCode,
        })
      : null;
  let recordingImportResult: Awaited<
    ReturnType<typeof upsertOutboundCallRecordingFromWebhook>
  > | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.outboundCallSession.update({
      where: { id: session.id },
      data: {
        providerCallId: session.providerCallId ?? event.providerCallId,
        providerTraceId: session.providerTraceId ?? event.providerTraceId,
        status: nextStatus,
        ringingAt:
          nextStatus === "RINGING" && !session.ringingAt ? event.eventAt : undefined,
        answeredAt:
          nextStatus === "ANSWERED" && !session.answeredAt
            ? event.eventAt
            : undefined,
        endedAt,
        durationSeconds,
        failureCode:
          nextStatus === "FAILED" ? event.failureCode ?? "PROVIDER_FAILED" : undefined,
        failureMessage:
          nextStatus === "FAILED" ? event.failureMessage ?? null : undefined,
        recordingUrl: event.recordingUrl ?? undefined,
        recordingExternalId: event.recordingExternalId ?? undefined,
        rawCdrJson:
          event.rawCdrJson === null ? undefined : toJson(event.rawCdrJson),
        rawEventsJson: toJson(appended.events),
      },
      select: { id: true },
    });

    if (
      durationSeconds !== undefined &&
      nextStatus &&
      terminalStatuses.has(nextStatus)
    ) {
      await tx.callRecord.update({
        where: { id: session.callRecordId },
        data: {
          durationSeconds,
          resultCode: inferredFailedResultCode ?? undefined,
        },
        select: { id: true },
      });
    }

    if (!appended.duplicate) {
      await tx.operationLog.create({
        data: {
          actorId: null,
          module: OperationModule.CALL,
          action: "outbound_call.webhook_received",
          targetType: OperationTargetType.OUTBOUND_CALL_SESSION,
          targetId: session.id,
          description: `外呼回调：${session.customer.name} (${maskPhoneForAudit(session.customer.phone)})`,
          afterData: toJson({
            sessionId: session.id,
            callRecordId: session.callRecordId,
            provider,
            providerCallId: event.providerCallId,
            status: nextStatus,
            incomingStatus: event.status,
            durationSeconds,
            recordingUrlConfigured: Boolean(event.recordingUrl),
            recordingPathConfigured: Boolean(
              event.recordingPath || event.recordingStorageKey,
            ),
            recordingImportEligible: shouldImportRecording,
            recordingExpected: serverRecordingExpected,
            recordingLocationMissing,
            failureCode: event.failureCode,
            inferredFailedResultCode,
          }),
        },
      });

      if (webhookAction) {
        await createCallActionEvent(tx, {
          action: webhookAction,
          dedupeKey: `webhook:crm-outbound:${session.id}:${event.eventId}`,
          actorId: null,
          correlationId: event.eventId,
          callMode: "crm-outbound",
          customerId: session.customerId,
          salesId: session.salesId,
          callRecordId: session.callRecordId,
          outboundSessionId: session.id,
          clientEventAt: event.eventAt,
          failureCode:
            nextStatus === "FAILED"
              ? event.failureCode ?? "PROVIDER_FAILED"
              : nextStatus === "CANCELED"
                ? event.failureCode ?? "PROVIDER_CANCELED"
                : null,
          failureMessage:
            nextStatus === "FAILED" || nextStatus === "CANCELED"
              ? event.failureMessage ?? null
              : null,
          description: `外呼状态回调：${session.customer.name}`,
          metadata: {
            provider,
            providerCallId: event.providerCallId,
            incomingStatus: event.status,
            status: nextStatus,
            durationSeconds,
            eventId: event.eventId,
            recordingExpected: serverRecordingExpected,
            recordingLocationMissing,
          },
        });
      }
    }

    if (recordingImportRuntime && !appended.duplicate) {
      recordingImportResult = await upsertOutboundCallRecordingFromWebhook({
        tx,
        session: {
          id: session.id,
          callRecordId: session.callRecordId,
          customerId: session.customerId,
          salesId: session.salesId,
          teamId: session.teamId,
          customer: session.customer,
        },
        event,
        runtime: recordingImportRuntime,
      });

      if (recordingImportResult.imported) {
        await tx.outboundCallSession.update({
          where: { id: session.id },
          data: {
            recordingImportedAt: event.eventAt,
          },
          select: { id: true },
        });
      }

      if (recordingImportResult.imported) {
        await createCallActionEvent(tx, {
          action: "call.recording_imported",
          dedupeKey: `recording-import:crm-outbound:${session.id}:${event.eventId}`,
          actorId: null,
          correlationId: event.eventId,
          callMode: "crm-outbound",
          customerId: session.customerId,
          salesId: session.salesId,
          callRecordId: session.callRecordId,
          outboundSessionId: session.id,
          clientEventAt: event.eventAt,
          description: `外呼录音已归档：${session.customer.name}`,
          metadata: {
            provider,
            providerCallId: event.providerCallId,
            recordingId: recordingImportResult.recordingId,
            storageKey: recordingImportResult.storageKey,
            aiEnqueued: recordingImportResult.aiEnqueued,
          },
        });
      } else if ("skipped" in recordingImportResult && recordingImportResult.skipped) {
        await createCallActionEvent(tx, {
          action: "call.recording_failed",
          dedupeKey: `recording-skip:crm-outbound:${session.id}:${event.eventId}`,
          actorId: null,
          correlationId: event.eventId,
          callMode: "crm-outbound",
          customerId: session.customerId,
          salesId: session.salesId,
          callRecordId: session.callRecordId,
          outboundSessionId: session.id,
          clientEventAt: event.eventAt,
          failureCode: recordingImportResult.skipCode,
          failureMessage: "外呼录音未能导入 CRM。",
          description: `外呼录音未导入：${session.customer.name}`,
          metadata: {
            provider,
            providerCallId: event.providerCallId,
            storageKey: recordingImportResult.storageKey,
            skipCode: recordingImportResult.skipCode,
          },
        });
      }
    } else if (recordingLocationMissing && !appended.duplicate) {
      await createCallActionEvent(tx, {
        action: "call.recording_failed",
        dedupeKey: `recording-missing:crm-outbound:${session.id}:${event.eventId}`,
        actorId: null,
        correlationId: event.eventId,
        callMode: "crm-outbound",
        customerId: session.customerId,
        salesId: session.salesId,
        callRecordId: session.callRecordId,
        outboundSessionId: session.id,
        clientEventAt: event.eventAt,
        failureCode: "RECORDING_LOCATION_MISSING",
        failureMessage: "外呼已结束且有有效通话时长，但回调未携带录音位置。",
        description: `外呼录音缺失：${session.customer.name}`,
        metadata: {
          provider,
          providerCallId: event.providerCallId,
          durationSeconds,
          recordOnServer: config.recordOnServer,
        },
      });
    }
  });

  return {
    handled: true,
    duplicate: appended.duplicate,
    sessionId: session.id,
    callRecordId: session.callRecordId,
    status: nextStatus,
    recordingImport: recordingImportResult,
  };
}
