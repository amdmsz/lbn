"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  purgeRecycleBinEntryAction,
  restoreRecycleBinEntryAction,
  type RecycleBinActionResult,
} from "@/app/(dashboard)/recycle-bin/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import type {
  RecycleBinBlockerGroup,
  RecycleBinListItem,
  RecycleBinTabValue,
} from "@/lib/recycle-bin/queries";
import { cn } from "@/lib/utils";

type RecycleBinDialogState =
  | {
      mode: "restore" | "purge";
      item: RecycleBinListItem;
    }
  | null;

function getTabLabel(activeTab: RecycleBinTabValue) {
  switch (activeTab) {
    case "master-data":
      return "商品主数据";
    case "live-sessions":
      return "直播场次";
    case "leads":
      return "线索";
    default:
      return "回收站";
  }
}

function getDialogMeta(mode: "restore" | "purge") {
  if (mode === "restore") {
    return {
      title: "恢复对象",
      badgeLabel: "恢复操作",
      badgeVariant: "success" as const,
      description: "恢复后，对象会按现有查询规则重新回到原业务工作区。",
      primaryLabel: "确认恢复",
      impactHint:
        "恢复不会改写对象原有的业务生命周期字段，只会让回收站条目退出 ACTIVE 状态。",
      impactLabel: "恢复目标位置",
    };
  }

  return {
    title: "永久删除对象",
    badgeLabel: "最终清理",
    badgeVariant: "danger" as const,
    description: "永久删除后会物理移除源对象，且无法恢复。",
    primaryLabel: "确认永久删除",
    impactHint:
      "永久删除前会再次实时重算 purge blocker，不能只依赖删除时的快照。",
    impactLabel: "最终清理说明",
  };
}

