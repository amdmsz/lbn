import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { runRecycleAutoFinalizeBatch } from "../lib/recycle-bin/auto-finalize";

function parsePositiveIntEnv(name: string, fallback?: number) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBatchLimit() {
  return parsePositiveIntEnv("RECYCLE_AUTO_FINALIZE_BATCH_LIMIT", 100) ?? 100;
}

function parseFailedAlertThreshold() {
  return parsePositiveIntEnv("RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD");
}

function parseBacklogAlertThreshold() {
  return parsePositiveIntEnv("RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD");
}

function parseDryRun(argv: string[]) {
  if (argv.includes("--dry-run")) {
    return true;
  }

  const raw = process.env.RECYCLE_AUTO_FINALIZE_DRY_RUN?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function writeJsonLine(
  writer: (...args: unknown[]) => void,
  payload: Record<string, unknown>,
) {
  writer(JSON.stringify(payload));
}

const structuredLogger = {
  info(payload?: unknown) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      writeJsonLine(console.log, payload as Record<string, unknown>);
      return;
    }

    writeJsonLine(console.log, {
      event: "recycle_auto_finalize.log",
      level: "info",
      message: payload ?? null,
    });
  },
  warn(payload?: unknown) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      writeJsonLine(console.warn, payload as Record<string, unknown>);
      return;
    }

    writeJsonLine(console.warn, {
      event: "recycle_auto_finalize.log",
      level: "warn",
      message: payload ?? null,
    });
  },
  error(payload?: unknown) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      writeJsonLine(console.error, payload as Record<string, unknown>);
      return;
    }

    writeJsonLine(console.error, {
      event: "recycle_auto_finalize.log",
      level: "error",
      message: payload ?? null,
    });
  },
};

async function main() {
  const result = await runRecycleAutoFinalizeBatch({
    limit: parseBatchLimit(),
    actorId: process.env.RECYCLE_AUTO_FINALIZE_ACTOR_ID?.trim() || undefined,
    dryRun: parseDryRun(process.argv.slice(2)),
    failedAlertThreshold: parseFailedAlertThreshold(),
    backlogAlertThreshold: parseBacklogAlertThreshold(),
    logger: structuredLogger,
  });

  writeJsonLine(console.log, {
    event: "recycle_auto_finalize.stdout_summary",
    runId: result.runId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    dryRun: result.dryRun,
    processed: result.processedCount,
    purged: result.purgedCount,
    archived: result.archivedCount,
    blocked: result.blockedCount,
    skipped: result.skippedCount,
    failed: result.failedCount,
    scanned: result.scannedCount,
    backlog: result.backlogCount,
    exitCode: result.exitCode,
  });

  for (const alert of result.alerts) {
    writeJsonLine(
      alert.severity === "error" ? console.error : console.warn,
      {
        event: "recycle_auto_finalize.alert",
        runId: result.runId,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        dryRun: result.dryRun,
        ...alert,
      },
    );
  }

  process.exitCode = result.exitCode;
}

void main()
  .catch((error) => {
    writeJsonLine(console.error, {
      event: "recycle_auto_finalize.fatal",
      message: error instanceof Error ? error.message : "Recycle auto-finalize fatal error.",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
