"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Loader2, PhoneCall, XCircle } from "lucide-react";
import type { OutboundCallSessionStatus } from "@prisma/client";
import { getOutboundCallFailureLabel } from "@/lib/outbound-calls/metadata";
import { cn } from "@/lib/utils";

type CallState = "idle" | "calling" | "tracking" | "completed" | "failed";

type OutboundCallSessionSnapshot = {
  id: string;
  callRecordId: string;
  customer: {
    name: string;
    phoneMasked: string;
  };
  dialedNumberMasked: string;
  seatNo: string | null;
  status: OutboundCallSessionStatus;
  failureCode: string | null;
  failureMessage: string | null;
  requestedAt: string;
  ringingAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  recordingImportedAt: string | null;
  recording: {
    id: string;
    status: string;
    durationSeconds: number | null;
    uploadedAt: string | null;
  } | null;
};

const terminalStatuses = new Set<OutboundCallSessionStatus>([
  "ENDED",
  "FAILED",
  "CANCELED",
]);

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(
    2,
    "0",
  )}`;
}

function formatBusinessDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} 秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  return restSeconds === 0
    ? `${minutes} 分钟`
    : `${minutes} 分 ${restSeconds} 秒`;
}

function getSessionVerdict(session: OutboundCallSessionSnapshot | null) {
  if (!session) {
    return null;
  }

  if (session.status === "ENDED") {
    return (session.durationSeconds ?? 0) > 0 ? "connected" : "ended";
  }

  if (session.status === "FAILED" || session.status === "CANCELED") {
    return "failed";
  }

  if (session.status === "ANSWERED") {
    return "answered";
  }

  if (session.status === "RINGING") {
    return "ringing";
  }

  return "pending";
}

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
  const router = useRouter();
  const [state, setState] = useState<CallState>("idle");
  const [session, setSession] = useState<OutboundCallSessionSnapshot | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const refreshedSessionRef = useRef<string | null>(null);

  const isTracking =
    state === "calling" ||
    (session ? !terminalStatuses.has(session.status) : false);
  const verdict = getSessionVerdict(session);
  const requestedAtMs = session ? Date.parse(session.requestedAt) : null;
  const elapsedSeconds =
    requestedAtMs && Number.isFinite(requestedAtMs)
      ? Math.floor((now - requestedAtMs) / 1000)
      : 0;
  const finalDurationSeconds =
    session?.durationSeconds ?? session?.recording?.durationSeconds ?? null;

  const statusCopy = useMemo(() => {
    if (!session) {
      if (state === "calling") {
        return {
          label: "发起中",
          description: "正在提交到 CTI Gateway",
        };
      }

      return null;
    }

    if (verdict === "connected") {
      return {
        label: "客户已接通",
        description: finalDurationSeconds
          ? `通话 ${formatBusinessDuration(finalDurationSeconds)}${
              session.recordingImportedAt ? "，录音已归档" : ""
            }`
          : session.recordingImportedAt
            ? "录音已归档"
            : "通话已结束",
      };
    }

    if (verdict === "ended") {
      return {
        label: "通话已结束",
        description: session.recordingImportedAt
          ? "未产生有效通话时长，录音已归档"
          : "未产生有效通话时长",
      };
    }

    if (verdict === "failed") {
      return {
        label: getOutboundCallFailureLabel(
          session.failureCode,
          session.failureMessage,
        ),
        description:
          session.failureMessage ??
          session.failureCode ??
          "客户未接通或线路返回失败",
      };
    }

    if (verdict === "answered") {
      return {
        label: "客户已接通",
        description: `通话计时 ${formatElapsed(elapsedSeconds)}`,
      };
    }

    if (verdict === "ringing") {
      return {
        label: "客户振铃中",
        description: `已等待 ${formatElapsed(elapsedSeconds)}`,
      };
    }

    return {
      label: "等待接通",
      description: `已提交到 ${session.seatNo ?? "坐席"}，已等待 ${formatElapsed(
        elapsedSeconds,
      )}`,
    };
  }, [elapsedSeconds, finalDurationSeconds, session, state, verdict]);

  useEffect(() => {
    if (!isTracking) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [isTracking]);

  useEffect(() => {
    if (!session || terminalStatuses.has(session.status)) {
      return;
    }

    let canceled = false;
    const sessionId = session.id;

    async function pollSession() {
      try {
        const response = await fetch(`/api/outbound-calls/${sessionId}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          session?: OutboundCallSessionSnapshot;
          message?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "外呼状态读取失败。");
        }

        if (!canceled && payload?.session) {
          setSession(payload.session);

          if (terminalStatuses.has(payload.session.status)) {
            setState(payload.session.status === "FAILED" ? "failed" : "completed");
          }
        }
      } catch (error) {
        if (!canceled) {
          setStatusMessage(
            error instanceof Error ? error.message : "外呼状态读取失败。",
          );
        }
      }
    }

    const timer = window.setInterval(() => {
      void pollSession();
    }, 1800);

    void pollSession();

    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [session]);

  useEffect(() => {
    if (!session || !terminalStatuses.has(session.status)) {
      return;
    }

    if (refreshedSessionRef.current === session.id) {
      return;
    }

    refreshedSessionRef.current = session.id;
    router.refresh();
  }, [router, session]);

  async function handleClick() {
    if (disabled || state === "calling" || isTracking) {
      return;
    }

    setState("calling");
    setSession(null);
    setStatusMessage(null);
    refreshedSessionRef.current = null;

    try {
      const response = await fetch("/api/outbound-calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const payload = (await response.json().catch(() => null)) as {
        call?: {
          sessionId: string;
          callRecordId: string;
          status: OutboundCallSessionStatus;
        };
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "外呼发起失败。");
      }

      if (payload?.call?.sessionId) {
        setState("tracking");
        setSession({
          id: payload.call.sessionId,
          callRecordId: payload.call.callRecordId,
          customer: {
            name: customerName,
            phoneMasked: "",
          },
          dialedNumberMasked: "",
          seatNo: null,
          status: payload.call.status,
          failureCode: null,
          failureMessage: null,
          requestedAt: new Date().toISOString(),
          ringingAt: null,
          answeredAt: null,
          endedAt: null,
          durationSeconds: null,
          recordingImportedAt: null,
          recording: null,
        });
        return;
      }

      setState("completed");
      setStatusMessage("外呼请求已提交。");
    } catch (error) {
      setState("failed");
      setStatusMessage(error instanceof Error ? error.message : "外呼发起失败。");
    }
  }

  const stateLabel =
    state === "calling"
      ? "发起中"
      : isTracking
        ? "呼叫中"
        : state === "completed"
          ? "再次外呼"
      : state === "failed"
        ? "重试外呼"
        : label;
  const Icon =
    state === "calling" || isTracking
      ? Loader2
      : verdict === "connected"
        ? CheckCircle2
        : state === "failed" || verdict === "failed"
          ? XCircle
          : PhoneCall;

  return (
    <span className="relative inline-flex flex-col items-end gap-1.5">
      <button
        type="button"
        aria-label={`${stateLabel}：${customerName}`}
        disabled={disabled || state === "calling" || isTracking}
        onClick={handleClick}
        className={cn(
          "inline-flex items-center justify-center rounded-full border font-medium shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-58",
          className,
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              (state === "calling" || isTracking) && "animate-spin",
            )}
            aria-hidden="true"
          />
          <span>{stateLabel}</span>
        </span>
      </button>

      {statusCopy || statusMessage ? (
        <span className="absolute right-0 top-[calc(100%+0.4rem)] z-20 w-64 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-xs shadow-[0_14px_34px_rgba(15,23,42,0.13)]">
          {statusCopy ? (
            <>
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-neutral-900">
                  {statusCopy.label}
                </span>
                {isTracking ? (
                  <span className="inline-flex items-center gap-1 tabular-nums text-neutral-500">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatElapsed(elapsedSeconds)}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block leading-5 text-neutral-500">
                {statusCopy.description}
              </span>
            </>
          ) : null}
          {statusMessage ? (
            <span className="mt-1 block leading-5 text-red-600">
              {statusMessage}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
