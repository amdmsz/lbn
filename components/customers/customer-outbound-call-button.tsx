"use client";

import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";

type CallState = "idle" | "calling" | "accepted" | "failed";

export function CustomerOutboundCallButton({
  customerId,
  customerName,
  label = "CTI 外呼",
  className,
  disabled = false,
}: Readonly<{
  customerId: string;
  customerName: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}>) {
  const [state, setState] = useState<CallState>("idle");

  async function handleClick() {
    if (disabled || state === "calling") {
      return;
    }

    setState("calling");

    try {
      const response = await fetch("/api/outbound-calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "外呼发起失败。");
      }

      setState("accepted");
      window.setTimeout(() => setState("idle"), 2600);
    } catch (error) {
      setState("failed");
      window.alert(error instanceof Error ? error.message : "外呼发起失败。");
      window.setTimeout(() => setState("idle"), 2600);
    }
  }

  const stateLabel =
    state === "calling"
      ? "发起中"
      : state === "accepted"
        ? "已提交"
        : state === "failed"
          ? "重试外呼"
          : label;

  return (
    <button
      type="button"
      aria-label={`${stateLabel}：${customerName}`}
      disabled={disabled || state === "calling" || state === "accepted"}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-medium shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-58",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{stateLabel}</span>
      </span>
    </button>
  );
}
