import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createCallAiProviderFromConfig } from "../lib/calls/call-ai-provider";
import {
  buildCallAiRuntimeConfigSnapshot,
  resolveCallAiRuntimeConfig,
} from "../lib/calls/call-runtime-config";
import { prisma } from "../lib/db/prisma";

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function getFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function writeJsonLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

async function loadAudioBytes() {
  const audioPath = getArg("audio");

  if (!audioPath) {
    return {
      bytes: Buffer.from("local-asr-smoke-audio-bytes"),
      filename: "local-asr-smoke.m4a",
      mimeType: "audio/mp4",
      storageKey: "smoke/local-asr-smoke.m4a",
    };
  }

  const bytes = await fs.readFile(audioPath);
  return {
    bytes,
    filename: path.basename(audioPath),
    mimeType: getArg("mime-type") || "audio/mp4",
    storageKey: getArg("storage-key") || `smoke/${path.basename(audioPath)}`,
  };
}

async function main() {
  const endpoint = getArg("endpoint");

  const audio = await loadAudioBytes();
  const config = await resolveCallAiRuntimeConfig({
    endpoint,
    asrProvider: getArg("asr-provider") || (endpoint ? "LOCAL_HTTP_ASR" : null),
    llmProvider: getArg("llm-provider") || (endpoint ? "MOCK_LLM" : null),
  });
  const provider = createCallAiProviderFromConfig(config);
  const context = {
    recordingId: "smoke-recording",
    callRecordId: "smoke-call-record",
    customerName: "本地联调客户",
    customerPhone: "13800000000",
    salesName: "本地销售",
    callTime: new Date("2026-04-26T00:00:00.000Z"),
    durationSeconds: 30,
    callRemark: "内网 ASR 联调",
    callResultCode: "INTERESTED",
  };

  const transcription = await provider.transcribe({
    audio: audio.bytes,
    filename: audio.filename,
    mimeType: audio.mimeType,
    storageKey: audio.storageKey,
    context,
  });

  writeJsonLine({
    event: "call_ai_provider.transcription_ok",
    provider: provider.providerName,
    runtime: buildCallAiRuntimeConfigSnapshot(config),
    modelProvider: transcription.modelProvider,
    modelName: transcription.modelName,
    transcriptPreview: transcription.text.slice(0, 160),
  });

  if (getFlag("transcribe-only")) {
    return;
  }

  const analysis = await provider.analyze({
    transcriptText: transcription.text,
    transcriptRaw: transcription.raw,
    context,
  });

  writeJsonLine({
    event: "call_ai_provider.analysis_ok",
    provider: provider.providerName,
    modelProvider: analysis.modelProvider,
    modelName: analysis.modelName,
    customerIntent: analysis.customerIntent,
    qualityScore: analysis.qualityScore,
    summaryPreview: analysis.summary.slice(0, 160),
  });
}

void main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: "call_ai_provider.failed",
        message:
          error instanceof Error
            ? error.message
            : "Call AI provider check failed.",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
