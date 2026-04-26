import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCallTranscriptDiarization,
  extractStoredCallTranscriptSegments,
  normalizeProvidedDialogueSegments,
} from "../../lib/calls/call-ai-diarization.ts";
import type { CallAiDiarizationRuntimeConfig } from "../../lib/calls/call-ai-provider.ts";

const config: CallAiDiarizationRuntimeConfig = {
  enabled: true,
  provider: "ASR_SEGMENTS",
  roleMapping: {
    speaker_0: "SALES",
    speaker_1: "CUSTOMER",
  },
  fallbackRoleInference: true,
  unknownSpeakerLabel: "未知",
  minSegmentTextLength: 1,
  source: "default",
};

test("diarization 会从 ASR segments 映射销售和客户", () => {
  const result = buildCallTranscriptDiarization({
    transcriptText: "销售：您好\n客户：先了解一下",
    transcriptRaw: {
      segments: [
        { speaker: "speaker_0", text: "您好", start: 0, end: 1.2 },
        { speaker: "speaker_1", text: "先了解一下", start: 1.2, end: 2.5 },
      ],
    },
    config,
  });

  assert.equal(result.source, "ASR_SEGMENTS");
  assert.equal(result.segmentCount, 2);
  assert.equal(result.segments[0]?.speakerRole, "SALES");
  assert.equal(result.segments[1]?.speakerRole, "CUSTOMER");
  assert.equal(result.segments[1]?.text, "先了解一下");
});

test("diarization 可从销售/客户文本前缀兜底", () => {
  const result = buildCallTranscriptDiarization({
    transcriptText: "销售：今天给您确认一下订单\n客户：可以，晚点发我微信",
    transcriptRaw: {},
    config,
  });

  assert.equal(result.source, "TEXT_PREFIX");
  assert.equal(result.segmentCount, 2);
  assert.equal(result.segments[0]?.speakerLabel, "销售");
  assert.equal(result.segments[1]?.speakerLabel, "客户");
});

test("diarization 支持 LLM dialogueSegments 和持久化读取", () => {
  const llmSegments = normalizeProvidedDialogueSegments(
    [
      {
        speakerRole: "SALES",
        speakerLabel: "销售",
        text: "这款酒今天有活动。",
      },
      {
        speakerRole: "CUSTOMER",
        speakerLabel: "客户",
        text: "我考虑一下。",
      },
    ],
    {
      ...config,
      provider: "LLM_INFERENCE",
    },
  );

  assert.equal(llmSegments.length, 2);
  assert.equal(llmSegments[0]?.source, "LLM_INFERENCE");

  const stored = extractStoredCallTranscriptSegments({
    schemaVersion: 1,
    raw: {},
    diarization: {
      schemaVersion: 1,
      enabled: true,
      provider: "LLM_INFERENCE",
      source: "LLM_INFERENCE",
      segmentCount: 2,
      generatedAt: new Date("2026-04-27T00:00:00.000Z").toISOString(),
      segments: llmSegments,
    },
  });

  assert.equal(stored.length, 2);
  assert.equal(stored[0]?.speakerRole, "SALES");
  assert.equal(stored[1]?.speakerRole, "CUSTOMER");
});
