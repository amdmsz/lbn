import { randomUUID } from "node:crypto";
import {
  OperationModule,
  OperationTargetType,
  Prisma,
  type CallActionEvent,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const callActionNames = [
  "call.intent_requested",
  "call.intent_authorized",
  "call.intent_rejected",
  "call.provider_requested",
  "call.provider_accepted",
  "call.provider_ringing",
  "call.provider_answered",
  "call.provider_ended",
  "call.provider_canceled",
  "call.provider_failed",
  "call.native_dispatched",
  "call.native_permission_denied",
  "call.offhook_detected",
  "call.idle_detected",
  "call.recording_started",
  "call.recording_imported",
  "call.recording_file_ready",
  "call.recording_unsupported",
  "call.recording_failed",
  "call.upload_started",
  "call.upload_completed",
  "call.upload_failed",
  "call.followup_prompted",
  "call.followup_saved",
] as const;

export type CallActionName = (typeof callActionNames)[number];
export type CallMode = "crm-outbound" | "local-phone";

export type CallActionEventInput = {
  action: CallActionName;
  dedupeKey?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  callMode?: CallMode | null;
  customerId?: string | null;
  salesId?: string | null;
  callRecordId?: string | null;
  outboundSessionId?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  deviceModel?: string | null;
  androidVersion?: string | null;
  clientEventAt?: Date | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ClientCallActionEvent = {
  id: string;
  action: string;
  correlationId: string | null;
  callMode: string | null;
  serverReceivedAt: string;
  failureCode: string | null;
  failureMessage: string | null;
};

type CallActionEventDb = Pick<
  Prisma.TransactionClient,
  "callActionEvent" | "operationLog"
>;

const MAX_CORRELATION_ID_LENGTH = 191;

type PrismaWithOptionalCallActionEvent = typeof prisma & {
  callActionEvent?: typeof prisma.callActionEvent;
};

function getCallActionEventDelegate() {
  return (prisma as PrismaWithOptionalCallActionEvent).callActionEvent ?? null;
}

function asNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeCallCorrelationId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > MAX_CORRELATION_ID_LENGTH) {
    return null;
  }

  return normalized;
}

export function createServerCallCorrelationId(callMode: CallMode) {
  return `${callMode}:${randomUUID()}`;
}

