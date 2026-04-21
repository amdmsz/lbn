"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finalizeRecycleBinEntryAction,
  purgeRecycleBinEntryAction,
  restoreRecycleBinEntryAction,
  type RecycleBinActionResult,
} from "@/app/(dashboard)/recycle-bin/actions";
import { RecycleBinHistorySummary } from "@/components/recycle-bin/recycle-bin-history-summary";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/shared/status-badge";
import type {
  RecycleBinBlockerGroup,
  RecycleBinEntryStatusValue,
  RecycleBinListItem,
  RecycleBinTabValue,
} from "@/lib/recycle-bin/queries";
import { cn } from "@/lib/utils";

type RecycleBinDialogState =
  | {
      mode: "restore" | "purge" | "finalize";
      item: RecycleBinListItem;
    }
  | null;

type RecycleBinDialogMeta = {
  title: string;
  badgeLabel: string;
  badgeVariant: StatusBadgeVariant;
  description: string;
  primaryLabel: string;
  impactLabel: string;
  impactHint: string;
};

function getTabLabel(activeTab: RecycleBinTabValue) {
  switch (activeTab) {
    case "master-data":
      return "商品主数据";
    case "live-sessions":
      return "直播场次";
    case "leads":
      return "线索";
    case "customers":
      return "客户";
    case "trade-orders":
      return "交易订单";
    default:
      return "回收站";
  }
}

