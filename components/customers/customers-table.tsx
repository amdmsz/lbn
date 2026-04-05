import Link from "next/link";
import type { ReactNode } from "react";
import type { CustomerListItem } from "@/lib/customers/queries";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export function CustomersTable({
  items,
  pagination,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  emptyTitle,
  emptyDescription,
  buildPageHref,
  pageSizeControl,
  scrollTargetId,
}: Readonly<{
  items: CustomerListItem[];
  pagination: PaginationData;
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  buildPageHref: (page: number) => string;
  pageSizeControl?: ReactNode;
  scrollTargetId?: string;
}>) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={
          <Link href={buildPageHref(1)} scroll={false} className="crm-button crm-button-secondary">
            重置筛选
          </Link>
        }
      />
    );
  }

  return (
    <div id={scrollTargetId} className="mt-2">
      <div className="mb-3 flex min-h-8 flex-col gap-2 rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)] px-[14px] py-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:flex-row md:items-center md:justify-between md:rounded-[18px] md:px-4 md:py-[12px] xl:rounded-[20px] xl:px-[18px] xl:py-[12px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
          客户列表
        </p>
        {pageSizeControl ? <div className="shrink-0">{pageSizeControl}</div> : null}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 min-[960px]:grid-cols-2 min-[1120px]:grid-cols-3">
        {items.map((item) => (
          <CustomerListCard
            key={item.id}
            item={item}
            canCreateCallRecord={canCreateCallRecord}
            canCreateSalesOrder={canCreateSalesOrder}
          />
        ))}
      </div>

      <div className="mt-[14px] [&>div]:rounded-[16px] [&>div]:border-[rgba(15,23,42,0.08)] [&>div]:bg-[rgba(255,255,255,0.72)] [&>div]:px-[14px] [&>div]:py-[12px] [&>div]:shadow-none md:[&>div]:rounded-[18px] md:[&>div]:px-4 xl:[&>div]:rounded-[20px] xl:[&>div]:px-[18px] [&_.crm-toolbar-cluster]:gap-2 [&_a]:h-8 [&_a]:rounded-[10px] [&_a]:px-3 [&_a]:py-0 [&_a]:text-[13px] [&_a]:shadow-none [&_a]:hover:translate-y-0 [&_p]:text-[13px] [&_p]:leading-5">
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          summary={`当前第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.totalCount} 位客户`}
          buildHref={buildPageHref}
          scrollTargetId={scrollTargetId}
        />
      </div>
    </div>
  );
}
