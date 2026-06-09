import { type ReactNode } from "react";
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
import type {
  CustomerCenterListData,
  CustomerCenterStatsData,
} from "@/lib/customers/queries";

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

/**
 * F19 streaming: 工作台壳子. 接收两个独立 Suspense slot:
 *   - `toolbarSlot`: 顶部筛选器 / sidebar (依赖 stats SQL aggregate, 较慢).
 *   - `listSlot`: 列表本体 (用户最关心, 优先 SSR).
 *
 * 不再持有 data, 由父级 page.tsx 决定 list/stats 在两个 Suspense 分别 await
 * 后渲染. 这样列表渲染不被 stats aggregate 阻塞.
 */
export function CustomerCenterWorkbench({
  toolbarSlot,
  listSlot,
}: Readonly<{
  toolbarSlot: ReactNode;
  listSlot: ReactNode;
}>) {
  return (
    <WorkbenchLayout
      className="!gap-0"
      toolbar={
        <div className={`${workspaceShellClassName} relative z-20 mb-3`}>
          {toolbarSlot}
        </div>
      }
    >
      <div className={workspaceShellClassName}>{listSlot}</div>
    </WorkbenchLayout>
  );
}

/**
 * Stats 边界内部的真实内容 — 顶部 / sidebar 筛选 toolbar.
 *
 * `teamOverview` / `salesOptions` 是 SQL aggregate 的派生, 走慢路径; 单独
 * 包在 stats Suspense 内, 不阻塞 ListSection.
 */
export function CustomerCenterToolbarSection({
  role,
  filters,
  productOptions,
  tagOptions,
  teamOverview,
  salesBoard,
}: Readonly<{
  role: RoleCode;
  filters: CustomerCenterListData["filters"];
  productOptions: CustomerCenterListData["productOptions"];
  tagOptions: CustomerCenterListData["tagOptions"];
  teamOverview: CustomerCenterStatsData["teamOverview"];
  salesBoard: CustomerCenterStatsData["salesBoard"];
}>) {
  return (
    <CustomerFilterToolbar
      filters={filters}
      exportHref={
        canExportCustomers(role) ? buildCustomersExportHref(filters) : null
      }
      productOptions={productOptions}
      tagOptions={tagOptions}
      teamOptions={role === "ADMIN" ? teamOverview : []}
      salesOptions={role === "ADMIN" || role === "SUPERVISOR" ? salesBoard : []}
    />
  );
}

/**
 * 列表区主体. 不再依赖 salesBoard (批量转移所有人) — 由 stats 异步注入的
 * `batchOwnerTransferOptions` (= `transferableOwners` 全集) 决定. 在 stats
 * 未到位时, 该 dropdown 暂时为空, 列表本身仍可看 / 筛选 / 翻页.
 *
 * 注意: 这里必须传 `transferableOwners`, 不能用 `salesBoard`. `salesBoard`
 * 跟随当前 filter (team 选中后只剩本团队成员), 会让 ADMIN 在某团队 filter
 * 下出现"暂无可移交的销售账号".
 */
export function CustomerCenterListSection({
  role,
  list,
  batchOwnerTransferOptions,
  outboundCallEnabled,
  moveCustomerToRecycleBinAction,
}: Readonly<{
  role: RoleCode;
  list: CustomerCenterListData;
  batchOwnerTransferOptions: CustomerCenterStatsData["transferableOwners"];
  outboundCallEnabled: boolean;
  moveCustomerToRecycleBinAction?: MoveCustomerToRecycleBinAction;
}>) {
  const headerAction = canCreateCustomer(role) ? <CustomerCreateEntry /> : null;

  return (
    <>
      <PhoneSearchAlert
        count={list.phoneSearchDisclosures.length}
        search={list.filters.search}
      />
      <CustomersTable
        items={list.queueItems}
        pagination={list.pagination}
        callResultOptions={list.callResultOptions}
        canCreateCallRecord={canCreateCallRecord(role)}
        canCreateSalesOrder={canCreateSalesOrder(role)}
        outboundCallEnabled={outboundCallEnabled}
        moveToRecycleBinAction={moveCustomerToRecycleBinAction}
        canBatchAddTags={canBatchManageCustomerTags(role)}
        canBatchTransferOwner={canTransferCustomerOwner(role)}
        canBatchMoveToRecycleBin={canBatchMoveCustomersToRecycleBin(role)}
        canBatchForceHardDelete={canPermanentlyDeleteCustomers(role)}
        batchTagOptions={list.tagOptions}
        batchOwnerTransferOptions={batchOwnerTransferOptions}
        emptyTitle="当前筛选条件下没有客户"
        emptyDescription="试试调整筛选条件或重置当前工作台范围。"
        filters={list.filters}
        headerAction={headerAction}
        scrollTargetId="customer-list"
      />
    </>
  );
}
