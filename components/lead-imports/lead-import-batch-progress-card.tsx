"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  formatImportDateTime,
  type LeadImportBatchProgressSnapshot,
  type LeadImportMode,
} from "@/lib/lead-imports/metadata";

type LeadImportBatchProgressCardProps = {
  batchId: string;
  mode: LeadImportMode;
  detailHref: string;
  initialProgress: LeadImportBatchProgressSnapshot;
  title?: string;
  description?: string;
  pollWhenIdle?: boolean;
};

function buildLeadAssignmentHref(batchId: string) {
  const params = new URLSearchParams({
    view: "unassigned",
    quick: "import_batch",
    importBatchId: batchId,
  });

  return `/leads?${params.toString()}`;
}

export function LeadImportBatchProgressCard({
  batchId,
  mode,
  detailHref,
  initialProgress,
  title = "批次进度",
  description = "导入任务已进入后台队列，处理过程中会自动刷新进度。",
  pollWhenIdle = false,
}: Readonly<LeadImportBatchProgressCardProps>) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [requestError, setRequestError] = useState("");
  const finishedRef = useRef(initialProgress.isTerminal);

  const shouldPoll = useMemo(() => {
    if (progress.isActive) {
      return true;
    }

    return pollWhenIdle && !progress.isTerminal;
  }, [pollWhenIdle, progress.isActive, progress.isTerminal]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function fetchProgress() {
      try {
        const response = await fetch(`/api/lead-imports/batches/${batchId}/progress`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("进度刷新失败");
        }

        const payload = (await response.json()) as {
          progress: LeadImportBatchProgressSnapshot;
        };

        if (cancelled) {
          return;
        }

        setProgress(payload.progress);
        setRequestError("");

        if (!finishedRef.current && payload.progress.isTerminal) {
          finishedRef.current = true;
          router.refresh();
        }
      } catch (error) {
        if (!cancelled) {
          setRequestError(error instanceof Error ? error.message : "进度刷新失败");
        }
      } finally {
        if (!cancelled && shouldPoll) {
          timeoutId = setTimeout(fetchProgress, 2_000);
        }
      }
    }

    if (shouldPoll) {
      timeoutId = setTimeout(fetchProgress, 2_000);
    }

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [batchId, router, shouldPoll]);

  return (
    <section className="crm-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-black/86">{title}</h3>
            <StatusBadge
              label={mode === "customer_continuation" ? "客户续接" : "线索导入"}
              variant="neutral"
            />
            <StatusBadge label={progress.statusLabel} variant={progress.statusVariant} />
            <StatusBadge label={progress.stageLabel} variant={progress.stageVariant} />
          </div>
          <p className="text-sm leading-6 text-black/58">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mode === "lead" && progress.isTerminal ? (
            <Link
              href={buildLeadAssignmentHref(batchId)}
              className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
            >
              去分配本批未分配线索
            </Link>
          ) : null}
          <Link
            href={detailHref}
            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
          >
            查看批次详情
          </Link>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-black/78">
              已处理 {progress.processedRows} / {progress.totalRows}
            </p>
            <p className="mt-1 text-xs text-black/48">
              成功 {progress.successRows} / 重复 {progress.duplicateRows} / 失败{" "}
              {progress.failedRows}
            </p>
          </div>
          <p className="text-2xl font-semibold text-black/84">{progress.progressPercent}%</p>
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-black/6">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#4d8fe6_0%,#7ab4ff_100%)] transition-[width] duration-500"
            style={{ width: `${progress.progressPercent}%` }}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="crm-subtle-panel">
            <p className="crm-detail-label">批次状态</p>
            <p className="mt-2 text-sm text-black/72">{progress.statusLabel}</p>
          </div>
          <div className="crm-subtle-panel">
            <p className="crm-detail-label">当前阶段</p>
            <p className="mt-2 text-sm text-black/72">{progress.stageLabel}</p>
          </div>
          <div className="crm-subtle-panel">
            <p className="crm-detail-label">开始时间</p>
            <p className="mt-2 text-sm text-black/72">
              {progress.processingStartedAt
                ? formatImportDateTime(progress.processingStartedAt)
                : "等待 Worker 接单"}
            </p>
          </div>
          <div className="crm-subtle-panel">
            <p className="crm-detail-label">最近心跳</p>
            <p className="mt-2 text-sm text-black/72">
              {progress.lastHeartbeatAt
                ? formatImportDateTime(progress.lastHeartbeatAt)
                : progress.isTerminal
                  ? "已结束"
                  : "尚未开始"}
            </p>
          </div>
        </div>

        {progress.errorMessage ? (
          <div className="crm-banner crm-banner-danger">{progress.errorMessage}</div>
        ) : null}
        {requestError ? <div className="crm-banner crm-banner-danger">{requestError}</div> : null}
      </div>
    </section>
  );
}
