"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import type { ImportedCustomerDeletionGuard } from "@/lib/customers/imported-customer-deletion";

type ImportedCustomerDeletionActionResult = {
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
};

type ImportedCustomerDeletionPanelProps = {
  guard: ImportedCustomerDeletionGuard | null;
  requestAction: (input: {
    customerId: string;
    reason: string;
  }) => Promise<ImportedCustomerDeletionActionResult>;
  reviewAction: (input: {
    requestId: string;
    decision: "approve" | "reject";
    reason?: string;
  }) => Promise<ImportedCustomerDeletionActionResult>;
  directDeleteAction: (input: {
    customerId: string;
    reason: string;
  }) => Promise<ImportedCustomerDeletionActionResult>;
};

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function buildBatchHref(guard: ImportedCustomerDeletionGuard) {
  if (!guard.source) {
    return null;
  }

  return guard.source.mode === "CUSTOMER_CONTINUATION"
    ? `/lead-imports/${guard.source.batchId}?mode=customer_continuation`
    : `/lead-imports/${guard.source.batchId}`;
}

function PanelRow({
  label,
  value,
}: Readonly<{
  label: string;
  value: ReactNode;
}>) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <p className="text-[12px] text-black/44">{label}</p>
      <div className="max-w-[70%] text-right text-[13px] leading-5 text-black/72">
        {value}
      </div>
    </div>
  );
}

function getAvailabilityContent(guard: ImportedCustomerDeletionGuard) {
  if (guard.blockedReason) {
    return <span className="text-[var(--color-danger)]">{guard.blockedReason}</span>;
  }

  if (guard.canDirectDelete) {
    return (
      <span className="text-[var(--color-success)]">
        当前角色可以直接删除这位导入新建客户。
      </span>
    );
  }

  if (guard.canRequestDeletion) {
    return (
      <span className="text-[var(--color-success)]">
        当前角色可以发起删除申请，等待团队主管审批。
      </span>
    );
  }

  if (guard.canReviewPendingRequest && guard.pendingRequest) {
    return (
      <span className="text-[var(--color-success)]">
        当前有一条待你审批的删除申请。
      </span>
    );
  }

  return <span className="text-black/56">当前可查看删除状态与审批历史。</span>;
}

