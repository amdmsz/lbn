import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import {
  canAccessCustomerPublicPool,
  canCreateCallRecord,
  canCreateSalesOrder,
} from "@/lib/auth/access";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerFilterToolbar } from "@/components/customers/customer-filter-toolbar";
import { CustomerPageSizeSelect } from "@/components/customers/customer-page-size-select";
import { CustomersTable } from "@/components/customers/customers-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type SummaryMetric = {
  label: string;
  value: string;
  note: string;
  href: string;
  emphasis?: "default" | "info" | "success" | "warning";
  active?: boolean;
};

const sectionShellClassName = "crm-workspace-shell";

const summaryToneClassName: Record<NonNullable<SummaryMetric["emphasis"]>, string> = {
  default: "border-black/7",
  info: "border-[rgba(58,105,143,0.12)]",
  success: "border-[rgba(47,107,71,0.14)]",
  warning: "border-[rgba(160,106,29,0.14)]",
};

function getScopeLabel(data: CustomerCenterData) {
  switch (data.scopeMode) {
    case "organization":
      return "组织范围";
    case "team":
      return data.selectedTeam?.name ?? "团队范围";
    case "sales":
      return data.selectedSales?.name ?? "销售范围";
    case "personal":
      return "我的客户";
    case "team_unassigned":
      return "未绑定团队";
    default:
      return "客户范围";
  }
}

function getHeaderMeta(role: RoleCode) {
  switch (role) {
    case "ADMIN":
      return {
        eyebrow: "组织客户工作台",
        title: "客户中心",
        description: "查看客户范围与推进状态。",
      };
    case "SUPERVISOR":
      return {
        eyebrow: "团队客户工作台",
        title: "客户中心",
        description: "查看团队客户与待办。",
      };
    default:
      return {
        eyebrow: "销售客户工作台",
        title: "客户中心",
        description: "处理我的客户与跟进。",
      };
  }
}

function getSummaryItems(role: RoleCode, data: CustomerCenterData): SummaryMetric[] {
  const scopeLabel = role === "SALES" ? "我的客户" : "当前客户";
  const today = new Date().toISOString().slice(0, 10);

  return [
    {
      label: scopeLabel,
      value: String(data.summary.customerCount),
      note: `今日新增 ${data.summary.todayNewImportedCount}`,
      href: buildCustomersHref(data.filters, {
        statuses: [],
        queue: "all",
        page: 1,
      }),
      active:
        data.filters.statuses.length === 0 &&
        !data.filters.importedFrom &&
        !data.filters.importedTo,
    },
    {
      label: "待首呼",
      value: String(data.summary.pendingFirstCallCount),
      note: "尚未形成通话记录",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_first_call"],
        queue: "pending_first_call",
        page: 1,
      }),
      emphasis: "warning",
      active:
        data.filters.statuses.length === 1 &&
        data.filters.statuses[0] === "pending_first_call",
    },
    {
      label: "待回访",
      value: String(data.summary.pendingFollowUpCount),
      note: "已到期的跟进动作",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_follow_up"],
        queue: "pending_follow_up",
        page: 1,
      }),
      emphasis: "info",
      active:
        data.filters.statuses.length === 1 &&
        data.filters.statuses[0] === "pending_follow_up",
    },
    {
      label: "待邀约",
      value: String(data.summary.pendingInvitationCount),
      note: "已形成关系但未进入邀约",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_invitation"],
        queue: "pending_invitation",
        page: 1,
      }),
      emphasis: "success",
      active:
        data.filters.statuses.length === 1 &&
        data.filters.statuses[0] === "pending_invitation",
    },
    {
      label: "待接续跟进",
      value: String(data.summary.migrationPendingFollowUpCount),
      note: "迁移导入后尚未形成新跟进",
      href: buildCustomersHref(data.filters, {
        statuses: ["migration_pending_follow_up"],
        queue: "migration_pending_follow_up",
        page: 1,
      }),
      emphasis: "warning",
      active:
        data.filters.statuses.length === 1 &&
        data.filters.statuses[0] === "migration_pending_follow_up",
    },
    {
      label: "今日新增",
      value: String(data.summary.todayNewImportedCount),
      note: "今日导入客户",
      href: buildCustomersHref(data.filters, {
        importedFrom: today,
        importedTo: today,
        page: 1,
      }),
      emphasis: "info",
      active: data.filters.importedFrom === today && data.filters.importedTo === today,
    },
  ];
}

