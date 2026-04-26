import type { CallTranscriptSegment } from "@/lib/calls/call-ai-diarization";
import { formatTranscriptSegmentTimeRange } from "@/lib/calls/call-ai-diarization";
import { cn } from "@/lib/utils";

function getSpeakerClassName(role: CallTranscriptSegment["speakerRole"]) {
  switch (role) {
    case "SALES":
      return "border-[rgba(79,125,247,0.16)] bg-[rgba(79,125,247,0.06)] text-[var(--color-primary)]";
    case "CUSTOMER":
      return "border-[rgba(22,163,74,0.16)] bg-[rgba(22,163,74,0.06)] text-[var(--color-success)]";
    default:
      return "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)]";
  }
}

export function CallTranscriptDialogue({
  segments,
  maxSegments = 8,
  className,
}: Readonly<{
  segments: CallTranscriptSegment[];
  maxSegments?: number;
  className?: string;
}>) {
  if (segments.length === 0) {
    return null;
  }

  const visibleSegments = segments.slice(0, maxSegments);
  const remainingCount = Math.max(0, segments.length - visibleSegments.length);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
          对话分离
        </p>
        <span className="text-[11px] font-medium text-[var(--color-sidebar-muted)]">
          {segments.length} 段
        </span>
      </div>
      <div className="space-y-1.5">
        {visibleSegments.map((segment) => {
          const timeRange = formatTranscriptSegmentTimeRange(segment);

          return (
            <div
              key={segment.id}
              className="grid gap-2 rounded-[0.8rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-2 md:grid-cols-[4.5rem_minmax(0,1fr)]"
            >
              <div className="flex items-center gap-1.5 md:block">
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold",
                    getSpeakerClassName(segment.speakerRole),
                  )}
                >
                  {segment.speakerLabel}
                </span>
                {timeRange ? (
                  <span className="text-[10px] tabular-nums text-[var(--color-sidebar-muted)] md:mt-1 md:block">
                    {timeRange}
                  </span>
                ) : null}
              </div>
              <p className="min-w-0 text-[12px] leading-5 text-[var(--foreground)]/82">
                {segment.text}
              </p>
            </div>
          );
        })}
      </div>
      {remainingCount > 0 ? (
        <p className="text-[11px] text-[var(--color-sidebar-muted)]">
          还有 {remainingCount} 段，当前列表仅展示前 {visibleSegments.length} 段。
        </p>
      ) : null}
    </div>
  );
}
