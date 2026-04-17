import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import {
  canAccessCustomerPublicPool,
  canBatchManageCustomerTags,
  canBatchMoveCustomersToRecycleBin,
  canCreateCallRecord,
  canCreateSalesOrder,
} from "@/lib/auth/access";
import type { MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerFilterToolbar } from "@/components/customers/customer-filter-toolbar";
import { CustomerPageSizeSelect } from "@/components/customers/customer-page-size-select";
import { CustomersTable } from "@/components/customers/customers-table";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type SummaryMetric = {
  label: string;
  value: string;
  note: string;
  href: string;
  active?: boolean;
};

type RoleLensItem = {
  id: string;
  label: string;
  value: string;
  note: string;
  href: string;
  active?: boolean;
};

const workspaceShellClassName = "crm-workspace-shell";

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
        description: "按范围、阶段与负责人快速切换，先看经营压力，再进入具体客户执行。",
      };
    case "SUPERVISOR":
      return {
        eyebrow: "团队客户工作台",
        title: "客户中心",
        description: "围绕团队承接、回访和成交节奏收口，优先处理最需要推进的客户池。",
      };
    default:
      return {
        eyebrow: "销售客户工作台",
        title: "客户中心",
        description: "把首呼、回访、邀约和成交动作放在同一工作台里，减少切换成本。",
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
      active:
        data.filters.statuses.length === 1 &&
        data.filters.statuses[0] === "pending_follow_up",
    },
    {
      label: "待邀约",
      value: String(data.summary.pendingInvitationCount),
      note: "已建立关系但未进入邀约",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_invitation"],
        queue: "pending_invitation",
        page: 1,
      }),
      active:
        data.filters.statuses.length === 1 &&
        data.filters.statuses[0] === "pending_invitation",
    },
    {
      label: "待成交",
      value: String(data.summary.pendingDealCount),
      note: "已进入成交推进阶段",
      href: buildCustomersHref(data.filters, {
        statuses: ["pending_deal"],
        queue: "pending_deal",
        page: 1,
      }),
      active:
        data.filters.statuses.length === 1 &&
        data.filters.statuses[0] === "pending_deal",
    },
    {
      label: "今日新增",
      value: String(data.summary.todayNewImportedCount),
      note: "按导入时间筛到今天",
      href: buildCustomersHref(data.filters, {
        importedFrom: today,
        importedTo: today,
        page: 1,
      }),
      active: data.filters.importedFrom === today && data.filters.importedTo === today,
    },
  ];
}

function getRoleLensMeta(role: RoleCode) {
  if (role === "ADMIN") {
    return {
      eyebrow: "管理视角",
      title: "团队焦点",
      description: "压缩展示最需要关注的团队范围，避免把组织概览铺成第二个大面板。",
    };
  }

  if (role === "SUPERVISOR") {
    return {
      eyebrow: "团队视角",
      title: "销售焦点",
      description: "优先看当前团队内最需要督导推进的销售承接面。",
    };
  }

  return null;
}

function getRoleLensItems(role: RoleCode, data: CustomerCenterData): RoleLensItem[] {
  if (role === "ADMIN") {
    return [...data.teamOverview]
      .sort((left, right) => {
        const leftPressure =
          left.pendingFollowUpCount + left.pendingDealCount + left.pendingFirstCallCount;
        const rightPressure =
          right.pendingFollowUpCount + right.pendingDealCount + right.pendingFirstCallCount;

        if (rightPressure !== leftPressure) {
          return rightPressure - leftPressure;
        }

        return right.customerCount - left.customerCount;
      })
      .slice(0, 3)
      .map((team) => ({
        id: team.id,
        label: team.name,
        value: `${team.customerCount} 位客户`,
        note: `待回访 ${team.pendingFollowUpCount} · 待成交 ${team.pendingDealCount}`,
        href: buildCustomersHref(data.filters, {
          teamId: team.id,
          salesId: "",
          page: 1,
        }),
        active: data.filters.teamId === team.id && !data.filters.salesId,
      }));
  }

  if (role === "SUPERVISOR") {
    return [...data.salesBoard]
      .sort((left, right) => {
        const leftPressure =
          left.pendingFollowUpCount + left.pendingDealCount + left.pendingFirstCallCount;
        const rightPressure =
          right.pendingFollowUpCount + right.pendingDealCount + right.pendingFirstCallCount;

        if (rightPressure !== leftPressure) {
          return rightPressure - leftPressure;
        }

        return right.customerCount - left.customerCount;
      })
      .slice(0, 3)
      .map((sales) => ({
        id: sales.id,
        label: sales.name,
        value: `${sales.customerCount} 位客户`,
        note: `待回访 ${sales.pendingFollowUpCount} · 待成交 ${sales.pendingDealCount}`,
        href: buildCustomersHref(data.filters, {
          salesId: sales.id,
          page: 1,
        }),
        active: data.filters.salesId === sales.id,
      }));
  }

  return [];
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
      className="inline-flex h-9 items-center rounded-[0.85rem] border border-black/8 bg-[rgba(247,248,250,0.84)] px-3.5 text-sm text-black/66 transition-colors hover:border-black/12 hover:bg-white hover:text-black/84"
    >
      {label}
    </Link>
  );
}

