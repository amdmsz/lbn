import { config as loadDotenv } from "dotenv";

import {
  getLogisticsCarrierLabel,
  getLogisticsStatusMeta,
  inferLogisticsCarrierCode,
  type LogisticsBadgeVariant,
} from "@/lib/logistics/metadata";

type XxApiTraceNode = {
  desc?: string;
  logisticsStatus?: string;
  subLogisticsStatus?: string;
  time?: number | string | null;
  areaName?: string | null;
};

type XxApiResponse = {
  code?: number;
  msg?: string;
  data?: {
    logisticsCompanyName?: string | null;
    cpCode?: string | null;
    logisticsStatus?: string | null;
    logisticsStatusDesc?: string | null;
    mailNo?: string | null;
    theLastMessage?: string | null;
    theLastTime?: number | string | null;
    logisticsTraceDetailList?: XxApiTraceNode[] | null;
  } | null;
};

type XxApiQueryAttemptResult =
  | {
      ok: true;
      payload: XxApiResponse;
    }
  | {
      ok: false;
      message: string;
    };

export type LogisticsTraceCheckpoint = {
  id: string;
  description: string;
  occurredAt: string | null;
  areaName: string | null;
  statusCode: string | null;
  subStatusCode: string | null;
};

export type LogisticsTraceResult = {
  mode: "remote" | "missing_tracking" | "not_configured" | "query_failed";
  shippingProvider: string | null;
  carrierCode: string | null;
  trackingNumber: string | null;
  currentStatusCode: string | null;
  currentStatusLabel: string;
  currentStatusVariant: LogisticsBadgeVariant;
  lastUpdatedAt: string | null;
  latestEvent: LogisticsTraceCheckpoint | null;
  checkpoints: LogisticsTraceCheckpoint[];
  message: string | null;
};

let hasLoadedDotenv = false;