function getTargetVariant(item: RecycleBinListItem) {
  if (item.targetType === "LIVE_SESSION") {
    return "info" as const;
  }

  if (item.targetType === "LEAD") {
    return "warning" as const;
  }

  if (item.targetType === "CUSTOMER") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function getDialogMeta(state: RecycleBinDialogState): RecycleBinDialogMeta | null {
  if (!state) {
    return null;
  }

  if (state.mode === "restore") {
    return {
      title: "恢复对象",
      badgeLabel: "恢复操作",
      badgeVariant: "success" as const,
      description:
        "恢复后，对象会按现有查询规则重新回到原业务工作区，不会重写对象原有业务字段。",
      primaryLabel: "确认恢复",
      impactLabel: "恢复目标位置",
      impactHint:
        "恢复不会改写对象原有生命周期字段，只会让回收站条目退出 ACTIVE 状态。",
    };
  }

  if (state.mode === "finalize") {
    const finalAction = state.item.finalActionPreview?.finalAction ?? "PURGE";

    return {
      title: "执行最终处理",
      badgeLabel: finalAction === "PURGE" ? "最终处理 / PURGE" : "最终处理 / ARCHIVE",
      badgeVariant: finalAction === "PURGE" ? "danger" : "info" as const,
      description:
        finalAction === "PURGE"
          ? "冷静期已结束，将按最新服务端真相执行 PURGE。"
          : "冷静期已结束，将按最新服务端真相执行 ARCHIVE。",
      primaryLabel: finalAction === "PURGE" ? "确认 PURGE" : "确认 ARCHIVE",
      impactLabel: "Finalize preview",
      impactHint:
        finalAction === "PURGE"
          ? "最终处理会物理删除对象，且不会再保留该对象本体。"
          : "最终处理会将对象按 ARCHIVE 终态封存/脱敏归档，不会伪装成 PURGED。",
    };
  }

  return {
    title:
      state.item.finalActionPreview !== null ? "提前永久删除" : "永久删除对象",
    badgeLabel: state.item.finalActionPreview !== null ? "提前永久删除" : "最终处理",
    badgeVariant: "danger" as const,
    description:
      state.item.finalActionPreview !== null
        ? "这会绕过 3 天冷静期，立即执行永久删除。仅 light 对象开放，且仅管理员可执行。"
        : "永久删除后会物理移除源对象，且无法恢复。",
    primaryLabel: state.item.finalActionPreview !== null ? "确认提前永久删除" : "确认永久删除",
    impactLabel: "最终处理说明",
    impactHint:
      state.item.finalActionPreview !== null
        ? "提前永久删除前，服务端仍会按最新真相重算，不能只依赖移入回收站时的快照。"
        : "永久删除前会再次实时重算清理阻断项，不能只依赖删除时的快照。",
  };
}

function getFinalizeActionBadges(item: RecycleBinListItem) {
  if (!item.finalActionPreview) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge
        label={item.finalActionPreview.finalAction}
        variant={item.finalActionPreview.finalAction === "PURGE" ? "warning" : "info"}
      />
      {item.finalActionLabel ? (
        <StatusBadge label={item.finalActionLabel} variant="neutral" />
      ) : null}
      {item.remainingTimeLabel ? (
        <StatusBadge
          label={item.remainingTimeLabel}
          variant={item.isExpired ? "danger" : "neutral"}
        />
      ) : null}
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
                <p className="text-[13px] font-medium leading-5 text-black/78">
                  {group.title}
                </p>
                <p className="text-[12.5px] leading-5 text-black/56">
                  {group.description}
                </p>
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
                    {blocker.suggestedAction ? (
                      <p className="mt-1 text-[12px] leading-5 text-black/48">
                        建议动作：{blocker.suggestedAction}
                      </p>
                    ) : null}
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

function renderFinalizeActionButtons({
  item,
  pending,
  onOpenDialog,
}: {
  item: RecycleBinListItem;
  pending: boolean;
  onOpenDialog: (mode: "restore" | "purge" | "finalize", item: RecycleBinListItem) => void;
}) {
  return (
    <div className="flex min-w-[12rem] flex-col items-start gap-2">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDialog("restore", item);
        }}
        disabled={!item.canRestore || pending}
        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
        title={item.canRestore ? "恢复对象" : item.restoreSummary}
      >
        恢复
      </button>

      {item.isExpired ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDialog("finalize", item);
          }}
          disabled={!item.canFinalizeNow || pending}
          className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
          title={
            item.canFinalizeNow
              ? "执行最终处理"
              : `最终处理仅管理员可执行：${item.finalActionPreview?.finalAction ?? "PURGE"}`
          }
        >
          执行最终处理
        </button>
      ) : item.canPurge ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDialog("purge", item);
          }}
          disabled={pending}
          className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm text-[var(--color-danger)] hover:border-[rgba(141,59,51,0.16)] hover:bg-[rgba(255,247,246,0.88)] disabled:cursor-not-allowed disabled:text-black/42 disabled:opacity-55"
          title="提前永久删除"
        >
          提前永久删除
        </button>
      ) : item.finalActionPreview?.finalAction === "ARCHIVE" ? (
        <p className="text-xs leading-5 text-black/48">3 天后仅封存</p>
      ) : item.purgeRequiresAdmin ? (
        <p className="text-xs leading-5 text-black/48">仅管理员可提前永久删除</p>
      ) : null}
    </div>
  );
}

function renderDefaultActionButtons({
  item,
  pending,
  onOpenDialog,
}: {
  item: RecycleBinListItem;
  pending: boolean;
  onOpenDialog: (mode: "restore" | "purge" | "finalize", item: RecycleBinListItem) => void;
}) {
  return (
    <div className="flex min-w-[12rem] flex-col items-start gap-2">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDialog("restore", item);
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
          onOpenDialog("purge", item);
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
  );
}

function getHistoryResultBadge(item: RecycleBinListItem) {
  if (item.entryStatusLabel === "ARCHIVED") {
    return {
      label: item.resolutionActionLabel ?? "ARCHIVE",
      variant: "info" as const,
    };
  }

  if (item.entryStatusLabel === "PURGED") {
    return {
      label: item.resolutionActionLabel ?? "PURGE",
      variant: "warning" as const,
    };
  }

  return {
    label: item.resolutionActionLabel ?? "RESTORE",
    variant: "success" as const,
  };
}

