"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyAutoAssignAction,
  applyInactiveRecycleAction,
  applyOwnerExitRecycleAction,
  assignCustomerPublicPoolAction,
  claimCustomerPublicPoolAction,
  previewAutoAssignAction,
  previewInactiveRecycleAction,
  previewOwnerExitRecycleAction,
  releaseCustomerToPublicPoolAction,
  type CustomerPublicPoolAutoAssignApplyActionResult,
  type CustomerPublicPoolAutoAssignPreviewActionResult,
  type CustomerPublicPoolRecycleApplyActionResult,
  type CustomerPublicPoolRecyclePreviewActionResult,
} from "@/app/(dashboard)/customers/public-pool/actions";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EntityTable } from "@/components/shared/entity-table";
import { MetricCard } from "@/components/shared/metric-card";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyActionBar } from "@/components/shared/sticky-action-bar";
import {
  buildCustomerPublicPoolCustomerDetailHref,
  buildCustomerPublicPoolHref,
  buildCustomerPublicPoolReportsHref,
  buildCustomerPublicPoolSettingsHref,
  type CustomerPublicPoolFilterShape,
} from "@/lib/customers/public-pool-filter-url";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  customerOwnershipEventReasonOptions,
  defaultTeamPublicPoolSettingValues,
  customerPublicPoolReasonOptions,
  getCustomerOwnershipModeLabel,
  publicPoolAutoAssignStrategyLabels,
  type PublicPoolAutoAssignStrategyValue,
} from "@/lib/customers/public-pool-metadata";
import type { CustomerPublicPoolData } from "@/lib/customers/public-pool";
import type {
  CustomerPublicPoolAutoAssignApplyResult,
  CustomerPublicPoolAutoAssignPreviewResult,
} from "@/lib/customers/public-pool-auto-assign";
import type {
  CustomerPublicPoolRecycleApplyResult,
  CustomerPublicPoolRecyclePreviewResult,
} from "@/lib/customers/public-pool-recycle";
import { cn } from "@/lib/utils";

const sectionShellClassName = "crm-workspace-shell";

const quietWorkbenchCardClassName =
  "rounded-[1.05rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-4 py-4 shadow-[var(--color-shell-shadow-sm)]";

const quietWorkbenchInsetClassName =
  "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

const quietWorkbenchSampleCardClassName =
  "rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2.5 shadow-[var(--color-shell-shadow-sm)]";

const quietWorkbenchActionLinkClassName =
  "inline-flex h-9 items-center rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3.5 text-sm text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] hover:shadow-[var(--color-shell-shadow-sm)]";

const quietWorkbenchTagClassName =
  "rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2 py-0.5 text-[11px] text-[var(--color-sidebar-muted)]";

const quietWorkbenchResultClassName =
  "mt-4 rounded-[1rem] border border-[rgba(122,154,255,0.18)] bg-[rgba(111,141,255,0.12)] px-3.5 py-3";

function formatDateTimeValue(value: Date | null) {
  return value ? formatDateTime(value) : "未记录";
}

