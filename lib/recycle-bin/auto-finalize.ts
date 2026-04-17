import { randomUUID } from "node:crypto";
import { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { finalizeRecycleBinEntry, previewRecycleBinFinalize } from "@/lib/recycle-bin/lifecycle";
import {
  countExpiredActiveRecycleEntries,
  listExpiredActiveRecycleEntries,
} from "@/lib/recycle-bin/repository";
import type { RecycleLifecycleActor } from "@/lib/recycle-bin/types";

const AUTO_FINALIZE_DOMAINS = ["CUSTOMER", "TRADE_ORDER"] as const;
const SKIPPABLE_RACE_MESSAGES = new Set([
  "The recycle-bin entry does not exist.",
  "Only active recycle-bin entries can preview finalization.",
  "Only active recycle-bin entries can be finalized.",
]);

type AutoFinalizeDomain = (typeof AUTO_FINALIZE_DOMAINS)[number];

type AutoFinalizeLogger = {
  info?: (message?: unknown, ...optionalParams: unknown[]) => void;
  warn?: (message?: unknown, ...optionalParams: unknown[]) => void;
  error?: (message?: unknown, ...optionalParams: unknown[]) => void;
};

type AutoFinalizeActorResolution = {
  actor: RecycleLifecycleActor;
  source: "configured_admin" | "first_active_admin";
  actorLabel: string;
};

export type RecycleAutoFinalizeAlert = {
  code:
    | "non_zero_exit"
    | "failed_over_threshold"
    | "backlog_over_threshold"
    | "consecutive_failure_requires_scheduler";
  severity: "warning" | "error";
  message: string;
  actual?: number;
  threshold?: number;
};

export type RecycleAutoFinalizeEntryResult = {
  entryId: string;
  targetType: string;
  targetId: string;
  domain: AutoFinalizeDomain;
  previewFinalAction: "PURGE" | "ARCHIVE" | null;
  status:
    | "purged"
    | "archived"
    | "would_purge"
    | "would_archive"
    | "blocked"
    | "skipped"
    | "failed";
  message: string;
};

export type RunRecycleAutoFinalizeBatchResult = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  actorId: string;
  actorLabel: string;
  actorSource: AutoFinalizeActorResolution["source"];
  scannedCount: number;
  backlogCount: number;
  attemptedCount: number;
  processedCount: number;
  purgedCount: number;
  archivedCount: number;
  blockedCount: number;
  skippedCount: number;
  failedCount: number;
  alerts: RecycleAutoFinalizeAlert[];
  exitCode: number;
  results: RecycleAutoFinalizeEntryResult[];
};

function getLogger(input?: AutoFinalizeLogger) {
  return {
    info: input?.info ?? console.log,
    warn: input?.warn ?? console.warn,
    error: input?.error ?? console.error,
  };
}

function logAutoFinalizeEvent(
  logger: ReturnType<typeof getLogger>,
  level: "info" | "warn" | "error",
  payload: Record<string, unknown>,
) {
  logger[level]?.(payload);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Recycle auto-finalize failed.";
}

function isSkippableRaceError(error: unknown) {
  return SKIPPABLE_RACE_MESSAGES.has(getErrorMessage(error));
}

async function resolveAutoFinalizeActor(
  preferredActorId?: string,
): Promise<AutoFinalizeActorResolution> {
  const select = {
    id: true,
    username: true,
    name: true,
  } satisfies Prisma.UserSelect;

  if (preferredActorId?.trim()) {
    const user = await prisma.user.findFirst({
      where: {
        id: preferredActorId.trim(),
        userStatus: UserStatus.ACTIVE,
        role: {
          is: {
            code: "ADMIN",
          },
        },
      },
      select,
    });

    if (!user) {
      throw new Error(
        `RECYCLE_AUTO_FINALIZE_ACTOR_ID=${preferredActorId.trim()} is not an active ADMIN user.`,
      );
    }

    return {
      actor: {
        id: user.id,
        role: "ADMIN",
      },
      source: "configured_admin",
      actorLabel: `${user.name} (@${user.username})`,
    };
  }

  const fallbackAdmin = await prisma.user.findFirst({
    where: {
      userStatus: UserStatus.ACTIVE,
      role: {
        is: {
          code: "ADMIN",
        },
      },
    },
    orderBy: {
      username: "asc",
    },
    select,
  });

  if (!fallbackAdmin) {
    throw new Error(
      "Recycle auto-finalize requires at least one active ADMIN user or RECYCLE_AUTO_FINALIZE_ACTOR_ID.",
    );
  }

  return {
    actor: {
      id: fallbackAdmin.id,
      role: "ADMIN",
    },
    source: "first_active_admin",
    actorLabel: `${fallbackAdmin.name} (@${fallbackAdmin.username})`,
  };
}