function HeaderActionLink({
  href,
  label,
}: Readonly<{
  href: string;
  label: string;
}>) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-[0.85rem] border border-black/8 bg-[rgba(247,248,250,0.8)] px-3.5 text-sm text-black/66 transition-colors hover:border-black/12 hover:bg-white hover:text-black/84"
    >
      {label}
    </Link>
  );
}

function SummaryMetricCard({
  item,
}: Readonly<{
  item: SummaryMetric;
}>) {
  return (
    <Link
      href={item.href}
      scroll={false}
      className={cn(
        "group flex min-h-[108px] flex-col rounded-[18px] border bg-[rgba(255,255,255,0.9)] px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-black/10 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)]",
        summaryToneClassName[item.emphasis ?? "default"],
        item.active ? "border-[rgba(15,23,42,0.14)] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]" : null,
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/42">
        {item.label}
      </p>
      <div className="mt-2 text-[1.65rem] font-semibold tracking-[-0.04em] text-[#101828] md:text-[1.95rem]">
        {item.value}
      </div>
      <p className="mt-auto pt-2 text-[12px] font-medium leading-5 text-black/56">{item.note}</p>
    </Link>
  );
}

export function CustomerCenterWorkbench({
  role,
  data,
}: Readonly<{
  role: RoleCode;
  data: CustomerCenterData;
}>) {
  const headerMeta = getHeaderMeta(role);
  const scopeLabel = getScopeLabel(data);
  const summaryItems = getSummaryItems(role, data);

  return (
    <WorkbenchLayout
      className="!gap-0"
      header={
        <div className={cn(sectionShellClassName, "mb-4")}>
          <section className="overflow-hidden rounded-[22px] border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,246,242,0.88))] shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-4 px-4 py-4 md:px-5 md:py-5 xl:flex-row xl:items-start xl:justify-between xl:px-6">
              <div className="min-w-0 max-w-3xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/38">
                  {headerMeta.eyebrow}
                </p>
                <h1 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.03em] text-black/88 md:text-[1.7rem]">
                  {headerMeta.title}
                </h1>
                <p className="mt-2 max-w-3xl text-[13px] leading-6 text-black/52">
                  {headerMeta.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StatusBadge label={scopeLabel} variant="info" />
                  {data.filters.teamId && data.selectedTeam ? (
                    <StatusBadge label={`团队：${data.selectedTeam.name}`} variant="neutral" />
                  ) : null}
                  {data.filters.salesId && data.selectedSales ? (
                    <StatusBadge label={`销售：${data.selectedSales.name}`} variant="neutral" />
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                {canAccessCustomerPublicPool(role) ? (
                  <HeaderActionLink href="/customers/public-pool" label="公海池" />
                ) : null}
                <HeaderActionLink href="/leads" label="线索中心" />
                <HeaderActionLink
                  href="/fulfillment?tab=trade-orders"
                  label="订单中心"
                />
              </div>
            </div>
          </section>
        </div>
      }
      summary={
        <div className={cn(sectionShellClassName, "mb-5")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {summaryItems.map((item) => (
              <SummaryMetricCard key={item.label} item={item} />
            ))}
          </div>
        </div>
      }
      toolbar={
        <div className={cn(sectionShellClassName, "mb-5")}>
          <CustomerFilterToolbar
            key={JSON.stringify(data.filters)}
            filters={data.filters}
            queueCounts={data.queueCounts}
            productOptions={data.productOptions}
            tagOptions={data.tagOptions}
            matchedCount={data.pagination.totalCount}
            teamOptions={role === "ADMIN" ? data.teamOverview : []}
            salesOptions={role === "ADMIN" || role === "SUPERVISOR" ? data.salesBoard : []}
          />
        </div>
      }
    >
      <div className={sectionShellClassName}>
        <CustomersTable
          items={data.queueItems}
          pagination={data.pagination}
          callResultOptions={data.callResultOptions}
          canCreateCallRecord={canCreateCallRecord(role)}
          canCreateSalesOrder={canCreateSalesOrder(role)}
          emptyTitle="当前筛选条件下没有客户"
          emptyDescription="试试调整筛选条件。"
          filters={data.filters}
          pageSizeControl={<CustomerPageSizeSelect filters={data.filters} />}
          scrollTargetId="customer-list"
        />
      </div>
    </WorkbenchLayout>
  );
}
