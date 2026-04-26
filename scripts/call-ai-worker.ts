import "dotenv/config";
import { runCallAiAnalysisBatch } from "../lib/calls/call-ai-worker";
import { prisma } from "../lib/db/prisma";

function parsePositiveIntArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const argValue = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const envName = `CALL_AI_${name.replace(/-/g, "_").toUpperCase()}`;
  const raw = argValue || process.env[envName]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasFlag(name: string) {
  const flag = `--${name}`;
  const envName = `CALL_AI_${name.replace(/-/g, "_").toUpperCase()}`;
  const raw = process.env[envName]?.trim().toLowerCase();

  return process.argv.includes(flag) || raw === "1" || raw === "true" || raw === "yes";
}

function writeJsonLine(
  writer: (...args: unknown[]) => void,
  payload: Record<string, unknown>,
) {
  writer(JSON.stringify(payload));
}

const structuredLogger = {
  info(payload: Record<string, unknown>) {
    writeJsonLine(console.log, payload);
  },
  warn(payload: Record<string, unknown>) {
    writeJsonLine(console.warn, payload);
  },
  error(payload: Record<string, unknown>) {
    writeJsonLine(console.error, payload);
  },
};

async function main() {
  const result = await runCallAiAnalysisBatch({
    limit: parsePositiveIntArg("limit", 5),
    retryFailed: hasFlag("retry-failed"),
    dryRun: hasFlag("dry-run"),
    enqueueMissing: hasFlag("enqueue-missing"),
    actorId: process.env.CALL_AI_WORKER_ACTOR_ID?.trim() || null,
    logger: structuredLogger,
  });

  writeJsonLine(console.log, {
    event: "call_ai.stdout_summary",
    ...result,
    exitCode: result.failedCount > 0 ? 1 : 0,
  });

  process.exitCode = result.failedCount > 0 ? 1 : 0;
}

void main()
  .catch((error) => {
    writeJsonLine(console.error, {
      event: "call_ai.fatal",
      message: error instanceof Error ? error.message : "Call AI worker fatal error.",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