async function listExpiredEntriesForAutoFinalize(limit: number, now: Date) {
  const domainEntries = await Promise.all(
    AUTO_FINALIZE_DOMAINS.map((domain) =>
      listExpiredActiveRecycleEntries(prisma, {
        domain,
        limit,
        now,
      }),
    ),
  );

  return domainEntries
    .flat()
    .sort((left, right) => {
      const expiresAtDiff =
        left.recycleExpiresAt.getTime() - right.recycleExpiresAt.getTime();

      if (expiresAtDiff !== 0) {
        return expiresAtDiff;
      }

      return left.deletedAt.getTime() - right.deletedAt.getTime();
    })
    .slice(0, limit);
}

async function countExpiredEntriesForAutoFinalize(now: Date) {
  const counts = await Promise.all(
    AUTO_FINALIZE_DOMAINS.map((domain) =>
      countExpiredActiveRecycleEntries(prisma, {
        domain,
        now,
      }),
    ),
  );

  return counts.reduce((sum, count) => sum + count, 0);
}

function evaluateAutoFinalizeAlerts(input: {
  dryRun: boolean;
  exitCode: number;
  failedCount: number;
  backlogCount: number;
  failedAlertThreshold?: number;
  backlogAlertThreshold?: number;
}): RecycleAutoFinalizeAlert[] {
  const alerts: RecycleAutoFinalizeAlert[] = [];

  if (input.failedAlertThreshold && input.failedCount >= input.failedAlertThreshold) {
    alerts.push({
      code: "failed_over_threshold",
      severity: "error",
      message: input.dryRun
        ? "Dry-run 预估 failed 数超过阈值，正式执行前需要先排查。"
        : "本次自动 finalize 的 failed 数超过阈值，需要立即排查。",
      actual: input.failedCount,
      threshold: input.failedAlertThreshold,
    });
  }

  if (input.backlogAlertThreshold && input.backlogCount >= input.backlogAlertThreshold) {
    alerts.push({
      code: "backlog_over_threshold",
      severity: "warning",
      message: "已过期但仍处于 ACTIVE 的条目积压过大，建议缩小积压后再持续观察。",
      actual: input.backlogCount,
      threshold: input.backlogAlertThreshold,
    });
  }

  if (input.exitCode !== 0) {
    alerts.push({
      code: "non_zero_exit",
      severity: "error",
      message: input.dryRun
        ? "Dry-run 以非零退出码结束，说明预检阶段已经出现 failed。"
        : "自动 finalize 以非零退出码结束，调度器应视为失败运行。",
      actual: input.exitCode,
      threshold: 0,
    });
    alerts.push({
      code: "consecutive_failure_requires_scheduler",
      severity: "warning",
      message:
        "连续失败需要由外部调度器基于连续 non_zero_exit 规则触发，本轮只输出稳定告警码，不在库内持久化失败状态。",
    });
  }

  return alerts;
}

