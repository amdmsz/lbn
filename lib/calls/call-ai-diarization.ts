import type { CallAiDiarizationRuntimeConfig } from "@/lib/calls/call-ai-provider";

export type CallTranscriptSpeakerRole = "SALES" | "CUSTOMER" | "UNKNOWN";

export type CallTranscriptSegmentSource =
  | "ASR_SEGMENTS"
  | "TEXT_PREFIX"
  | "LLM_INFERENCE"
  | "FALLBACK";

export type CallTranscriptSegment = {
  id: string;
  speakerRole: CallTranscriptSpeakerRole;
  speakerLabel: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
  confidence: number | null;
  source: CallTranscriptSegmentSource;
};

export type CallTranscriptDiarizationResult = {
  schemaVersion: 1;
  enabled: boolean;
  provider: string;
  source: CallTranscriptSegmentSource | "DISABLED";
  segmentCount: number;
  generatedAt: string;
  segments: CallTranscriptSegment[];
};

type RawSegmentLike = Record<string, unknown>;

const MAX_STORED_SEGMENTS = 80;
const DEFAULT_DIARIZATION_CONFIG: CallAiDiarizationRuntimeConfig = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSegmentSource(value: unknown): value is CallTranscriptSegmentSource {
  return (
    value === "ASR_SEGMENTS" ||
    value === "TEXT_PREFIX" ||
    value === "LLM_INFERENCE" ||
    value === "FALLBACK"
  );
}

function pickString(record: RawSegmentLike, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function pickNumber(record: RawSegmentLike, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseFloat(value)
          : Number.NaN;

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeMs(value: number | null, unit: "ms" | "seconds" | "auto") {
  if (value === null || value < 0) {
    return null;
  }

  if (unit === "ms") {
    return Math.round(value);
  }

  if (unit === "seconds") {
    return Math.round(value * 1000);
  }

  return Math.round(value > 3600 ? value : value * 1000);
}

function pickStartMs(record: RawSegmentLike) {
  return (
    normalizeMs(pickNumber(record, ["startMs", "start_ms", "beginMs", "begin_ms"]), "ms") ??
    normalizeMs(
      pickNumber(record, [
        "start",
        "begin",
        "startTime",
        "beginTime",
        "start_time",
        "begin_time",
      ]),
      "auto",
    )
  );
}

function pickEndMs(record: RawSegmentLike) {
  return (
    normalizeMs(pickNumber(record, ["endMs", "end_ms", "stopMs", "stop_ms"]), "ms") ??
    normalizeMs(
      pickNumber(record, [
        "end",
        "stop",
        "endTime",
        "stopTime",
        "end_time",
        "stop_time",
      ]),
      "auto",
    )
  );
}

function getWordsText(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (isRecord(item)) {
        return pickString(item, ["word", "text", "content"]);
      }

      return "";
    })
    .join("")
    .trim();
}

function pickSegmentText(record: RawSegmentLike) {
  return (
    pickString(record, [
      "text",
      "transcript",
      "transcriptText",
      "sentence",
      "content",
      "utterance",
    ]) || getWordsText(record.words)
  );
}

function normalizeSpeakerKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^spk[_\s-]?/, "speaker_")
    .replace(/^speaker\s+/, "speaker_")
    .replace(/[\s-]+/g, "_");
}

function roleFromTextPrefix(prefix: string): CallTranscriptSpeakerRole {
  if (/^(销售|业务员|客服|坐席|sales)$/i.test(prefix)) {
    return "SALES";
  }

  if (/^(客户|顾客|用户|买家|对方|customer)$/i.test(prefix)) {
    return "CUSTOMER";
  }

  return "UNKNOWN";
}

function getSpeakerRole(
  speakerValue: string,
  config: CallAiDiarizationRuntimeConfig,
): CallTranscriptSpeakerRole {
  const directRole = speakerValue.toUpperCase();

  if (
    directRole === "SALES" ||
    directRole === "CUSTOMER" ||
    directRole === "UNKNOWN"
  ) {
    return directRole;
  }

  const normalized = normalizeSpeakerKey(speakerValue);
  const numeric = normalized.match(/\d+/)?.[0] ?? "";
  const candidates = [
    normalized,
    numeric ? `speaker_${numeric}` : "",
    numeric ? `spk_${numeric}` : "",
    speakerValue,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const mapped = config.roleMapping[candidate];

    if (mapped) {
      return mapped;
    }
  }

  return roleFromTextPrefix(speakerValue);
}

