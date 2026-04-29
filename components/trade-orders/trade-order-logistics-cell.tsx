"use client";

import { useEffect, useRef, useState } from "react";
import { LogisticsTraceContent } from "@/components/shipping/logistics-trace-content";
import { ClientPortal } from "@/components/shared/client-portal";
import { useLogisticsTrace } from "@/lib/logistics/client";
import {
  getLogisticsCarrierLabel,
  getNormalizedTrackingNumber,
  getShippingLogisticsStatusMeta,
} from "@/lib/logistics/metadata";
import { cn } from "@/lib/utils";

const logisticsButtonVariants = {
  neutral:
    "border-border/50 bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
  info:
    "border-primary/20 bg-primary/10 text-primary hover:border-primary/30 hover:bg-primary/15",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/70 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100/70 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  danger:
    "border-destructive/20 bg-destructive/10 text-destructive hover:border-destructive/30 hover:bg-destructive/15",
} as const;

type HoverCardPosition = {
  top: number;
  left: number;
};

export function TradeOrderLogisticsCell({
  receiverName,
  receiverPhone,
  receiverAddress,
  shippingTaskId,
  shippingProvider,
  trackingNumber,
  shippingStatus,
}: Readonly<{
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  shippingTaskId?: string | null;
  shippingProvider?: string | null;
  trackingNumber?: string | null;
  shippingStatus?: string | null;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isHoverOpen, setIsHoverOpen] = useState(false);
  const [hoverCardPosition, setHoverCardPosition] = useState<HoverCardPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const { loadState, data, reload } = useLogisticsTrace(shippingTaskId, isOpen);

  const effectiveProvider = data?.trace.shippingProvider ?? shippingProvider ?? null;
  const effectiveTrackingNumber = data?.trace.trackingNumber ?? trackingNumber ?? null;
  const normalizedTrackingNumber = getNormalizedTrackingNumber(effectiveTrackingNumber);
  const providerLabel =
    effectiveProvider?.trim() || data?.trace.carrierCode
      ? getLogisticsCarrierLabel(effectiveProvider, data?.trace.carrierCode ?? null)
      : "物流公司未知";

  const logisticsStatusMeta = getShippingLogisticsStatusMeta({
    shippingStatus: data?.shippingTask.shippingStatus ?? shippingStatus,
    trackingNumber: effectiveTrackingNumber,
    traceMode: data?.trace.mode,
    traceStatusCode: data?.trace.currentStatusCode,
    traceStatusLabel: data?.trace.currentStatusLabel,
  });

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openHoverCard() {
    clearCloseTimer();

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const cardWidth = 224;
    const left = Math.min(
      window.innerWidth - cardWidth - 12,
      Math.max(12, rect.left + rect.width / 2 - cardWidth / 2),
    );

    setHoverCardPosition({
      top: Math.max(12, rect.top - 10),
      left,
    });
    setIsHoverOpen(true);
  }

  function scheduleCloseHoverCard() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsHoverOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }

  function closeHoverCardImmediately() {
    clearCloseTimer();
    setIsHoverOpen(false);
  }

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  async function handleCopyTrackingNumber() {
    if (!normalizedTrackingNumber) {
      return;
    }

    await navigator.clipboard.writeText(normalizedTrackingNumber);
    setCopied(true);
  }

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-medium text-foreground">
                {receiverName || "未填写收件人"}
              </span>
              <span className="text-xs text-muted-foreground">
                {receiverPhone || "暂无手机号"}
              </span>
            </div>
            <div className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
              {receiverAddress || "未填写收件地址"}
            </div>
          </div>

          <button
            ref={buttonRef}
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold leading-none transition",
              logisticsButtonVariants[logisticsStatusMeta.variant],
            )}
            onMouseEnter={openHoverCard}
            onMouseLeave={scheduleCloseHoverCard}
            onFocus={openHoverCard}
            onBlur={scheduleCloseHoverCard}
            onClick={() => {
              closeHoverCardImmediately();
              setIsOpen(true);
            }}
          >
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {logisticsStatusMeta.label}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{providerLabel}</span>
          <span className="font-mono tabular-nums tracking-[0.01em] text-muted-foreground">
            {normalizedTrackingNumber || "未回填单号"}
          </span>
        </div>
      </div>

      {isHoverOpen && hoverCardPosition ? (
        <ClientPortal>
          <div
            className="fixed z-[10020] w-56 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-lg"
            style={{
              top: hoverCardPosition.top,
              left: hoverCardPosition.left,
              transform: "translateY(-100%)",
            }}
            role="tooltip"
            onMouseEnter={openHoverCard}
            onMouseLeave={scheduleCloseHoverCard}
          >
            <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">
              物流信息
            </div>
            <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <div>快递公司：{providerLabel}</div>
              <div className="flex items-start gap-2">
                <span className="shrink-0">物流单号：</span>
                <div className="min-w-0">
                  {normalizedTrackingNumber ? (
                    <button
                      type="button"
                      className="block max-w-full truncate whitespace-nowrap text-left font-mono text-[10px] font-medium tabular-nums tracking-[0.01em] text-primary hover:underline"
                      title={normalizedTrackingNumber}
                      onClick={handleCopyTrackingNumber}
                    >
                      {normalizedTrackingNumber}
                    </button>
                  ) : (
                    <span>物流单号未知</span>
                  )}
                  {copied ? (
                    <div className="mt-0.5 text-[11px] text-primary">
                      已复制
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                点击状态标签可查看完整轨迹。
              </div>
            </div>
          </div>
        </ClientPortal>
      ) : null}

      {isOpen ? (
        <ClientPortal>
          <div className="fixed inset-0 z-[10010] flex justify-end bg-black/20 backdrop-blur-sm">
            <div
              className="h-[100dvh] w-full max-w-[26rem] overflow-y-auto border-l border-border/60 bg-card px-5 py-5 shadow-2xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground">
                    物流轨迹
                  </h3>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {providerLabel} /{" "}
                    {normalizedTrackingNumber || "物流单号未知"}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  onClick={() => setIsOpen(false)}
                >
                  关闭
                </button>
              </div>

              <div className="mt-4">
                <LogisticsTraceContent
                  loadState={loadState}
                  shippingProvider={shippingProvider}
                  trackingNumber={trackingNumber}
                  shippingStatus={shippingStatus}
                  onRetry={reload}
                  showCopyAction={false}
                />
              </div>
            </div>
            <button
              type="button"
              className="flex-1"
              aria-label="关闭物流轨迹面板"
              onClick={() => setIsOpen(false)}
            />
          </div>
        </ClientPortal>
      ) : null}
    </>
  );
}
