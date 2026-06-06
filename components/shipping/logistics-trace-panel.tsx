"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { LogisticsTraceContent } from "@/components/shipping/logistics-trace-content";
import { useLogisticsTrace } from "@/lib/logistics/client";
import {
  getShippingLogisticsStatusMeta,
  getShippingLogisticsSummaryText,
} from "@/lib/logistics/metadata";
import { cn } from "@/lib/utils";

export function LogisticsTracePanel({
  shippingTaskId,
  shippingProvider,
  trackingNumber,
  className,
  title = "查看物流",
}: Readonly<{
  shippingTaskId: string;
  shippingProvider?: string | null;
  trackingNumber?: string | null;
  className?: string;
  title?: string;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const { loadState, data, reload } = useLogisticsTrace(shippingTaskId, isOpen);

  const summaryText = getShippingLogisticsSummaryText({
    shippingProvider: data?.trace.shippingProvider ?? shippingProvider,
    carrierCode: data?.trace.carrierCode,
    trackingNumber: data?.trace.trackingNumber ?? trackingNumber,
  });

  const traceStatusMeta = getShippingLogisticsStatusMeta({
    shippingStatus: data?.shippingTask.shippingStatus,
    trackingNumber: data?.trace.trackingNumber ?? trackingNumber,
    traceMode: data?.trace.mode,
    traceStatusCode: data?.trace.currentStatusCode,
    traceStatusLabel: data?.trace.currentStatusLabel,
  });

  return (
    <details
      className={cn(
        "rounded-xl border border-border/60 bg-[rgba(247,248,250,0.72)]",
        className,
      )}
      onToggle={(event) => setIsOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="text-xs leading-5 text-muted-foreground/70">{summaryText}</div>
          </div>
          {data ? (
            <StatusBadge label={traceStatusMeta.label} variant={traceStatusMeta.variant} />
          ) : (
            <span className="text-xs text-muted-foreground/70">
              {trackingNumber ? "展开查看" : "待回填单号"}
            </span>
          )}
        </div>
      </summary>

      <div className="border-t border-border/60 px-3.5 py-3.5">
        <LogisticsTraceContent
          loadState={loadState}
          shippingProvider={shippingProvider}
          trackingNumber={trackingNumber}
          onRetry={reload}
        />
      </div>
    </details>
  );
}