async function createAutoFinalizeRunLog(
  result: RunRecycleAutoFinalizeBatchResult,
  limit: number,
) {
  if (result.dryRun) {
    return;
  }

  if (
    result.attemptedCount === 0 &&
    result.blockedCount === 0 &&
    result.failedCount === 0
  ) {
    return;
  }

  await prisma.operationLog.create({
    data: {
      actorId: result.actorId,
      module: "SYSTEM",
      action: "system.recycle_auto_finalize_run",
      targetType: "USER",
      targetId: result.actorId,
      description: `Auto finalize expired recycle entries: ${result.purgedCount} purged, ${result.archivedCount} archived, ${result.blockedCount} blocked, ${result.failedCount} failed.`,
      afterData: {
        runId: result.runId,
        domains: [...AUTO_FINALIZE_DOMAINS],
        actorSource: result.actorSource,
        actorLabel: result.actorLabel,
        dryRun: result.dryRun,
        limit,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        scannedCount: result.scannedCount,
        backlogCount: result.backlogCount,
        attemptedCount: result.attemptedCount,
        processedCount: result.processedCount,
        purgedCount: result.purgedCount,
        archivedCount: result.archivedCount,
        blockedCount: result.blockedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        exitCode: result.exitCode,
        alerts: result.alerts,
        results: result.results.slice(0, 20),
      } satisfies Prisma.InputJsonValue,
    },
  });
}

