"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import { notifyToast } from "@/components/shared/toast-provider";
import type { CustomerBatchActionNoticeState } from "@/lib/customers/batch-action-contract";
import {
  formatRegion,
  getCustomerExecutionClassQuickResult,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
} from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

export type CustomerViewMode = "cards" | "table";

export function getCustomerAddress(item: CustomerListItem) {
  const region = formatRegion(item.province, item.city, item.district);
  const detail = item.address?.trim();

  if (detail) {
    return region !== "未填写" ? `${region} / ${detail}` : detail;
  }

  return region;
}

export function getOwnerLabel(item: CustomerListItem) {
  return item.owner ? `${item.owner.name} (@${item.owner.username})` : "未分配负责人";
}

export function getCustomerInitial(item: CustomerListItem) {
  const name = item.name.trim();
  if (!name) return "?";
  return Array.from(name)[0]?.toUpperCase() ?? "?";
}

export function getPrimarySignal(item: CustomerListItem) {
  return item.latestPurchasedProduct ?? item.latestInterestedProduct ?? "暂无商品信号";
}

export function getLatestCallRecord(item: CustomerListItem) {
  return item.callRecords[0] ?? null;
}

export function getProgressSummary(item: CustomerListItem) {
  if (item.workingStatuses.length === 0) {
    return {
      primary: getCustomerStatusLabel(item.status),
      secondary: "当前没有挂起推进项",
    };
  }

  const labels = item.workingStatuses.map((status) => getCustomerWorkStatusLabel(status));
  return {
    primary: labels[0] ?? "当前推进",
    secondary: labels.length > 1 ? `另有 ${labels.length - 1} 项推进` : "当前主推进项",
  };
}

export function getSignalMeta(item: CustomerListItem) {
  if (item.latestPurchasedProduct) {
    return "导入前购买";
  }

  if (item.latestInterestedProduct) {
    return "导入意向";
  }

  return "暂无商品字段";
}

export function getSuggestedFollowUpResult(item: CustomerListItem) {
  if (item.newImported && item.pendingFirstCall) {
    return "";
  }

  return item.callRecords[0]?.resultCode ?? getCustomerExecutionClassQuickResult(item.executionClass);
}

export function buildCustomerPopupHref(customerId: string) {
  return `/customers/${customerId}?mode=popup`;
}

export function isRecentIsoDate(value: string | undefined, maxAgeMs: number) {
  if (!value) {
    return false;
  }

  const time = Date.parse(value);

  return Number.isFinite(time) && Date.now() - time <= maxAgeMs;
}

export function readJsonStorageValue<T>(storage: Storage, key: string): T | null {
  const stored = storage.getItem(key);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function notifyCustomerBatchActionResult(
  state: CustomerBatchActionNoticeState,
  input: Readonly<{
    defaultTitle: string;
    successLabel: string;
    countUnitLabel: string;
  }>,
) {
  if (state.status === "idle") {
    return;
  }

  const summary = state.summary;
  const summaryText =
    summary.totalCount > 0
      ? `${input.successLabel} ${summary.successCount}${input.countUnitLabel}，${state.skippedLabel} ${summary.skippedCount}${input.countUnitLabel}，阻断 ${summary.blockedCount}${input.countUnitLabel}`
      : "";
  const scopeText = state.selection
    ? `范围：${state.selection.label} ${state.selection.count}${input.countUnitLabel}`
    : "";
  const limitText = state.limitExceeded
    ? `超过单次 ${state.limitExceeded.maxCount}${input.countUnitLabel} 上限`
    : "";
  const blockedText =
    state.blockedReasonSummary.length > 0
      ? `阻断原因：${state.blockedReasonSummary
          .map((item) => `${item.label} ${item.count}${input.countUnitLabel}`)
          .join("；")}`
      : "";
  const description = [summaryText, scopeText, limitText, blockedText]
    .filter(Boolean)
    .join(" · ");

  notifyToast({
    title: state.message || input.defaultTitle,
    description,
    tone:
      state.status === "error"
        ? "danger"
        : summary.successCount > 0
          ? "success"
          : "info",
  });
}

export function CustomerViewToggle({
  value,
  onChange,
}: Readonly<{
  value: CustomerViewMode;
  onChange: (nextValue: CustomerViewMode) => void;
}>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-1">
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-[background-color,color] duration-120",
          value === "table"
            ? "bg-[var(--color-shell-hover)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
            : "text-[var(--color-sidebar-muted)] hover:text-[var(--foreground)]",
        )}
      >
        <Rows3 className="h-3.5 w-3.5" />
        <span>表格</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-[background-color,color] duration-120",
          value === "cards"
            ? "bg-[var(--color-shell-hover)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
            : "text-[var(--color-sidebar-muted)] hover:text-[var(--foreground)]",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>卡片</span>
      </button>
    </div>
  );
}
