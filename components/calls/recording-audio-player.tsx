"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import {
  getRecordingMimeLabel,
  shouldTranscodeRecordingForBrowser,
} from "@/lib/calls/recording-audio";
import { cn } from "@/lib/utils";

function isPlayableRecordingStatus(status: string) {
  return status === "UPLOADED" || status === "PROCESSING" || status === "READY";
}

function formatPlaybackTime(value: number | null | undefined) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value ?? 0 : 0));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function clampSeekValue(value: number, duration: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return value;
  }

  return Math.min(value, duration);
}

const playbackRates = [0.75, 1, 1.25, 1.5, 2] as const;

export function RecordingAudioPlayer({
  recordingId,
  status,
  mimeType,
  durationSeconds,
  className,
}: Readonly<{
  recordingId: string;
  status: string;
  mimeType: string;
  durationSeconds?: number | null;
  className?: string;
}>) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canPlay = isPlayableRecordingStatus(status);
  const usesTranscodedPlayback = shouldTranscodeRecordingForBrowser(mimeType);
  const audioUrl = `/api/call-recordings/${recordingId}/audio`;
  const downloadUrl = `${audioUrl}?download=1`;
  const fallbackDuration = Number.isFinite(durationSeconds ?? NaN)
    ? Math.max(0, durationSeconds ?? 0)
    : 0;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const visibleDuration = duration > 0 ? duration : fallbackDuration;
  const canSeek = canPlay && visibleDuration > 0 && !loadError;
  const progressPercent = useMemo(() => {
    if (!visibleDuration) {
      return 0;
    }

    return Math.min(100, Math.max(0, (currentTime / visibleDuration) * 100));
  }, [currentTime, visibleDuration]);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const syncDuration = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    } else if (fallbackDuration > 0) {
      setDuration(fallbackDuration);
    }
  }, [fallbackDuration]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio || !canPlay || loadError) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
      setLoadError(false);
    } catch {
      setIsPlaying(false);
      setLoadError(true);
    }
  }, [canPlay, isPlaying, loadError]);

  const seekTo = useCallback(
    (value: number) => {
      const audio = audioRef.current;
      const nextTime = clampSeekValue(value, visibleDuration);

      setCurrentTime(nextTime);

      if (audio) {
        audio.currentTime = nextTime;
      }
    },
    [visibleDuration],
  );

  const resetPlayback = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const changePlaybackRate = useCallback((value: number) => {
    const nextRate = playbackRates.includes(value as (typeof playbackRates)[number])
      ? value
      : 1;
    const audio = audioRef.current;

    if (audio) {
      audio.playbackRate = nextRate;
    }

    setPlaybackRate(nextRate);
  }, []);

  if (!canPlay) {
    return (
      <div
        className={cn(
          "rounded-[0.75rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2 text-[11px] font-medium text-[var(--color-sidebar-muted)]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span>录音未就绪</span>
          <span>{getRecordingMimeLabel(mimeType)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-2.5 shadow-[var(--color-shell-shadow-sm)]",
        className,
      )}
    >
      <audio
        ref={audioRef}
        preload="metadata"
        src={audioUrl}
        onLoadedMetadata={() => {
          syncDuration();
          setLoadError(false);
        }}
        onDurationChange={syncDuration}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          syncDuration();
        }}
        onPlay={() => {
          setIsPlaying(true);
          setLoadError(false);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(visibleDuration);
        }}
        onError={() => {
          setIsPlaying(false);
          setLoadError(true);
        }}
      />

      <div className="grid gap-2 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
        <button
          type="button"
          onClick={togglePlayback}
          disabled={loadError}
          aria-label={isPlaying ? "暂停录音" : "播放录音"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(79,125,247,0.18)] bg-[var(--foreground)] text-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)] transition hover:bg-[var(--foreground)]/92 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5 translate-x-[1px]" aria-hidden="true" />
          )}
        </button>

        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-3 text-[10.5px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
            <span>{formatPlaybackTime(currentTime)}</span>
            <span>{visibleDuration > 0 ? formatPlaybackTime(visibleDuration) : "--:--"}</span>
          </div>
          <div
            className={cn(
              "relative h-7",
              canSeek ? "cursor-pointer" : "cursor-not-allowed opacity-55",
            )}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--color-border-soft)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-[var(--color-panel)] bg-[var(--color-accent)] shadow-[0_4px_10px_rgba(15,23,42,0.18)]"
              style={{
                left: `calc(${progressPercent}% - 0.5rem)`,
              }}
            />
            <input
              type="range"
              min={0}
              max={visibleDuration > 0 ? visibleDuration : 1}
              step="0.1"
              value={Math.min(currentTime, visibleDuration > 0 ? visibleDuration : 1)}
              disabled={!canSeek}
              aria-label="拖动录音进度"
              onChange={(event) => seekTo(Number(event.currentTarget.value))}
              className="absolute inset-0 h-7 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={playbackRate}
            aria-label="播放倍速"
            disabled={loadError}
            onChange={(event) => changePlaybackRate(Number(event.currentTarget.value))}
            className="h-7 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2 text-[11px] font-medium tabular-nums text-[var(--foreground)] outline-none transition hover:border-[rgba(79,125,247,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {playbackRates.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetPlayback}
            aria-label="回到开头"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)] transition hover:border-[rgba(79,125,247,0.22)] hover:text-[var(--foreground)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
        <span>
          {loadError
            ? "播放失败，请刷新或下载原文件"
            : `${getRecordingMimeLabel(mimeType)}${
                usesTranscodedPlayback ? " / 转码播放" : ""
              }`}
        </span>
        <a
          href={downloadUrl}
          download
          className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          原文件
        </a>
      </div>
    </div>
  );
}
