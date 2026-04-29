import {
  LogisticsExceptionType,
  LogisticsFollowUpTaskStatus,
  OperationModule,
  OperationTargetType,
  ShippingFulfillmentStatus,
  ShippingTaskStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { evaluateLogisticsAddressMatch } from "@/lib/logistics/address-match";
import {
  getNextCostAwareLogisticsCheckAt,
  getUnsignedExceptionDeadlineAt,
  isUnsignedShipmentOverdue,
  resolveLogisticsTraceSignal,
  type LogisticsTraceSignal,
} from "@/lib/logistics/auto-status-rules";
import { getReceiverPhoneTail } from "@/lib/logistics/metadata";
import { queryShippingLogisticsTrace, type LogisticsTraceResult } from "@/lib/logistics/provider";

type LogisticsAutoStatusLogger = {
  info: (payload: Record<string, unknown>) => void;
  warn: (payload: Record<string, unknown>) => void;
  error: (payload: Record<string, unknown>) => void;
};

export type LogisticsAutoStatusWorkerOptions = {
  limit: number;
  dryRun?: boolean;
  actorId?: string | null;
  logger?: LogisticsAutoStatusLogger;
};

export type LogisticsAutoStatusWorkerResult = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  scannedCount: number;
  processedCount: number;
  completedCount: number;
  exceptionCount: number;
  queryFailedCount: number;
  skippedCount: number;
  failedCount: number;
};

type DueLogisticsTask = Awaited<ReturnType<typeof loadDueLogisticsTasks>>[number];

type ProcessOutcome =
  | "CHECKED"
  | "AUTO_COMPLETED"
  | "EXCEPTION"
  | "QUERY_FAILED"
  | "SKIPPED";

const defaultLogger: LogisticsAutoStatusLogger = {
  info(payload) {
    console.log(JSON.stringify(payload));
  },
  warn(payload) {
    console.warn(JSON.stringify(payload));
  },
  error(payload) {
    console.error(JSON.stringify(payload));
  },
};