function getSpeakerLabel(
  role: CallTranscriptSpeakerRole,
  speakerValue: string,
  config: CallAiDiarizationRuntimeConfig,
) {
  if (role === "SALES") {
    return "销售";
  }

  if (role === "CUSTOMER") {
    return "客户";
  }

  return speakerValue || config.unknownSpeakerLabel || "未知";
}

function buildSegment(input: {
  index: number;
  text: string;
  role: CallTranscriptSpeakerRole;
  speakerLabel: string;
  source: CallTranscriptSegmentSource;
  startMs?: number | null;
  endMs?: number | null;
  confidence?: number | null;
}): CallTranscriptSegment {
  return {
    id: `seg_${String(input.index + 1).padStart(3, "0")}`,
    speakerRole: input.role,
    speakerLabel: input.speakerLabel,
    text: input.text.trim(),
    startMs: input.startMs ?? null,
    endMs: input.endMs ?? null,
    confidence: input.confidence ?? null,
    source: input.source,
  };
}

function collectRawSegmentRecords(value: unknown, depth = 0): RawSegmentLike[] {
  if (depth > 5) {
    return [];
  }

  if (Array.isArray(value)) {
    const textLikeItems = value.filter(
      (item): item is RawSegmentLike =>
        isRecord(item) && Boolean(pickSegmentText(item)),
    );

    if (textLikeItems.length > 0) {
      return textLikeItems;
    }

    return value.flatMap((item) => collectRawSegmentRecords(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const preferredKeys = [
    "segments",
    "sentences",
    "sentence_info",
    "utterances",
    "dialogue",
    "dialogueSegments",
    "transcriptSegments",
  ];
  const preferred = preferredKeys.flatMap((key) =>
    collectRawSegmentRecords(value[key], depth + 1),
  );

  if (preferred.length > 0) {
    return preferred;
  }

  return Object.values(value).flatMap((item) =>
    collectRawSegmentRecords(item, depth + 1),
  );
}

function normalizeRawSegments(
  raw: unknown,
  config: CallAiDiarizationRuntimeConfig,
) {
  return collectRawSegmentRecords(raw)
    .slice(0, MAX_STORED_SEGMENTS)
    .map((record, index) => {
      const text = pickSegmentText(record);
      const speakerValue = pickString(record, [
        "speakerRole",
        "role",
        "speaker",
        "speakerId",
        "speaker_id",
        "speakerLabel",
        "speaker_label",
        "channel",
        "spk",
      ]);
      const role = getSpeakerRole(speakerValue, config);

      return buildSegment({
        index,
        text,
        role,
        speakerLabel: getSpeakerLabel(role, speakerValue, config),
        source: "ASR_SEGMENTS",
        startMs: pickStartMs(record),
        endMs: pickEndMs(record),
        confidence: pickNumber(record, ["confidence", "score", "probability"]),
      });
    })
    .filter((segment) => segment.text.length >= config.minSegmentTextLength);
}

function normalizeTextPrefixedSegments(
  transcriptText: string,
  config: CallAiDiarizationRuntimeConfig,
) {
  const lines = transcriptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const segments: CallTranscriptSegment[] = [];

  for (const line of lines) {
    const match = line.match(/^([^:：]{1,24})[:：]\s*(.+)$/);

    if (!match) {
      continue;
    }

    const speakerValue = match[1]?.trim() ?? "";
    const text = match[2]?.trim() ?? "";
    const role = getSpeakerRole(speakerValue, config);

    if (text.length < config.minSegmentTextLength) {
      continue;
    }

    segments.push(
      buildSegment({
        index: segments.length,
        text,
        role,
        speakerLabel: getSpeakerLabel(role, speakerValue, config),
        source: "TEXT_PREFIX",
      }),
    );

    if (segments.length >= MAX_STORED_SEGMENTS) {
      break;
    }
  }

  return segments;
}

export function normalizeProvidedDialogueSegments(
  value: unknown,
  config: CallAiDiarizationRuntimeConfig = DEFAULT_DIARIZATION_CONFIG,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_STORED_SEGMENTS)
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = pickSegmentText(item);
      const speakerValue = pickString(item, [
        "speakerRole",
        "role",
        "speaker",
        "speakerLabel",
      ]);
      const role = getSpeakerRole(speakerValue, config);

      if (text.length < config.minSegmentTextLength) {
        return null;
      }

      return buildSegment({
        index,
        text,
        role,
        speakerLabel: getSpeakerLabel(role, speakerValue, config),
        source: "LLM_INFERENCE",
        startMs: pickStartMs(item),
        endMs: pickEndMs(item),
        confidence: pickNumber(item, ["confidence", "score", "probability"]),
      });
    })
    .filter((item): item is CallTranscriptSegment => Boolean(item));
}