function getHistoryArchiveSourceBadge(item: RecycleBinListItem) {
  const source = item.historyArchive?.source ?? "UNAVAILABLE";

  if (source === "SNAPSHOT_V2") {
    return {
      label: source,
      variant: "info" as const,
    };
  }

  if (source === "LEGACY_FALLBACK") {
    return {
      label: source,
      variant: "warning" as const,
    };
  }

  return {
    label: source,
    variant: "neutral" as const,
  };
}

function getHistorySnapshotVersionLabel(item: RecycleBinListItem) {
  return item.historyArchive?.snapshotVersion !== null &&
    item.historyArchive?.snapshotVersion !== undefined
    ? String(item.historyArchive.snapshotVersion)
    : "--";
}

function getHistoryAuditNote(item: RecycleBinListItem) {
  if (item.historyArchive?.source === "LEGACY_FALLBACK") {
    return "当前条目属于 legacy archive snapshot，仅保证基础审计字段稳定可读，不伪装成完整结构化检索结果。";
  }

  if (item.historyArchive?.source === "UNAVAILABLE" || !item.historyArchive) {
    return "当前条目没有可解析的结构化 archive payload，仅保留删除、处理人与最终结果等基础审计信息。";
  }

  return "当前条目已接入结构化 archive contract，可稳定读取 finalAction、archive source 与 snapshotVersion。";
}