function normalizeLimit(limit: number) {
  return Math.max(1, Math.min(200, Number.isFinite(limit) ? Math.floor(limit) : 50));
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function mapFulfillmentStatusToLegacyTaskStatus(status: ShippingFulfillmentStatus) {
  switch (status) {
    case ShippingFulfillmentStatus.READY_TO_SHIP:
      return ShippingTaskStatus.PROCESSING;
    case ShippingFulfillmentStatus.SHIPPED:
      return ShippingTaskStatus.SHIPPED;
    case ShippingFulfillmentStatus.DELIVERED:
    case ShippingFulfillmentStatus.COMPLETED:
      return ShippingTaskStatus.COMPLETED;
    case ShippingFulfillmentStatus.CANCELED:
      return ShippingTaskStatus.CANCELED;
    case ShippingFulfillmentStatus.PENDING:
    default:
      return ShippingTaskStatus.PENDING;
  }
}

async function loadDueLogisticsTasks(input: { now: Date; limit: number }) {
  return prisma.logisticsFollowUpTask.findMany({
    where: {
      status: {
        in: [LogisticsFollowUpTaskStatus.PENDING, LogisticsFollowUpTaskStatus.IN_PROGRESS],
      },
      nextTriggerAt: {
        lte: input.now,
      },
      shippingTask: {
        is: {
          trackingNumber: {
            not: null,
          },
          shippingStatus: {
            in: [ShippingFulfillmentStatus.SHIPPED, ShippingFulfillmentStatus.DELIVERED],
          },
          logisticsExceptionType: null,
        },
      },
    },
    orderBy: [{ nextTriggerAt: "asc" }, { createdAt: "asc" }],
    take: input.limit,
    select: {
      id: true,
      salesOrderId: true,
      shippingTaskId: true,
      customerId: true,
      intervalDays: true,
      nextTriggerAt: true,
      createdAt: true,
      shippingTask: {
        select: {
          id: true,
          tradeOrderId: true,
          salesOrderId: true,
          shippingProvider: true,
          carrier: true,
          trackingNumber: true,
          shippingStatus: true,
          shippedAt: true,
          completedAt: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          salesOrder: {
            select: {
              id: true,
              orderNo: true,
              subOrderNo: true,
              receiverPhoneSnapshot: true,
            },
          },
        },
      },
    },
  });
}

function buildTraceSnapshot(trace: LogisticsTraceResult) {
  return {
    logisticsLastCheckedAt: new Date(),
    logisticsLastStatusCode: trace.currentStatusCode,
    logisticsLastStatusLabel: trace.currentStatusLabel,
    logisticsLastEventAt: trace.lastUpdatedAt ? new Date(trace.lastUpdatedAt) : null,
  };
}

function getOutcomeAction(outcome: ProcessOutcome) {
  switch (outcome) {
    case "AUTO_COMPLETED":
      return "logistics_auto_status.auto_completed";
    case "EXCEPTION":
      return "logistics_auto_status.exception_detected";
    case "QUERY_FAILED":
      return "logistics_auto_status.query_failed";
    case "SKIPPED":
      return "logistics_auto_status.skipped";
    case "CHECKED":
    default:
      return "logistics_auto_status.checked";
  }
}

function getOutcomeDescription(input: {
  outcome: ProcessOutcome;
  signal: LogisticsTraceSignal;
}) {
  switch (input.outcome) {
    case "AUTO_COMPLETED":
      return "物流智能检查：轨迹已签收，履约状态更新为已完成并关闭后续检查。";
    case "EXCEPTION":
      return "物流智能检查：检测到物流异常。";
    case "QUERY_FAILED":
      return "物流智能检查：物流轨迹查询失败，等待下一次低频检查。";
    case "SKIPPED":
      return "物流智能检查：跳过本次处理。";
    case "CHECKED":
    default:
      return `物流智能检查：当前轨迹信号为 ${input.signal}，等待下一次低频检查。`;
  }
}

async function markTaskSkipped(input: {
  row: DueLogisticsTask;
  now: Date;
  actorId?: string | null;
  reason: string;
}) {
  const nextTriggerAt =
    getNextCostAwareLogisticsCheckAt({
      now: input.now,
      shippedAt: input.row.shippingTask.shippedAt,
      taskCreatedAt: input.row.createdAt,
    }) ?? input.now;

  await prisma.$transaction(async (tx) => {
    await tx.logisticsFollowUpTask.update({
      where: { id: input.row.id },
      data: {
        status: LogisticsFollowUpTaskStatus.IN_PROGRESS,
        lastTriggeredAt: input.now,
        nextTriggerAt,
        remark: input.reason,
      },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: input.actorId || null,
        module: OperationModule.LOGISTICS,
        action: getOutcomeAction("SKIPPED"),
        targetType: OperationTargetType.LOGISTICS_FOLLOW_UP_TASK,
        targetId: input.row.id,
        description: input.reason,
        afterData: toPrismaJson({
          salesOrderId: input.row.salesOrderId,
          shippingTaskId: input.row.shippingTaskId,
          nextTriggerAt,
        }),
      },
    });
  });
}

