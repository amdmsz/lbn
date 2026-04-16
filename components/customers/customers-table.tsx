"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { batchAddCustomerTagAction } from "@/app/(dashboard)/customers/actions";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import {
  CustomerMobileDialButton,
  MobileCallFollowUpSheet,
} from "@/components/customers/mobile-call-followup-sheet";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityTable } from "@/components/shared/entity-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CallResultOption } from "@/lib/calls/metadata";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import {
  formatDateTime,
  formatRelativeDateTime,
  formatRegion,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
  getCustomerWorkStatusVariant,
  type CustomerWorkStatusKey,
} from "@/lib/customers/metadata";
import type {
  CustomerCenterFilters,
  CustomerListItem,
} from "@/lib/customers/queries";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { cn } from "@/lib/utils";

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type CustomerViewMode = "cards" | "table";

type BatchTagOption = {
  id: string;
  name: string;
  label: string;
  count: number;
};

type BatchTagBlockedReason = {
  reason: string;
  count: number;
};

type BatchTagNoticeState = {
  status: "idle" | "success" | "error";
  message: string;
  summary?: {
    totalCount: number;
    successCount: number;
    alreadyTaggedCount: number;
    blockedCount: number;
  };
  blockedReasons?: BatchTagBlockedReason[];
};

type PageSelectionState = {
  pageKey: string;
  ids: string[];
};

const customerViewStorageKey = "customer-center-view-mode";
const initialBatchTagNoticeState: BatchTagNoticeState = {
  status: "idle",
  message: "",
};

function buildCustomerTradeOrderHref(customerId: string) {
  return `/customers/${customerId}?tab=orders&createTradeOrder=1`;
}

function getCustomerAddress(item: CustomerListItem) {
  const region = formatRegion(item.province, item.city, item.district);
  const detail = item.address?.trim();

  if (detail) {
    return region !== "未填写" ? `${region} / ${detail}` : detail;
  }

  return region;
}

function getPrimaryWorkStatus(item: CustomerListItem): CustomerWorkStatusKey | null {
  return item.workingStatuses[0] ?? null;
}

function getOwnerLabel(item: CustomerListItem) {
  return item.owner ? `${item.owner.name} (@${item.owner.username})` : "未分配负责人";
}

function getPrimarySignal(item: CustomerListItem) {
  return item.latestPurchasedProduct ?? item.latestInterestedProduct ?? "暂无商品信号";
}

function getNextAction(item: CustomerListItem) {
  const primaryStatus = getPrimaryWorkStatus(item);

  switch (primaryStatus) {
    case "pending_first_call":
      return {
        label: "优先完成首呼",
        note: "还没有形成首条通话记录。",
      };
    case "pending_follow_up":
      return {
        label: "回访已到期",
        note: "建议尽快补一条新的有效跟进。",
      };
    case "pending_wechat":
      return {
        label: "补充微信承接",
        note: "客户已进入私域承接阶段。",
      };
    case "pending_invitation":
      return {
        label: "推进邀约",
        note: "已建立联系，下一步适合转入直播或活动触达。",
      };
    case "pending_deal":
      return {
        label: "推进成交",
        note: "当前更适合回到成交主单或支付推进动作。",
      };
    case "migration_pending_follow_up":
      return {
        label: "完成迁移接续",
        note: "导入后尚未形成新的有效跟进。",
      };
    default:
      if (item.latestTradeAt) {
        return {
          label: "维护复购节奏",
          note: `最近成交 ${formatRelativeDateTime(item.latestTradeAt)}`,
        };
      }

      return {
        label: "查看详情并继续经营",
        note: "先进入客户详情，再决定跟进或成交动作。",
      };
  }
}

function buildBatchTagSummaryText(
  summary: NonNullable<BatchTagNoticeState["summary"]>,
) {
  return `成功添加 ${summary.successCount} 位，已有标签 ${summary.alreadyTaggedCount} 位，被阻断 ${summary.blockedCount} 位。`;
}

function buildBatchTagBlockedReasonText(blockedReasons: BatchTagBlockedReason[]) {
  return blockedReasons.map((item) => `${item.reason} ${item.count} 位`).join("；");
}

