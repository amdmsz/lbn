"use client";

import { useEffect, useRef, useState } from "react";
import { LogisticsTraceContent } from "@/components/shipping/logistics-trace-content";
import { useLogisticsTrace } from "@/lib/logistics/client";
import {
  getLogisticsCarrierLabel,
  getNormalizedTrackingNumber,
  getShippingLogisticsStatusMeta,
} from "@/lib/logistics/metadata";
import { cn } from "@/lib/utils";

const logisticsButtonVariants = {
  neutral:
    "border-black/10 bg-[rgba(18,24,31,0.04)] text-black/68 hover:border-black/16 hover:bg-[rgba(18,24,31,0.06)]",
  info:
    "border-[rgba(54,95,135,0.16)] bg-[rgba(54,95,135,0.10)] text-[var(--color-info)] hover:border-[rgba(54,95,135,0.24)] hover:bg-[rgba(54,95,135,0.14)]",
  success:
    "border-[rgba(47,107,71,0.16)] bg-[rgba(47,107,71,0.10)] text-[var(--color-success)] hover:border-[rgba(47,107,71,0.24)] hover:bg-[rgba(47,107,71,0.14)]",
  warning:
    "border-[rgba(155,106,29,0.16)] bg-[rgba(155,106,29,0.10)] text-[var(--color-warning)] hover:border-[rgba(155,106,29,0.24)] hover:bg-[rgba(155,106,29,0.14)]",
  danger:
    "border-[rgba(141,59,51,0.16)] bg-[rgba(141,59,51,0.10)] text-[var(--color-danger)] hover:border-[rgba(141,59,51,0.24)] hover:bg-[rgba(141,59,51,0.14)]",
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

    const cardWidth = 208;
    const left = Math.min(
      window.innerWidth - cardWidth - 12,
      Math.max(12, rect.left + rect.width / 2 - cardWidth / 2),
    );

    setHoverCardPosition({
      top: Math.max(12, rect.top - 8),
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
      <div className="text-sm font-medium text-black/82">{receiverName || "未填写收件人"}</div>
      <div className="text-xs text-black/58">{receiverPhone || "暂无手机"}</div>
      <div className="line-clamp-2 text-xs leading-5 text-black/52">
        {receiverAddress || "未填写地址"}
      </div>

      <div className="mt-1.5">
        <button
          ref={buttonRef}
          type="button"
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-[0.28rem] text-[10px] font-semibold leading-none transition",
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
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {logisticsStatusMeta.label}
        </button>
      </div>

      {isHoverOpen && hoverCardPosition ? (
        <div
          className="fixed z-40 w-52 rounded-[0.9rem] border border-black/8 bg-white/98 px-3 py-2.5 shadow-[0_14px_32px_rgba(18,24,31,0.10)]"
          style={{
            top: hoverCardPosition.top,
            left: hoverCardPosition.left,
            transform: "translateY(-100%)",
          }}
          role="tooltip"
          onMouseEnter={openHoverCard}
          onMouseLeave={scheduleCloseHoverCard}
        >
          <div className="text-[11px] font-semibold tracking-[0.08em] text-black/40">物流信息</div>
          <div className="mt-2 space-y-1 text-sm text-black/66">
            <div>快递公司：{providerLabel}</div>
            <div className="flex items-start gap-2">
              <span className="shrink-0">物流单号：</span>
              <div className="min-w-0">
                {normalizedTrackingNumber ? (
                  <button
                    type="button"
                    className="block max-w-full truncate whitespace-nowrap text-left font-mono text-[9px] font-medium leading-3 tabular-nums tracking-[0.01em] text-[var(--color-info)] hover:underline sm:text-[10px]"
                    title={normalizedTrackingNumber}
                    onClick={handleCopyTrackingNumber}
                  >
                    {normalizedTrackingNumber}
                  </button>
                ) : (
                  <span>物流单号未知</span>
                )}
                {copied ? (
                  <div className="mt-0.5 text-[11px] text-[var(--color-info)]">已复制</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/18">
          <div
            className="h-full w-full max-w-[28rem] overflow-y-auto border-l border-black/8 bg-white px-5 py-5 shadow-[0_24px_56px_rgba(18,24,31,0.18)]"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-black/84">物流轨迹</h3>
                <p className="mt-1 text-sm text-black/55">
                  {providerLabel} / {normalizedTrackingNumber || "物流单号未知"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-black/58 hover:border-black/18 hover:bg-[rgba(247,248,250,0.92)]"
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
      ) : null}
    </>
  );
}