function normalizeTimestamp(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  const numericValue = Number(value);
  if (!Number.isNaN(numericValue) && numericValue > 0) {
    return new Date(numericValue).toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildFallbackResult(
  mode: LogisticsTraceResult["mode"],
  message: string,
  trackingNumber: string | null,
  shippingProvider: string | null,
  carrierCode: string | null,
): LogisticsTraceResult {
  const currentStatus =
    mode === "missing_tracking"
      ? { label: "未回填单号", variant: "neutral" as LogisticsBadgeVariant }
      : mode === "not_configured"
        ? { label: "未配置物流服务", variant: "warning" as LogisticsBadgeVariant }
        : getLogisticsStatusMeta("FAIL", "查询失败");

  return {
    mode,
    shippingProvider,
    carrierCode,
    trackingNumber,
    currentStatusCode: null,
    currentStatusLabel: currentStatus.label,
    currentStatusVariant: currentStatus.variant,
    lastUpdatedAt: null,
    latestEvent: null,
    checkpoints: [],
    message,
  };
}

function getEnvValue(key: string) {
  const currentValue = process.env[key]?.trim();
  if (currentValue) {
    return currentValue;
  }

  if (!hasLoadedDotenv) {
    loadDotenv({ path: ".env" });
    loadDotenv({ path: ".env.local", override: true });
    hasLoadedDotenv = true;
  }

  return process.env[key]?.trim() || null;
}

async function requestXxApiTrace(
  endpoint: string,
  apiKey: string,
  params: Readonly<{
    trackingNumber: string;
    receiverPhoneTail: string | null;
    carrierCode: string | null;
    includeCarrierCode: boolean;
  }>,
): Promise<XxApiQueryAttemptResult> {
  const url = new URL(endpoint);
  url.searchParams.set("number", params.trackingNumber);

  if (params.receiverPhoneTail) {
    url.searchParams.set("mobile", params.receiverPhoneTail);
  }

  if (params.includeCarrierCode && params.carrierCode) {
    url.searchParams.set("type", params.carrierCode);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `物流服务响应失败（HTTP ${response.status}）。`,
    };
  }

  return {
    ok: true,
    payload: (await response.json()) as XxApiResponse,
  };
}

function buildCheckpoints(payload: XxApiResponse["data"]) {
  return (payload?.logisticsTraceDetailList ?? [])
    .map((node, index) => ({
      id: `${index}-${node.time ?? "unknown"}`,
      description: node.desc?.trim() || "轨迹节点更新",
      occurredAt: normalizeTimestamp(node.time),
      areaName: node.areaName?.trim() || null,
      statusCode: node.logisticsStatus?.trim() || null,
      subStatusCode: node.subLogisticsStatus?.trim() || null,
    }))
    .sort((left, right) => {
      const leftTime = left.occurredAt ? new Date(left.occurredAt).getTime() : 0;
      const rightTime = right.occurredAt ? new Date(right.occurredAt).getTime() : 0;
      return rightTime - leftTime;
    });
}

export async function queryShippingLogisticsTrace({
  shippingProvider,
  carrier,
  trackingNumber,
  receiverPhoneTail,
}: Readonly<{
  shippingProvider?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  receiverPhoneTail?: string | null;
}>): Promise<LogisticsTraceResult> {
  const normalizedTrackingNumber = trackingNumber?.trim() ?? "";
  const carrierCode = inferLogisticsCarrierCode(shippingProvider, carrier);
  const carrierLabel = getLogisticsCarrierLabel(shippingProvider, carrierCode);

  if (!normalizedTrackingNumber) {
    return buildFallbackResult(
      "missing_tracking",
      "尚未回填物流单号，暂时无法查询物流轨迹。",
      null,
      shippingProvider?.trim() || null,
      carrierCode,
    );
  }

  const apiKey = getEnvValue("XXAPI_API_KEY");
  if (!apiKey) {
    return buildFallbackResult(
      "not_configured",
      "物流轨迹适配层已接入，但当前环境未配置 XXAPI_API_KEY。",
      normalizedTrackingNumber,
      carrierLabel,
      carrierCode,
    );
  }

  const endpoint = getEnvValue("XXAPI_EXPRESS_ENDPOINT") || "https://v2.xxapi.cn/api/express";

  try {
    const attempts = carrierCode ? [true, false] : [false];
    let payload: XxApiResponse | null = null;
    let failureMessage = "物流服务未返回有效轨迹。";

    for (const includeCarrierCode of attempts) {
      const attempt = await requestXxApiTrace(endpoint, apiKey, {
        trackingNumber: normalizedTrackingNumber,
        receiverPhoneTail: receiverPhoneTail?.trim() || null,
        carrierCode,
        includeCarrierCode,
      });

      if (!attempt.ok) {
        failureMessage = attempt.message;
        continue;
      }

      if (attempt.payload.code === 200 && attempt.payload.data) {
        payload = attempt.payload;
        break;
      }

      failureMessage = attempt.payload.msg?.trim() || "物流服务未返回有效轨迹。";
    }

    if (!payload?.data) {
      return buildFallbackResult(
        "query_failed",
        failureMessage,
        normalizedTrackingNumber,
        carrierLabel,
        carrierCode,
      );
    }

    const checkpoints = buildCheckpoints(payload.data);
    const latestEvent =
      checkpoints[0] ??
      (payload.data.theLastMessage
        ? {
            id: "latest-message",
            description: payload.data.theLastMessage,
            occurredAt: normalizeTimestamp(payload.data.theLastTime),
            areaName: null,
            statusCode: payload.data.logisticsStatus?.trim() || null,
            subStatusCode: null,
          }
        : null);

    const statusMeta = getLogisticsStatusMeta(
      payload.data.logisticsStatus ?? latestEvent?.statusCode ?? null,
      payload.data.logisticsStatusDesc ?? latestEvent?.description ?? null,
    );

    return {
      mode: "remote",
      shippingProvider: payload.data.logisticsCompanyName?.trim() || carrierLabel,
      carrierCode: payload.data.cpCode?.trim() || carrierCode,
      trackingNumber: payload.data.mailNo?.trim() || normalizedTrackingNumber,
      currentStatusCode:
        payload.data.logisticsStatus?.trim() || latestEvent?.statusCode || null,
      currentStatusLabel: statusMeta.label,
      currentStatusVariant: statusMeta.variant,
      lastUpdatedAt:
        normalizeTimestamp(payload.data.theLastTime) || latestEvent?.occurredAt || null,
      latestEvent,
      checkpoints,
      message:
        checkpoints.length === 0
          ? payload.data.logisticsStatusDesc?.trim() || "暂无物流轨迹。"
          : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "物流服务请求失败。";

    return buildFallbackResult(
      "query_failed",
      message,
      normalizedTrackingNumber,
      carrierLabel,
      carrierCode,
    );
  }
}