export function ImportedCustomerDeletionPanel({
  guard,
  requestAction,
  reviewAction,
  directDeleteAction,
}: Readonly<ImportedCustomerDeletionPanelProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ImportedCustomerDeletionActionResult | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [directReason, setDirectReason] = useState("");

  if (!guard) {
    return null;
  }

  const batchHref = buildBatchHref(guard);
  const latestRequest = guard.latestRequest;
  const pendingRequest = guard.pendingRequest;

  function handleAction(
    runner: () => Promise<ImportedCustomerDeletionActionResult>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await runner();
      setNotice(result);

      if (result.redirectTo) {
        router.replace(result.redirectTo);
        return;
      }

      if (result.status === "success") {
        onSuccess?.();
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-[1rem] border border-[rgba(141,59,51,0.12)] bg-[rgba(255,251,250,0.88)] px-4 py-4 shadow-[0_8px_18px_rgba(18,24,31,0.04)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
            删除审批
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.98rem] font-semibold text-black/84">
              导入客户删除与审批
            </h3>
            {guard.source ? (
              <StatusBadge label={guard.source.modeLabel} variant="info" />
            ) : (
              <StatusBadge label="非导入新建" variant="neutral" />
            )}
            {latestRequest ? (
              <StatusBadge
                label={latestRequest.statusLabel}
                variant={latestRequest.statusVariant}
              />
            ) : null}
          </div>
          <p className="text-sm leading-6 text-black/56">
            这里只处理导入新建客户的硬删除，客户本体和客户侧运营记录会删除，但导入批次、
            线索真相和操作审计会保留。
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[0.95rem] border border-black/7 bg-white/78 px-4 py-3.5">
          <PanelRow
            label="导入来源"
            value={
              guard.source ? (
                <span>{guard.source.modeLabel}</span>
              ) : (
                <span className="text-black/46">当前客户不是导入新建客户</span>
              )
            }
          />
          <PanelRow
            label="来源批次"
            value={
              guard.source && batchHref ? (
                <Link href={batchHref} className="crm-text-link">
                  {guard.source.batchFileName}
                </Link>
              ) : (
                <span className="text-black/46">暂无</span>
              )
            }
          />
          <PanelRow
            label="来源行号"
            value={
              guard.source?.rowNumber ? `第 ${guard.source.rowNumber} 行` : "暂无"
            }
          />
          <PanelRow
            label="建议审批人"
            value={
              guard.suggestedReviewer ? (
                <span>
                  {guard.suggestedReviewer.name} (@{guard.suggestedReviewer.username})
                </span>
              ) : (
                <span className="text-black/46">未找到团队主管</span>
              )
            }
          />
          <PanelRow label="当前限制" value={getAvailabilityContent(guard)} />
        </div>

        <div className="rounded-[0.95rem] border border-black/7 bg-white/78 px-4 py-3.5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-black/82">最近流程</p>
              {latestRequest ? (
                <StatusBadge
                  label={latestRequest.statusLabel}
                  variant={latestRequest.statusVariant}
                />
              ) : (
                <StatusBadge label="尚未发起" variant="neutral" />
              )}
            </div>

            {latestRequest ? (
              <div className="space-y-2 text-sm leading-6 text-black/60">
                <p>申请原因：{latestRequest.requestReason}</p>
                <p>
                  申请时间：{formatDateTime(latestRequest.createdAt)} / 申请人：
                  {latestRequest.requestedBy.name}
                </p>
                <p>
                  审批人：
                  {latestRequest.reviewer
                    ? `${latestRequest.reviewer.name} (@${latestRequest.reviewer.username})`
                    : "暂无"}
                </p>
                {latestRequest.reviewedAt ? (
                  <p>审批时间：{formatDateTime(latestRequest.reviewedAt)}</p>
                ) : null}
                {latestRequest.rejectReason ? (
                  <p className="text-[var(--color-danger)]">
                    驳回原因：{latestRequest.rejectReason}
                  </p>
                ) : null}
                {latestRequest.executedAt ? (
                  <p className="text-[var(--color-success)]">
                    执行时间：{formatDateTime(latestRequest.executedAt)}
                    {latestRequest.executedBy
                      ? ` / 执行人：${latestRequest.executedBy.name}`
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-6 text-black/56">
                当前还没有删除申请记录。满足条件时，管理员或主管可以直接删除，销售可以发起审批。
              </p>
            )}
          </div>
        </div>
      </div>

      {notice ? (
        <div className="mt-4">
          <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
            {notice.message}
          </ActionBanner>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {guard.canDirectDelete ? (
          <div className="rounded-[0.95rem] border border-[rgba(141,59,51,0.12)] bg-[rgba(255,255,255,0.76)] px-4 py-3.5">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-black/82">直接删除客户</p>
              <p className="text-[13px] leading-6 text-black/56">
                当前角色可以直接执行硬删除。删除后会回到客户列表或公海列表，同时保留导入与审计记录。
              </p>
            </div>
            <div className="mt-3 space-y-3">
              <textarea
                value={directReason}
                onChange={(event) => setDirectReason(event.target.value)}
                rows={3}
                maxLength={500}
                className="crm-textarea"
                placeholder="请填写本次直接删除原因"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isPending || directReason.trim().length === 0}
                  className="crm-button crm-button-primary"
                  onClick={() =>
                    handleAction(
                      () =>
                        directDeleteAction({
                          customerId: guard.customerId,
                          reason: directReason,
                        }),
                      () => setDirectReason(""),
                    )
                  }
                >
                  {isPending ? "处理中..." : "删除客户"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {guard.canRequestDeletion ? (
          <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(255,255,255,0.76)] px-4 py-3.5">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-black/82">发起删除申请</p>
              <p className="text-[13px] leading-6 text-black/56">
                删除申请会路由给团队主管审批。审批通过后，系统会立即执行客户删除。
              </p>
            </div>
            <div className="mt-3 space-y-3">
              <textarea
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
                rows={3}
                maxLength={500}
                className="crm-textarea"
                placeholder="请填写申请删除的原因"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isPending || requestReason.trim().length === 0}
                  className="crm-button crm-button-primary"
                  onClick={() =>
                    handleAction(
                      () =>
                        requestAction({
                          customerId: guard.customerId,
                          reason: requestReason,
                        }),
                      () => setRequestReason(""),
                    )
                  }
                >
                  {isPending ? "提交中..." : "申请删除"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {guard.canReviewPendingRequest && pendingRequest ? (
          <div className="rounded-[0.95rem] border border-[rgba(54,95,135,0.12)] bg-[rgba(248,251,255,0.82)] px-4 py-3.5">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-black/82">审批当前申请</p>
              <p className="text-[13px] leading-6 text-black/56">
                批准后会立即执行客户删除；驳回后会保留客户，并记录审批意见。
              </p>
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-black/60">
              <p>申请原因：{pendingRequest.requestReason}</p>
              <p>
                申请人：{pendingRequest.requestedBy.name} / 申请时间：
                {formatDateTime(pendingRequest.createdAt)}
              </p>
            </div>
            <div className="mt-3 space-y-3">
              <textarea
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
                rows={3}
                maxLength={500}
                className="crm-textarea"
                placeholder="审批备注，驳回时建议填写原因"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  className="crm-button crm-button-secondary"
                  onClick={() =>
                    handleAction(
                      () =>
                        reviewAction({
                          requestId: pendingRequest.id,
                          decision: "reject",
                          reason: reviewReason || undefined,
                        }),
                      () => setReviewReason(""),
                    )
                  }
                >
                  {isPending ? "处理中..." : "驳回申请"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  className="crm-button crm-button-primary"
                  onClick={() =>
                    handleAction(
                      () =>
                        reviewAction({
                          requestId: pendingRequest.id,
                          decision: "approve",
                          reason: reviewReason || undefined,
                        }),
                      () => setReviewReason(""),
                    )
                  }
                >
                  {isPending ? "处理中..." : "批准并删除"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
