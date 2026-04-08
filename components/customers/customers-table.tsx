"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import {
  CustomerMobileDialButton,
  MobileCallFollowUpSheet,
} from "@/components/customers/mobile-call-followup-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityTable } from "@/components/shared/entity-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CallResultOption } from "@/lib/calls/metadata";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import {
  formatDateTime,
  formatRelativeDateTime,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
  getCustomerWorkStatusVariant,
  formatRegion,
} from "@/lib/customers/metadata";
import type {
  CustomerCenterFilters,
  CustomerListItem,
} from "@/lib/customers/queries";
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
    return region !== "未填写" ? `${region} · ${detail}` : detail;
  }

  return region;
}

function CustomerViewToggle({
  value,
  onChange,
}: Readonly<{
  value: CustomerViewMode;
  onChange: (nextValue: CustomerViewMode) => void;
}>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-black/7 bg-[rgba(247,248,250,0.78)] p-1">
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
  const [viewMode, setViewMode] = useState<CustomerViewMode>(() => {
    if (typeof window === "undefined") {
      return "cards";
    }

    const stored = window.localStorage.getItem(customerViewStorageKey);
    return stored === "table" ? "table" : "cards";
  });

  function handleChangeView(nextValue: CustomerViewMode) {
    setViewMode(nextValue);
    window.localStorage.setItem(customerViewStorageKey, nextValue);
  }

  if (items.length === 0) {
    return (
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
    );
  }

  return (
    <div id={scrollTargetId} className="mt-1">
      <div className="mb-4 flex min-h-10 flex-col gap-3 rounded-[18px] border border-black/8 bg-[rgba(255,255,255,0.9)] px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between xl:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
            客户列表
          </p>
          <p className="mt-1 text-[12px] text-black/50">
            当前页 {items.length} 位客户 · 共 {pagination.totalCount} 位
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pageSizeControl ? <div className="shrink-0">{pageSizeControl}</div> : null}
          <CustomerViewToggle value={viewMode} onChange={handleChangeView} />
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
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
        <div className="mb-5">
          <EntityTable
            density="compact"
            rows={items}
            getRowKey={(row) => row.id}
            columns={[
              {
                key: "customer",
                title: "客户",
                render: (row) => (
                  <div className="space-y-1">
                    <Link
                      href={`/customers/${row.id}`}
                      className="text-sm font-semibold text-black/84 hover:text-black"
                    >
                      {row.name}
                    </Link>
                    <div className="text-[12px] font-medium text-black/72">{row.phone}</div>
                  </div>
                ),
              },
              {
                key: "status",
                title: "当前状态",
                render: (row) => (
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
                ),
              },
              {
                key: "product",
                title: "商品 / 标签",
                render: (row) => (
                  <div className="space-y-1">
                    <div
                      className="max-w-[18rem] truncate text-[12px] font-medium text-black/72"
                      title={row.latestPurchasedProduct ?? row.latestInterestedProduct ?? "暂无商品或意向记录"}
                    >
                      {row.latestPurchasedProduct ?? row.latestInterestedProduct ?? "暂无商品或意向记录"}
                    </div>
                    <div className="text-[12px] text-black/46">
                      标签 {row.customerTags.length}
                    </div>
                  </div>
                ),
              },
              {
                key: "address",
                title: "地址",
                render: (row) => (
                  <div
                    className="max-w-[18rem] truncate text-[12px] text-black/56"
                    title={getCustomerAddress(row)}
                  >
                    {getCustomerAddress(row)}
                  </div>
                ),
              },
              {
                key: "time",
                title: "最近导入",
                render: (row) => {
                  const importedAt = row.latestImportAt ?? row.createdAt;

                  return (
                    <div className="space-y-1 text-[12px]">
                      <div className="font-medium text-black/72" title={formatDateTime(importedAt)}>
                        {formatRelativeDateTime(importedAt)}
                      </div>
                      <div className="text-black/46" title={row.latestFollowUpAt ? formatDateTime(row.latestFollowUpAt) : "暂无跟进"}>
                        {row.latestFollowUpAt
                          ? `跟进 ${formatRelativeDateTime(row.latestFollowUpAt)}`
                          : "待跟进"}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: "actions",
                title: "动作",
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/customers/${row.id}`}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-[12px]"
                    >
                      查看
                    </Link>
                    <CustomerMobileDialButton
                      customerId={row.id}
                      customerName={row.name}
                      phone={row.phone}
                      triggerSource="table"
                      disabled={!canCreateCallRecord}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-[12px]"
                    />
                    {canCreateSalesOrder ? (
                      <Link
                        href={buildCustomerTradeOrderHref(row.id)}
                        className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-[12px]"
                      >
                        成交主单
                      </Link>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {canCreateCallRecord ? (
        <MobileCallFollowUpSheet
          scope={{
            kind: "list",
            customerIds: items.map((item) => item.id),
          }}
          resultOptions={callResultOptions}
        />
      ) : null}

      <div className="mt-4 [&>div]:rounded-[18px] [&>div]:border-black/7 [&>div]:bg-[rgba(255,255,255,0.78)] [&>div]:px-4 [&>div]:py-3 [&>div]:shadow-[0_6px_16px_rgba(15,23,42,0.03)] [&_.crm-toolbar-cluster]:gap-2 [&_a]:h-8 [&_a]:rounded-[10px] [&_a]:px-3 [&_a]:py-0 [&_a]:text-[13px] [&_a]:shadow-none [&_a]:hover:translate-y-0 [&_p]:text-[13px] [&_p]:leading-5">
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          summary={`当前第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.totalCount} 位客户`}
          buildHref={(page) => buildCustomersHref(filters, { page })}
          scrollTargetId={scrollTargetId}
        />
      </div>
    </div>
  );
}