function RoleLensStrip({
  role,
  items,
}: Readonly<{
  role: RoleCode;
  items: RoleLensItem[];
}>) {
  const meta = getRoleLensMeta(role);

  if (!meta || items.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[0.95rem] border border-black/8 bg-[rgba(255,255,255,0.9)] shadow-[0_6px_16px_rgba(18,24,31,0.025)]">
      <div className="flex flex-col gap-1.5 border-b border-black/7 px-4 py-2.5 md:flex-row md:items-center md:justify-between md:px-5 md:py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
            {meta.eyebrow}
          </p>
          <h2 className="mt-0.5 text-[0.93rem] font-semibold text-black/84">{meta.title}</h2>
        </div>
        <p className="max-w-2xl text-[12px] leading-5 text-black/52">{meta.description}</p>
      </div>

      <div className="grid gap-px bg-black/6 md:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            scroll={false}
            className={cn(
              "bg-[rgba(255,255,255,0.92)] px-4 py-2.5 transition-colors hover:bg-white md:px-5 md:py-3",
              item.active && "bg-white",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-black/84">{item.label}</p>
                <p className="mt-0.5 text-[13px] font-medium text-black/72">{item.value}</p>
                <p className="mt-1 text-[12px] leading-5 text-black/48">{item.note}</p>
              </div>
              {item.active ? (
                <StatusBadge label="当前视角" variant="info" />
              ) : (
                <span className="text-[12px] font-medium text-black/46">进入</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
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
  const headerMeta = getHeaderMeta(role);
  const scopeLabel = getScopeLabel(data);
  const summaryItems = getSummaryItems(role, data);
  const roleLensItems = getRoleLensItems(role, data);

  return (
    <WorkbenchLayout
      className="!gap-0"
      header={
        <div className={cn(workspaceShellClassName, "mb-4")}>
          <PageHeader
            eyebrow={headerMeta.eyebrow}
            title={headerMeta.title}
            description={headerMeta.description}
            className="border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,246,242,0.9))] shadow-[0_14px_30px_rgba(15,23,42,0.04)]"
            meta={
              <>
                <StatusBadge label={scopeLabel} variant="info" />
                {data.filters.teamId && data.selectedTeam ? (
                  <StatusBadge label={`团队：${data.selectedTeam.name}`} variant="neutral" />
                ) : null}
                {data.filters.salesId && data.selectedSales ? (
                  <StatusBadge label={`销售：${data.selectedSales.name}`} variant="neutral" />
                ) : null}
                {data.summary.migrationPendingFollowUpCount > 0 ? (
                  <StatusBadge
                    label={`待接续 ${data.summary.migrationPendingFollowUpCount}`}
                    variant="warning"
                  />
                ) : null}
              </>
            }
            actions={
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {canAccessCustomerPublicPool(role) ? (
                  <HeaderActionLink href="/customers/public-pool" label="公海池" />
                ) : null}
                <HeaderActionLink href="/leads" label="线索中心" />
                <HeaderActionLink
                  href="/fulfillment?tab=trade-orders"
                  label="订单中心"
                />
              </div>
            }
          />
        </div>
      }
      summary={
        <div className={cn(workspaceShellClassName, "mb-5 space-y-2.5")}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {summaryItems.map((item) => (
              <MetricCard
                key={item.label}
                label={item.label}
                value={item.value}
                note={item.note}
                href={item.href}
                density="strip"
                className={
                  item.active
                    ? "border-[rgba(15,23,42,0.14)] bg-white shadow-[0_10px_20px_rgba(18,24,31,0.045)]"
                    : undefined
                }
              />
            ))}
          </div>

          <RoleLensStrip role={role} items={roleLensItems} />
        </div>
      }
      toolbar={
        <div className={cn(workspaceShellClassName, "mb-5")}>
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
          emptyDescription="试试调整筛选条件或重置工作台范围。"
          filters={data.filters}
          pageSizeControl={<CustomerPageSizeSelect filters={data.filters} />}
          scrollTargetId="customer-list"
        />
      </div>
    </WorkbenchLayout>
  );
}