export function parseCallClientEventAt(value: unknown) {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isCallActionEventUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function toInputJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function resolveOperationTarget(input: CallActionEventInput) {
  if (input.callRecordId) {
    return {
      targetType: OperationTargetType.CALL_RECORD,
      targetId: input.callRecordId,
    };
  }

  if (input.outboundSessionId) {
    return {
      targetType: OperationTargetType.OUTBOUND_CALL_SESSION,
      targetId: input.outboundSessionId,
    };
  }

  if (input.deviceId) {
    return {
      targetType: OperationTargetType.MOBILE_DEVICE,
      targetId: input.deviceId,
    };
  }

  if (input.customerId) {
    return {
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.customerId,
    };
  }

  throw new Error("Call action event requires a target id.");
}

function buildAuditPayload(
  input: CallActionEventInput,
  serverReceivedAt: Date,
) {
  return {
    action: input.action,
    dedupeKey: asNullableString(input.dedupeKey),
    correlationId: asNullableString(input.correlationId),
    callMode: input.callMode ?? null,
    actorId: asNullableString(input.actorId),
    customerId: asNullableString(input.customerId),
    salesId: asNullableString(input.salesId),
    callRecordId: asNullableString(input.callRecordId),
    outboundSessionId: asNullableString(input.outboundSessionId),
    deviceId: asNullableString(input.deviceId),
    appVersion: asNullableString(input.appVersion),
    deviceModel: asNullableString(input.deviceModel),
    androidVersion: asNullableString(input.androidVersion),
    clientEventAt: input.clientEventAt?.toISOString() ?? null,
    serverReceivedAt: serverReceivedAt.toISOString(),
    failureCode: asNullableString(input.failureCode),
    failureMessage: asNullableString(input.failureMessage),
    metadata: input.metadata ?? null,
  };
}

export async function createCallActionEvent(
  db: CallActionEventDb,
  input: CallActionEventInput,
) {
  const serverReceivedAt = new Date();
  const target = resolveOperationTarget(input);
  const payload = buildAuditPayload(input, serverReceivedAt);

  const event = await db.callActionEvent.create({
    data: {
      dedupeKey: payload.dedupeKey,
      correlationId: payload.correlationId,
      action: input.action,
      callMode: payload.callMode,
      customerId: payload.customerId,
      salesId: payload.salesId,
      actorId: payload.actorId,
      callRecordId: payload.callRecordId,
      outboundSessionId: payload.outboundSessionId,
      deviceId: payload.deviceId,
      appVersion: payload.appVersion,
      deviceModel: payload.deviceModel,
      androidVersion: payload.androidVersion,
      clientEventAt: input.clientEventAt ?? null,
      serverReceivedAt,
      failureCode: payload.failureCode,
      failureMessage: payload.failureMessage,
      metadataJson: input.metadata ? toInputJson(input.metadata) : undefined,
    },
    select: {
      id: true,
    },
  });

  await db.operationLog.create({
    data: {
      actorId: payload.actorId,
      module: OperationModule.CALL,
      action: input.action,
      targetType: target.targetType,
      targetId: target.targetId,
      description: input.description ?? input.action,
      afterData: toInputJson(payload),
    },
  });

  return event;
}

export async function recordCallActionEventBestEffort(
  input: CallActionEventInput,
) {
  try {
    return await prisma.$transaction((tx) => createCallActionEvent(tx, input));
  } catch (error) {
    if (isCallActionEventUniqueConflict(error)) {
      return null;
    }

    throw error;
  }
}

export async function findStartedOutboundCallByCorrelationId(input: {
  correlationId: string;
  customerId: string;
  salesId: string;
}) {
  const event = await prisma.callActionEvent.findFirst({
    where: {
      correlationId: input.correlationId,
      action: "call.intent_authorized",
      callMode: "crm-outbound",
      customerId: input.customerId,
      salesId: input.salesId,
      outboundSessionId: {
        not: null,
      },
    },
    orderBy: [{ serverReceivedAt: "desc" }, { id: "desc" }],
    select: {
      outboundSessionId: true,
    },
  });

  if (!event?.outboundSessionId) {
    return null;
  }

  return prisma.outboundCallSession.findUnique({
    where: { id: event.outboundSessionId },
    select: {
      id: true,
      callRecordId: true,
      provider: true,
      providerCallId: true,
      status: true,
    },
  });
}

export async function findStartedMobileCallByCorrelationId(input: {
  correlationId: string;
  customerId: string;
  salesId: string;
}) {
  const event = await prisma.callActionEvent.findFirst({
    where: {
      correlationId: input.correlationId,
      action: "call.intent_authorized",
      callMode: "local-phone",
      customerId: input.customerId,
      salesId: input.salesId,
      callRecordId: {
        not: null,
      },
    },
    orderBy: [{ serverReceivedAt: "desc" }, { id: "desc" }],
    select: {
      callRecordId: true,
    },
  });

  if (!event?.callRecordId) {
    return null;
  }

  return prisma.callRecord.findUnique({
    where: { id: event.callRecordId },
    select: {
      id: true,
    },
  });
}

export async function findLatestCallActionEventsByCallRecordIds(
  callRecordIds: readonly string[],
) {
  const uniqueCallRecordIds = Array.from(new Set(callRecordIds.filter(Boolean)));

  if (uniqueCallRecordIds.length === 0) {
    return new Map<string, ClientCallActionEvent>();
  }

  const callActionEvent = getCallActionEventDelegate();

  if (!callActionEvent) {
    console.warn(
      "Call action event Prisma delegate is unavailable; skipping latest call action lookup.",
    );
    return new Map<string, ClientCallActionEvent>();
  }

  let events: Array<
    Pick<
      CallActionEvent,
      | "id"
      | "action"
      | "correlationId"
      | "callMode"
      | "callRecordId"
      | "serverReceivedAt"
      | "failureCode"
      | "failureMessage"
    >
  >;

  try {
    events = await callActionEvent.findMany({
      where: {
        callRecordId: {
          in: uniqueCallRecordIds,
        },
      },
      orderBy: [{ serverReceivedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        action: true,
        correlationId: true,
        callMode: true,
        callRecordId: true,
        serverReceivedAt: true,
        failureCode: true,
        failureMessage: true,
      },
    });
  } catch (error) {
    console.warn("Failed to load latest call action events; skipping lookup.", error);
    return new Map<string, ClientCallActionEvent>();
  }

  const latestByCallRecordId = new Map<string, ClientCallActionEvent>();

  for (const event of events) {
    if (!event.callRecordId || latestByCallRecordId.has(event.callRecordId)) {
      continue;
    }

    latestByCallRecordId.set(event.callRecordId, mapCallActionEventForClient(event));
  }

  return latestByCallRecordId;
}

export function mapCallActionEventForClient(
  event: Pick<
    CallActionEvent,
    | "id"
    | "action"
    | "correlationId"
    | "callMode"
    | "serverReceivedAt"
    | "failureCode"
    | "failureMessage"
  >,
): ClientCallActionEvent {
  return {
    id: event.id,
    action: event.action,
    correlationId: event.correlationId,
    callMode: event.callMode,
    serverReceivedAt: event.serverReceivedAt.toISOString(),
    failureCode: event.failureCode,
    failureMessage: event.failureMessage,
  };
}