function CustomerViewToggle({
  value,
  onChange,
}: Readonly<{
  value: CustomerViewMode;
  onChange: (nextValue: CustomerViewMode) => void;
}>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-black/8 bg-[rgba(247,248,250,0.86)] p-1">
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-medium transition-colors",
          value === "table"
            ? "bg-white text-black/84 shadow-[0_6px_14px_rgba(15,23,42,0.08)]"
            : "text-black/52 hover:text-black/78",
        )}
      >
        <Rows3 className="h-3.5 w-3.5" />
        <span>表格</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-medium transition-colors",
          value === "cards"
            ? "bg-white text-black/84 shadow-[0_6px_14px_rgba(15,23,42,0.08)]"
            : "text-black/52 hover:text-black/78",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>卡片</span>
      </button>
    </div>
  );
}

function BatchTagDialog({
  open,
  selectedCount,
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
        <div className="border-b border-black/6 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-black/84">批量添加标签</h3>
              <p className="text-sm leading-6 text-black/58">
                本次对已选 {selectedCount} 位客户批量添加一个标签。已有标签不会覆盖，只会记为“已有标签”。
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
          {selectedCustomerIds.map((customerId) => (
            <input key={customerId} type="hidden" name="customerIds" value={customerId} />
          ))}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-black/78">选择标签</span>
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

          <div className="rounded-[0.9rem] border border-black/7 bg-[rgba(247,248,250,0.76)] px-4 py-3 text-[13px] leading-6 text-black/56">
            这轮只支持当前页手选，不做标签移除，也不会覆盖已有标签。
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

export function CustomersTable({
  items,
  pagination,
  callResultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  canBatchAddTags = false,
  batchTagOptions = [],
  emptyTitle,
  emptyDescription,
  filters,
  pageSizeControl,
  scrollTargetId,
}: Readonly<{
  items: CustomerListItem[];
  pagination: PaginationData;
  callResultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  canBatchAddTags?: boolean;
  batchTagOptions?: BatchTagOption[];
  emptyTitle: string;
  emptyDescription: string;
  filters: CustomerCenterFilters;
  pageSizeControl?: ReactNode;
  scrollTargetId?: string;
}>) {
  const [viewMode, setViewMode] = useState<CustomerViewMode>("table");
  const currentPageSelectionKey = `${pagination.page}:${items.map((item) => item.id).join(",")}`;
  const [pageSelection, setPageSelection] = useState<PageSelectionState>({
    pageKey: currentPageSelectionKey,
    ids: [],
  });
  const [batchTagDialogOpen, setBatchTagDialogOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [batchTagNotice, setBatchTagNotice] = useState<BatchTagNoticeState>(
    initialBatchTagNoticeState,
  );
  const [batchTagPending, startBatchTagTransition] = useTransition();
  const router = useRouter();

  const selectedIds =
    pageSelection.pageKey === currentPageSelectionKey ? pageSelection.ids : [];
  const selectedCount = selectedIds.length;
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  useEffect(() => {
    const stored = window.localStorage.getItem(customerViewStorageKey);

    if (stored !== "cards" && stored !== "table") {
      return;
    }

    const timer = window.setTimeout(() => {
      setViewMode(stored);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  function handleChangeView(nextValue: CustomerViewMode) {
    setViewMode(nextValue);
    window.localStorage.setItem(customerViewStorageKey, nextValue);
  }

  function toggleSelected(customerId: string) {
    setPageSelection({
      pageKey: currentPageSelectionKey,
      ids: selectedIds.includes(customerId)
        ? selectedIds.filter((id) => id !== customerId)
        : [...selectedIds, customerId],
    });
  }

  function toggleSelectAllCurrentPage() {
    setPageSelection({
      pageKey: currentPageSelectionKey,
      ids: selectedIds.length === items.length ? [] : items.map((item) => item.id),
    });
  }

  function openBatchTagDialog() {
    setBatchTagNotice(initialBatchTagNoticeState);
    setSelectedTagId("");
    setBatchTagDialogOpen(true);
  }

  function closeBatchTagDialog() {
    setBatchTagDialogOpen(false);
    setSelectedTagId("");
  }

  function handleBatchTagSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startBatchTagTransition(async () => {
      const nextState = await batchAddCustomerTagAction(formData);
      setBatchTagNotice(nextState);
      closeBatchTagDialog();

      if (nextState.summary && nextState.summary.successCount > 0) {
        setPageSelection({
          pageKey: currentPageSelectionKey,
          ids: [],
        });
        router.refresh();
      }
    });
  }

  const baseColumns = [
    {
      key: "customer",
      title: "客户",
      headerClassName: "w-[26%]",
      render: (row: CustomerListItem) => (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/customers/${row.id}`}
              className="text-sm font-semibold text-black/84 hover:text-black"
            >
              {row.name}
            </Link>
            {Number(row.lifetimeTradeAmount) > 0.009 ? (
              <span className="text-[12px] font-medium text-black/48">
                累计 {formatCurrency(row.lifetimeTradeAmount)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-5 text-black/52">
            <span>{row.phone}</span>
            <span className="max-w-[18rem] truncate" title={getCustomerAddress(row)}>
              {getCustomerAddress(row)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      title: "负责人 / 状态",
      headerClassName: "w-[22%]",
      render: (row: CustomerListItem) => (
        <div className="space-y-2">
          <div className="text-[13px] font-medium text-black/78">{getOwnerLabel(row)}</div>
          <div className="flex flex-wrap gap-1.5">
            {row.workingStatuses.length > 0 ? (
              row.workingStatuses.slice(0, 2).map((status) => (
                <StatusBadge
                  key={status}
                  label={getCustomerWorkStatusLabel(status)}
                  variant={getCustomerWorkStatusVariant(status)}
                />
              ))
            ) : (
              <StatusBadge label={getCustomerStatusLabel(row.status)} variant="neutral" />
            )}
          </div>
        </div>
      ),
    },
    {
      key: "signal",
      title: "最近信号",
      headerClassName: "w-[24%]",
      render: (row: CustomerListItem) => (
        <div className="space-y-1.5">
          <div
            className="max-w-[18rem] truncate text-[13px] font-medium text-black/78"
            title={getPrimarySignal(row)}
          >
            {getPrimarySignal(row)}
          </div>
          <div className="space-y-1 text-[12px] leading-5 text-black/48">
            <p title={row.latestFollowUpAt ? formatDateTime(row.latestFollowUpAt) : "暂无跟进记录"}>
              {row.latestFollowUpAt
                ? `最近跟进 ${formatRelativeDateTime(row.latestFollowUpAt)}`
                : "最近跟进 暂无"}
            </p>
            <p title={row.latestTradeAt ? formatDateTime(row.latestTradeAt) : "暂无成交记录"}>
              {row.latestTradeAt
                ? `最近成交 ${formatRelativeDateTime(row.latestTradeAt)}`
                : "最近成交 暂无"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "next_action",
      title: "下一步",
      headerClassName: "w-[18%]",
      render: (row: CustomerListItem) => {
        const nextAction = getNextAction(row);

        return (
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-black/82">{nextAction.label}</p>
            <p className="text-[12px] leading-5 text-black/48">{nextAction.note}</p>
          </div>
        );
      },
    },
    {
      key: "actions",
      title: "动作",
      headerClassName: "w-[10%]",
      render: (row: CustomerListItem) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/customers/${row.id}`}
            className="inline-flex h-8 items-center rounded-[10px] border border-black/8 bg-white px-3 text-[12px] font-medium text-black/72 transition hover:border-black/12 hover:text-black/84"
          >
            详情
          </Link>
          {canCreateCallRecord ? (
            <CustomerMobileDialButton
              customerId={row.id}
              customerName={row.name}
              phone={row.phone}
              triggerSource="table"
              className="inline-flex h-8 items-center rounded-[10px] border border-black/8 bg-white px-3 text-[12px] font-medium text-black/72 transition hover:border-black/12 hover:text-black/84"
            />
          ) : null}
          {canCreateSalesOrder ? (
            <Link
              href={buildCustomerTradeOrderHref(row.id)}
              className="inline-flex h-8 items-center rounded-[10px] border border-black/8 bg-[rgba(15,23,42,0.03)] px-3 text-[12px] font-medium text-black/78 transition hover:border-black/12 hover:bg-white hover:text-black/88"
            >
              成交主单
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  const columns = canBatchAddTags
    ? [
        {
          key: "selection",
          title: "选择",
          headerClassName: "w-[56px]",
          render: (row: CustomerListItem) => (
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedIds.includes(row.id)}
                onChange={() => toggleSelected(row.id)}
                aria-label={`选择客户 ${row.name}`}
                className="h-4 w-4 rounded border border-black/18 text-black focus:ring-black/15"
              />
            </div>
          ),
        },
        ...baseColumns,
      ]
    : baseColumns;

  return (
    <>
      <div id={scrollTargetId} className="space-y-4">
        <DataTableWrapper
          eyebrow="客户工作区"
          title="客户列表"
          description="把客户识别、负责人、最近信号和下一步动作压到同一层里，优先服务扫描与执行。"
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              {pageSizeControl ? <div className="shrink-0">{pageSizeControl}</div> : null}
              <CustomerViewToggle value={viewMode} onChange={handleChangeView} />
            </div>
          }
        >
          {items.length === 0 ? (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={
                <Link
                  href={buildCustomersHref(filters, { page: 1 })}
                  scroll={false}
                  className="crm-button crm-button-secondary"
                >
                  重置筛选
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {batchTagNotice.message ? (
                <ActionBanner tone={batchTagNotice.status === "success" ? "success" : "danger"}>
                  <div className="space-y-1.5">
                    <p>{batchTagNotice.message}</p>
                    {batchTagNotice.summary && batchTagNotice.summary.totalCount > 0 ? (
                      <p>{buildBatchTagSummaryText(batchTagNotice.summary)}</p>
                    ) : null}
                    {batchTagNotice.blockedReasons && batchTagNotice.blockedReasons.length > 0 ? (
                      <p>
                        阻断原因：{buildBatchTagBlockedReasonText(batchTagNotice.blockedReasons)}
                      </p>
                    ) : null}
                  </div>
                </ActionBanner>
              ) : null}

              {canBatchAddTags ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.95rem] border border-black/8 bg-[rgba(247,248,250,0.72)] px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-black/62">
                    <StatusBadge
                      label={`已选 ${selectedCount} 位`}
                      variant={selectedCount > 0 ? "info" : "neutral"}
                    />
                    <button
                      type="button"
                      onClick={toggleSelectAllCurrentPage}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                    >
                      {allSelected ? "取消当前页全选" : "全选当前页"}
                    </button>
                    {selectedCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPageSelection({
                            pageKey: currentPageSelectionKey,
                            ids: [],
                          })
                        }
                        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                      >
                        清空选择
                      </button>
                    ) : null}
                    {batchTagOptions.length === 0 ? (
                      <span className="text-[12px] text-black/45">暂无可用标签</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openBatchTagDialog}
                    disabled={selectedCount === 0 || batchTagOptions.length === 0}
                    className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                  >
                    批量添加标签
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={`当前页 ${items.length} 位`} variant="neutral" />
                  <StatusBadge label={`共 ${pagination.totalCount} 位客户`} variant="info" />
                </div>
                <p className="text-[12px] leading-5 text-black/48">
                  默认把客户工作台收回到更薄的列表扫描视角，卡片视图保留给需要更强上下文时使用。
                </p>
              </div>

              {viewMode === "cards" ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3 min-[1680px]:grid-cols-4">
                  {items.map((item) => (
                    <CustomerListCard
                      key={item.id}
                      item={item}
                      callResultOptions={callResultOptions}
                      canCreateCallRecord={canCreateCallRecord}
                      canCreateSalesOrder={canCreateSalesOrder}
                      selectable={canBatchAddTags}
                      selected={selectedIds.includes(item.id)}
                      onToggleSelected={() => toggleSelected(item.id)}
                    />
                  ))}
                </div>
              ) : (
                <EntityTable
                  density="compact"
                  rows={items}
                  getRowKey={(row) => row.id}
                  columns={columns}
                />
              )}
            </div>
          )}
        </DataTableWrapper>

        {canCreateCallRecord ? (
          <MobileCallFollowUpSheet
            scope={{
              kind: "list",
              customerIds: items.map((item) => item.id),
            }}
            resultOptions={callResultOptions}
          />
        ) : null}

        {items.length > 0 ? (
          <div className="[&>div]:rounded-[18px] [&>div]:border-black/7 [&>div]:bg-[rgba(255,255,255,0.78)] [&>div]:px-4 [&>div]:py-3 [&>div]:shadow-[0_6px_16px_rgba(15,23,42,0.03)] [&_.crm-toolbar-cluster]:gap-2 [&_a]:h-8 [&_a]:rounded-[10px] [&_a]:px-3 [&_a]:py-0 [&_a]:text-[13px] [&_a]:shadow-none [&_a]:hover:translate-y-0 [&_p]:text-[13px] [&_p]:leading-5">
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              summary={`当前第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.totalCount} 位客户`}
              buildHref={(page) => buildCustomersHref(filters, { page })}
              scrollTargetId={scrollTargetId}
            />
          </div>
        ) : null}
      </div>

      <BatchTagDialog
        open={batchTagDialogOpen}
        selectedCount={selectedCount}
        tagOptions={batchTagOptions}
        selectedTagId={selectedTagId}
        pending={batchTagPending}
        onClose={closeBatchTagDialog}
        onTagChange={setSelectedTagId}
        onSubmit={handleBatchTagSubmit}
        selectedCustomerIds={selectedIds}
      />
    </>
  );
}