function formatRelativeAge(value: Date | null) {
  if (!value) {
    return "无有效跟进";
  }

  const deltaMs = Date.now() - value.getTime();
  const deltaHours = Math.floor(deltaMs / (1000 * 60 * 60));

  if (deltaHours < 24) {
    return `${Math.max(deltaHours, 0)} 小时前`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays} 天前`;
}

function formatProtectionWindow(value: Date | null) {
  if (!value) {
    return "未锁定";
  }

  return `至 ${formatDateTime(value)}`;
}

type WorkbenchFeedback = {
  status: "success" | "error";
  message: string;
};

function buildDefaultFeedback(): WorkbenchFeedback {
  return {
    status: "success",
    message: "",
  };
}

function getSummaryCards(data: CustomerPublicPoolData) {
  const filters = data.filters as CustomerPublicPoolFilterShape;

  return [
    {
      label: "可认领",
      value: String(data.summary.claimableCount),
      note: "当前可立即处理的公海客户",
      href: buildCustomerPublicPoolHref(filters, {
        view: "pool",
        segment: "claimable",
        page: 1,
      }),
      emphasis: "success" as const,
      active: filters.view === "pool" && filters.segment === "claimable",
    },
    {
      label: "锁定中",
      value: String(data.summary.lockedCount),
      note: "仍在保护期内，默认不可抢占",
      href: buildCustomerPublicPoolHref(filters, {
        view: "pool",
        segment: "locked",
        page: 1,
      }),
      emphasis: "warning" as const,
      active: filters.view === "pool" && filters.segment === "locked",
    },
    {
      label: "今日新入池",
      value: String(data.summary.todayNewCount),
      note: "今天进入公海的客户",
      href: buildCustomerPublicPoolHref(filters, {
        view: "pool",
        segment: "today_new",
        page: 1,
      }),
      emphasis: "info" as const,
      active: filters.view === "pool" && filters.segment === "today_new",
    },
    {
      label: "即将到期",
      value: String(data.summary.expiringSoonCount),
      note: "保护期 24 小时内到期",
      href: buildCustomerPublicPoolHref(filters, {
        view: "pool",
        segment: "expiring_soon",
        page: 1,
      }),
      emphasis: "default" as const,
      active: filters.view === "pool" && filters.segment === "expiring_soon",
    },
    ...(data.actor.role === "SALES"
      ? [
          {
            label: "我已认领",
            value: String(data.summary.myClaimCount),
            note: "仍由我持有的认领客户",
            href: buildCustomerPublicPoolHref(filters, {
              view: "records",
              reason: "SALES_CLAIM",
              page: 1,
            }),
            emphasis: "default" as const,
            active: filters.view === "records" && filters.reason === "SALES_CLAIM",
          },
        ]
      : []),
  ];
}

function getViewTabs(data: CustomerPublicPoolData) {
  const filters = data.filters as CustomerPublicPoolFilterShape;
  const items = [
    {
      value: "pool",
      label: "公海工作台",
      href: buildCustomerPublicPoolHref(filters, {
        view: "pool",
        page: 1,
      }),
      count: data.summary.publicCount,
    },
  ];

  if (data.canManage) {
    items.push({
      value: "recycle",
      label: "回收工作台",
      href: buildCustomerPublicPoolHref(filters, {
        view: "recycle",
        segment: "all",
        reason: "",
        page: 1,
      }),
      count: data.summary.recycleCandidateCount,
    });
    items.push({
      value: "records",
      label: "流转记录",
      href: buildCustomerPublicPoolHref(filters, {
        view: "records",
        segment: "all",
        page: 1,
      }),
      count: data.summary.recordCount,
    });
  }

  return items;
}

function getSegmentTabs(data: CustomerPublicPoolData) {
  const filters = data.filters as CustomerPublicPoolFilterShape;

  return [
    {
      value: "all",
      label: "全部",
      href: buildCustomerPublicPoolHref(filters, { segment: "all", page: 1 }),
      count: data.summary.publicCount,
    },
    {
      value: "claimable",
      label: "可认领",
      href: buildCustomerPublicPoolHref(filters, { segment: "claimable", page: 1 }),
      count: data.summary.claimableCount,
    },
    {
      value: "locked",
      label: "锁定中",
      href: buildCustomerPublicPoolHref(filters, { segment: "locked", page: 1 }),
      count: data.summary.lockedCount,
    },
    {
      value: "today_new",
      label: "今日新入池",
      href: buildCustomerPublicPoolHref(filters, { segment: "today_new", page: 1 }),
      count: data.summary.todayNewCount,
    },
    {
      value: "expiring_soon",
      label: "即将到期",
      href: buildCustomerPublicPoolHref(filters, { segment: "expiring_soon", page: 1 }),
      count: data.summary.expiringSoonCount,
    },
  ];
}

function getWorkbenchViewMeta(data: CustomerPublicPoolData) {
  switch (data.filters.view) {
    case "recycle":
      return {
        eyebrow: "Recycle Queue",
        title: "团队回收工作台",
        description: "处理释放与回收。",
      };
    case "records":
      return {
        eyebrow: "Ownership Audit",
        title: "Ownership 审计记录",
        description: "查看 ownership 流转记录。",
      };
    case "pool":
    default:
      return {
        eyebrow: "Public Pool",
        title: "公海认领与分配工作台",
        description: "处理认领、指派与筛选。",
      };
  }
}

function getSelectionHint(
  data: CustomerPublicPoolData,
  actionableCount: number,
  selectedCount: number,
) {
  if (data.filters.view === "records") {
    return "记录视图只读。";
  }

  if (selectedCount > 0) {
    if (data.filters.view === "recycle") {
      return `已选择 ${selectedCount} 位客户。`;
    }

    return data.canClaim
      ? `已选择 ${selectedCount} 位客户。`
      : `已选择 ${selectedCount} 位客户。`;
  }

  if (data.filters.view === "recycle") {
    if (data.recycleItems.length === 0) {
      return "当前筛选范围内没有可回收客户。";
    }

    if (actionableCount === 0) {
      return "当前列表客户均在保护期内。";
    }

    return `可回收 ${actionableCount} 位客户。`;
  }

  if (data.poolItems.length === 0) {
    return "当前筛选范围内没有待处理的公海客户。";
  }

  if (actionableCount === 0) {
    return "当前列表客户均已锁定。";
  }

  if (data.canClaim) {
    return `可认领 ${actionableCount} 位客户。`;
  }

  if (data.canManage && data.salesOptions.length === 0) {
    return "当前团队没有可指派销售。";
  }

  return `可指派 ${actionableCount} 位客户。`;
}

function getBatchBarTitle(data: CustomerPublicPoolData) {
  if (data.filters.view === "recycle") {
    return "批量回收";
  }

  return data.canClaim ? "批量认领" : "批量指派";
}

function getActiveTeamLabel(data: CustomerPublicPoolData) {
  if (data.filters.teamId) {
    return (
      data.teamOptions.find((team) => team.id === data.filters.teamId)?.name ?? data.filters.teamId
    );
  }

  if (data.actor.teamId) {
    return (
      data.teamOptions.find((team) => team.id === data.actor.teamId)?.name ?? data.actor.teamId
    );
  }

  return data.actor.role === "ADMIN" ? "全平台" : "当前团队";
}

function formatActionDateTimeValue(value: string | null) {
  return value ? formatDateTime(new Date(value)) : "未记录";
}

function formatPreviewScopeLabel(preview: CustomerPublicPoolRecyclePreviewResult | null) {
  if (!preview) {
    return "当前筛选范围";
  }

  return preview.scope.teamName ?? "全平台";
}

function formatRecycleRuleSummary(kind: "inactive" | "owner_exit") {
  if (kind === "inactive") {
    return `默认阈值 ${defaultTeamPublicPoolSettingValues.defaultInactiveDays} 天，保护期内不会自动回收。`;
  }

  return "owner 失去承接资格时可直接回收，不再被保护期阻挡。";
}

function getRecycleApplyResult(
  result: CustomerPublicPoolRecycleApplyResult | null,
  kind: "inactive" | "owner_exit",
) {
  if (!result || result.kind !== kind) {
    return null;
  }

  return result;
}

function RecycleAutomationCard({
  kind,
  title,
  description,
  preview,
  applyResult,
  pending,
  onPreview,
  onApply,
}: Readonly<{
  kind: "inactive" | "owner_exit";
  title: string;
  description: string;
  preview: CustomerPublicPoolRecyclePreviewResult | null;
  applyResult: CustomerPublicPoolRecycleApplyResult | null;
  pending: boolean;
  onPreview: () => void;
  onApply: () => void;
}>) {
  return (
    <div className={quietWorkbenchCardClassName}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="crm-detail-label text-[10px]">
            {kind === "inactive" ? "Inactive Recycle" : "Owner Exit Recycle"}
          </p>
          <h3 className="mt-1.5 text-[1rem] font-semibold tracking-tight text-[var(--foreground)]">
            {title}
          </h3>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            {description}
          </p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {preview?.ruleSummary ?? formatRecycleRuleSummary(kind)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="crm-button crm-button-secondary"
            onClick={onPreview}
          >
            {pending ? "处理中..." : `预览${kind === "inactive" ? "自动回收" : "离职回收"}`}
          </button>
          <button
            type="button"
            disabled={pending}
            className="crm-button crm-button-primary"
            onClick={onApply}
          >
            {pending ? "处理中..." : `执行${kind === "inactive" ? "自动回收" : "离职回收"}`}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusBadge
          label={`命中 ${preview?.counts.eligible ?? 0}`}
          variant={(preview?.counts.eligible ?? 0) > 0 ? "info" : "neutral"}
        />
        <StatusBadge
          label={`范围 ${formatPreviewScopeLabel(preview)}`}
          variant="neutral"
        />
        <StatusBadge
          label={`Owner ${preview?.counts.affectedOwners ?? 0}`}
          variant="neutral"
        />
        <StatusBadge
          label={`团队 ${preview?.counts.affectedTeams ?? 0}`}
          variant="neutral"
        />
        {preview && preview.counts.blockedByClaimLock > 0 ? (
          <StatusBadge
            label={`保护期拦截 ${preview.counts.blockedByClaimLock}`}
            variant="warning"
          />
        ) : null}
      </div>

      {preview ? (
        <div className="mt-4 grid gap-3 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className={cn(quietWorkbenchInsetClassName, "space-y-3")}>
            <div>
              <p className="text-[12px] font-medium text-[var(--foreground)]">命中规则</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {preview.reasons.length > 0 ? (
                  preview.reasons.map((reason) => (
                    <StatusBadge
                      key={reason.code}
                      label={`${reason.label} ${reason.count}`}
                      variant="neutral"
                    />
                  ))
                ) : (
                  <StatusBadge label="暂无命中" variant="neutral" />
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[12px] font-medium text-[var(--foreground)]">影响 owner</p>
                <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                  {preview.ownerBuckets.length > 0 ? (
                    preview.ownerBuckets.map((bucket) => (
                      <div key={`${bucket.id ?? "unknown"}-${bucket.label}`}>
                        {bucket.label} · {bucket.count}
                      </div>
                    ))
                  ) : (
                    <div>暂无命中 owner</div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-[var(--foreground)]">影响团队</p>
                <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                  {preview.teamBuckets.length > 0 ? (
                    preview.teamBuckets.map((bucket) => (
                      <div key={`${bucket.id ?? "unknown"}-${bucket.label}`}>
                        {bucket.label} · {bucket.count}
                      </div>
                    ))
                  ) : (
                    <div>暂无命中团队</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={quietWorkbenchInsetClassName}>
            <p className="text-[12px] font-medium text-[var(--foreground)]">样例客户</p>
            <div className="mt-2 space-y-2.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              {preview.sampleCustomers.length > 0 ? (
                preview.sampleCustomers.map((item) => (
                  <div
                    key={item.customerId}
                    className={quietWorkbenchSampleCardClassName}
                  >
                    <div className="font-medium text-[var(--foreground)]">
                      {item.customerName} · {item.ownerName ?? "无 owner"}
                    </div>
                    <div>{item.reasonLabel}</div>
                    <div>{item.reasonDetail}</div>
                    <div>最近有效跟进：{formatActionDateTimeValue(item.lastEffectiveFollowUpAt)}</div>
                    {item.baselineAt ? (
                      <div>判断基准：{formatActionDateTimeValue(item.baselineAt)}</div>
                    ) : null}
                    {item.eligibleAt ? (
                      <div>命中时间：{formatActionDateTimeValue(item.eligibleAt)}</div>
                    ) : null}
                    <div>保护至：{formatActionDateTimeValue(item.claimLockedUntil)}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-[0.95rem] border border-dashed border-[var(--color-border-soft)] px-3 py-3 text-[var(--color-sidebar-muted)]">
                  当前规则预览没有命中客户。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {applyResult ? (
        <div className={quietWorkbenchResultClassName}>
          <p className="text-[12px] font-medium text-[var(--foreground)]">执行结果</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge label={`尝试 ${applyResult.counts.attempted}`} variant="neutral" />
            <StatusBadge label={`成功 ${applyResult.counts.success}`} variant="success" />
            <StatusBadge label={`跳过 ${applyResult.counts.skipped}`} variant="warning" />
            <StatusBadge
              label={`失败 ${applyResult.counts.failed}`}
              variant={applyResult.counts.failed > 0 ? "danger" : "neutral"}
            />
            {applyResult.remainingEligibleCount > 0 ? (
              <StatusBadge
                label={`剩余 ${applyResult.remainingEligibleCount}`}
                variant="neutral"
              />
            ) : null}
          </div>
          {applyResult.appliedSamples.length > 0 ? (
            <div className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              已处理样例：
              {applyResult.appliedSamples
                .map((item) => item.customerName)
                .join("、")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AutoAssignAutomationCard({
  activeTeamAutoAssign,
  preview,
  applyResult,
  pending,
  onPreview,
  onApply,
}: Readonly<{
  activeTeamAutoAssign: CustomerPublicPoolData["activeTeamAutoAssign"];
  preview: CustomerPublicPoolAutoAssignPreviewResult | null;
  applyResult: CustomerPublicPoolAutoAssignApplyResult | null;
  pending: boolean;
  onPreview: () => void;
  onApply: () => void;
}>) {
  const strategy = preview?.strategy ?? activeTeamAutoAssign?.autoAssignStrategy ?? "NONE";
  const strategyLabel =
    publicPoolAutoAssignStrategyLabels[strategy] ?? "未启用自动分配";
  const batchSize =
    preview?.config.autoAssignBatchSize ??
    activeTeamAutoAssign?.autoAssignBatchSize ??
    defaultTeamPublicPoolSettingValues.autoAssignBatchSize;
  const maxActiveCustomersPerSales =
    preview?.config.maxActiveCustomersPerSales ??
    activeTeamAutoAssign?.maxActiveCustomersPerSales ??
    null;
  const blockingIssue = preview?.blockingIssue ?? applyResult?.blockingIssue ?? null;

  return (
    <div className={quietWorkbenchCardClassName}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="crm-detail-label text-[10px]">
            Auto Assign
          </p>
          <h3 className="mt-1.5 text-[1rem] font-semibold tracking-tight text-[var(--foreground)]">
            自动分配
          </h3>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            只处理团队公海中的 PUBLIC 客户。先预览，再按团队规则批次执行，不把自动分配和手动指派揉成一套黑盒逻辑。
          </p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {preview?.ruleSummary ??
              (activeTeamAutoAssign?.teamId
                ? `当前策略为 ${strategyLabel}，每次 apply 最多处理 ${batchSize} 位客户。`
                : "请先切到一个具体团队，再预览或执行自动分配。")}
          </p>
          {blockingIssue ? (
            <p className="mt-2 text-[12px] leading-5 text-[var(--color-danger)]">
              {blockingIssue.detail}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="crm-button crm-button-secondary"
            onClick={onPreview}
          >
            {pending ? "处理中..." : "预览自动分配"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="crm-button crm-button-primary"
            onClick={onApply}
          >
            {pending ? "处理中..." : "执行自动分配"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusBadge label={`策略 ${strategyLabel}`} variant="info" />
        <StatusBadge
          label={`范围 ${preview?.scope.teamName ?? activeTeamAutoAssign?.teamName ?? "未选团队"}`}
          variant="neutral"
        />
        <StatusBadge label={`候选 SALES ${preview?.counts.availableSales ?? 0}`} variant="neutral" />
        <StatusBadge label={`可分配 ${preview?.counts.assignableCustomers ?? 0}`} variant="success" />
        <StatusBadge label={`未分配 ${preview?.counts.unassignedCustomers ?? 0}`} variant="warning" />
        <StatusBadge
          label={`容量 ${maxActiveCustomersPerSales === null ? "不设上限" : maxActiveCustomersPerSales}`}
          variant="neutral"
        />
      </div>

      {preview ? (
        <div className="mt-4 grid gap-3 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className={cn(quietWorkbenchInsetClassName, "space-y-3")}>
            <div>
              <p className="text-[12px] font-medium text-[var(--foreground)]">规则摘要</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge label={`batch ${batchSize}`} variant="neutral" />
                {preview.unassignedReasonSummaries.length > 0 ? (
                  preview.unassignedReasonSummaries.map((reason) => (
                    <StatusBadge
                      key={reason.code}
                      label={`${reason.label} ${reason.count}`}
                      variant="warning"
                    />
                  ))
                ) : (
                  <StatusBadge label="当前无阻塞原因" variant="neutral" />
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[12px] font-medium text-[var(--foreground)]">候选 SALES</p>
                <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                  {preview.availableSales.length > 0 ? (
                    preview.availableSales.slice(0, 6).map((sales) => (
                      <div key={sales.salesId}>
                        {sales.salesName} (@{sales.salesUsername}) · 当前私有 {sales.currentPrivateCustomerCount}
                      </div>
                    ))
                  ) : (
                    <div>当前没有可用 SALES。</div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-[var(--foreground)]">分配分布</p>
                <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                  {preview.ownerBuckets.length > 0 ? (
                    preview.ownerBuckets.map((bucket) => (
                      <div key={bucket.ownerId}>
                        {bucket.ownerName} (@{bucket.ownerUsername}) · 分配 {bucket.assignedCount}
                      </div>
                    ))
                  ) : (
                    <div>暂无分配样例。</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={quietWorkbenchInsetClassName}>
            <p className="text-[12px] font-medium text-[var(--foreground)]">样例结果</p>
            <div className="mt-2 space-y-2.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              {preview.sampleAssignments.length > 0 ? (
                preview.sampleAssignments.map((item) => (
                  <div
                    key={item.customerId}
                    className={quietWorkbenchSampleCardClassName}
                  >
                    <div className="font-medium text-[var(--foreground)]">
                      {item.customerName} → {item.salesName}
                    </div>
                    <div>
                      {
                        publicPoolAutoAssignStrategyLabels[
                          item.strategy as PublicPoolAutoAssignStrategyValue
                        ]
                      } · 当前负载 {item.currentLoad} → {item.projectedLoad}
                    </div>
                    <div>入池时间：{formatActionDateTimeValue(item.publicPoolEnteredAt)}</div>
                    <div>最近 owner：{item.lastOwnerName ?? "未记录"}</div>
                  </div>
                ))
              ) : preview.sampleUnassigned.length > 0 ? (
                preview.sampleUnassigned.map((item) => (
                  <div
                    key={item.customerId}
                    className={quietWorkbenchSampleCardClassName}
                  >
                    <div className="font-medium text-[var(--foreground)]">{item.customerName}</div>
                    <div>{item.reasonLabel}</div>
                    <div>{item.reasonDetail}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-[0.95rem] border border-dashed border-[var(--color-border-soft)] px-3 py-3 text-[var(--color-sidebar-muted)]">
                  当前规则预览没有命中客户。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {applyResult ? (
        <div className={quietWorkbenchResultClassName}>
          <p className="text-[12px] font-medium text-[var(--foreground)]">执行结果</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge label={`尝试 ${applyResult.counts.attempted}`} variant="neutral" />
            <StatusBadge label={`成功 ${applyResult.counts.success}`} variant="success" />
            <StatusBadge label={`跳过 ${applyResult.counts.skipped}`} variant="warning" />
            <StatusBadge
              label={`失败 ${applyResult.counts.failed}`}
              variant={applyResult.counts.failed > 0 ? "danger" : "neutral"}
            />
            {applyResult.remainingAssignableCount > 0 ? (
              <StatusBadge label={`剩余 ${applyResult.remainingAssignableCount}`} variant="neutral" />
            ) : null}
          </div>
          {applyResult.nextRoundRobinCursorUserId ? (
            <div className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              当前轮转游标已续到 {applyResult.nextRoundRobinCursorUserId}。
            </div>
          ) : null}
          {applyResult.appliedSamples.length > 0 ? (
            <div className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              已处理样例：
              {applyResult.appliedSamples.map((item) => item.customerName).join("、")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerPublicPoolWorkbench({
  data,
}: Readonly<{
  data: CustomerPublicPoolData;
}>) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [targetSalesId, setTargetSalesId] = useState(data.salesOptions[0]?.id ?? "");
  const [result, setResult] = useState<WorkbenchFeedback>(buildDefaultFeedback);
  const [inactivePreview, setInactivePreview] =
    useState<CustomerPublicPoolRecyclePreviewResult | null>(null);
  const [ownerExitPreview, setOwnerExitPreview] =
    useState<CustomerPublicPoolRecyclePreviewResult | null>(null);
  const [autoAssignPreview, setAutoAssignPreview] =
    useState<CustomerPublicPoolAutoAssignPreviewResult | null>(null);
  const [recycleApplyResult, setRecycleApplyResult] =
    useState<CustomerPublicPoolRecycleApplyResult | null>(null);
  const [autoAssignApplyResult, setAutoAssignApplyResult] =
    useState<CustomerPublicPoolAutoAssignApplyResult | null>(null);
  const [pending, startTransition] = useTransition();

  const filters = data.filters as CustomerPublicPoolFilterShape;
  const summaryCards = getSummaryCards(data);
  const viewMeta = getWorkbenchViewMeta(data);
  const filterReasonOptions =
    data.filters.view === "records"
      ? customerOwnershipEventReasonOptions
      : customerPublicPoolReasonOptions;
  const resetHref = buildCustomerPublicPoolHref(filters, {
    search: "",
    reason: "",
    teamId: "",
    hasOrders: "all",
    page: 1,
  });

  function toggleSelected(customerId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, customerId])]
        : current.filter((item) => item !== customerId),
    );
  }

  function toggleSelectAll(nextIds: string[], checked: boolean) {
    setSelectedIds(checked ? nextIds : []);
  }

  function runMutation(
    runner: () => Promise<{ status: "success" | "error"; message: string }>,
    clearSelection = true,
  ) {
    startTransition(async () => {
      const nextResult = await runner();
      setResult(nextResult);

      if (nextResult.status === "success") {
        if (clearSelection) {
          setSelectedIds([]);
        }
        router.refresh();
      }
    });
  }

  function getRecycleAutomationInput() {
    return {
      teamId: data.filters.teamId,
      note,
    };
  }

  function getAutoAssignInput() {
    return {
      teamId: data.activeTeamAutoAssign?.teamId ?? data.filters.teamId,
      note,
    };
  }

  function runRecyclePreview(
    kind: "inactive" | "owner_exit",
    runner: () => Promise<CustomerPublicPoolRecyclePreviewActionResult>,
  ) {
    startTransition(async () => {
      const nextResult = await runner();
      setResult({
        status: nextResult.status,
        message: nextResult.message,
      });

      if (nextResult.preview) {
        if (kind === "inactive") {
          setInactivePreview(nextResult.preview);
        } else {
          setOwnerExitPreview(nextResult.preview);
        }
      }
    });
  }

  function runRecycleApply(
    kind: "inactive" | "owner_exit",
    runner: () => Promise<CustomerPublicPoolRecycleApplyActionResult>,
  ) {
    startTransition(async () => {
      const nextResult = await runner();
      setResult({
        status: nextResult.status,
        message: nextResult.message,
      });

      if (nextResult.result) {
        setRecycleApplyResult(nextResult.result);
      }

      if (nextResult.status === "success") {
        router.refresh();
      }
    });
  }

  function runAutoAssignPreview(
    runner: () => Promise<CustomerPublicPoolAutoAssignPreviewActionResult>,
  ) {
    startTransition(async () => {
      const nextResult = await runner();
      setResult({
        status: nextResult.status,
        message: nextResult.message,
      });

      if (nextResult.preview) {
        setAutoAssignPreview(nextResult.preview);
      }
    });
  }

  function runAutoAssignApply(
    runner: () => Promise<CustomerPublicPoolAutoAssignApplyActionResult>,
  ) {
    startTransition(async () => {
      const nextResult = await runner();
      setResult({
        status: nextResult.status,
        message: nextResult.message,
      });

      if (nextResult.result) {
        setAutoAssignApplyResult(nextResult.result);
      }

      if (nextResult.status === "success") {
        router.refresh();
      }
    });
  }

  const allPoolIds = data.poolItems.filter((item) => !item.isLocked).map((item) => item.id);
  const allRecycleIds = data.recycleItems
    .filter((item) => data.actor.role === "ADMIN" || !item.isLocked)
    .map((item) => item.id);
  const actionableCount =
    data.filters.view === "recycle" ? allRecycleIds.length : allPoolIds.length;
  const selectedCount = selectedIds.length;
  const selectionHint = getSelectionHint(data, actionableCount, selectedCount);
  const activeTeamLabel = getActiveTeamLabel(data);
  const inactiveApplyResult = getRecycleApplyResult(recycleApplyResult, "inactive");
  const ownerExitApplyResult = getRecycleApplyResult(recycleApplyResult, "owner_exit");

  return (
    <WorkbenchLayout
      className="!gap-0"
      header={
        <div className={cn(sectionShellClassName, "mb-4")}>
          <header className="rounded-[1.1rem] border border-[var(--color-border-soft)] bg-[linear-gradient(180deg,var(--color-shell-surface-strong),var(--color-shell-surface-soft))] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] backdrop-blur-[18px] md:px-5 md:py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="crm-detail-label text-[10px]">
                  Customer Ownership Lifecycle
                </p>
                <h1 className="mt-1.5 text-[1.28rem] font-semibold tracking-tight text-[var(--foreground)] md:text-[1.46rem]">
                  公海池
                </h1>
                <p className="mt-2 max-w-3xl text-[12.5px] leading-5 text-[var(--color-sidebar-muted)] md:text-[13px]">
                  公海池属于 Customer 域，不是独立对象。这里承接认领、指派、回收和
                  ownership 审计，保持客户主工作流仍然收口在 `/customers`。
                </p>
                <div className="crm-toolbar-cluster mt-2.5 gap-1.5">
                  <StatusBadge label={`当前角色：${data.actor.role}`} variant="info" />
                  <StatusBadge label={`当前范围：${activeTeamLabel}`} variant="neutral" />
                  <StatusBadge label={viewMeta.title} variant="neutral" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {data.canManage ? (
                  <>
                    <Link
                      href={buildCustomerPublicPoolSettingsHref(
                        data.filters.teamId || data.actor.teamId || "",
                      )}
                      className={quietWorkbenchActionLinkClassName}
                    >
                      团队规则
                    </Link>
                    <Link
                      href={buildCustomerPublicPoolReportsHref({
                        teamId: data.filters.teamId || data.actor.teamId || "",
                      })}
                      className={quietWorkbenchActionLinkClassName}
                    >
                      运营报表
                    </Link>
                  </>
                ) : null}
                <Link
                  href="/customers"
                  className={quietWorkbenchActionLinkClassName}
                >
                  返回客户中心
                </Link>
              </div>
            </div>
          </header>
        </div>
      }
      summary={
        <div className={cn(sectionShellClassName, "mb-5")}>
          <div
            className={cn(
              "grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3",
              summaryCards.length >= 5 ? "2xl:grid-cols-5" : "2xl:grid-cols-4",
            )}
          >
            {summaryCards.map((item) => (
              <MetricCard
                key={item.label}
                label={item.label}
                value={item.value}
                note={item.note}
                href={item.href}
                density="strip"
                className={
                  item.active
                    ? "border-[rgba(122,154,255,0.2)] bg-[var(--color-shell-hover)] shadow-[var(--color-shell-shadow-md)]"
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      }
      toolbar={
        <div className={cn(sectionShellClassName, "mb-5 space-y-3")}>
          <SectionCard
            eyebrow={viewMeta.eyebrow}
            title={viewMeta.title}
            description={viewMeta.description}
            density="compact"
            className="rounded-[1.05rem] border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)]"
            actions={
              <div className="flex flex-wrap gap-1.5">
                {data.filters.view !== "records" ? (
                  <StatusBadge label={`可处理 ${actionableCount}`} variant="neutral" />
                ) : null}
                <StatusBadge label={`匹配 ${data.pagination.totalCount}`} variant="neutral" />
                {selectedCount > 0 ? (
                  <StatusBadge label={`已选择 ${selectedCount}`} variant="info" />
                ) : null}
                {data.filters.view === "pool" ? (
                  <StatusBadge label={`锁定 ${data.summary.lockedCount}`} variant="warning" />
                ) : null}
              </div>
            }
          >
            <div className="space-y-3">
              <RecordTabs items={getViewTabs(data)} activeValue={data.filters.view} />
              {data.filters.view === "pool" ? (
                <RecordTabs items={getSegmentTabs(data)} activeValue={data.filters.segment} />
              ) : null}

              <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className={quietWorkbenchInsetClassName}>
                  <p className="crm-detail-label text-[10px]">当前动作提示</p>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--foreground)]">
                    {selectionHint}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.filters.view !== "records" ? (
                      <StatusBadge label={`可处理 ${actionableCount}`} variant="neutral" />
                    ) : null}
                    <StatusBadge label={`匹配 ${data.pagination.totalCount}`} variant="neutral" />
                    {selectedCount > 0 ? (
                      <StatusBadge label={`已选择 ${selectedCount}`} variant="info" />
                    ) : null}
                    {data.filters.view === "pool" ? (
                      <StatusBadge label={`锁定 ${data.summary.lockedCount}`} variant="warning" />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <form
            action="/customers/public-pool"
            method="get"
            className="grid gap-3 rounded-[1.05rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-4 py-4 shadow-[var(--color-shell-shadow-sm)] md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
          >
            <input type="hidden" name="view" value={data.filters.view} />
            {data.filters.view === "pool" ? (
              <input type="hidden" name="segment" value={data.filters.segment} />
            ) : null}
            <label className="space-y-2 xl:col-span-2">
              <span className="crm-label">搜索客户</span>
              <input
                name="search"
                defaultValue={data.filters.search}
                placeholder="客户名 / 手机号"
                className="crm-input"
              />
            </label>
            <label className="space-y-2">
              <span className="crm-label">
                {data.filters.view === "records" ? "动作原因" : "入池原因"}
              </span>
              <select name="reason" defaultValue={data.filters.reason} className="crm-select">
                <option value="">全部原因</option>
                {filterReasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="crm-label">订单情况</span>
              <select name="hasOrders" defaultValue={data.filters.hasOrders} className="crm-select">
                <option value="all">全部</option>
                <option value="yes">有订单</option>
                <option value="no">无订单</option>
              </select>
            </label>
            {data.teamOptions.length > 0 ? (
              <label className="space-y-2">
                <span className="crm-label">团队</span>
                <select name="teamId" defaultValue={data.filters.teamId} className="crm-select">
                  <option value="">全部团队</option>
                  {data.teamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-2">
              <span className="crm-label">每页</span>
              <select name="pageSize" defaultValue={String(data.filters.pageSize)} className="crm-select">
                {[10, 20, 30, 50, 100].map((value) => (
                  <option key={value} value={value}>
                    {value} / 页
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2 xl:col-span-3 2xl:col-span-6">
              <button type="submit" className="crm-button crm-button-primary">
                应用筛选
              </button>
              <Link href={resetHref} scroll={false} className="crm-button crm-button-secondary">
                重置
              </Link>
            </div>
          </form>
        </div>
      }
      stickyBar={
        data.filters.view === "records" ? null : (
          <div className={sectionShellClassName}>
            <StickyActionBar
              title={getBatchBarTitle(data)}
              description={selectionHint}
            >
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                placeholder="可选备注"
                className="crm-input w-full sm:min-w-[11rem]"
              />
              {data.filters.view === "pool" && data.canManage ? (
                <select
                  value={targetSalesId}
                  onChange={(event) => setTargetSalesId(event.target.value)}
                  className="crm-select w-full sm:min-w-[12rem]"
                >
                  <option value="">选择指派销售</option>
                  {data.salesOptions.map((sales) => (
                    <option key={sales.id} value={sales.id}>
                      {sales.name} (@{sales.username})
                    </option>
                  ))}
                </select>
              ) : null}
              {data.filters.view === "pool" && data.canClaim ? (
                <button
                  type="button"
                  disabled={pending || selectedCount === 0}
                  className="crm-button crm-button-primary"
                  onClick={() =>
                    runMutation(() =>
                      claimCustomerPublicPoolAction({
                        customerIds: selectedIds,
                        note,
                      }),
                    )
                  }
                >
                  {pending ? "处理中..." : "批量认领"}
                </button>
              ) : null}
              {data.filters.view === "pool" && data.canManage ? (
                <button
                  type="button"
                  disabled={pending || selectedCount === 0 || !targetSalesId}
                  className="crm-button crm-button-primary"
                  onClick={() =>
                    runMutation(() =>
                      assignCustomerPublicPoolAction({
                        customerIds: selectedIds,
                        targetSalesId,
                        note,
                      }),
                    )
                  }
                >
                  {pending ? "处理中..." : "批量指派"}
                </button>
              ) : null}
              {data.filters.view === "recycle" && data.canManage ? (
                <button
                  type="button"
                  disabled={pending || selectedCount === 0}
                  className="crm-button crm-button-primary"
                  onClick={() =>
                    runMutation(() =>
                      releaseCustomerToPublicPoolAction({
                        customerIds: selectedIds,
                        note,
                        reason: "BATCH_REALLOCATION",
                      }),
                    )
                  }
                >
                  {pending ? "处理中..." : "批量回收"}
                </button>
              ) : null}
            </StickyActionBar>
          </div>
        )
      }
    >
      <div id="customer-public-pool" className={cn(sectionShellClassName, "space-y-4")}>
        {result.message ? (
          <ActionBanner tone={result.status === "success" ? "success" : "danger"}>
            {result.message}
          </ActionBanner>
        ) : null}

        {data.filters.view === "pool" ? (
          <div className="space-y-4">
            {data.canManage ? (
              <AutoAssignAutomationCard
                activeTeamAutoAssign={data.activeTeamAutoAssign}
                preview={autoAssignPreview}
                applyResult={autoAssignApplyResult}
                pending={pending}
                onPreview={() =>
                  runAutoAssignPreview(() => previewAutoAssignAction(getAutoAssignInput()))
                }
                onApply={() =>
                  runAutoAssignApply(() => applyAutoAssignAction(getAutoAssignInput()))
                }
              />
            ) : null}
          <DataTableWrapper
            title="公海客户列表"
            description="查看公海客户。"
            eyebrow="Public Pool"
          >
            <EntityTable
              density="compact"
              rows={data.poolItems}
              getRowKey={(row) => row.id}
              emptyTitle="当前没有匹配的公海客户"
              emptyDescription="试试调整筛选。"
              columns={[
                {
                  key: "select",
                  title: (
                    <input
                      type="checkbox"
                      checked={allPoolIds.length > 0 && selectedIds.length === allPoolIds.length}
                      onChange={(event) => toggleSelectAll(allPoolIds, event.target.checked)}
                    />
                  ) as unknown as string,
                  render: (row) => (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      disabled={row.isLocked}
                      onChange={(event) => toggleSelected(row.id, event.target.checked)}
                    />
                  ),
                },
                {
                  key: "customer",
                  title: "客户",
                  render: (row) => {
                    const detailHref = buildCustomerPublicPoolCustomerDetailHref(row.id, filters);

                    return (
                      <div className="space-y-1">
                        <Link
                          href={detailHref}
                          className="font-medium text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
                        >
                          {row.name}
                        </Link>
                        <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                          {row.phone}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="text-[12px] text-[var(--color-sidebar-muted)]">
                            {row.region}
                          </span>
                          {row.publicPoolTeam ? (
                            <span className="text-[12px] text-[var(--color-sidebar-muted)]">
                              · {row.publicPoolTeam.name}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "source",
                  title: "来源 / 标签",
                  render: (row) => (
                    <div className="space-y-1">
                      <div className="text-[12px] text-[var(--foreground)]">
                        {row.latestLeadSource ?? "无来源记录"}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {row.tags.length > 0 ? (
                          row.tags.map((tag) => (
                            <span key={tag.id} className={quietWorkbenchTagClassName}>
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[12px] text-[var(--color-sidebar-muted)]">
                            无标签
                          </span>
                        )}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "followUp",
                  title: "最近有效跟进",
                  render: (row) => (
                    <div className="space-y-1">
                      <div className="text-[12px] text-[var(--foreground)]">
                        {formatDateTimeValue(row.lastEffectiveFollowUpAt)}
                      </div>
                      <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                        {formatRelativeAge(row.lastEffectiveFollowUpAt)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "lastOwner",
                  title: "最近 Owner",
                  render: (row) => (
                    <div className="space-y-1">
                      <div className="text-[12px] text-[var(--foreground)]">
                        {row.lastOwner ? row.lastOwner.name : "未承接"}
                      </div>
                      <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                        {row.lastOwner ? `@${row.lastOwner.username}` : "无最近 owner"}
                      </div>
                      <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                        {row.lastOwner?.teamName ?? "无团队记录"}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "entered",
                  title: "入池原因 / 时间",
                  render: (row) => (
                    <div className="space-y-1">
                      <div className="text-[12px] text-[var(--foreground)]">
                        {row.publicPoolReasonLabel ?? "未记录原因"}
                      </div>
                      <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                        {formatDateTimeValue(row.publicPoolEnteredAt)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "protection",
                  title: "锁定 / 保护期",
                  render: (row) => (
                    <div className="space-y-1">
                      {row.isLocked ? (
                        <StatusBadge label="锁定中" variant="warning" />
                      ) : (
                        <StatusBadge label="可认领" variant="success" />
                      )}
                      <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                        {formatProtectionWindow(row.claimLockedUntil)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "orders",
                  title: "订单 / 成交摘要",
                  render: (row) => (
                    <div className="space-y-1 text-[12px] text-[var(--color-sidebar-muted)]">
                      <div>交易单 {row.orderSummary.tradeOrderCount}</div>
                      <div>销售单 {row.orderSummary.salesOrderCount}</div>
                      <div>{row.orderSummary.hasApprovedSalesOrder ? "有已审核订单" : "未成交"}</div>
                    </div>
                  ),
                },
                {
                  key: "action",
                  title: "动作",
                  render: (row) => {
                    const detailHref = buildCustomerPublicPoolCustomerDetailHref(row.id, filters);

                    return (
                      <div className="flex flex-col items-start gap-2">
                        <Link
                          href={detailHref}
                          className="text-[12px] font-medium text-[var(--color-sidebar-muted)] underline-offset-2 transition-colors hover:text-[var(--foreground)] hover:underline"
                        >
                          查看详情
                        </Link>
                        {data.canClaim ? (
                          <button
                            type="button"
                            disabled={pending || row.isLocked}
                            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                            onClick={() =>
                              runMutation(
                                () =>
                                  claimCustomerPublicPoolAction({
                                    customerIds: [row.id],
                                    note,
                                  }),
                                false,
                              )
                            }
                          >
                            认领
                          </button>
                        ) : (
                          <span className="text-[12px] text-[var(--color-sidebar-muted)]">
                            {row.isLocked ? "保护中，暂不指派" : "通过上方批量栏指派"}
                          </span>
                        )}
                      </div>
                    );
                  },
                },
              ]}
            />
          </DataTableWrapper>
          </div>
        ) : null}

        {data.filters.view === "recycle" ? (
          <div className="space-y-4">
            <div className="grid gap-3 2xl:grid-cols-2">
              <RecycleAutomationCard
                kind="inactive"
                title="自动回收"
                description="按规则预览并执行回收。"
                preview={inactivePreview}
                applyResult={inactiveApplyResult}
                pending={pending}
                onPreview={() =>
                  runRecyclePreview("inactive", () =>
                    previewInactiveRecycleAction(getRecycleAutomationInput()),
                  )
                }
                onApply={() =>
                  runRecycleApply("inactive", () =>
                    applyInactiveRecycleAction(getRecycleAutomationInput()),
                  )
                }
              />
              <RecycleAutomationCard
                kind="owner_exit"
                title="离职回收"
                description="按离职规则回收。"
                preview={ownerExitPreview}
                applyResult={ownerExitApplyResult}
                pending={pending}
                onPreview={() =>
                  runRecyclePreview("owner_exit", () =>
                    previewOwnerExitRecycleAction(getRecycleAutomationInput()),
                  )
                }
                onApply={() =>
                  runRecycleApply("owner_exit", () =>
                    applyOwnerExitRecycleAction(getRecycleAutomationInput()),
                  )
                }
              />
            </div>

            <DataTableWrapper
              title="可回收客户"
              description="查看可回收客户。"
              eyebrow="Recycle"
            >
              <EntityTable
                density="compact"
                rows={data.recycleItems}
                getRowKey={(row) => row.id}
                emptyTitle="当前没有可回收客户"
                emptyDescription="当前筛选条件下没有记录。"
                columns={[
                  {
                    key: "select",
                    title: (
                      <input
                        type="checkbox"
                        checked={allRecycleIds.length > 0 && selectedIds.length === allRecycleIds.length}
                        onChange={(event) => toggleSelectAll(allRecycleIds, event.target.checked)}
                      />
                    ) as unknown as string,
                    render: (row) => (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        disabled={data.actor.role !== "ADMIN" && row.isLocked}
                        onChange={(event) => toggleSelected(row.id, event.target.checked)}
                      />
                    ),
                  },
                  {
                    key: "customer",
                    title: "客户",
                    render: (row) => {
                      const detailHref = buildCustomerPublicPoolCustomerDetailHref(row.id, filters);

                      return (
                        <div className="space-y-1">
                          <Link
                            href={detailHref}
                            className="font-medium text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
                          >
                            {row.name}
                          </Link>
                          <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                            {row.phone}
                          </div>
                          <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                            {row.region}
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    key: "owner",
                    title: "当前 Owner",
                    render: (row) => (
                      <div className="space-y-1 text-[12px] text-[var(--color-sidebar-muted)]">
                        <div>{row.owner?.name ?? "无 owner"}</div>
                        <div>{row.owner ? `@${row.owner.username}` : "-"}</div>
                        <div>{row.owner?.teamName ?? "无团队"}</div>
                      </div>
                    ),
                  },
                  {
                    key: "followUp",
                    title: "最近有效跟进",
                    render: (row) => (
                      <div className="space-y-1">
                        <div className="text-[12px] text-[var(--foreground)]">
                          {formatDateTimeValue(row.lastEffectiveFollowUpAt)}
                        </div>
                        <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                          {formatRelativeAge(row.lastEffectiveFollowUpAt)}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "protection",
                    title: "锁定 / 保护期",
                    render: (row) => (
                      <div className="space-y-1">
                        {row.isLocked ? (
                          <StatusBadge label="保护中" variant="warning" />
                        ) : (
                          <StatusBadge label="可回收" variant="neutral" />
                        )}
                        <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                          {formatProtectionWindow(row.claimLockedUntil)}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "orders",
                    title: "订单 / 成交摘要",
                    render: (row) => (
                      <div className="space-y-1 text-[12px] text-[var(--color-sidebar-muted)]">
                        <div>交易单 {row.orderSummary.tradeOrderCount}</div>
                        <div>销售单 {row.orderSummary.salesOrderCount}</div>
                        <div>{row.orderSummary.hasApprovedSalesOrder ? "有已审核订单" : "未成交"}</div>
                      </div>
                    ),
                  },
                  {
                    key: "action",
                    title: "动作",
                    render: (row) => {
                      const detailHref = buildCustomerPublicPoolCustomerDetailHref(row.id, filters);

                      return (
                        <div className="flex flex-col items-start gap-2">
                          <Link
                            href={detailHref}
                            className="text-[12px] font-medium text-[var(--color-sidebar-muted)] underline-offset-2 transition-colors hover:text-[var(--foreground)] hover:underline"
                          >
                            查看详情
                          </Link>
                          <button
                            type="button"
                            disabled={pending || (data.actor.role !== "ADMIN" && row.isLocked)}
                            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                            onClick={() =>
                              runMutation(
                                () =>
                                  releaseCustomerToPublicPoolAction({
                                    customerIds: [row.id],
                                    note,
                                    reason: "MANUAL_RELEASE",
                                  }),
                                false,
                              )
                            }
                          >
                            释放
                          </button>
                        </div>
                      );
                    },
                  },
                ]}
              />
            </DataTableWrapper>
          </div>
        ) : null}

        {data.filters.view === "records" ? (
          <DataTableWrapper
            title="Ownership 审计链"
            description="查看流转记录。"
            eyebrow="Records"
          >
            <EntityTable
              density="compact"
              rows={data.recordItems}
              getRowKey={(row) => row.id}
              emptyTitle="当前没有匹配的流转记录"
              emptyDescription="试试调整筛选。"
              columns={[
                {
                  key: "time",
                  title: "时间",
                  render: (row) => (
                    <div className="text-[12px] text-[var(--foreground)]">
                      {formatDateTime(row.createdAt)}
                    </div>
                  ),
                },
                {
                  key: "customer",
                  title: "客户",
                  render: (row) => (
                    <div className="space-y-1">
                      <Link
                        href={buildCustomerPublicPoolCustomerDetailHref(row.customer.id, filters)}
                        className="font-medium text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
                      >
                        {row.customer.name}
                      </Link>
                      <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                        {row.customer.phone}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "transition",
                  title: "状态变化",
                  render: (row) => (
                    <div className="space-y-1">
                      <StatusBadge label={row.reasonLabel} variant="info" />
                      <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                        {(row.fromOwnershipMode
                          ? getCustomerOwnershipModeLabel(row.fromOwnershipMode)
                          : "无状态") + " → " + getCustomerOwnershipModeLabel(row.toOwnershipMode)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "owners",
                  title: "归属变化",
                  render: (row) => (
                    <div className="space-y-1 text-[12px] text-[var(--color-sidebar-muted)]">
                      <div>从：{row.fromOwner ? row.fromOwner.name : "公海 / 无 owner"}</div>
                      <div>到：{row.toOwner ? row.toOwner.name : "公海 / 无 owner"}</div>
                    </div>
                  ),
                },
                {
                  key: "actor",
                  title: "操作者",
                  render: (row) => (
                    <div className="space-y-1 text-[12px] text-[var(--color-sidebar-muted)]">
                      <div>{row.actor?.name ?? "系统"}</div>
                      <div>{row.actor ? `@${row.actor.username}` : "-"}</div>
                    </div>
                  ),
                },
                {
                  key: "auditMeta",
                  title: "审计快照",
                  render: (row) => (
                    <div className="space-y-1 text-[12px] text-[var(--color-sidebar-muted)]">
                      <div>团队：{row.team?.name ?? "无团队"}</div>
                      <div>有效跟进：{formatDateTimeValue(row.effectiveFollowUpAt)}</div>
                      <div>保护至：{formatProtectionWindow(row.claimLockedUntil)}</div>
                    </div>
                  ),
                },
                {
                  key: "note",
                  title: "备注",
                  render: (row) => (
                    <div className="max-w-[16rem] text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                      {row.note || "无备注"}
                    </div>
                  ),
                },
              ]}
            />
          </DataTableWrapper>
        ) : null}

        <div className="mt-[14px] [&>div]:rounded-[16px] [&>div]:border-[var(--color-border-soft)] [&>div]:bg-[var(--color-panel-soft)] [&>div]:px-[14px] [&>div]:py-[12px] [&>div]:shadow-[var(--color-shell-shadow-sm)] md:[&>div]:rounded-[18px] md:[&>div]:px-4 xl:[&>div]:rounded-[20px] xl:[&>div]:px-[18px] [&_.crm-toolbar-cluster]:gap-2 [&_a]:h-8 [&_a]:rounded-[10px] [&_a]:border [&_a]:border-[var(--color-border-soft)] [&_a]:bg-[var(--color-shell-surface)] [&_a]:px-3 [&_a]:py-0 [&_a]:text-[13px] [&_a]:text-[var(--color-sidebar-muted)] [&_a]:shadow-none [&_a]:hover:translate-y-0 [&_a]:hover:border-[rgba(122,154,255,0.18)] [&_a]:hover:bg-[var(--color-shell-hover)] [&_a]:hover:text-[var(--foreground)] [&_p]:text-[13px] [&_p]:leading-5 [&_p]:text-[var(--color-sidebar-muted)]">
          <PaginationControls
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            summary={`当前第 ${data.pagination.page} / ${data.pagination.totalPages} 页，共 ${data.pagination.totalCount} 条记录`}
            buildHref={(page) =>
              buildCustomerPublicPoolHref(data.filters as CustomerPublicPoolFilterShape, { page })
            }
            scrollTargetId="customer-public-pool"
          />
        </div>
      </div>
    </WorkbenchLayout>
  );
}
