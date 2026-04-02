import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { saveSalesOrderAction } from "@/app/(dashboard)/orders/actions";
import { canCreateCallRecord, canCreateSalesOrder } from "@/lib/auth/access";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerFilterToolbar } from "@/components/customers/customer-filter-toolbar";
import { CustomerPageSizeSelect } from "@/components/customers/customer-page-size-select";
import { CustomersTable } from "@/components/customers/customers-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { customerRoleHeaderMeta } from "@/lib/customers/metadata";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { getSalesOrderCreateFormOptions } from "@/lib/sales-orders/queries";
import { cn } from "@/lib/utils";

type SummaryMetric = {
  label: string;
  value: string;
  note: string;
  href: string;
  emphasis?: "default" | "info" | "success" | "warning";
};

const sectionShellClassName =
  "mx-auto w-full max-w-[1360px] px-[14px] md:px-[18px] xl:px-6";

const summaryToneClassName: Record<NonNullable<SummaryMetric["emphasis"]>, string> = {
  default: "border-black/6",
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

function getSummaryItems(role: RoleCode, data: CustomerCenterData): SummaryMetric[] {
  const scopeLabel = role === "SALES" ? "我的客户" : "当前客户";

  return [
    {
      label: scopeLabel,
      value: String(data.summary.customerCount),
      note: "当前可见范围",
      href: buildCustomersHref(data.filters, {
        statuses: [],
        queue: "all",
        page: 1,
      }),
    },
    {
      label: "待首呼",
      value: String(data.summary.pendingFirstCallCount),
      note: "尚未形成通话",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_first_call"],
        queue: "pending_first_call",
        page: 1,
      }),
      emphasis: "warning",
    },
    {
      label: "待回访",
      value: String(data.summary.pendingFollowUpCount),
      note: "已有待办跟进",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_follow_up"],
        queue: "pending_follow_up",
        page: 1,
      }),
      emphasis: "info",
    },
    {
      label: "待邀约",
      value: String(data.summary.pendingInvitationCount),
      note: "形成触点未邀约",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_invitation"],
        queue: "pending_invitation",
        page: 1,
      }),
      emphasis: "success",
    },
  ];
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
        "group flex min-h-[88px] flex-col rounded-[16px] border bg-[rgba(255,255,255,0.88)] px-4 pb-3 pt-[14px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:bg-[rgba(255,255,255,0.96)] md:min-h-[92px] md:rounded-[18px] xl:min-h-[96px]",
        summaryToneClassName[item.emphasis ?? "default"],
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">
        {item.label}
      </p>
      <div className="mt-2 text-[1.18rem] font-semibold tracking-tight text-black/86 md:text-[1.3rem]">
        {item.value}
      </div>
      <p className="mt-auto truncate pt-1 text-[12px] leading-5 text-black/48">{item.note}</p>
    </Link>
  );
}

export async function CustomerCenterWorkbench({
  role,
  data,
}: Readonly<{
  role: RoleCode;
  data: CustomerCenterData;
}>) {
  const headerMeta = customerRoleHeaderMeta[role];
  const scopeLabel = getScopeLabel(data);
  const summaryItems = getSummaryItems(role, data);
  const createOrderOptions = canCreateSalesOrder(role)
    ? await getSalesOrderCreateFormOptions()
    : null;

  const headerMetaContent =
    role === "SALES" && !data.filters.teamId && !data.filters.salesId ? null : (
      <>
        <StatusBadge label={scopeLabel} variant="info" />
        {data.filters.salesId && data.selectedSales ? (
          <StatusBadge label={`销售：${data.selectedSales.name}`} variant="neutral" />
        ) : null}
        {data.filters.teamId && data.selectedTeam ? (
          <StatusBadge label={`团队：${data.selectedTeam.name}`} variant="neutral" />
        ) : null}
      </>
    );

  return (
    <WorkbenchLayout
      className="!gap-0"
      header={
        <div className={cn(sectionShellClassName, "mb-[14px]")}>
          <header className="min-h-[92px] rounded-[18px] border border-black/6 bg-[rgba(255,255,255,0.92)] px-4 pb-[14px] pt-4 md:px-5 md:pb-4 md:pt-5 xl:min-h-[104px] xl:px-5 xl:pb-4 xl:pt-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
                  {headerMeta.eyebrow}
                </p>
                <h1 className="mt-1.5 text-[1.32rem] font-semibold tracking-tight text-black/88 md:text-[1.5rem]">
                  {headerMeta.title}
                </h1>
                <p className="mt-2 max-w-2xl text-[13px] leading-5 text-black/54">
                  {headerMeta.description}
                </p>
                {headerMetaContent ? (
                  <div className="crm-toolbar-cluster mt-2.5 gap-1.5">{headerMetaContent}</div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/leads"
                  className="inline-flex h-9 items-center rounded-[0.78rem] border border-black/8 bg-[rgba(247,248,250,0.84)] px-3.5 text-sm text-black/72 transition hover:border-black/12 hover:bg-white hover:text-black/84"
                >
                  线索中心
                </Link>
                <Link
                  href="/orders"
                  className="inline-flex h-9 items-center rounded-[0.78rem] border border-black/8 bg-[rgba(247,248,250,0.84)] px-3.5 text-sm text-black/72 transition hover:border-black/12 hover:bg-white hover:text-black/84"
                >
                  订单中心
                </Link>
              </div>
            </div>
          </header>
        </div>
      }
      summary={
        <div className={cn(sectionShellClassName, "mb-4")}>
          <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
            {summaryItems.map((item) => (
              <SummaryMetricCard key={item.label} item={item} />
            ))}
          </div>
        </div>
      }
      toolbar={
        <div className={cn(sectionShellClassName, "mb-[14px]")}>
          <CustomerFilterToolbar
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
          canCreateCallRecord={canCreateCallRecord(role)}
          canCreateSalesOrder={canCreateSalesOrder(role)}
          emptyTitle="当前筛选条件下没有客户"
          emptyDescription="调整时间、状态、产品或标签后，再继续查看客户工作列表。"
          buildPageHref={(page) => buildCustomersHref(data.filters, { page })}
          pageSizeControl={<CustomerPageSizeSelect filters={data.filters} />}
          createOrderConfig={
            createOrderOptions
              ? {
                  ...createOrderOptions,
                  saveAction: saveSalesOrderAction,
                  redirectTo: buildCustomersHref(data.filters),
                }
              : null
          }
          scrollTargetId="customer-list"
        />
      </div>
    </WorkbenchLayout>
  );
}
