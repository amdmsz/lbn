"use client";

import type { FormEvent } from "react";
import { Trash2 } from "lucide-react";
import type {
  CustomerCenterFilters,
  SalesRepBoardItem,
} from "@/lib/customers/queries";

export type SelectionMode = "manual" | "filtered";

export type BatchTagOption = {
  id: string;
  name: string;
  label: string;
  count: number;
};

export const BATCH_FORCE_DELETE_CONFIRMATION_PHRASE = "永久删除";

function FilterHiddenInputs({
  filters,
}: Readonly<{
  filters: CustomerCenterFilters;
}>) {
  return (
    <>
      <input type="hidden" name="queue" value={filters.queue} />
      {filters.executionClasses.map((executionClass) => (
        <input
          key={executionClass}
          type="hidden"
          name="executionClasses"
          value={executionClass}
        />
      ))}
      {filters.search ? <input type="hidden" name="search" value={filters.search} /> : null}
      {filters.teamId ? <input type="hidden" name="teamId" value={filters.teamId} /> : null}
      {filters.salesId ? <input type="hidden" name="salesId" value={filters.salesId} /> : null}
      {filters.productKeys.map((productKey) => (
        <input key={productKey} type="hidden" name="productKeys" value={productKey} />
      ))}
      {filters.productKeyword ? (
        <input type="hidden" name="productKeyword" value={filters.productKeyword} />
      ) : null}
      {filters.tagIds.map((tagId) => (
        <input key={tagId} type="hidden" name="tagIds" value={tagId} />
      ))}
      {filters.assignedFrom ? (
        <input type="hidden" name="assignedFrom" value={filters.assignedFrom} />
      ) : null}
      {filters.assignedTo ? (
        <input type="hidden" name="assignedTo" value={filters.assignedTo} />
      ) : null}
      <input type="hidden" name="page" value={String(filters.page)} />
      <input type="hidden" name="pageSize" value={String(filters.pageSize)} />
    </>
  );
}

