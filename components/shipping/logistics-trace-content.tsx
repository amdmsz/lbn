"use client";

import { StatusBadge } from "@/components/shared/status-badge";
import type {
  LogisticsTraceLoadState,
  LogisticsTracePanelData,
} from "@/lib/logistics/client";
import {
  getLogisticsCarrierLabel,
  getNormalizedTrackingNumber,
  getShippingLogisticsStatusMeta,
} from "@/lib/logistics/metadata";

function formatDateTime(value: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getLoadedData(loadState: LogisticsTraceLoadState): LogisticsTracePanelData | null {
  return loadState.status === "loaded" ? loadState.data : null;
}

export function LogisticsTraceContent({
  loadState,
  shippingProvider,
  trackingNumber,
  shippingStatus,
  onRetry,
  onCopyTrackingNumber,
  copied = false,
  showCopyAction = true,
}: Readonly<{
  loadState: LogisticsTraceLoadState;
  shippingProvider?: string | null;
  trackingNumber?: string | null;
  shippingStatus?: string | null;
  onRetry: () => void;
  onCopyTrackingNumber?: () => void | Promise<void>;
  copied?: boolean;
  showCopyAction?: boolean;
}>) {
  const data = getLoadedData(loadState);
  const effectiveTrackingNumber = data?.trace.trackingNumber ?? trackingNumber ?? null;
  const normalizedTrackingNumber = getNormalizedTrackingNumber(effectiveTrackingNumber);
  const effectiveProvider = data?.trace.shippingProvider ?? shippingProvider;
  const effectiveCarrierCode = data?.trace.carrierCode ?? null;
  const providerLabel =
    effectiveProvider?.trim() || effectiveCarrierCode
      ? getLogisticsCarrierLabel(effectiveProvider, effectiveCarrierCode)
      : "物流公司未知";

  const traceStatusMeta = getShippingLogisticsStatusMeta({
    shippingStatus: data?.shippingTask.shippingStatus ?? shippingStatus,
    trackingNumber: effectiveTrackingNumber,
    traceMode: data?.trace.mode,
    traceStatusCode: data?.trace.currentStatusCode,
    traceStatusLabel: data?.trace.currentStatusLabel,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={traceStatusMeta.label} variant={traceStatusMeta.variant} />
        {data?.trace.lastUpdatedAt ? (
          <span className="text-xs text-black/48">
            最近更新：{formatDateTime(data.trace.lastUpdatedAt)}
          </span>
        ) : null}
        {showCopyAction && normalizedTrackingNumber && onCopyTrackingNumber ? (
          <button
            type="button"
            className="text-xs font-medium text-[var(--color-info)] hover:underline"
            onClick={onCopyTrackingNumber}
          >
            复制单号
          </button>
        ) : null}
        {copied ? <span className="text-[11px] text-[var(--color-info)]">已复制</span> : null}
        <button
          type="button"
          className="text-xs font-medium text-[var(--color-info)] hover:underline"
          onClick={onRetry}
        >
          刷新轨迹
        </button>
      </div>

      {loadState.status === "loading" ? (
        <div className="text-sm text-black/58">正在查询物流轨迹...</div>
      ) : loadState.status === "error" ? (
        <div className="rounded-[0.8rem] border border-[rgba(141,59,51,0.14)] bg-[rgba(255,247,246,0.78)] px-3 py-2.5 text-sm text-[var(--color-danger)]">
          <div>{loadState.message}</div>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-[var(--color-danger)] hover:underline"
            onClick={onRetry}
          >
            重新查询
          </button>
        </div>
      ) : data ? (
        <>
          <div className="rounded-[0.9rem] border border-black/8 bg-[rgba(247,248,250,0.82)] px-3.5 py-3">
            <div className="space-y-1 text-sm text-black/66">
              <div>快递公司：{providerLabel || "物流公司未知"}</div>
              <div>物流单号：{normalizedTrackingNumber || "物流单号未知"}</div>
              <div>当前状态：{traceStatusMeta.label}</div>
              {data.trace.latestEvent ? (
                <div>
                  最近节点：{data.trace.latestEvent.description}
                  {data.trace.latestEvent.areaName ? ` / ${data.trace.latestEvent.areaName}` : ""}
                </div>
              ) : null}
              {data.trace.message ? <div>说明：{data.trace.message}</div> : null}
            </div>
          </div>

          {data.trace.checkpoints.length > 0 ? (
            <div className="space-y-2 rounded-[0.9rem] border border-black/8 bg-white px-3.5 py-3">
              {data.trace.checkpoints.map((checkpoint) => (
                <div
                  key={checkpoint.id}
                  className="grid gap-1 border-b border-black/6 pb-2 text-sm text-black/66 last:border-b-0 last:pb-0 md:grid-cols-[7rem_minmax(0,1fr)]"
                >
                  <div className="text-xs text-black/45">
                    {formatDateTime(checkpoint.occurredAt)}
                  </div>
                  <div>
                    <div>{checkpoint.description}</div>
                    {checkpoint.areaName ? (
                      <div className="text-xs text-black/48">{checkpoint.areaName}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-[0.9rem] border border-black/8 bg-[rgba(247,248,250,0.82)] px-3.5 py-3 text-sm text-black/62">
          <div>快递公司：{providerLabel || "物流公司未知"}</div>
          <div className="mt-1">物流单号：{normalizedTrackingNumber || "物流单号未知"}</div>
          <div className="mt-1">
            {normalizedTrackingNumber ? "点击刷新后可查看最新物流轨迹。" : "未回填物流，暂无可查询轨迹。"}
          </div>
        </div>
      )}
    </div>
  );
}