export function RecycleBinWorkbench({
  activeTab,
  items,
}: Readonly<{
  activeTab: RecycleBinTabValue;
  items: RecycleBinListItem[];
}>) {
  const router = useRouter();
  const [notice, setNotice] = useState<RecycleBinActionResult | null>(null);
  const [dialogState, setDialogState] = useState<RecycleBinDialogState>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    items[0]?.entryId ?? null,
  );
  const [pending, startTransition] = useTransition();

  const selectedItem = useMemo(
    () => items.find((item) => item.entryId === selectedEntryId) ?? items[0] ?? null,
    [items, selectedEntryId],
  );

  const showLeadColumns = activeTab === "leads";

  function closeDialog() {
    setDialogState(null);
  }

  function openDialog(mode: "restore" | "purge", item: RecycleBinListItem) {
    setSelectedEntryId(item.entryId);
    setDialogState({ mode, item });
  }

  function handleConfirm() {
    if (!dialogState) {
      return;
    }

    const formData = new FormData();
    formData.set("entryId", dialogState.item.entryId);

    startTransition(async () => {
      const result =
        dialogState.mode === "restore"
          ? await restoreRecycleBinEntryAction(formData)
          : await purgeRecycleBinEntryAction(formData);

      setNotice(result);
      closeDialog();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <DataTableWrapper
          title={`${getTabLabel(activeTab)}回收站条目`}
          description="第一版保留恢复、永久删除和 blocker 摘要；点击行即可在右侧查看更完整的治理详情。"
          contentClassName="p-0"
        >
          {items.length > 0 ? (
            <div className="crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>对象类型</th>
                    <th>名称</th>
                    <th>次标识</th>
                    {showLeadColumns ? <th>删除前状态</th> : null}
                    {showLeadColumns ? <th>删除前负责人</th> : null}
                    <th>删除原因</th>
                    <th>删除时间</th>
                    <th>删除人</th>
                    <th>blocker 摘要</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const selected = item.entryId === selectedItem?.entryId;

                    return (
                      <tr
                        key={item.entryId}
                        onClick={() => setSelectedEntryId(item.entryId)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          selected
                            ? "bg-[rgba(160,106,29,0.05)]"
                            : "hover:bg-[rgba(18,24,31,0.025)]",
                        )}
                      >
                        <td>
                          <StatusBadge
                            label={item.targetTypeLabel}
                            variant={
                              item.targetType === "LIVE_SESSION"
                                ? "info"
                                : item.targetType === "LEAD"
                                  ? "warning"
                                  : "neutral"
                            }
                          />
                        </td>
                        <td className="text-black/82">
                          <div className="space-y-1">
                            <div className="font-medium">{item.name}</div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedEntryId(item.entryId);
                              }}
                              className="text-xs font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-strong)]"
                            >
                              查看详情
                            </button>
                          </div>
                        </td>
                        <td className="text-black/56">{item.secondaryLabel}</td>
                        {showLeadColumns ? (
                          <td className="text-black/62">{item.statusLabel ?? "--"}</td>
                        ) : null}
                        {showLeadColumns ? (
                          <td className="text-black/62">{item.ownerLabel ?? "--"}</td>
                        ) : null}
                        <td>{item.deleteReasonLabel}</td>
                        <td className="whitespace-nowrap">{item.deletedAtLabel}</td>
                        <td>{item.deletedByLabel}</td>
                        <td className="min-w-[18rem]">
                          <div className="space-y-2">
                            <p className="text-sm leading-6 text-black/62">{item.blockerSummary}</p>
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge
                                label={item.canRestore ? "可恢复" : "恢复受阻"}
                                variant={item.canRestore ? "success" : "warning"}
                              />
                              <StatusBadge
                                label={
                                  item.canPurge
                                    ? "可永久删除"
                                    : item.purgeRequiresAdmin
                                      ? "仅管理员可清理"
                                      : "永久删除受阻"
                                }
                                variant={item.canPurge ? "danger" : "neutral"}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="align-top">
                          <div className="flex min-w-[12rem] flex-col items-start gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDialog("restore", item);
                              }}
                              disabled={!item.canRestore || pending}
                              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
                              title={item.canRestore ? "恢复对象" : item.restoreSummary}
                            >
                              恢复
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDialog("purge", item);
                              }}
                              disabled={!item.canPurge || pending}
                              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm text-[var(--color-danger)] hover:border-[rgba(141,59,51,0.16)] hover:bg-[rgba(255,247,246,0.88)] disabled:cursor-not-allowed disabled:text-black/42 disabled:opacity-55"
                              title={
                                item.canPurge
                                  ? "永久删除对象"
                                  : item.purgeRequiresAdmin
                                    ? "永久删除仅管理员可执行"
                                    : item.purgeSummary
                              }
                            >
                              永久删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 md:p-5">
              <EmptyState
                title={`暂无${getTabLabel(activeTab)}回收站条目`}
                description="当前范围内没有 ACTIVE 回收站对象，后续移入回收站的对象会在这里统一治理。"
              />
            </div>
          )}
        </DataTableWrapper>

        <SectionCard
          title="Blocker 详情"
          description="右侧只展示当前选中对象的恢复与最终清理判断，不在这里扩复杂治理流程。"
          className="xl:sticky xl:top-[var(--crm-sticky-top)] xl:self-start"
        >
          {selectedItem ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  对象摘要
                </p>
                <div className="space-y-2">
                  <DetailRow label="对象类型" value={selectedItem.targetTypeLabel} />
                  <DetailRow label="名称" value={selectedItem.name} />
                  <DetailRow label="次标识" value={selectedItem.secondaryLabel} />
                  {selectedItem.statusLabel ? (
                    <DetailRow label="删除前状态" value={selectedItem.statusLabel} />
                  ) : null}
                  {selectedItem.ownerLabel ? (
                    <DetailRow label="删除前负责人" value={selectedItem.ownerLabel} />
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  删除原因
                </p>
                <div className="space-y-2">
                  <DetailRow label="原因类型" value={selectedItem.deleteReasonLabel} />
                  <DetailRow
                    label="补充说明"
                    value={selectedItem.deleteReasonText?.trim() || "未填写补充说明"}
                    multiline
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  删除信息
                </p>
                <div className="space-y-2">
                  <DetailRow label="删除时间" value={selectedItem.deletedAtLabel} />
                  <DetailRow label="删除人" value={selectedItem.deletedByLabel} />
                </div>
              </div>

              <GuardSection
                title="Restore blocker"
                emptyLabel="当前可恢复"
                summary={selectedItem.restoreSummary}
                groups={selectedItem.restoreBlockerGroups}
              />

              <GuardSection
                title="Purge blocker"
                emptyLabel={
                  selectedItem.canPurge
                    ? "当前可永久删除"
                    : selectedItem.purgeRequiresAdmin
                      ? "当前无结构性阻断，但仅管理员可永久删除"
                      : "当前可见 blocker 已清零"
                }
                summary={selectedItem.purgeSummary}
                groups={selectedItem.purgeBlockerGroups}
              />

              <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  恢复目标位置
                </p>
                <div className="rounded-[0.85rem] border border-black/7 bg-white/78 px-3 py-2 text-sm font-medium text-black/74">
                  {selectedItem.restoreRouteSnapshot}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="暂未选中回收站对象"
              description="从左侧表格选择一条对象后，这里会展示它的 blocker 与恢复目标位置。"
            />
          )}
        </SectionCard>
      </div>

      <RecycleBinConfirmDialog
        state={dialogState}
        pending={pending}
        onClose={closeDialog}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function RecycleBinConfirmDialog({
  state,
  pending,
  onClose,
  onConfirm,
}: Readonly<{
  state: RecycleBinDialogState;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}>) {
  if (!state) {
    return null;
  }

  const meta = getDialogMeta(state.mode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/34 px-4 py-8">
      <div className="w-full max-w-xl overflow-hidden rounded-[1.05rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={meta.badgeLabel} variant={meta.badgeVariant} />
              <StatusBadge label={state.item.targetTypeLabel} variant="neutral" />
            </div>
            <div>
              <h3 className="text-[1.02rem] font-semibold text-black/86">{meta.title}</h3>
              <p className="mt-1 text-sm leading-6 text-black/58">{meta.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="crm-button crm-button-ghost min-h-0 px-2.5 py-2 text-sm"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.78)] p-4 sm:grid-cols-2">
            <SummaryRow label="对象名称" value={state.item.name} />
            <SummaryRow label="对象类型" value={state.item.targetTypeLabel} />
            <SummaryRow label="次标识" value={state.item.secondaryLabel} />
            {state.item.statusLabel ? (
              <SummaryRow label="删除前状态" value={state.item.statusLabel} />
            ) : null}
            {state.item.ownerLabel ? (
              <SummaryRow label="删除前负责人" value={state.item.ownerLabel} />
            ) : null}
            <SummaryRow label="删除原因" value={state.item.deleteReasonLabel} />
            <SummaryRow label="删除时间" value={state.item.deletedAtLabel} />
            <SummaryRow label="删除人" value={state.item.deletedByLabel} />
          </div>

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.74)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
              当前判断
            </p>
            <p className="text-[13px] leading-5 text-black/58">
              {state.mode === "restore" ? state.item.restoreSummary : state.item.purgeSummary}
            </p>
          </div>

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.74)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
              {meta.impactLabel}
            </p>
            <p className="text-[13px] leading-5 text-black/58">
              {state.mode === "restore" ? state.item.restoreRouteSnapshot : meta.impactHint}
            </p>
            {state.mode === "restore" ? (
              <p className="text-[12px] leading-5 text-black/46">{meta.impactHint}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] leading-5 text-black/56">
            {state.mode === "restore"
              ? "恢复成功后，对象会按原业务入口重新可见。"
              : "永久删除成功后，该对象会从系统中彻底移除。"}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "处理中..." : meta.primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-black/42">{label}</p>
      <p className="text-sm font-medium leading-5 text-black/78">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  multiline = false,
}: Readonly<{
  label: string;
  value: string;
  multiline?: boolean;
}>) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-black/42">{label}</p>
      <p
        className={cn(
          "text-sm font-medium text-black/78",
          multiline ? "leading-6" : "leading-5",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function GuardSection({
  title,
  summary,
  groups,
  emptyLabel,
}: Readonly<{
  title: string;
  summary: string;
  groups: RecycleBinBlockerGroup[];
  emptyLabel: string;
}>) {
  const blockerCount = groups.reduce((count, group) => count + group.items.length, 0);

  return (
    <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
          {title}
        </p>
        <StatusBadge
          label={blockerCount > 0 ? `${blockerCount} 个阻断项` : emptyLabel}
          variant={blockerCount > 0 ? "warning" : "success"}
        />
      </div>
      <p className="text-[13px] leading-5 text-black/58">{summary}</p>
      {groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((group) => (
            <div
              key={`${title}-${group.title}`}
              className="space-y-2 rounded-[0.85rem] border border-black/7 bg-white/78 px-3 py-2.5"
            >
              <div className="space-y-1">
                <p className="text-[13px] font-medium leading-5 text-black/78">{group.title}</p>
                <p className="text-[12.5px] leading-5 text-black/56">{group.description}</p>
              </div>
              <div className="space-y-2">
                {group.items.map((blocker) => (
                  <div
                    key={`${title}-${group.title}-${blocker.name}`}
                    className="rounded-[0.75rem] border border-black/6 bg-[rgba(249,250,252,0.82)] px-3 py-2"
                  >
                    <p className="text-[12.5px] font-medium leading-5 text-black/76">
                      {blocker.name}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-black/56">
                      {blocker.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
