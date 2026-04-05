"use client";

import { useCallback, useEffect, useState } from "react";
import type { LogisticsBadgeVariant, LogisticsTraceMode } from "@/lib/logistics/metadata";

export type LogisticsTracePanelData = {
  shippingTask: {
    id: string;
    shippingProvider: string | null;
    trackingNumber: string | null;
    shippingStatus: string;
    shippedAt: string | null;
    tradeOrder: {
      id: string;
      tradeNo: string;
    } | null;
    salesOrder: {
      id: string;
      orderNo: string;
      subOrderNo: string | null;
      displayNo: string;
      supplier: {
        id: string;
        name: string;
      };
    } | null;
  };
  trace: {
    mode: LogisticsTraceMode;
    shippingProvider: string | null;
    carrierCode: string | null;
    trackingNumber: string | null;
    currentStatusCode: string | null;
    currentStatusLabel: string;
    currentStatusVariant: LogisticsBadgeVariant;
    lastUpdatedAt: string | null;
    latestEvent: {
      id: string;
      description: string;
      occurredAt: string | null;
      areaName: string | null;
      statusCode: string | null;
      subStatusCode: string | null;
    } | null;
    checkpoints: Array<{
      id: string;
      description: string;
      occurredAt: string | null;
      areaName: string | null;
      statusCode: string | null;
      subStatusCode: string | null;
    }>;
    message: string | null;
  };
};

export type LogisticsTraceLoadState =
  | { status: "idle"; shippingTaskId: string | null }
  | { status: "loading"; shippingTaskId: string }
  | { status: "loaded"; shippingTaskId: string; data: LogisticsTracePanelData }
  | { status: "error"; shippingTaskId: string; message: string };

export async function fetchLogisticsTrace(
  shippingTaskId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/logistics/track?shippingTaskId=${encodeURIComponent(shippingTaskId)}`,
    {
      method: "GET",
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(payload?.message || `物流查询失败（HTTP ${response.status}）`);
  }

  return (await response.json()) as LogisticsTracePanelData;
}

export function useLogisticsTrace(shippingTaskId?: string | null, enabled = false) {
  const normalizedShippingTaskId = shippingTaskId?.trim() ?? "";
  const [requestVersion, setRequestVersion] = useState(0);
  const [loadState, setLoadState] = useState<LogisticsTraceLoadState>({
    status: "idle",
    shippingTaskId: normalizedShippingTaskId || null,
  });
  const activeLoadState =
    loadState.shippingTaskId === (normalizedShippingTaskId || null) ||
    loadState.shippingTaskId === normalizedShippingTaskId
      ? loadState
      : ({
          status: "idle",
          shippingTaskId: normalizedShippingTaskId || null,
        } satisfies LogisticsTraceLoadState);

  useEffect(() => {
    if (!enabled || !normalizedShippingTaskId) {
      return;
    }

    const controller = new AbortController();

    async function loadTrace() {
      setLoadState({ status: "loading", shippingTaskId: normalizedShippingTaskId });

      try {
        const payload = await fetchLogisticsTrace(normalizedShippingTaskId, controller.signal);
        setLoadState({
          status: "loaded",
          shippingTaskId: normalizedShippingTaskId,
          data: payload,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadState({
            status: "error",
            shippingTaskId: normalizedShippingTaskId,
            message: error instanceof Error ? error.message : "物流查询失败",
          });
        }
      }
    }

    void loadTrace();

    return () => controller.abort();
  }, [enabled, normalizedShippingTaskId, requestVersion]);

  const reload = useCallback(() => {
    setRequestVersion((current) => current + 1);
  }, []);

  return {
    loadState: activeLoadState,
    data: activeLoadState.status === "loaded" ? activeLoadState.data : null,
    isLoading: activeLoadState.status === "loading",
    errorMessage: activeLoadState.status === "error" ? activeLoadState.message : null,
    reload,
  };
}
