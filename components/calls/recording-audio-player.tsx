import { Download } from "lucide-react";
import {
  getRecordingMimeLabel,
  shouldTranscodeRecordingForBrowser,
} from "@/lib/calls/recording-audio";
import { cn } from "@/lib/utils";

function isPlayableRecordingStatus(status: string) {
  return status === "UPLOADED" || status === "PROCESSING" || status === "READY";
}

export function RecordingAudioPlayer({
  recordingId,
  status,
  mimeType,
  className,
}: Readonly<{
  recordingId: string;
  status: string;
  mimeType: string;
  className?: string;
}>) {
  const canPlay = isPlayableRecordingStatus(status);
  const usesTranscodedPlayback = shouldTranscodeRecordingForBrowser(mimeType);
  const audioUrl = `/api/call-recordings/${recordingId}/audio`;
  const downloadUrl = `${audioUrl}?download=1`;

  return (
    <div className={cn("space-y-1.5", className)}>
      {canPlay ? (
        <audio controls preload="none" src={audioUrl} className="h-9 w-full" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
        <span>
          {getRecordingMimeLabel(mimeType)}
          {usesTranscodedPlayback ? " / 转码播放" : ""}
        </span>
        {canPlay ? (
          <a
            href={downloadUrl}
            download
            className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            原文件
          </a>
        ) : null}
      </div>
    </div>
  );
}
