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
  canManageCustomerPublicPool,
  canPermanentlyDeleteCustomers,
  canTransferCustomerOwner,
} from "@/lib/auth/access";
import { CustomerCreateEntry } from "@/components/customers/customer-create-entry";
import type { MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerFilterToolbar } from "@/components/customers/customer-filter-toolbar";
import {
  CustomerQueueTabs,
  type CustomerQueueTabItem,
} from "@/components/customers/customer-queue-tabs";
import { CustomerTodayStats } from "@/components/customers/customer-today-stats";
import { CustomersTable } from "@/components/customers/customers-table";
import { buildCustomersExportHref } from "@/lib/customers/export-url";
import { primaryCustomerQueueOptions } from "@/lib/customers/metadata";
import type {
  CustomerCenterListData,
  CustomerCenterStatsData,
  CustomerPhoneSearchDisclosure,
} from "@/lib/customers/queries";

const workspaceShellClassName = "mx-auto w-full max-w-7xl min-w-0";

// 把"号码已存在但不在你可见范围"的客户归属说清楚, 方便判断该认领还是该移交.
function describePhoneDisclosureLocation(
  disclosure: CustomerPhoneSearchDisclosure,
): string {
  if (disclosure.owner) {
    const team = disclosure.owner.team?.name ? `·${disclosure.owner.team.name}` : "";
    return `归属 ${disclosure.owner.name}（@${disclosure.owner.username}${team}）`;
  }

  if (disclosure.publicPoolTeam) {
    return `${disclosure.publicPoolTeam.name} 团队公海`;
  }

  if (disclosure.ownershipMode === "PUBLIC") {
    return "公海（未分配团队）";
  }

  if (disclosure.lastOwner) {
    const team = disclosure.lastOwner.team?.name
      ? `·${disclosure.lastOwner.team.name}`
      : "";
    return `原归属 ${disclosure.lastOwner.name}（@${disclosure.lastOwner.username}${team}，已释放）`;
  }

  return "未分配";
}

function PhoneSearchAlert({
  disclosures,
  search,
  role,
}: Readonly<{
  disclosures: CustomerPhoneSearchDisclosure[];
  search: string;
  role: RoleCode;
}>) {
  if (disclosures.length === 0) return null;

  // 仅 ADMIN / SUPERVISOR 展示归属明细 (谁的/哪个公海); SALES 只提示"已存在",
  // 不暴露具体归属人, 避免撞单/跨抢.
  const showOwnership = role === "ADMIN" || role === "SUPERVISOR";

  return (
    <div
      role="status"
      className="mb-3 rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p>
            号码 “{search}” 已存在于系统，但不在你当前的可见范围
            {showOwnership
              ? "（只读，归属如下）："
              : `（只读，共 ${disclosures.length} 条）。`}
          </p>
          {showOwnership ? (
            <ul className="mt-1.5 space-y-1">
              {disclosures.map((disclosure) => (
                <li
                  key={disclosure.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                >
                  <span className="font-medium">
                    {disclosure.name || "未命名客户"}
                  </span>
                  <span className="tabular-nums opacity-80">
                    {disclosure.phoneMasked}
                  </span>
                  <span className="opacity-90">
                    · {describePhoneDisclosureLocation(disclosure)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
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
 * 队列 tab 数据从 `queueCounts` 派生 — Wave 12 收敛后首屏只渲染 4 个主队列,
 * 顺序对齐 `primaryCustomerQueueOptions` (待拨打 → 已加微 → 待邀约 → 全部).
 * 其余队列入口在筛选器高级筛选「工作队列」组 (单选 chip, 同样写 queue URL
 * 参数). count 为 0 的主队列仍保留 (销售要据此判断"这个队列今天清空了").
 */
function buildQueueTabItems(
  queueCounts: CustomerCenterStatsData["queueCounts"],
): CustomerQueueTabItem[] {
  return primaryCustomerQueueOptions.map((option) => ({
    key: option.value,
    label: option.label,
    count: queueCounts[option.value] ?? 0,
  }));
}

/**
 * Stats 边界内部的真实内容 — 顶部 / sidebar 筛选 toolbar + 队列 tab + 今日战绩条.
 *
 * `teamOverview` / `salesOptions` / `queueCounts` 是 SQL aggregate 的派生, 走慢
 * 路径; 单独包在 stats Suspense 内, 不阻塞 ListSection.
 *
 * 队列 tab + 今日战绩条放在筛选工具栏之后、客户列表之前 (顺序: 工具栏 → 队列
 * tab → 战绩条 → 列表). 它们依赖 `queueCounts` (stats), 所以与 toolbar 同源,
 * 一并在 stats 边界内填充.
 */
export function CustomerCenterToolbarSection({
  role,
  filters,
  productOptions,
  tagOptions,
  teamOverview,
  salesBoard,
  queueCounts,
  myDialedToday,
  scopeDialedToday,
  wechatAddedToday,
}: Readonly<{
  role: RoleCode;
  filters: CustomerCenterListData["filters"];
  productOptions: CustomerCenterListData["productOptions"];
  tagOptions: CustomerCenterListData["tagOptions"];
  teamOverview: CustomerCenterStatsData["teamOverview"];
  salesBoard: CustomerCenterStatsData["salesBoard"];
  queueCounts: CustomerCenterStatsData["queueCounts"];
  myDialedToday: CustomerCenterStatsData["myDialedToday"];
  scopeDialedToday: CustomerCenterStatsData["scopeDialedToday"];
  wechatAddedToday: CustomerCenterStatsData["wechatAddedToday"];
}>) {
  return (
    <div className="space-y-3">
      <CustomerFilterToolbar
        filters={filters}
        exportHref={
          canExportCustomers(role) ? buildCustomersExportHref(filters) : null
        }
        productOptions={productOptions}
        tagOptions={tagOptions}
        teamOptions={role === "ADMIN" ? teamOverview : []}
        salesOptions={role === "ADMIN" || role === "SUPERVISOR" ? salesBoard : []}
        queueCounts={queueCounts}
      />
      <CustomerQueueTabs
        items={buildQueueTabItems(queueCounts)}
        activeKey={filters.queue}
        filters={filters}
      />
      <CustomerTodayStats
        myDialedToday={myDialedToday}
        scopeDialedToday={scopeDialedToday}
        wechatAddedToday={wechatAddedToday}
        pendingDialCount={queueCounts.pending_dial ?? 0}
        isSalesViewer={role === "SALES"}
      />
    </div>
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
        disclosures={list.phoneSearchDisclosures}
        search={list.filters.search}
        role={role}
      />
      <CustomersTable
        viewerRole={role}
        items={list.queueItems}
        pagination={list.pagination}
        callResultOptions={list.callResultOptions}
        canCreateCallRecord={canCreateCallRecord(role)}
        canCreateSalesOrder={canCreateSalesOrder(role)}
        outboundCallEnabled={outboundCallEnabled}
        moveToRecycleBinAction={moveCustomerToRecycleBinAction}
        canBatchAddTags={canBatchManageCustomerTags(role)}
        canBatchTransferOwner={canTransferCustomerOwner(role)}
        canBatchReleaseToPublicPool={canManageCustomerPublicPool(role)}
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