export function RecycleBinWorkbench({
  activeTab,
  entryStatus,
  items,
}: Readonly<{
  activeTab: RecycleBinTabValue;
  entryStatus: RecycleBinEntryStatusValue;
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
  const isHistoryView = entryStatus !== "active";
  const isFinalizeTab =
    !isHistoryView && (activeTab === "customers" || activeTab === "trade-orders");
  const showStatusColumns =
    !isHistoryView &&
    (activeTab === "leads" || activeTab === "trade-orders" || activeTab === "customers");

  function closeDialog() {
    setDialogState(null);
  }

  function openDialog(mode: "restore" | "purge" | "finalize", item: RecycleBinListItem) {
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
          : dialogState.mode === "finalize"
            ? await finalizeRecycleBinEntryAction(formData)
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
          description={
            isHistoryView
              ? `${getTabLabel(activeTab)} tab 已切到 ${entryStatus.toUpperCase()} 历史视角：左侧只读展示删除与解决结果，右侧展示对象摘要、归档载荷与最终说明。`
              : isFinalizeTab
              ? `${getTabLabel(activeTab)} tab 已切到 finalize 视角：左侧保留恢复，提前永久删除只对 light + ADMIN 开放，到期后统一执行最终处理。`
              : "当前保留恢复、清理动作和 blocker 摘要；点击行即可在右侧查看更完整的治理详情。"
          }
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
                    {showStatusColumns ? <th>删除前状态</th> : null}
                    {showStatusColumns ? <th>删除前负责人</th> : null}
                    <th>删除原因</th>
                    <th>删除时间</th>
                    {isHistoryView ? <th>处理时间</th> : <th>删除人</th>}
                    <th>{isHistoryView ? "最终结果" : isFinalizeTab ? "Finalize 预览" : "blocker 摘要"}</th>
                    <th>{isHistoryView ? "处理人" : "操作"}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const selected = item.entryId === selectedItem?.entryId;
                    const historyBadge = getHistoryResultBadge(item);

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
                            variant={getTargetVariant(item)}
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
                        {showStatusColumns ? (
                          <td className="text-black/62">{item.statusLabel ?? "--"}</td>
                        ) : null}
                        {showStatusColumns ? (
                          <td className="text-black/62">{item.ownerLabel ?? "--"}</td>
                        ) : null}
                        <td>{item.deleteReasonLabel}</td>
                        <td className="whitespace-nowrap">{item.deletedAtLabel}</td>
                        <td className="whitespace-nowrap">
                          {isHistoryView ? item.resolvedAtLabel ?? "--" : item.deletedByLabel}
                        </td>
                        <td className="min-w-[18rem]">
                          <div className="space-y-2">
                            <p className="text-sm leading-6 text-black/62">
                              {isHistoryView
                                ? item.resolutionSummary ?? "当前为历史终态只读记录。"
                                : isFinalizeTab && item.finalActionPreview
                                ? item.finalizeSummary ?? item.finalActionPreview.blockerSummary
                                : item.blockerSummary}
                            </p>
                            {isHistoryView ? (
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge
                                  label={historyBadge.label}
                                  variant={historyBadge.variant}
                                />
                                <StatusBadge
                                  label={item.entryStatusLabel}
                                  variant="neutral"
                                />
                              </div>
                            ) : isFinalizeTab && item.finalActionPreview ? (
                              <>
                                {getFinalizeActionBadges(item)}
                                <p className="text-xs leading-5 text-black/48">
                                  {item.remainingTimeLabel
                                    ? `剩余时间：${item.remainingTimeLabel}`
                                    : "剩余时间：待重算"}
                                </p>
                              </>
                            ) : (
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
                                        ? "仅管理员可删除"
                                        : "清理受阻"
                                  }
                                  variant={item.canPurge ? "danger" : "neutral"}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="align-top">
                          {isHistoryView ? (
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-black/72">
                                {item.resolvedByLabel ?? "--"}
                              </div>
                              <p className="text-xs leading-5 text-black/48">只读历史</p>
                            </div>
                          ) : isFinalizeTab
                            ? renderFinalizeActionButtons({
                                item,
                                pending,
                                onOpenDialog: openDialog,
                              })
                            : renderDefaultActionButtons({
                                item,
                                pending,
                                onOpenDialog: openDialog,
                              })}
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
                description={
                  isHistoryView
                    ? `当前范围内没有 ${entryStatus.toUpperCase()} ${getTabLabel(activeTab)}历史条目。后续处理完成的对象会在这里沉淀只读审计记录。`
                    : isFinalizeTab
                    ? `当前范围内没有 ACTIVE ${getTabLabel(activeTab)}回收站对象。后续移入回收站的对象会在这里按 finalize 视角统一治理。`
                    : "当前范围内没有 ACTIVE 回收站对象，后续移入回收站的对象会在这里统一治理。"
                }
              />
            </div>
          )}
        </DataTableWrapper>

        <SectionCard
          title={isHistoryView ? "历史详情" : isFinalizeTab ? "Finalize Preview" : "治理详情"}
          description={
            isHistoryView
              ? "右侧只展示当前选中对象的删除信息、解决结果、finalAction 与 archivePayloadJson，不提供历史操作按钮。"
              : isFinalizeTab
              ? "右侧只展示当前选中对象的 restore 与 finalize preview，不在这里扩复杂治理树。"
              : "右侧只展示当前选中对象的恢复与清理判断，不在这里扩复杂治理流程。"
          }
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

              {selectedItem.customerSummary && !isHistoryView ? (
                <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    客户补充信息
                  </p>
                  <div className="space-y-2">
                    <DetailRow label="手机号" value={selectedItem.customerSummary.phone} />
                    <DetailRow
                      label="客户等级"
                      value={selectedItem.customerSummary.levelLabel}
                    />
                    <DetailRow
                      label="归属模式"
                      value={selectedItem.customerSummary.ownershipLabel}
                    />
                    <DetailRow
                      label="最近有效跟进"
                      value={selectedItem.customerSummary.lastEffectiveFollowUpAtLabel ?? "暂无"}
                    />
                    <DetailRow
                      label="已审核成交主单"
                      value={`${selectedItem.customerSummary.approvedTradeOrderCount} 笔`}
                    />
                    <DetailRow
                      label="关联线索"
                      value={`${selectedItem.customerSummary.linkedLeadCount} 条`}
                    />
                  </div>
                </div>
              ) : null}

              {isHistoryView ? <RecycleBinHistorySummary item={selectedItem} /> : null}

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

              {isHistoryView ? (
                <>
                  <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        最终结果
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge
                          label={selectedItem.resolutionActionLabel ?? selectedItem.entryStatusLabel}
                          variant={getHistoryResultBadge(selectedItem).variant}
                        />
                        <StatusBadge
                          label={selectedItem.entryStatusLabel}
                          variant="neutral"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <DetailRow
                        label="处理时间"
                        value={selectedItem.resolvedAtLabel ?? "--"}
                      />
                      <DetailRow
                        label="处理人"
                        value={selectedItem.resolvedByLabel ?? "--"}
                      />
                      <DetailRow
                        label="finalAction"
                        value={selectedItem.resolutionActionLabel ?? "--"}
                      />
                      <DetailRow
                        label="最终说明"
                        value={selectedItem.resolutionSummary ?? "当前为历史终态只读记录。"}
                        multiline
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        审计信息
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge
                          label={getHistoryArchiveSourceBadge(selectedItem).label}
                          variant={getHistoryArchiveSourceBadge(selectedItem).variant}
                        />
                        <StatusBadge
                          label={`snapshotVersion ${getHistorySnapshotVersionLabel(selectedItem)}`}
                          variant="neutral"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <DetailRow label="deletedAt" value={selectedItem.deletedAtLabel} />
                      <DetailRow label="deletedBy" value={selectedItem.deletedByLabel} />
                      <DetailRow
                        label="resolvedAt"
                        value={selectedItem.resolvedAtLabel ?? "--"}
                      />
                      <DetailRow
                        label="resolvedBy"
                        value={selectedItem.resolvedByLabel ?? "--"}
                      />
                      <DetailRow
                        label="finalAction"
                        value={selectedItem.resolutionActionLabel ?? "--"}
                      />
                      <DetailRow
                        label="historyArchive.source"
                        value={selectedItem.historyArchive?.source ?? "UNAVAILABLE"}
                      />
                      <DetailRow
                        label="archivePayload snapshotVersion"
                        value={getHistorySnapshotVersionLabel(selectedItem)}
                      />
                      <DetailRow
                        label="审计说明"
                        value={getHistoryAuditNote(selectedItem)}
                        multiline
                      />
                    </div>
                  </div>

                  {selectedItem.archivePayloadJsonText &&
                  selectedItem.targetType !== "CUSTOMER" &&
                  selectedItem.targetType !== "TRADE_ORDER" ? (
                    <details className="rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                      <summary className="cursor-pointer list-none text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        Archive Payload
                      </summary>
                      <pre className="mt-3 overflow-x-auto rounded-[0.85rem] border border-black/7 bg-white/80 p-3 text-xs leading-6 text-black/68">
                        {selectedItem.archivePayloadJsonText}
                      </pre>
                    </details>
                  ) : null}
                </>
              ) : (
                <>
                  <GuardSection
                    title="Restore blocker"
                    emptyLabel="当前可恢复"
                    summary={selectedItem.restoreSummary}
                    groups={selectedItem.restoreBlockerGroups}
                  />

                  {isFinalizeTab && selectedItem.finalActionPreview ? (
                <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                      Finalize preview
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        label={selectedItem.finalActionPreview.finalAction}
                        variant={
                          selectedItem.finalActionPreview.finalAction === "PURGE"
                            ? "warning"
                            : "info"
                        }
                      />
                      {selectedItem.finalActionLabel ? (
                        <StatusBadge
                          label={selectedItem.finalActionLabel}
                          variant="neutral"
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <DetailRow
                      label="剩余时间"
                      value={selectedItem.remainingTimeLabel ?? "待重算"}
                    />
                    <DetailRow
                      label="当前判断"
                      value={
                        selectedItem.finalizeSummary ??
                        selectedItem.finalActionPreview.blockerSummary
                      }
                      multiline
                    />
                    <DetailRow
                      label="提前永久删除"
                      value={
                        selectedItem.finalActionPreview.canEarlyPurge
                          ? "仅 ADMIN 可在冷静期内提前永久删除"
                          : "当前不开放提前永久删除"
                      }
                      multiline
                    />
                  </div>

                  <GuardSection
                    title="Finalize blocker"
                    emptyLabel={
                      selectedItem.finalActionPreview.finalAction === "PURGE"
                        ? "当前终态为 PURGE"
                        : "当前终态为 ARCHIVE"
                    }
                    summary={
                      selectedItem.finalizeSummary ??
                      selectedItem.finalActionPreview.blockerSummary
                    }
                    groups={selectedItem.finalizeBlockerGroups}
                  />
                </div>
                  ) : (
                    <GuardSection
                      title="清理判断"
                      emptyLabel={
                        selectedItem.canPurge
                          ? "当前可执行永久删除"
                          : selectedItem.purgeRequiresAdmin
                            ? "当前无结构性阻断，但仅管理员可永久删除"
                            : "当前清理阻断项已清零"
                      }
                      summary={selectedItem.purgeSummary}
                      groups={selectedItem.purgeBlockerGroups}
                    />
                  )}
                </>
              )}

              <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  {isHistoryView ? "对象入口快照" : "恢复目标位置"}
                </p>
                <div className="rounded-[0.85rem] border border-black/7 bg-white/78 px-3 py-2 text-sm font-medium text-black/74">
                  {selectedItem.restoreRouteSnapshot}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="暂未选中回收站对象"
              description={
                isHistoryView
                  ? "从左侧表格选择一条对象后，这里会展示它的删除信息、解决结果与 archive payload。"
                  : "从左侧表格选择一条对象后，这里会展示它的 blocker、恢复位置与最终处理判断。"
              }
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
  const meta = getDialogMeta(state);

  if (!state || !meta) {
    return null;
  }

  const currentSummary =
    state.mode === "restore"
      ? state.item.restoreSummary
      : state.mode === "finalize"
        ? state.item.finalizeSummary ??
          state.item.finalActionPreview?.blockerSummary ??
          "当前未拿到最终处理预览。"
        : state.item.purgeSummary;

  const impactContent =
    state.mode === "restore"
      ? state.item.restoreRouteSnapshot
      : state.mode === "finalize"
        ? `${state.item.remainingTimeLabel ?? "冷静期已到期"} / ${
            state.item.finalActionPreview?.finalAction ?? "PURGE"
          }`
        : meta.impactHint;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/34 px-4 py-8">
      <div className="w-full max-w-xl overflow-hidden rounded-[1.05rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={meta.badgeLabel} variant={meta.badgeVariant} />
              <StatusBadge label={state.item.targetTypeLabel} variant="neutral" />
              {state.mode === "finalize" && state.item.finalActionPreview ? (
                <StatusBadge
                  label={state.item.finalActionPreview.finalAction}
                  variant={
                    state.item.finalActionPreview.finalAction === "PURGE"
                      ? "warning"
                      : "info"
                  }
                />
              ) : null}
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
            <p className="text-[13px] leading-5 text-black/58">{currentSummary}</p>
          </div>

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.74)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
              {meta.impactLabel}
            </p>
            <p className="text-[13px] leading-5 text-black/58">{impactContent}</p>
            <p className="text-[12px] leading-5 text-black/46">{meta.impactHint}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] leading-5 text-black/56">
            {state.mode === "restore"
              ? "恢复成功后，对象会按原业务入口重新可见。"
              : state.mode === "finalize"
                ? "最终处理成功后会按 PURGE 或 ARCHIVE 收口；ARCHIVE 不会伪装成 PURGED。"
                : state.item.finalActionPreview
                  ? "提前永久删除会绕过 3 天冷静期，立即执行物理删除。"
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
