"use client";

import {
  ArrowRightLeft,
  CheckSquare2,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import type { BatchTagOption, SelectionMode } from "@/components/customers/customer-batch-dialogs";
import { MAX_BATCH_CUSTOMER_ACTION_SIZE } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

type PaginationLite = { totalCount: number };

export type BatchActionBarProps = Readonly<{
  selectionMode: SelectionMode;
  pagination: PaginationLite;
  itemCount: number;
  selectedCount: number;
  allCurrentPageSelected: boolean;
  canSelectFiltered: boolean;
  dangerHint: string | null;
  neutralHint: string;
  batchExecutionBlockedByLimit: boolean;
  manualRecycleUnavailable: boolean;
  canBatchAddTags: boolean;
  canBatchTransferOwner: boolean;
  canBatchMoveToRecycleBin: boolean;
  canBatchForceHardDelete: boolean;
  hasBatchOwnerTransferOptions: boolean;
  batchTagOptions: BatchTagOption[];
  batchRecycleDisabled: boolean;
  onSelectFilteredResults: () => void;
  onToggleSelectAllCurrentPage: () => void;
  onResetSelection: () => void;
  onOpenBatchTag: () => void;
  onOpenBatchOwnerTransfer: () => void;
  onOpenBatchRecycle: () => void;
  onOpenBatchForceDelete: () => void;
}>;

const CHIP_BASE =
  "inline-flex h-8 items-center rounded-full border border-border/60 bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary";

export function CustomersTableBatchActionBar(props: BatchActionBarProps) {
  const {
    selectionMode,
    pagination,
    itemCount,
    selectedCount,
    allCurrentPageSelected,
    canSelectFiltered,
    dangerHint,
    neutralHint,
    batchExecutionBlockedByLimit,
    manualRecycleUnavailable,
    canBatchAddTags,
    canBatchTransferOwner,
    canBatchMoveToRecycleBin,
    canBatchForceHardDelete,
    hasBatchOwnerTransferOptions,
    batchTagOptions,
    batchRecycleDisabled,
    onSelectFilteredResults,
    onToggleSelectAllCurrentPage,
    onResetSelection,
    onOpenBatchTag,
    onOpenBatchOwnerTransfer,
    onOpenBatchRecycle,
    onOpenBatchForceDelete,
  } = props;

  const barClass = cn(
    "flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between",
    batchExecutionBlockedByLimit
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
      : selectionMode === "filtered"
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-border/60 bg-muted/40 text-muted-foreground",
  );

  const countChipClass = cn(
    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
    batchExecutionBlockedByLimit
      ? "border-rose-200 bg-card text-rose-700 dark:border-rose-500/30 dark:text-rose-200"
      : selectionMode === "filtered"
        ? "border-primary/30 bg-card text-primary"
        : "border-border/60 bg-card text-muted-foreground",
  );

  const showExpandToFiltered =
    selectionMode === "manual" &&
    allCurrentPageSelected &&
    pagination.totalCount > itemCount;

  const recycleTitle = manualRecycleUnavailable
    ? canBatchForceHardDelete
      ? "已选客户均不满足回收条件；如确需彻底删除，请改用右侧硬删入口走永久删除流程。"
      : "已选客户有归属或导入历史，无法自助回收；如确需删除，请联系您的主管走硬删流程。"
    : "批量移入回收站；服务端仍会逐条校验误建轻客户条件。";

  return (
    <div className={barClass}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={countChipClass}>
          <CheckSquare2 className="h-3.5 w-3.5" />
          <span>
            {selectionMode === "filtered"
              ? `筛选结果 ${pagination.totalCount}`
              : `已选 ${selectedCount}`}
          </span>
        </span>
        <span className="min-w-0 text-xs leading-5">{dangerHint ?? neutralHint}</span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {showExpandToFiltered ? (
          canSelectFiltered ? (
            <button type="button" onClick={onSelectFilteredResults} className={CHIP_BASE}>
              选择全部 {pagination.totalCount}
            </button>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">
              超过 {MAX_BATCH_CUSTOMER_ACTION_SIZE} 位上限
            </span>
          )
        ) : null}

        <button type="button" onClick={onToggleSelectAllCurrentPage} className={CHIP_BASE}>
          {selectionMode === "filtered"
            ? "取消跨页"
            : allCurrentPageSelected
              ? "取消当前页"
              : "全选当前页"}
        </button>

        {selectionMode === "manual" ? (
          <button
            type="button"
            onClick={onResetSelection}
            aria-label="清空选择"
            title="清空选择"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}

        {canBatchAddTags ? (
          <button
            type="button"
            onClick={onOpenBatchTag}
            disabled={batchTagOptions.length === 0 || batchExecutionBlockedByLimit}
            title="批量为已选客户添加标签"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <Tags className="h-3.5 w-3.5" />
            标签
          </button>
        ) : null}

        {canBatchTransferOwner ? (
          <button
            type="button"
            onClick={onOpenBatchOwnerTransfer}
            disabled={!hasBatchOwnerTransferOptions || batchExecutionBlockedByLimit}
            title={hasBatchOwnerTransferOptions ? "批量移交负责人" : "暂无可移交的销售账号"}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/20 bg-card px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            移交
          </button>
        ) : null}

        {canBatchMoveToRecycleBin ? (
          <button
            type="button"
            onClick={onOpenBatchRecycle}
            disabled={batchRecycleDisabled}
            title={recycleTitle}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-200 bg-card px-3 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            回收
          </button>
        ) : null}

        {canBatchForceHardDelete ? (
          <button
            type="button"
            onClick={onOpenBatchForceDelete}
            disabled={batchExecutionBlockedByLimit}
            title="永久删除已选客户，不可恢复；将触发硬删审计链 (仅 ADMIN / SUPERVISOR 可执行)。"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            硬删
          </button>
        ) : null}
      </div>
    </div>
  );
}
