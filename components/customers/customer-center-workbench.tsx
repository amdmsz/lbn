import { Info } from "lucide-react";
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
import { CustomersTable } from "@/components/customers/customers-table";
import { buildCustomersExportHref } from "@/lib/customers/export-url";
import type { CustomerCenterData } from "@/lib/customers/queries";

const workspaceShellClassName = "mx-auto w-full max-w-7xl min-w-0";

function PhoneSearchAlert({
  count,
  search,
}: Readonly<{ count: number; search: string }>) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">
        搜索 “{search}” 命中范围外 {count} 条客户,仅展示归属(只读)。
      </span>
    </div>
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
  const headerAction = canCreateCustomer(role) ? <CustomerCreateEntry /> : null;

  return (
    <WorkbenchLayout
      className="!gap-0"
      toolbar={
        <div className={`${workspaceShellClassName} relative z-20 mb-3`}>
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
        <PhoneSearchAlert
          count={data.phoneSearchDisclosures.length}
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
          headerAction={headerAction}
          scrollTargetId="customer-list"
        />
      </div>
    </WorkbenchLayout>
  );
}