function buildFallbackSegment(
  transcriptText: string,
  config: CallAiDiarizationRuntimeConfig,
) {
  const text = transcriptText.trim();

  if (text.length < config.minSegmentTextLength) {
    return [];
  }

  return [
    buildSegment({
      index: 0,
      text,
      role: "UNKNOWN",
      speakerLabel: config.unknownSpeakerLabel || "未知",
      source: "FALLBACK",
    }),
  ];
}

export function buildCallTranscriptDiarization(input: {
  transcriptText: string;
  transcriptRaw: unknown;
  config: CallAiDiarizationRuntimeConfig;
  analysisSegments?: unknown;
  now?: Date;
}): CallTranscriptDiarizationResult {
  if (!input.config.enabled || input.config.provider === "DISABLED") {
    return {
      schemaVersion: 1,
      enabled: false,
      provider: input.config.provider,
      source: "DISABLED",
      segmentCount: 0,
      generatedAt: (input.now ?? new Date()).toISOString(),
      segments: [],
    };
  }

  const asrSegments = normalizeRawSegments(input.transcriptRaw, input.config);
  const llmSegments = normalizeProvidedDialogueSegments(
    input.analysisSegments,
    input.config,
  );
  const textSegments = normalizeTextPrefixedSegments(
    input.transcriptText,
    input.config,
  );
  const segments =
    input.config.provider === "LLM_INFERENCE" && llmSegments.length > 0
      ? llmSegments
      : asrSegments.length > 0
        ? asrSegments
        : input.config.fallbackRoleInference && llmSegments.length > 0
          ? llmSegments
          : textSegments.length > 0
            ? textSegments
            : buildFallbackSegment(input.transcriptText, input.config);
  const source = segments[0]?.source ?? "FALLBACK";

  return {
    schemaVersion: 1,
    enabled: true,
    provider: input.config.provider,
    source,
    segmentCount: segments.length,
    generatedAt: (input.now ?? new Date()).toISOString(),
    segments,
  };
}

export function buildCallTranscriptJsonPayload(input: {
  raw: unknown;
  diarization: CallTranscriptDiarizationResult;
}) {
  return {
    schemaVersion: 1,
    raw: input.raw,
    diarization: input.diarization,
  };
}

export function extractStoredCallTranscriptSegments(
  transcriptJson: unknown,
): CallTranscriptSegment[] {
  if (isRecord(transcriptJson)) {
    const diarization = transcriptJson.diarization;

    if (isRecord(diarization) && Array.isArray(diarization.segments)) {
      return normalizeProvidedDialogueSegments(
        diarization.segments,
        DEFAULT_DIARIZATION_CONFIG,
      ).map((segment) => ({
        ...segment,
        source: isSegmentSource(diarization.source)
          ? diarization.source
          : segment.source,
      }));
    }
  }

  return buildCallTranscriptDiarization({
    transcriptText: "",
    transcriptRaw: transcriptJson,
    config: DEFAULT_DIARIZATION_CONFIG,
  }).segments;
}

export function formatTranscriptSegmentTimeRange(segment: CallTranscriptSegment) {
  if (segment.startMs === null && segment.endMs === null) {
    return "";
  }

  const formatMs = (value: number | null) => {
    if (value === null) {
      return "";
    }

    const totalSeconds = Math.floor(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  return [formatMs(segment.startMs), formatMs(segment.endMs)]
    .filter(Boolean)
    .join("-");
}