async function applyTraceDecision(input: {
  row: DueLogisticsTask;
  now: Date;
  actorId?: string | null;
  trace: LogisticsTraceResult;
}) {
  const { row, now, actorId, trace } = input;
  const shippingTask = row.shippingTask;
  const signal = resolveLogisticsTraceSignal(trace);
  const isOverdueUnsigned = isUnsignedShipmentOverdue({
    now,
    shippedAt: shippingTask.shippedAt,
    taskCreatedAt: row.createdAt,
  });
  const unsignedDeadlineAt = getUnsignedExceptionDeadlineAt({
    shippedAt: shippingTask.shippedAt,
    taskCreatedAt: row.createdAt,
  });
  const addressMatch = evaluateLogisticsAddressMatch({
    receiverAddress: shippingTask.receiverAddressSnapshot,
    latestEvent: trace.latestEvent,
    checkpoints: trace.checkpoints,
  });

  let outcome: ProcessOutcome = "CHECKED";
  let nextShippingStatus = shippingTask.shippingStatus;
  let nextCompletedAt = shippingTask.completedAt;
  let nextTaskStatus: LogisticsFollowUpTaskStatus = LogisticsFollowUpTaskStatus.IN_PROGRESS;
  let nextTriggerAt =
    getNextCostAwareLogisticsCheckAt({
      now,
      shippedAt: shippingTask.shippedAt,
      taskCreatedAt: row.createdAt,
    }) ?? now;
  const nextIntervalDays = 2;
  let exceptionType: LogisticsExceptionType | null = null;
  let exceptionMessage: string | null = null;

  if (trace.mode === "not_configured" || signal === "QUERY_FAILED") {
    outcome = isOverdueUnsigned ? "EXCEPTION" : "QUERY_FAILED";
    if (isOverdueUnsigned) {
      exceptionType = LogisticsExceptionType.TRACE_QUERY_FAILED;
      exceptionMessage = trace.message || "发货超过 7 天仍无法确认签收，且物流轨迹查询失败，请人工核对。";
    }
  } else if (addressMatch.status === "MISMATCH") {
    outcome = "EXCEPTION";
    exceptionType = LogisticsExceptionType.ADDRESS_MISMATCH;
    exceptionMessage = `${addressMatch.reason} 轨迹：${addressMatch.evidence ?? "未知"}。`;
  } else if (signal === "RETURN_OR_REJECTED") {
    outcome = "EXCEPTION";
    exceptionType = LogisticsExceptionType.RETURN_OR_REJECTED;
    exceptionMessage = trace.latestEvent?.description || trace.currentStatusLabel || "物流轨迹显示退回、拒收或问题件。";
  } else if (signal === "DELIVERED") {
    outcome = "AUTO_COMPLETED";
    nextShippingStatus = ShippingFulfillmentStatus.COMPLETED;
    nextCompletedAt = shippingTask.completedAt ?? now;
    nextTaskStatus = LogisticsFollowUpTaskStatus.DONE;
    nextTriggerAt = now;
  } else if (isOverdueUnsigned) {
    outcome = "EXCEPTION";
    exceptionType = LogisticsExceptionType.OVERDUE_NOT_SIGNED;
    exceptionMessage = `发货超过 7 天仍未检测到签收轨迹，签收截止参考时间：${unsignedDeadlineAt.toISOString()}。`;
  }

  const traceSnapshot = buildTraceSnapshot(trace);
  const shouldCloseTask = nextTaskStatus === LogisticsFollowUpTaskStatus.DONE || Boolean(exceptionType);
  const operationDescription = getOutcomeDescription({ outcome, signal });

  await prisma.$transaction(async (tx) => {
    await tx.shippingTask.update({
      where: { id: shippingTask.id },
      data: {
        shippingStatus: nextShippingStatus,
        status: mapFulfillmentStatusToLegacyTaskStatus(nextShippingStatus),
        completedAt: nextCompletedAt,
        logisticsLastCheckedAt: traceSnapshot.logisticsLastCheckedAt,
        logisticsLastStatusCode: traceSnapshot.logisticsLastStatusCode,
        logisticsLastStatusLabel: traceSnapshot.logisticsLastStatusLabel,
        logisticsLastEventAt: traceSnapshot.logisticsLastEventAt,
        logisticsExceptionType: exceptionType,
        logisticsExceptionDetectedAt: exceptionType ? now : null,
        logisticsExceptionMessage: exceptionMessage,
      },
      select: { id: true },
    });

    if (shouldCloseTask) {
      await tx.logisticsFollowUpTask.updateMany({
        where: {
          shippingTaskId: shippingTask.id,
          status: {
            in: [LogisticsFollowUpTaskStatus.PENDING, LogisticsFollowUpTaskStatus.IN_PROGRESS],
          },
        },
        data: {
          status: exceptionType ? LogisticsFollowUpTaskStatus.CANCELED : LogisticsFollowUpTaskStatus.DONE,
          lastTriggeredAt: now,
          lastFollowedUpAt: now,
          closedAt: now,
          remark: operationDescription,
        },
      });
    } else {
      await tx.logisticsFollowUpTask.update({
        where: { id: row.id },
        data: {
          status: LogisticsFollowUpTaskStatus.IN_PROGRESS,
          intervalDays: nextIntervalDays,
          nextTriggerAt,
          lastTriggeredAt: now,
          lastFollowedUpAt: now,
          remark: operationDescription,
        },
        select: { id: true },
      });
    }

    await tx.operationLog.create({
      data: {
        actorId: actorId || null,
        module: OperationModule.LOGISTICS,
        action: getOutcomeAction(outcome),
        targetType: OperationTargetType.SHIPPING_TASK,
        targetId: shippingTask.id,
        description: operationDescription,
        beforeData: toPrismaJson({
          shippingStatus: shippingTask.shippingStatus,
          completedAt: shippingTask.completedAt,
          logisticsExceptionType: null,
        }),
        afterData: toPrismaJson({
          signal,
          outcome,
          shippingStatus: nextShippingStatus,
          completedAt: nextCompletedAt,
          exceptionType,
          exceptionMessage,
          addressMatch,
          trace: {
            mode: trace.mode,
            statusCode: trace.currentStatusCode,
            statusLabel: trace.currentStatusLabel,
            latestEvent: trace.latestEvent,
            lastUpdatedAt: trace.lastUpdatedAt,
            message: trace.message,
          },
          salesOrderId: row.salesOrderId,
          shippingTaskId: shippingTask.id,
          tradeOrderId: shippingTask.tradeOrderId,
          unsignedDeadlineAt,
          nextTriggerAt: shouldCloseTask ? null : nextTriggerAt,
        }),
      },
    });
  });

  return outcome;
}

