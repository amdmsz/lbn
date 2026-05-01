import type { OutboundCallProvider } from "@prisma/client";
import {
  getSystemSettingSecret,
  resolveSystemSettingValue,
} from "@/lib/system-settings/queries";
import {
  OUTBOUND_CALL_CODECS,
  OUTBOUND_CALL_PROVIDERS,
  OUTBOUND_CALL_RECORDING_IMPORT_MODES,
  type OutboundCallProviderSettingValue,
} from "@/lib/system-settings/schema";

export type OutboundCallRuntimeProvider =
  OutboundCallProviderSettingValue["provider"];

export type ResolvedOutboundCallRuntimeConfig =
  OutboundCallProviderSettingValue & {
    startRetryAttempts: number;
    startRetryDelayMs: number;
    source: "database" | "fallback" | "default";
    secret: string;
    secretSource: "database" | "fallback" | "default";
  };

function normalizeProvider(value: string | undefined): OutboundCallRuntimeProvider {
  const provider = value?.trim().toUpperCase();

  return OUTBOUND_CALL_PROVIDERS.includes(provider as OutboundCallRuntimeProvider)
    ? (provider as OutboundCallRuntimeProvider)
    : "DISABLED";
}

function normalizeCodec(
  value: string | undefined,
): OutboundCallProviderSettingValue["codec"] {
  const codec = value?.trim().toUpperCase();

  return OUTBOUND_CALL_CODECS.includes(
    codec as OutboundCallProviderSettingValue["codec"],
  )
    ? (codec as OutboundCallProviderSettingValue["codec"])
    : "PCMA";
}

function normalizeRecordingImportMode(
  value: string | undefined,
): OutboundCallProviderSettingValue["recordingImportMode"] {
  const mode = value?.trim().toUpperCase();

  return OUTBOUND_CALL_RECORDING_IMPORT_MODES.includes(
    mode as OutboundCallProviderSettingValue["recordingImportMode"],
  )
    ? (mode as OutboundCallProviderSettingValue["recordingImportMode"])
    : "WEBHOOK_URL";
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoundedPositiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  return Math.min(parsePositiveInt(value, fallback), max);
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getEnvOutboundCallSettingValue(): OutboundCallProviderSettingValue {
  const provider = normalizeProvider(process.env.OUTBOUND_CALL_PROVIDER);

  return {
    enabled: process.env.OUTBOUND_CALL_ENABLED === "1" && provider !== "DISABLED",
    provider,
    gatewayBaseUrl: normalizeOptional(process.env.OUTBOUND_CALL_GATEWAY_BASE_URL),
    startPath: process.env.OUTBOUND_CALL_START_PATH?.trim() || "/calls/start",
    webhookBaseUrl: normalizeOptional(process.env.OUTBOUND_CALL_WEBHOOK_BASE_URL),
    defaultRoutingGroup: normalizeOptional(
      process.env.OUTBOUND_CALL_DEFAULT_ROUTING_GROUP,
    ),
    dialPrefix: normalizeOptional(process.env.OUTBOUND_CALL_DIAL_PREFIX),
    defaultDisplayNumber: normalizeOptional(
      process.env.OUTBOUND_CALL_DEFAULT_DISPLAY_NUMBER,
    ),
    codec: normalizeCodec(process.env.OUTBOUND_CALL_CODEC),
    recordOnServer: process.env.OUTBOUND_CALL_RECORD_ON_SERVER !== "0",
    recordingImportMode: normalizeRecordingImportMode(
      process.env.OUTBOUND_CALL_RECORDING_IMPORT_MODE,
    ),
    timeoutSeconds: parsePositiveInt(process.env.OUTBOUND_CALL_TIMEOUT_SECONDS, 30),
    requireWebhookSecret: process.env.OUTBOUND_CALL_REQUIRE_WEBHOOK_SECRET !== "0",
    webhookTimestampToleranceSeconds: parsePositiveInt(
      process.env.OUTBOUND_CALL_WEBHOOK_TOLERANCE_SECONDS,
      300,
    ),
  };
}

export function isRuntimeProviderEnabled(
  provider: OutboundCallRuntimeProvider,
): provider is OutboundCallProvider {
  return provider === "MOCK" || provider === "FREESWITCH" || provider === "CUSTOM_HTTP";
}

export async function resolveOutboundCallRuntimeConfig(): Promise<ResolvedOutboundCallRuntimeConfig> {
  const envValue = getEnvOutboundCallSettingValue();
  const forceEnvConfig = process.env.OUTBOUND_CALL_FORCE_ENV_CONFIG === "1";
  const setting = forceEnvConfig
    ? ({
        value: envValue,
        source: "fallback",
      } as const)
    : await resolveSystemSettingValue<OutboundCallProviderSettingValue>(
        "outbound_call.provider",
        "active",
        {
          fallbackValue: envValue,
        },
      );
  const fallbackSecret = process.env.OUTBOUND_CALL_WEBHOOK_SECRET?.trim() ?? "";
  const databaseSecret = forceEnvConfig
    ? null
    : await getSystemSettingSecret("outbound_call.provider", "active");
  const secret = databaseSecret ?? fallbackSecret;

  return {
    ...setting.value,
    startRetryAttempts: parseBoundedPositiveInt(
      process.env.OUTBOUND_CALL_START_RETRY_ATTEMPTS,
      2,
      3,
    ),
    startRetryDelayMs: parseBoundedPositiveInt(
      process.env.OUTBOUND_CALL_START_RETRY_DELAY_MS,
      350,
      3000,
    ),
    source: setting.source,
    secret,
    secretSource: databaseSecret
      ? "database"
      : fallbackSecret
        ? "fallback"
        : "default",
  };
}

export async function isOutboundCallRuntimeEnabled() {
  const config = await resolveOutboundCallRuntimeConfig();
  return config.enabled && isRuntimeProviderEnabled(config.provider);
}
