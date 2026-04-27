import type {
  OutboundCallProvider,
  OutboundCallSessionStatus,
} from "@prisma/client";
import type { ResolvedOutboundCallRuntimeConfig } from "@/lib/outbound-calls/config";

export type StartOutboundCallAdapterInput = {
  sessionId: string;
  callRecordId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  dialedNumber: string;
  salesId: string;
  seatNo: string;
  extensionNo: string | null;
  displayNumber: string | null;
  routingGroup: string | null;
  codec: string;
  recordOnServer: boolean;
  webhookBaseUrl: string | null;
};

export type StartOutboundCallAdapterResult = {
  providerCallId: string;
  providerTraceId: string | null;
  initialStatus: OutboundCallSessionStatus;
};

export type OutboundCallProviderAdapter = {
  startOutboundCall(
    input: StartOutboundCallAdapterInput,
  ): Promise<StartOutboundCallAdapterResult>;
};

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeInitialStatus(value: unknown): OutboundCallSessionStatus {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";

  switch (status) {
    case "RINGING":
      return "RINGING";
    case "ANSWERED":
      return "ANSWERED";
    case "FAILED":
      return "FAILED";
    case "REQUESTED":
      return "REQUESTED";
    case "PROVIDER_ACCEPTED":
    case "ACCEPTED":
    case "OK":
    default:
      return "PROVIDER_ACCEPTED";
  }
}

function parseGatewayStartResult(
  payload: unknown,
  fallbackProviderCallId: string,
): StartOutboundCallAdapterResult {
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const providerCallId =
    asNonEmptyString(body.providerCallId) ??
    asNonEmptyString(body.callId) ??
    asNonEmptyString(body.uuid) ??
    asNonEmptyString(body.uniqueId) ??
    fallbackProviderCallId;

  return {
    providerCallId,
    providerTraceId:
      asNonEmptyString(body.providerTraceId) ??
      asNonEmptyString(body.traceId) ??
      asNonEmptyString(body.requestId),
    initialStatus: normalizeInitialStatus(body.status),
  };
}

function createMockProviderAdapter(): OutboundCallProviderAdapter {
  return {
    async startOutboundCall(input) {
      return {
        providerCallId: `mock_${input.sessionId}`,
        providerTraceId: `mock_trace_${input.callRecordId}`,
        initialStatus: "PROVIDER_ACCEPTED",
      };
    },
  };
}

function buildGatewayUrl(config: ResolvedOutboundCallRuntimeConfig) {
  if (!config.gatewayBaseUrl) {
    throw new Error("CTI Gateway Base URL 未配置。");
  }

  return new URL(config.startPath || "/calls/start", config.gatewayBaseUrl);
}

function createHttpProviderAdapter(
  config: ResolvedOutboundCallRuntimeConfig,
): OutboundCallProviderAdapter {
  return {
    async startOutboundCall(input) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        config.timeoutSeconds * 1000,
      );

      try {
        const response = await fetch(buildGatewayUrl(config), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.secret
              ? { Authorization: `Bearer ${config.secret}` }
              : {}),
          },
          body: JSON.stringify({
            correlationId: input.sessionId,
            sessionId: input.sessionId,
            callRecordId: input.callRecordId,
            customerId: input.customerId,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            dialedNumber: input.dialedNumber,
            salesId: input.salesId,
            seatNo: input.seatNo,
            extensionNo: input.extensionNo,
            displayNumber: input.displayNumber,
            routingGroup: input.routingGroup,
            codec: input.codec,
            recordOnServer: input.recordOnServer,
            webhookBaseUrl: input.webhookBaseUrl,
          }),
          signal: controller.signal,
        });

        const text = await response.text();
        const payload = text ? JSON.parse(text) : {};

        if (!response.ok) {
          const message =
            payload && typeof payload === "object"
              ? asNonEmptyString((payload as Record<string, unknown>).message)
              : null;
          throw new Error(message ?? `CTI Gateway 返回 ${response.status}。`);
        }

        return parseGatewayStartResult(payload, input.sessionId);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function createOutboundCallProviderAdapter(
  provider: OutboundCallProvider,
  config: ResolvedOutboundCallRuntimeConfig,
) {
  switch (provider) {
    case "MOCK":
      return createMockProviderAdapter();
    case "FREESWITCH":
    case "CUSTOM_HTTP":
      return createHttpProviderAdapter(config);
    default:
      throw new Error("暂不支持该外呼 Provider。");
  }
}