async function processDueLogisticsTask(input: {
  row: DueLogisticsTask;
  now: Date;
  actorId?: string | null;
  logger: LogisticsAutoStatusLogger;
}) {
  const trackingNumber = input.row.shippingTask.trackingNumber?.trim();

  if (!trackingNumber) {
    await markTaskSkipped({
      row: input.row,
      now: input.now,
      actorId: input.actorId,
      reason: "物流自动检查跳过：物流单号为空。",
    });
    return "SKIPPED" satisfies ProcessOutcome;
  }

  const receiverPhoneTail = getReceiverPhoneTail(
    input.row.shippingTask.receiverPhoneSnapshot ||
      input.row.shippingTask.salesOrder?.receiverPhoneSnapshot,
  );

  const trace = await queryShippingLogisticsTrace({
    shippingProvider: input.row.shippingTask.shippingProvider,
    carrier: input.row.shippingTask.carrier,
    trackingNumber,
    receiverPhoneTail,
  });

  const outcome = await applyTraceDecision({
    row: input.row,
    now: input.now,
    actorId: input.actorId,
    trace,
  });

  input.logger.info({
    event: "logistics_auto_status.processed",
    logisticsFollowUpTaskId: input.row.id,
    shippingTaskId: input.row.shippingTaskId,
    salesOrderId: input.row.salesOrderId,
    outcome,
    traceMode: trace.mode,
    traceStatusCode: trace.currentStatusCode,
  });

  return outcome;
}

export async function runLogisticsAutoStatusBatch(
  options: LogisticsAutoStatusWorkerOptions,
): Promise<LogisticsAutoStatusWorkerResult> {
  const startedAt = new Date();
  const now = new Date();
  const logger = options.logger ?? defaultLogger;
  const limit = normalizeLimit(options.limit);
  const rows = await loadDueLogisticsTasks({ now, limit });

  if (options.dryRun) {
    for (const row of rows) {
      logger.info({
        event: "logistics_auto_status.dry_run_candidate",
        logisticsFollowUpTaskId: row.id,
        shippingTaskId: row.shippingTaskId,
        salesOrderId: row.salesOrderId,
        nextTriggerAt: row.nextTriggerAt,
        intervalDays: row.intervalDays,
        shippingStatus: row.shippingTask.shippingStatus,
        trackingTail: row.shippingTask.trackingNumber?.slice(-4) ?? null,
      });
    }

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      dryRun: true,
      scannedCount: rows.length,
      processedCount: 0,
      completedCount: 0,
      exceptionCount: 0,
      queryFailedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  let processedCount = 0;
  let completedCount = 0;
  let exceptionCount = 0;
  let queryFailedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    try {
      const outcome = await processDueLogisticsTask({
        row,
        now: new Date(),
        actorId: options.actorId,
        logger,
      });

      processedCount += 1;
      if (outcome === "AUTO_COMPLETED") completedCount += 1;
      if (outcome === "EXCEPTION") exceptionCount += 1;
      if (outcome === "QUERY_FAILED") queryFailedCount += 1;
      if (outcome === "SKIPPED") skippedCount += 1;
    } catch (error) {
      failedCount += 1;
      logger.error({
        event: "logistics_auto_status.failed",
        logisticsFollowUpTaskId: row.id,
        shippingTaskId: row.shippingTaskId,
        salesOrderId: row.salesOrderId,
        message: error instanceof Error ? error.message : "物流自动检查失败。",
      });
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    dryRun: false,
    scannedCount: rows.length,
    processedCount,
    completedCount,
    exceptionCount,
    queryFailedCount,
    skippedCount,
    failedCount,
  };
}
