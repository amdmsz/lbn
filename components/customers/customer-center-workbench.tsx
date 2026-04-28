import type { ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import {
  canBatchManageCustomerTags,
  canBatchMoveCustomersToRecycleBin,
  canCreateCallRecord,
  canCreateCustomer,
  canCreateSalesOrder,
} from "@/lib/auth/access";
import { CustomerCreateEntry } from "@/components/customers/customer-create-entry";
import type { MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerFilterToolbar } from "@/components/customers/customer-filter-toolbar";
import { CustomerPageSizeSelect } from "@/components/customers/customer-page-size-select";
import { CustomersTable } from "@/components/customers/customers-table";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

const workspaceShellClassName = "crm-workspace-shell";

function getInlineTableAction(role: RoleCode): ReactNode {
  if (!canCreateCustomer(role)) {
    return null;
  }

  return <CustomerCreateEntry />;
}

export function CustomerCenterWorkbench({
  role,
  data,
  moveCustomerToRecycleBinAction,
}: Readonly<{
  role: RoleCode;
  data: CustomerCenterData;
  moveCustomerToRecycleBinAction?: MoveCustomerToRecycleBinAction;
}>) {
  return (
    <WorkbenchLayout
      className="!gap-0"
      toolbar={
        <div className={cn(workspaceShellClassName, "relative z-20 mb-3")}>
          <CustomerFilterToolbar
            filters={data.filters}
            productOptions={data.productOptions}
            tagOptions={data.tagOptions}
            teamOptions={role === "ADMIN" ? data.teamOverview : []}
            salesOptions={role === "ADMIN" || role === "SUPERVISOR" ? data.salesBoard : []}
          />
        </div>
      }
    >
      <div className={workspaceShellClassName}>
        <CustomersTable
          items={data.queueItems}
          pagination={data.pagination}
          callResultOptions={data.callResultOptions}
          canCreateCallRecord={canCreateCallRecord(role)}
          canCreateSalesOrder={canCreateSalesOrder(role)}
          moveToRecycleBinAction={moveCustomerToRecycleBinAction}
          canBatchAddTags={canBatchManageCustomerTags(role)}
          canBatchMoveToRecycleBin={canBatchMoveCustomersToRecycleBin(role)}
          batchTagOptions={data.tagOptions}
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