export function BatchTagDialog({
  open,
  selectedCount,
  selectionMode,
  filters,
  tagOptions,
  selectedTagId,
  pending,
  onClose,
  onTagChange,
  onSubmit,
  selectedCustomerIds,
}: Readonly<{
  open: boolean;
  selectedCount: number;
  selectionMode: SelectionMode;
  filters: CustomerCenterFilters;
  tagOptions: BatchTagOption[];
  selectedTagId: string;
  pending: boolean;
  onClose: () => void;
  onTagChange: (nextValue: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedCustomerIds: string[];
}>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="批量添加标签"
        className="crm-card w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">批量添加标签</h3>
              <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                本次会对已选 {selectedCount} 位客户批量添加一个标签。已有标签不会覆盖，只会计入“已有标签”。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === "filtered" ? (
            <FilterHiddenInputs filters={filters} />
          ) : (
            selectedCustomerIds.map((customerId) => (
              <input key={customerId} type="hidden" name="customerIds" value={customerId} />
            ))
          )}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">选择标签</span>
            <select
              name="tagId"
              value={selectedTagId}
              onChange={(event) => onTagChange(event.target.value)}
              required
              className="crm-input h-11 w-full"
            >
              <option value="">请选择一个标签</option>
              {tagOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label || option.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            {selectionMode === "filtered"
              ? `这次会按当前筛选结果批量处理 ${selectedCount} 位客户，不做标签移除，也不会覆盖已有标签。`
              : "这次会按当前页手选客户批量添加标签，不做标签移除，也不会覆盖已有标签。"}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending || !selectedTagId}
              className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "提交中..." : "确认添加标签"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BatchOwnerTransferDialog({
  open,
  selectedCount,
  selectionMode,
  filters,
  ownerOptions,
  selectedTargetOwnerId,
  pending,
  onClose,
  onOwnerChange,
  onSubmit,
  selectedCustomerIds,
}: Readonly<{
  open: boolean;
  selectedCount: number;
  selectionMode: SelectionMode;
  filters: CustomerCenterFilters;
  ownerOptions: SalesRepBoardItem[];
  selectedTargetOwnerId: string;
  pending: boolean;
  onClose: () => void;
  onOwnerChange: (nextValue: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedCustomerIds: string[];
}>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="批量移交负责人"
        className="crm-card w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">批量移交负责人</h3>
              <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                本次会把已选 {selectedCount} 位客户逐条移交给新的销售负责人。已由目标负责人承接的客户会计入“无需移交”。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === "filtered" ? (
            <FilterHiddenInputs filters={filters} />
          ) : (
            selectedCustomerIds.map((customerId) => (
              <input key={customerId} type="hidden" name="customerIds" value={customerId} />
            ))
          )}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">新的负责人</span>
            <select
              name="targetOwnerId"
              value={selectedTargetOwnerId}
              onChange={(event) => onOwnerChange(event.target.value)}
              required
              className="crm-input h-11 w-full"
            >
              <option value="">请选择销售负责人</option>
              {ownerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} (@{option.username})
                  {option.teamName ? ` / ${option.teamName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">移交备注</span>
            <textarea
              name="note"
              rows={3}
              maxLength={500}
              placeholder="可填写移交原因，选填"
              disabled={pending}
              className="crm-textarea"
            />
          </label>

          <div className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            {selectionMode === "filtered"
              ? `这次会按当前筛选结果批量处理 ${selectedCount} 位客户，服务端仍会校验当前账号可见范围、团队范围和目标销售状态。`
              : "这次会按当前页手选客户批量移交，服务端仍会校验当前账号可见范围、团队范围和目标销售状态。"}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending || !selectedTargetOwnerId}
              className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "移交中..." : "确认移交"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BatchRecycleDialog({
  open,
  selectedCount,
  manualRecycleEligibleCount,
  selectionMode,
  filters,
  pending,
  onClose,
  onSubmit,
  selectedCustomerIds,
}: Readonly<{
  open: boolean;
  selectedCount: number;
  manualRecycleEligibleCount: number | null;
  selectionMode: SelectionMode;
  filters: CustomerCenterFilters;
  pending: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedCustomerIds: string[];
}>) {
  if (!open) {
    return null;
  }

  const submitDisabled =
    pending ||
    (selectionMode === "manual" &&
      selectedCount > 0 &&
      manualRecycleEligibleCount === 0);
  const scopeNotice =
    selectionMode === "filtered"
      ? `这次会按当前筛选结果检查 ${selectedCount} 位客户。已有归属历史、跟进、订单、支付或履约链的客户不会被移入回收站，会返回阻断原因。`
      : manualRecycleEligibleCount === 0
        ? "当前已选客户都不满足回收条件，请改走客户状态、公海、移交或归档治理。"
        : manualRecycleEligibleCount !== null && manualRecycleEligibleCount < selectedCount
          ? `当前已选客户中 ${manualRecycleEligibleCount} 位可尝试移入回收站，其余会返回阻断原因。`
          : "这次会按当前页手选客户逐条检查，只处理满足误建轻客户条件的对象。";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="批量移入回收站"
        className="crm-card w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">批量移入回收站</h3>
              <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                回收站只用于误建、未形成归属和业务链的轻客户。已进入归属、跟进、交易或履约链的客户会保留在客户中心，并给出治理建议。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === "filtered" ? (
            <FilterHiddenInputs filters={filters} />
          ) : (
            selectedCustomerIds.map((customerId) => (
              <input key={customerId} type="hidden" name="customerIds" value={customerId} />
            ))
          )}
          <input type="hidden" name="reasonCode" value="mistaken_creation" />

          <div className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            {scopeNotice}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending
                ? "提交中..."
                : submitDisabled
                  ? "没有可回收客户"
                  : "确认移入回收站"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BatchForceDeleteDialog({
  open,
  selectedCount,
  selectionMode,
  filters,
  pending,
  confirmation,
  reason,
  onClose,
  onSubmit,
  onConfirmationChange,
  onReasonChange,
  selectedCustomerIds,
}: Readonly<{
  open: boolean;
  selectedCount: number;
  selectionMode: SelectionMode;
  filters: CustomerCenterFilters;
  pending: boolean;
  confirmation: string;
  reason: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onConfirmationChange: (nextValue: string) => void;
  onReasonChange: (nextValue: string) => void;
  selectedCustomerIds: string[];
}>) {
  if (!open) {
    return null;
  }

  const confirmationMatched =
    confirmation.trim() === BATCH_FORCE_DELETE_CONFIRMATION_PHRASE;
  const submitDisabled = pending || !confirmationMatched || !reason.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/32 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="批量硬删除客户"
        className="crm-card w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--tone-danger-soft-border-strong)] bg-[var(--tone-danger-soft-bg)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--color-danger)]">
                批量硬删除客户
              </h3>
              <p className="text-sm leading-6 text-[rgba(84,49,45,0.78)]">
                本次会直接删除 {selectedCount} 位客户及其关联记录，不进入回收站，删除后只能依赖数据库备份恢复。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === "filtered" ? (
            <FilterHiddenInputs filters={filters} />
          ) : (
            selectedCustomerIds.map((customerId) => (
              <input key={customerId} type="hidden" name="customerIds" value={customerId} />
            ))
          )}

          <div className="rounded-[0.9rem] border border-[var(--tone-danger-soft-border)] bg-[var(--tone-danger-soft-bg)] px-4 py-3 text-[13px] leading-6 text-[rgba(84,49,45,0.78)]">
            {selectionMode === "filtered"
              ? "这次会按当前筛选结果逐条硬删除，服务端仍会校验当前账号可见范围和主管团队范围。"
              : "这次会按当前页手选客户逐条硬删除，服务端仍会校验当前账号可见范围和主管团队范围。"}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              确认内容
            </span>
            <input
              name="confirmation"
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.currentTarget.value)}
              placeholder={`输入 ${BATCH_FORCE_DELETE_CONFIRMATION_PHRASE}`}
              disabled={pending}
              className="crm-input h-11 w-full"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              删除原因
            </span>
            <textarea
              name="reason"
              value={reason}
              onChange={(event) => onReasonChange(event.currentTarget.value)}
              rows={3}
              maxLength={500}
              placeholder="填写本次批量硬删除原因"
              disabled={pending}
              className="crm-textarea"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="inline-flex min-h-0 items-center justify-center gap-2 rounded-lg bg-destructive px-3.5 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pending ? "删除中..." : "确认硬删除"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
