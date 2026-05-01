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

class GatewayStartError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GatewayStartError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGatewayPayload(text: string, responseOk: boolean) {
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (responseOk) {
      throw new GatewayStartError(
        "CTI Gateway 返回了无法解析的 JSON，外呼状态不可确认。",
        false,
      );
    }

    return {
      message: text.slice(0, 500),
    };
  }
}

function getGatewayFailureMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    const nestedError =
      body.error && typeof body.error === "object"
        ? (body.error as Record<string, unknown>)
        : null;

    return (
      asNonEmptyString(body.message) ??
      asNonEmptyString(nestedError?.message) ??
      asNonEmptyString(body.error) ??
      `CTI Gateway 返回 HTTP ${status}。`
    );
  }

  return `CTI Gateway 返回 HTTP ${status}。`;
}

function isRetryableHttpStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function normalizeGatewayStartError(error: unknown, timeoutSeconds: number) {
  if (error instanceof GatewayStartError) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    return new GatewayStartError(
      `CTI Gateway 请求超时（${timeoutSeconds}s）。`,
      true,
    );
  }

  const message =
    error instanceof Error ? error.message : "CTI Gateway 网络请求失败。";

  return new GatewayStartError(`CTI Gateway 网络请求失败：${message}`, true);
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
      const gatewayUrl = buildGatewayUrl(config);
      const attempts = Math.max(1, config.startRetryAttempts);
      let lastError: GatewayStartError | null = null;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          config.timeoutSeconds * 1000,
        );

        try {
          const response = await fetch(gatewayUrl, {
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
          const payload = parseGatewayPayload(text, response.ok);

          if (!response.ok) {
            throw new GatewayStartError(
              getGatewayFailureMessage(payload, response.status),
              isRetryableHttpStatus(response.status),
            );
          }

          return parseGatewayStartResult(payload, input.sessionId);
        } catch (error) {
          const normalized = normalizeGatewayStartError(
            error,
            config.timeoutSeconds,
          );
          lastError = normalized;

          if (!normalized.retryable || attempt === attempts) {
            break;
          }

          await sleep(config.startRetryDelayMs * attempt);
        } finally {
          clearTimeout(timer);
        }
      }

      throw new Error(
        attempts > 1 && lastError
          ? `${lastError.message}（已重试 ${attempts} 次）`
          : lastError?.message ?? "CTI Gateway 调用失败。",
      );
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
