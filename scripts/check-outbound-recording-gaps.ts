import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { findOutboundRecordingGaps } from "../lib/outbound-calls/reconciliation";

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function writeJsonLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

async function main() {
  const hours = parsePositiveInt(getArg("hours"), 24);
  const limit = parsePositiveInt(getArg("limit"), 50);
  const failOnGaps = hasFlag("fail-on-gaps");
  const gaps = await findOutboundRecordingGaps({ hours, limit });

  writeJsonLine({
    event: "outbound_recording_gaps.checked",
    hours,
    limit,
    gapCount: gaps.length,
    gaps,
  });

  if (failOnGaps && gaps.length > 0) {
    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    writeJsonLine({
      event: "outbound_recording_gaps.failed",
      message:
        error instanceof Error
          ? error.message
          : "Outbound recording gap check failed.",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
