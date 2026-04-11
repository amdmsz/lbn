"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import {
  CustomerMobileDialButton,
  MobileCallFollowUpSheet,
} from "@/components/customers/mobile-call-followup-sheet";
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

const customerViewStorageKey = "customer-center-view-mode";

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
        note: "还没有形成首个通话记录。",
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

export function CustomersTable({
  items,
  pagination,
  callResultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
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
  emptyTitle: string;
  emptyDescription: string;
  filters: CustomerCenterFilters;
  pageSizeControl?: ReactNode;
  scrollTargetId?: string;
}>) {
  const [viewMode, setViewMode] = useState<CustomerViewMode>("table");

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

  return (
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={`当前页 ${items.length} 位`}
                  variant="neutral"
                />
                <StatusBadge
                  label={`共 ${pagination.totalCount} 位客户`}
                  variant="info"
                />
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
                  />
                ))}
              </div>
            ) : (
              <EntityTable
                density="compact"
                rows={items}
                getRowKey={(row) => row.id}
                columns={[
                  {
                    key: "customer",
                    title: "客户",
                    headerClassName: "w-[26%]",
                    render: (row) => (
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
                          <span
                            className="max-w-[18rem] truncate"
                            title={getCustomerAddress(row)}
                          >
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
                    render: (row) => (
                      <div className="space-y-2">
                        <div className="text-[13px] font-medium text-black/78">
                          {getOwnerLabel(row)}
                        </div>
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
                            <StatusBadge
                              label={getCustomerStatusLabel(row.status)}
                              variant="neutral"
                            />
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "signal",
                    title: "最近信号",
                    headerClassName: "w-[24%]",
                    render: (row) => (
                      <div className="space-y-1.5">
                        <div
                          className="max-w-[18rem] truncate text-[13px] font-medium text-black/78"
                          title={getPrimarySignal(row)}
                        >
                          {getPrimarySignal(row)}
                        </div>
                        <div className="space-y-1 text-[12px] leading-5 text-black/48">
                          <p
                            title={
                              row.latestFollowUpAt
                                ? formatDateTime(row.latestFollowUpAt)
                                : "暂无跟进记录"
                            }
                          >
                            {row.latestFollowUpAt
                              ? `最近跟进 ${formatRelativeDateTime(row.latestFollowUpAt)}`
                              : "最近跟进 暂无"}
                          </p>
                          <p
                            title={
                              row.latestTradeAt
                                ? formatDateTime(row.latestTradeAt)
                                : "暂无成交记录"
                            }
                          >
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
                    render: (row) => {
                      const nextAction = getNextAction(row);

                      return (
                        <div className="space-y-1.5">
                          <p className="text-[13px] font-medium text-black/82">
                            {nextAction.label}
                          </p>
                          <p className="text-[12px] leading-5 text-black/48">{nextAction.note}</p>
                        </div>
                      );
                    },
                  },
                  {
                    key: "actions",
                    title: "动作",
                    headerClassName: "w-[10%]",
                    render: (row) => (
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
                ]}
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
  );
}
