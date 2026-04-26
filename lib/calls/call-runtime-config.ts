import {
  getEnvCallAiRuntimeConfig,
  type CallAiConfigSource,
  type CallAiSecretSource,
  type ResolvedCallAiRuntimeConfig,
} from "@/lib/calls/call-ai-provider";
import {
  getSystemSettingSecret,
  resolveSystemSettingValue,
} from "@/lib/system-settings/queries";
import type {
  CallAiAsrSettingValue,
  CallAiDiarizationSettingValue,
  CallAiLlmSettingValue,
  RuntimeWorkerSettingValue,
} from "@/lib/system-settings/schema";
import {
  CALL_AI_ASR_PROVIDERS,
  CALL_AI_LLM_PROVIDERS,
  DIARIZATION_PROVIDERS,
} from "@/lib/system-settings/schema";

const BYTES_PER_MB = 1024 * 1024;

export type CallAiRuntimeConfigOverrides = {
  asrProvider?: string | null;
  llmProvider?: string | null;
  endpoint?: string | null;
};

export type ResolvedCallAiWorkerRuntimeConfig =
  RuntimeWorkerSettingValue & {
    source: "database" | "fallback" | "default";
  };

function normalizeOverride(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAsrProvider(value: string): CallAiAsrSettingValue["provider"] {
  return CALL_AI_ASR_PROVIDERS.includes(
    value as CallAiAsrSettingValue["provider"],
  )
    ? (value as CallAiAsrSettingValue["provider"])
    : "MOCK";
}

function normalizeLlmProvider(value: string): CallAiLlmSettingValue["provider"] {
  const provider = value === "MOCK" ? "MOCK_LLM" : value;

  return CALL_AI_LLM_PROVIDERS.includes(
    provider as CallAiLlmSettingValue["provider"],
  )
    ? (provider as CallAiLlmSettingValue["provider"])
    : "MOCK_LLM";
}

function normalizeDiarizationProvider(
  value: string,
): CallAiDiarizationSettingValue["provider"] {
  return DIARIZATION_PROVIDERS.includes(
    value as CallAiDiarizationSettingValue["provider"],
  )
    ? (value as CallAiDiarizationSettingValue["provider"])
    : "ASR_SEGMENTS";
}

function getEnvRuntimeWorkerSettingValue(): RuntimeWorkerSettingValue {
  return {
    leadImportWorkerRequired:
      process.env.REQUIRE_LEAD_IMPORT_WORKER === "1" ||
      process.env.LEAD_IMPORT_WORKER_REQUIRED === "1",
    callAiWorkerEnabled: process.env.CALL_AI_ENABLED === "1",
    callAiWorkerConcurrency: parsePositiveInteger(
      process.env.CALL_AI_WORKER_CONCURRENCY,
      1,
    ),
    callAiRetryLimit: parsePositiveInteger(process.env.CALL_AI_RETRY_LIMIT, 3),
    queueHealthCheckEnabled:
      process.env.CALL_AI_QUEUE_HEALTH_CHECK_ENABLED !== "0",
  };
}

function mapSecretSource(secret: string, fallbackSecret: string): CallAiSecretSource {
  if (secret) {
    return "database";
  }

  return fallbackSecret ? "fallback" : "default";
}

async function resolveSecretWithFallback(input: {
  namespace: "call_ai.asr" | "call_ai.llm";
  fallbackSecret: string;
}) {
  const secret = await getSystemSettingSecret(input.namespace, "active");

  return {
    value: secret || input.fallbackSecret,
    source: mapSecretSource(secret || "", input.fallbackSecret),
  };
}

function mapSource(source: "database" | "fallback" | "default"): CallAiConfigSource {
  return source;
}

export async function resolveCallAiRuntimeConfig(
  overrides: CallAiRuntimeConfigOverrides = {},
): Promise<ResolvedCallAiRuntimeConfig> {
  const envConfig = getEnvCallAiRuntimeConfig();
  const [asr, llm, diarization, asrSecret, llmSecret] = await Promise.all([
    resolveSystemSettingValue<CallAiAsrSettingValue>("call_ai.asr", "active", {
      fallbackValue: {
        provider: normalizeAsrProvider(envConfig.asr.provider),
        endpoint: envConfig.asr.endpoint || null,
        model: envConfig.asr.model,
        timeoutMs: envConfig.asr.timeoutMs,
        maxFileMb: Math.max(1, Math.ceil(envConfig.asr.maxFileBytes / BYTES_PER_MB)),
        language: envConfig.asr.language,
        publicAudioBaseUrl: envConfig.asr.publicAudioBaseUrl,
        enableDiarization: envConfig.asr.enableDiarization,
      },
    }),
    resolveSystemSettingValue<CallAiLlmSettingValue>("call_ai.llm", "active", {
      fallbackValue: {
        provider: normalizeLlmProvider(envConfig.llm.provider),
        baseUrl: envConfig.llm.baseUrl || null,
        model: envConfig.llm.model,
        temperature: Number.isFinite(envConfig.llm.temperature)
          ? envConfig.llm.temperature
          : 0.2,
        maxOutputTokens: envConfig.llm.maxOutputTokens,
        timeoutMs: envConfig.llm.timeoutMs,
        strictJsonOutput: envConfig.llm.strictJsonOutput,
      },
    }),
    resolveSystemSettingValue<CallAiDiarizationSettingValue>(
      "call_ai.diarization",
      "active",
      {
        fallbackValue: {
          enabled: envConfig.diarization.enabled,
          provider: normalizeDiarizationProvider(envConfig.diarization.provider),
          roleMapping: envConfig.diarization.roleMapping,
          fallbackRoleInference: envConfig.diarization.fallbackRoleInference,
          unknownSpeakerLabel: envConfig.diarization.unknownSpeakerLabel,
          minSegmentTextLength: envConfig.diarization.minSegmentTextLength,
        },
      },
    ),
    resolveSecretWithFallback({
      namespace: "call_ai.asr",
      fallbackSecret: envConfig.asr.apiKey,
    }),
    resolveSecretWithFallback({
      namespace: "call_ai.llm",
      fallbackSecret: envConfig.llm.apiKey,
    }),
  ]);
  const endpointOverride = normalizeOverride(overrides.endpoint);
  const asrProviderOverride = normalizeOverride(overrides.asrProvider);
  const llmProviderOverride = normalizeOverride(overrides.llmProvider);

  return {
    asr: {
      ...envConfig.asr,
      provider: asrProviderOverride || asr.value.provider,
      endpoint: endpointOverride || asr.value.endpoint || envConfig.asr.endpoint,
      baseUrl: endpointOverride || asr.value.endpoint || envConfig.asr.baseUrl,
      apiKey: asrSecret.value,
      model: asr.value.model,
      timeoutMs: asr.value.timeoutMs,
      maxFileBytes:
        asr.source === "fallback"
          ? envConfig.asr.maxFileBytes
          : asr.value.maxFileMb * BYTES_PER_MB,
      language: asr.value.language,
      publicAudioBaseUrl:
        asr.value.publicAudioBaseUrl || envConfig.asr.publicAudioBaseUrl,
      enableDiarization: asr.value.enableDiarization,
      source: endpointOverride || asrProviderOverride ? "override" : mapSource(asr.source),
      secretSource: asrSecret.source,
    },
    llm: {
      ...envConfig.llm,
      provider: llmProviderOverride || llm.value.provider,
      baseUrl: llm.value.baseUrl || envConfig.llm.baseUrl,
      apiKey: llmSecret.value,
      model: llm.value.model,
      timeoutMs: llm.value.timeoutMs,
      temperature: llm.value.temperature,
      maxOutputTokens: llm.value.maxOutputTokens,
      strictJsonOutput: llm.value.strictJsonOutput,
      source: llmProviderOverride ? "override" : mapSource(llm.source),
      secretSource: llmSecret.source,
    },
    diarization: {
      ...diarization.value,
      source: mapSource(diarization.source),
    },
  };
}

export async function resolveCallAiWorkerRuntimeConfig(): Promise<ResolvedCallAiWorkerRuntimeConfig> {
  const runtime = await resolveSystemSettingValue<RuntimeWorkerSettingValue>(
    "runtime.worker",
    "active",
    {
      fallbackValue: getEnvRuntimeWorkerSettingValue(),
    },
  );

  return {
    ...runtime.value,
    source: runtime.source,
  };
}

export function buildCallAiRuntimeConfigSnapshot(
  config: ResolvedCallAiRuntimeConfig,
) {
  return {
    asr: {
      source: config.asr.source,
      secretSource: config.asr.secretSource,
      provider: config.asr.provider,
      endpoint: config.asr.endpoint,
      baseUrl: config.asr.baseUrl,
      model: config.asr.model,
      timeoutMs: config.asr.timeoutMs,
      maxFileBytes: config.asr.maxFileBytes,
      language: config.asr.language,
      publicAudioBaseUrlConfigured: Boolean(config.asr.publicAudioBaseUrl),
      enableDiarization: config.asr.enableDiarization,
    },
    llm: {
      source: config.llm.source,
      secretSource: config.llm.secretSource,
      provider: config.llm.provider,
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      timeoutMs: config.llm.timeoutMs,
      temperature: config.llm.temperature,
      maxOutputTokens: config.llm.maxOutputTokens,
      strictJsonOutput: config.llm.strictJsonOutput,
    },
    diarization: config.diarization,
  };
}
