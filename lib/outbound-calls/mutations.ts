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
} from "@/lib/outbound-calls/config";
import {
  maskPhoneForAudit,
  normalizeDialedPhone,
} from "@/lib/outbound-calls/metadata";
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
    text.includes("NO_ANSWER")
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
}) {
  const authorization = getHeader(input.headers, "authorization");

  if (authorization?.startsWith("Bearer ")) {
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
  const actorTeamId = await resolveActorTeamId(actor);
  const customerScope = getCustomerScope(actor.role, actor.id, actorTeamId);

  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
  }

  const config = await resolveOutboundCallRuntimeConfig();

  if (!config.enabled || !isRuntimeProviderEnabled(config.provider)) {
    throw new Error("外呼 CTI 尚未启用。");
  }

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
    throw new Error("销售只能拨打自己负责的客户。");
  }

  if (!customer.phone.trim()) {
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

  const created = await prisma.$transaction(async (tx) => {
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

    return session;
  });

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
    });

    return {
      sessionId: created.id,
      callRecordId: created.callRecordId,
      provider,
      providerCallId: result.providerCallId,
      status: nextStatus,
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
    });

    throw new Error(`外呼发起失败：${message}`);
  }
}

function parseWebhookEvent(provider: OutboundCallProvider, payload: Record<string, unknown>) {
  const eventId =
    asNonEmptyString(payload.eventId) ??
    asNonEmptyString(payload.id) ??
    asNonEmptyString(payload.uuid);
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

  if (config.requireWebhookSecret) {
    if (!config.secret) {
      throw new Error("外呼 Webhook 密钥未配置。");
    }

    verifyWebhookSecret({
      headers: input.headers,
      rawBody: input.rawBody,
      secret: config.secret,
      toleranceSeconds: config.webhookTimestampToleranceSeconds,
    });
  }

  const payload = safeJsonParse(input.rawBody);
  const event = parseWebhookEvent(provider, payload);
  const recordingImportRuntime = hasRecordingLocation(event)
    ? await resolveOutboundRecordingImportRuntime()
    : null;
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
        data: { durationSeconds },
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
            failureCode: event.failureCode,
          }),
        },
      });
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