export async function runRecycleAutoFinalizeBatch(input?: {
  now?: Date;
  limit?: number;
  actorId?: string;
  dryRun?: boolean;
  failedAlertThreshold?: number;
  backlogAlertThreshold?: number;
  logger?: AutoFinalizeLogger;
  runId?: string;
}) {
  const now = input?.now ?? new Date();
  const limit = Math.max(1, input?.limit ?? 100);
  const dryRun = input?.dryRun ?? false;
  const logger = getLogger(input?.logger);
  const startedAt = new Date();
  const runId = input?.runId?.trim() || randomUUID();
  const actorResolution = await resolveAutoFinalizeActor(input?.actorId);
  const [expiredEntries, backlogCount] = await Promise.all([
    listExpiredEntriesForAutoFinalize(limit, now),
    countExpiredEntriesForAutoFinalize(now),
  ]);

  const result: RunRecycleAutoFinalizeBatchResult = {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    dryRun,
    actorId: actorResolution.actor.id,
    actorLabel: actorResolution.actorLabel,
    actorSource: actorResolution.source,
    scannedCount: expiredEntries.length,
    backlogCount,
    attemptedCount: 0,
    processedCount: 0,
    purgedCount: 0,
    archivedCount: 0,
    blockedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    alerts: [],
    exitCode: 0,
    results: [],
  };

  logAutoFinalizeEvent(logger, "info", {
    event: "recycle_auto_finalize.run_started",
    runId,
    startedAt: result.startedAt,
    dryRun,
    actorId: result.actorId,
    actorSource: result.actorSource,
    limit,
    scannedCount: result.scannedCount,
    backlogCount: result.backlogCount,
    now: now.toISOString(),
  });

  for (const entry of expiredEntries) {
    let previewFinalAction: RecycleAutoFinalizeEntryResult["previewFinalAction"] = null;

    try {
      const preview = await previewRecycleBinFinalize(actorResolution.actor, {
        entryId: entry.id,
      });
      previewFinalAction = preview.preview.finalAction;

      logAutoFinalizeEvent(logger, "info", {
        event: "recycle_auto_finalize.entry_previewed",
        runId,
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        previewFinalAction,
        isExpired: preview.isExpired,
        canFinalize: preview.preview.canFinalize,
        dryRun,
      });

      result.attemptedCount += 1;

      if (dryRun) {
        if (!preview.preview.canFinalize) {
          result.blockedCount += 1;
          result.processedCount += 1;
          result.results.push({
            entryId: entry.id,
            targetType: entry.targetType,
            targetId: entry.targetId,
            domain: entry.domain as AutoFinalizeDomain,
            previewFinalAction,
            status: "blocked",
            message: preview.preview.blockerSummary,
          });
          logAutoFinalizeEvent(logger, "warn", {
            event: "recycle_auto_finalize.entry_blocked",
            runId,
            entryId: entry.id,
            targetType: entry.targetType,
            targetId: entry.targetId,
            message: preview.preview.blockerSummary,
            dryRun,
          });
          continue;
        }

        if (preview.preview.finalAction === "PURGE") {
          result.purgedCount += 1;
          result.processedCount += 1;
          result.results.push({
            entryId: entry.id,
            targetType: entry.targetType,
            targetId: entry.targetId,
            domain: entry.domain as AutoFinalizeDomain,
            previewFinalAction,
            status: "would_purge",
            message: "Dry-run preview: the entry would be finalized as PURGE.",
          });
          logAutoFinalizeEvent(logger, "info", {
            event: "recycle_auto_finalize.entry_would_purge",
            runId,
            entryId: entry.id,
            targetType: entry.targetType,
            targetId: entry.targetId,
            dryRun,
          });
          continue;
        }

        result.archivedCount += 1;
        result.processedCount += 1;
        result.results.push({
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          domain: entry.domain as AutoFinalizeDomain,
          previewFinalAction,
          status: "would_archive",
          message: "Dry-run preview: the entry would be finalized as ARCHIVE.",
        });
        logAutoFinalizeEvent(logger, "info", {
          event: "recycle_auto_finalize.entry_would_archive",
          runId,
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          dryRun,
        });
        continue;
      }

      const finalizeResult = await finalizeRecycleBinEntry(actorResolution.actor, {
        entryId: entry.id,
      });

      if (finalizeResult.status === "purged") {
        result.purgedCount += 1;
        result.processedCount += 1;
        result.results.push({
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          domain: entry.domain as AutoFinalizeDomain,
          previewFinalAction,
          status: "purged",
          message: finalizeResult.message,
        });
        logAutoFinalizeEvent(logger, "info", {
          event: "recycle_auto_finalize.entry_purged",
          runId,
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          dryRun,
        });
        continue;
      }

      if (finalizeResult.status === "archived") {
        result.archivedCount += 1;
        result.processedCount += 1;
        result.results.push({
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          domain: entry.domain as AutoFinalizeDomain,
          previewFinalAction,
          status: "archived",
          message: finalizeResult.message,
        });
        logAutoFinalizeEvent(logger, "info", {
          event: "recycle_auto_finalize.entry_archived",
          runId,
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          dryRun,
        });
        continue;
      }

      result.blockedCount += 1;
      result.processedCount += 1;
      result.results.push({
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        domain: entry.domain as AutoFinalizeDomain,
        previewFinalAction,
        status: "blocked",
        message: finalizeResult.message,
      });
      logAutoFinalizeEvent(logger, "warn", {
        event: "recycle_auto_finalize.entry_blocked",
        runId,
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        message: finalizeResult.message,
        dryRun,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      if (isSkippableRaceError(error)) {
        result.skippedCount += 1;
        result.processedCount += 1;
        result.results.push({
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          domain: entry.domain as AutoFinalizeDomain,
          previewFinalAction,
          status: "skipped",
          message,
        });
        logAutoFinalizeEvent(logger, "info", {
          event: "recycle_auto_finalize.entry_skipped",
          runId,
          entryId: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          message,
          dryRun,
        });
        continue;
      }

      result.failedCount += 1;
      result.processedCount += 1;
      result.results.push({
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        domain: entry.domain as AutoFinalizeDomain,
        previewFinalAction,
        status: "failed",
        message,
      });
      logAutoFinalizeEvent(logger, "error", {
        event: "recycle_auto_finalize.entry_failed",
        runId,
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        message,
        dryRun,
      });
    }
  }

  result.finishedAt = new Date().toISOString();
  result.exitCode = result.failedCount > 0 ? 1 : 0;
  result.alerts = evaluateAutoFinalizeAlerts({
    dryRun,
    exitCode: result.exitCode,
    failedCount: result.failedCount,
    backlogCount: result.backlogCount,
    failedAlertThreshold: input?.failedAlertThreshold,
    backlogAlertThreshold: input?.backlogAlertThreshold,
  });

  await createAutoFinalizeRunLog(result, limit);

  logAutoFinalizeEvent(logger, result.exitCode === 0 ? "info" : "error", {
    event: "recycle_auto_finalize.run_completed",
    runId: result.runId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    dryRun: result.dryRun,
    actorId: result.actorId,
    processed: result.processedCount,
    purged: result.purgedCount,
    archived: result.archivedCount,
    blocked: result.blockedCount,
    skipped: result.skippedCount,
    failed: result.failedCount,
    scannedCount: result.scannedCount,
    backlogCount: result.backlogCount,
    exitCode: result.exitCode,
    alerts: result.alerts,
  });

  return result;
}
