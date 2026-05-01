import "dotenv/config";
import type { OutboundCallProvider } from "@prisma/client";
import type { ResolvedOutboundCallRuntimeConfig } from "../lib/outbound-calls/config";
import { createOutboundCallProviderAdapter } from "../lib/outbound-calls/providers";

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function writeJsonLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

function normalizeProvider(value: string | undefined): OutboundCallProvider {
  const provider = value?.trim().toUpperCase();

  if (provider === "MOCK" || provider === "FREESWITCH" || provider === "CUSTOM_HTTP") {
    return provider;
  }

  return "CUSTOM_HTTP";
}

function splitEndpoint(endpoint: string | undefined) {
  if (!endpoint) {
    return {
      gatewayBaseUrl: process.env.OUTBOUND_CALL_GATEWAY_BASE_URL?.trim() || null,
      startPath: process.env.OUTBOUND_CALL_START_PATH?.trim() || "/calls/start",
    };
  }

  const url = new URL(endpoint);
  return {
    gatewayBaseUrl: `${url.protocol}//${url.host}`,
    startPath: `${url.pathname}${url.search || ""}` || "/calls/start",
  };
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildConfig(provider: OutboundCallProvider): ResolvedOutboundCallRuntimeConfig {
  const endpoint = getArg("endpoint");
  const endpointParts = splitEndpoint(endpoint);
  const secret =
    getArg("secret") ?? process.env.OUTBOUND_CALL_WEBHOOK_SECRET?.trim() ?? "";

  return {
    enabled: true,
    provider,
    gatewayBaseUrl:
      getArg("gateway-base-url") ??
      endpointParts.gatewayBaseUrl ??
      (provider === "MOCK" ? null : ""),
    startPath: getArg("start-path") ?? endpointParts.startPath,
    webhookBaseUrl:
      getArg("webhook-base-url") ??
      process.env.OUTBOUND_CALL_WEBHOOK_BASE_URL?.trim() ??
      null,
    defaultRoutingGroup:
      getArg("routing-group") ??
      process.env.OUTBOUND_CALL_DEFAULT_ROUTING_GROUP?.trim() ??
      null,
    dialPrefix:
      getArg("dial-prefix") ?? process.env.OUTBOUND_CALL_DIAL_PREFIX?.trim() ?? null,
    defaultDisplayNumber:
      getArg("display-number") ??
      process.env.OUTBOUND_CALL_DEFAULT_DISPLAY_NUMBER?.trim() ??
      null,
    codec: (getArg("codec") ?? process.env.OUTBOUND_CALL_CODEC ?? "PCMA").toUpperCase() as
      | "PCMA"
      | "PCMU"
      | "OPUS"
      | "AUTO",
    recordOnServer: getArg("record-on-server") !== "0",
    recordingImportMode: "WEBHOOK_URL",
    timeoutSeconds: parsePositiveInt(getArg("timeout-seconds"), 30),
    startRetryAttempts: parsePositiveInt(getArg("retry-attempts"), 2),
    startRetryDelayMs: parsePositiveInt(getArg("retry-delay-ms"), 350),
    requireWebhookSecret: false,
    webhookTimestampToleranceSeconds: 300,
    source: "fallback",
    secret,
    secretSource: secret ? "fallback" : "default",
  };
}

async function main() {
  const provider = normalizeProvider(getArg("provider") ?? process.env.OUTBOUND_CALL_PROVIDER);
  const config = buildConfig(provider);
  const adapter = createOutboundCallProviderAdapter(provider, config);
  const sessionId = getArg("session-id") ?? `smoke_${Date.now()}`;
  const callRecordId = getArg("call-record-id") ?? `smoke_call_${Date.now()}`;

  const result = await adapter.startOutboundCall({
    sessionId,
    callRecordId,
    customerId: getArg("customer-id") ?? "smoke_customer",
    customerName: getArg("customer-name") ?? "CTI 联调客户",
    customerPhone: getArg("phone") ?? "13800000000",
    dialedNumber: getArg("dialed-number") ?? getArg("phone") ?? "13800000000",
    salesId: getArg("sales-id") ?? "smoke_sales",
    seatNo: getArg("seat-no") ?? "6001",
    extensionNo: getArg("extension-no") ?? null,
    displayNumber: config.defaultDisplayNumber,
    routingGroup: config.defaultRoutingGroup,
    codec: config.codec,
    recordOnServer: config.recordOnServer,
    webhookBaseUrl: config.webhookBaseUrl,
  });

  writeJsonLine({
    event: "outbound_provider.start_ok",
    provider,
    gatewayBaseUrl: config.gatewayBaseUrl,
    startPath: config.startPath,
    providerCallId: result.providerCallId,
    providerTraceId: result.providerTraceId,
    initialStatus: result.initialStatus,
  });
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "outbound_provider.start_failed",
      message:
        error instanceof Error
          ? error.message
          : "Outbound provider check failed.",
    }),
  );
  process.exitCode = 1;
});
