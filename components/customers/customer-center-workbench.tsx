import type { ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import {
  canBatchManageCustomerTags,
  canBatchMoveCustomersToRecycleBin,
  canCreateCallRecord,
  canCreateCustomer,
  canCreateSalesOrder,
  canExportCustomers,
  canPermanentlyDeleteCustomers,
  canTransferCustomerOwner,
} from "@/lib/auth/access";
import { CustomerCreateEntry } from "@/components/customers/customer-create-entry";
import type { MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerFilterToolbar } from "@/components/customers/customer-filter-toolbar";
import { CustomerPageSizeSelect } from "@/components/customers/customer-page-size-select";
import { CustomersTable } from "@/components/customers/customers-table";
import { buildCustomersExportHref } from "@/lib/customers/export-url";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { getCustomerOwnershipModeLabel } from "@/lib/customers/public-pool-metadata";
import { cn } from "@/lib/utils";

const workspaceShellClassName = "mx-auto w-full max-w-7xl min-w-0";

function getInlineTableAction(role: RoleCode): ReactNode {
  if (!canCreateCustomer(role)) {
    return null;
  }

  return <CustomerCreateEntry />;
}

function formatDisclosureOwner(
  item: CustomerCenterData["phoneSearchDisclosures"][number],
) {
  if (item.owner) {
    return `${item.owner.name} (@${item.owner.username})`;
  }

  if (item.lastOwner) {
    return `上一负责人 ${item.lastOwner.name} (@${item.lastOwner.username})`;
  }

  return "暂无负责人";
}

function formatDisclosureTeam(
  item: CustomerCenterData["phoneSearchDisclosures"][number],
) {
  return item.owner?.team?.name ?? item.publicPoolTeam?.name ?? item.lastOwner?.team?.name ?? "暂无团队";
}

function PhoneSearchOwnershipDisclosure({
  items,
  search,
}: Readonly<{
  items: CustomerCenterData["phoneSearchDisclosures"];
  search: string;
}>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mb-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-amber-950 shadow-sm">
      <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
            手机号归属提示
          </p>
          <p className="mt-1 text-sm font-semibold">
            搜索 “{search}” 命中当前范围外客户
          </p>
          <p className="mt-1 text-[12px] leading-5 text-amber-800">
            这里只显示客户归属，不开放详情、跟进、下单、标签或回收操作。
          </p>
        </div>
        <span className="inline-flex h-7 w-fit items-center rounded-full border border-amber-300/80 bg-white/70 px-2.5 text-[11px] font-semibold text-amber-800">
          只读
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid gap-1 rounded-xl border border-amber-200/70 bg-white/80 px-3 py-2 md:grid-cols-[1.1fr_1.3fr_1fr_auto] md:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
              <p className="font-mono text-[12px] text-muted-foreground">{item.phoneMasked}</p>
            </div>
            <p className="truncate text-[12px] font-medium text-foreground">
              {formatDisclosureOwner(item)}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">
              {formatDisclosureTeam(item)}
            </p>
            <span className="inline-flex h-6 w-fit items-center rounded-full border border-border/70 bg-muted/50 px-2 text-[11px] font-medium text-muted-foreground">
              {getCustomerOwnershipModeLabel(item.ownershipMode)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CustomerCenterWorkbench({
  role,
  data,
  outboundCallEnabled,
  moveCustomerToRecycleBinAction,
}: Readonly<{
  role: RoleCode;
  data: CustomerCenterData;
  outboundCallEnabled: boolean;
  moveCustomerToRecycleBinAction?: MoveCustomerToRecycleBinAction;
}>) {
  return (
    <WorkbenchLayout
      className="!gap-0"
      toolbar={
        <div className={cn(workspaceShellClassName, "relative z-20 mb-3")}>
          <CustomerFilterToolbar
            filters={data.filters}
            exportHref={
              canExportCustomers(role) ? buildCustomersExportHref(data.filters) : null
            }
            productOptions={data.productOptions}
            tagOptions={data.tagOptions}
            teamOptions={role === "ADMIN" ? data.teamOverview : []}
            salesOptions={role === "ADMIN" || role === "SUPERVISOR" ? data.salesBoard : []}
          />
        </div>
      }
    >
      <div className={workspaceShellClassName}>
        <PhoneSearchOwnershipDisclosure
          items={data.phoneSearchDisclosures}
          search={data.filters.search}
        />
        <CustomersTable
          items={data.queueItems}
          pagination={data.pagination}
          callResultOptions={data.callResultOptions}
          canCreateCallRecord={canCreateCallRecord(role)}
          canCreateSalesOrder={canCreateSalesOrder(role)}
          outboundCallEnabled={outboundCallEnabled}
          moveToRecycleBinAction={moveCustomerToRecycleBinAction}
          canBatchAddTags={canBatchManageCustomerTags(role)}
          canBatchTransferOwner={canTransferCustomerOwner(role)}
          canBatchMoveToRecycleBin={canBatchMoveCustomersToRecycleBin(role)}
          canBatchForceHardDelete={canPermanentlyDeleteCustomers(role)}
          batchTagOptions={data.tagOptions}
          batchOwnerTransferOptions={data.salesBoard}
          emptyTitle="当前筛选条件下没有客户"
          emptyDescription="试试调整筛选条件或重置当前工作台范围。"
          filters={data.filters}
          pageSizeControl={<CustomerPageSizeSelect filters={data.filters} />}
          headerAction={getInlineTableAction(role)}
          scrollTargetId="customer-list"
        />
      </div>
    </WorkbenchLayout>
  );
}
