import Link from "next/link";
import { CustomerStageTabs } from "@/components/customers/customer-stage-tabs";
import { CustomersTable } from "@/components/customers/customers-table";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  getCustomerQueueLabel,
  type CustomerQueueKey,
} from "@/lib/customers/metadata";
import type {
  CustomerCenterFilters,
  CustomerListItem,
} from "@/lib/customers/queries";

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function buildCustomerQueueHref(
  filters: CustomerCenterFilters,
  overrides: Partial<CustomerCenterFilters> = {},
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.teamId) {
    params.set("teamId", next.teamId);
  }

  if (next.salesId) {
    params.set("salesId", next.salesId);
  }

  if (next.queue !== "all") {
    params.set("queue", next.queue);
  }

  if (next.search) {
    params.set("search", next.search);
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

export function CustomerWorkQueue({
  title,
  description,
  queueCounts,
  filters,
  items,
  pagination,
  callResultOptions,
  canCreateCallRecord,
  selectedOwnerLabel,
}: Readonly<{
  title: string;
  description: string;
  queueCounts: Record<CustomerQueueKey, number>;
  filters: CustomerCenterFilters;
  items: CustomerListItem[];
  pagination: PaginationData;
  callResultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  selectedOwnerLabel: string;
}>) {
  return (
    <SectionCard
      eyebrow="客户队列"
      title={title}
      description={description}
      actions={
        <StatusBadge
          label={`${selectedOwnerLabel} · ${getCustomerQueueLabel(filters.queue)}`}
          variant="info"
        />
      }
      anchorId="customer-queue"
      contentClassName="space-y-4"
    >
      <CustomerStageTabs
        activeQueue={filters.queue}
        counts={queueCounts}
        buildHref={(queue) =>
          buildCustomerQueueHref(filters, {
            queue,
            page: 1,
          })
        }
        scrollTargetId="customer-queue"
      />

      <form
        method="get"
        className="crm-subtle-panel grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]"
      >
        {filters.teamId ? <input type="hidden" name="teamId" value={filters.teamId} /> : null}
        {filters.salesId ? (
          <input type="hidden" name="salesId" value={filters.salesId} />
        ) : null}
        <input type="hidden" name="queue" value={filters.queue} />

        <label className="space-y-1.5">
          <span className="crm-label">搜索客户</span>
          <input
            name="search"
            defaultValue={filters.search}
            placeholder="姓名 / 手机号 / 负责人"
            className="crm-input"
          />
        </label>

        <button type="submit" className="crm-button crm-button-primary self-end">
          应用搜索
        </button>

        <Link
          href={buildCustomerQueueHref(filters, {
            search: "",
            page: 1,
          })}
          scroll={false}
          className="crm-button crm-button-secondary self-end"
        >
          清空搜索
        </Link>
      </form>

      <CustomersTable
        items={items}
        pagination={pagination}
        callResultOptions={callResultOptions}
        canCreateCallRecord={canCreateCallRecord}
        emptyTitle={`${getCustomerQueueLabel(filters.queue)}暂无客户`}
        emptyDescription="当前筛选条件下没有匹配客户，可以切换队列或放宽搜索条件。"
        filters={filters}
        scrollTargetId="customer-queue"
      />
    </SectionCard>
  );
}
