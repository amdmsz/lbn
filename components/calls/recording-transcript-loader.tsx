"use client";

import { useCallback, useState } from "react";
import { ChevronDown, Loader2, MessageSquareText } from "lucide-react";
import { CallTranscriptDialogue } from "@/components/calls/call-transcript-dialogue";
import type { CallTranscriptSegment } from "@/lib/calls/call-ai-diarization";
import { cn } from "@/lib/utils";

type TranscriptPayload = {
  analysis?: {
    aiAnalysis?: {
      transcriptText?: string | null;
      transcriptSegments?: CallTranscriptSegment[];
    } | null;
  };
  message?: string;
};

type LoaderStatus = "idle" | "loading" | "ready" | "failed";

export function RecordingTranscriptLoader({
  recordingId,
  className,
}: Readonly<{
  recordingId: string;
  className?: string;
}>) {
  const [status, setStatus] = useState<LoaderStatus>("idle");
  const [transcriptText, setTranscriptText] = useState<string | null>(null);
  const [segments, setSegments] = useState<CallTranscriptSegment[]>([]);
  const [error, setError] = useState("");

  const loadTranscript = useCallback(async () => {
    if (status === "loading" || status === "ready") {
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const response = await fetch(`/api/call-recordings/${recordingId}/analysis`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as TranscriptPayload;

      if (!response.ok) {
        throw new Error(payload.message ?? "完整转写加载失败。");
      }

      const nextAnalysis = payload.analysis?.aiAnalysis;
      setTranscriptText(nextAnalysis?.transcriptText?.trim() || null);
      setSegments(nextAnalysis?.transcriptSegments ?? []);
      setStatus("ready");
    } catch (nextError) {
      setStatus("failed");
      setError(nextError instanceof Error ? nextError.message : "完整转写加载失败。");
    }
  }, [recordingId, status]);

  const hasContent = segments.length > 0 || Boolean(transcriptText);

  return (
    <div className={cn("mt-3", className)}>
      <button
        type="button"
        onClick={() => void loadTranscript()}
        disabled={status === "loading"}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 text-[11.5px] font-semibold text-[var(--foreground)] transition hover:border-[rgba(79,125,247,0.22)] hover:bg-[var(--color-shell-hover)] disabled:cursor-wait disabled:opacity-60"
      >
        {status === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <MessageSquareText className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
        )}
        <span>{status === "ready" ? "完整转写已加载" : "加载完整转写"}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[var(--color-sidebar-muted)] transition-transform",
            status === "ready" ? "rotate-180" : "",
          )}
          aria-hidden="true"
        />
      </button>

      {status === "failed" ? (
        <div className="mt-2 rounded-[0.75rem] border border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.06)] px-3 py-2 text-[12px] leading-5 text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {status === "ready" ? (
        hasContent ? (
          segments.length > 0 ? (
            <CallTranscriptDialogue
              segments={segments}
              maxSegments={null}
              className="mt-3 max-h-[34rem] overflow-y-auto pr-1"
            />
          ) : (
            <p className="mt-3 max-h-[34rem] overflow-y-auto whitespace-pre-wrap rounded-[0.75rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3 pr-1 text-[12.5px] leading-6 text-[var(--foreground)]/84">
              {transcriptText}
            </p>
          )
        ) : (
          <div className="mt-2 rounded-[0.75rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            AI 暂未返回有效转写。
          </div>
        )
      ) : null}
    </div>
  );
}
