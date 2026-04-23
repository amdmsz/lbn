import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { EntityTable } from "@/components/shared/entity-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessLiveSessionModule,
  canAccessProductModule,
} from "@/lib/auth/access";
import { buildOrderFulfillmentHref } from "@/lib/fulfillment/navigation";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import type {
  ConversionMetric,
  EmployeeRankingItem,
  PaymentSummaryData,
  SummaryCard,
} from "@/lib/reports/queries";
import type { NavigationGroup } from "@/lib/navigation";

type DashboardDataShape = {
  scopeMode: "team" | "personal" | "role" | "restricted";
  cards: SummaryCard[];
  conversions:
    | {
        windowLabel: string;
        scopeLabel: string;
        metrics: ConversionMetric[];
      }
    | null;
  ranking:
    | {
        windowLabel: string;
        description: string;
        items: EmployeeRankingItem[];
      }
    | null;
  paymentSummary?: PaymentSummaryData | null;
  fulfillmentSummary?: PaymentSummaryData | null;
  financeSummary?: PaymentSummaryData | null;
};

function getRoleMeta(role: RoleCode) {
  switch (role) {
    case "ADMIN":
      return {
        eyebrow: "组织驾驶舱",
        title: "组织工作台",
        description: "先看组织级客户、交易、履约与财务预览，再进入各业务域处理具体事项。",
        roleNote: "组织级视角",
        boundary: "可查看全量组织数据与系统设置。",
      };
    case "SUPERVISOR":
      return {
        eyebrow: "团队经营台",
        title: "团队工作台",
        description: "先看团队客户经营、订单审核与履约风险，再向下进入销售和具体业务页面。",
        roleNote: "团队级视角",
        boundary: "仅查看本人团队范围，保留审核与协同权限。",
      };
    case "SALES":
      return {
        eyebrow: "个人客户工作台",
        title: "个人销售工作台",
        description: "首屏只保留你当前最需要推进的客户、订单和收款事项，客户中心仍是主入口。",
        roleNote: "个人视角",
        boundary: "只看本人客户，不进入团队级经营或履约执行台。",
      };
    case "OPS":
      return {
        eyebrow: "运营协同台",
        title: "运营工作台",
        description: "聚焦直播场次、商品协同和礼品相关事项，不把交易、收款和履约强塞给运营岗位。",
        roleNote: "运营协同",
        boundary: "不扩展销售客户和收款权限。",
      };
    case "SHIPPER":
      return {
        eyebrow: "履约执行台",
        title: "履约工作台",
        description: "先看发货执行和履约结果；需要协同时，再进入直播场次或商品主数据模块处理履约配合任务。",
        roleNote: "履约执行",
        boundary: "不进入客户经营和收款确认主链。",
      };
  }
}

function appendGrantedQuickEntries(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[],
  items: Array<{
    title: string;
    description: string;
    href: string;
  }>,
) {
  const nextItems = [...items];

  const hasGrantedLiveModule =
    canAccessLiveSessionModule(role, permissionCodes) && !canAccessLiveSessionModule(role);
  const hasGrantedProductModule =
    canAccessProductModule(role, permissionCodes) && !canAccessProductModule(role);

  if (hasGrantedLiveModule && !nextItems.some((item) => item.href === "/live-sessions")) {
    nextItems.push({
      title: "直播场次",
      description: "这是管理员额外授权的协同入口，可查看或维护直播场次基础信息。",
      href: "/live-sessions",
    });
  }

  if (hasGrantedProductModule && !nextItems.some((item) => item.href === "/products")) {
    nextItems.push({
      title: "商品中心",
      description: "这是管理员额外授权的入口，可维护商品、SKU 与供货商主数据。",
      href: "/products",
    });
  }

  return nextItems;
}

function getQuickEntries(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  switch (role) {
    case "ADMIN":
      return appendGrantedQuickEntries(role, permissionCodes, [
        {
          title: "客户中心",
          description: "看组织、团队与销售层级客户经营。",
          href: "/customers",
        },
        {
          title: "订单中心 / 交易单",
          description: "看审核、交易结构和异常订单。",
          href: buildOrderFulfillmentHref("trade-orders"),
        },
        {
          title: "订单中心 / 发货执行",
          description: "看履约执行状态与报单节奏。",
          href: buildOrderFulfillmentHref("shipping"),
        },
        {
          title: "报表中心",
          description: "看经营、履约和财务预览。",
          href: "/reports",
        },
      ]);
    case "SUPERVISOR":
      return appendGrantedQuickEntries(role, permissionCodes, [
        {
          title: "团队客户",
          description: "进入团队客户视图继续下钻销售。",
          href: "/customers",
        },
        {
          title: "待审核订单",
          description: "集中处理团队订单审核和结果回看。",
          href: buildOrderFulfillmentHref("trade-orders", { statusView: "PENDING_REVIEW" }),
        },
        {
          title: "催收任务",
          description: "看团队待收、逾期与回款压力。",
          href: "/collection-tasks",
        },
        {
          title: "履约协同",
          description: "跟踪团队履约和发货执行。",
          href: buildOrderFulfillmentHref("shipping"),
        },
      ]);
    case "SALES":
      return appendGrantedQuickEntries(role, permissionCodes, [
        {
          title: "客户中心",
          description: "今天优先处理客户工作队列。",
          href: "/customers",
        },
        {
          title: "订单中心 / 交易单",
          description: "回看本人订单审核与成交结果。",
          href: buildOrderFulfillmentHref("trade-orders"),
        },
        {
          title: "收款记录",
          description: "提交和跟踪本人客户收款。",
          href: "/payment-records",
        },
        {
          title: "催收任务",
          description: "推进尾款、COD 和运费任务。",
          href: "/collection-tasks",
        },
      ]);
    case "OPS":
      return appendGrantedQuickEntries(role, permissionCodes, [
        {
          title: "直播场次",
          description: "承接直播排期与邀约协同。",
          href: "/live-sessions",
        },
        {
          title: "商品中心",
          description: "配合查看商品信息与直播关联。",
          href: "/products",
        },
        {
          title: "礼品管理",
          description: "回看礼品资格与结果。",
          href: "/gifts",
        },
      ]);
    case "SHIPPER":
      return appendGrantedQuickEntries(role, permissionCodes, [
        {
          title: "订单中心 / 发货执行",
          description: "进入履约执行台处理任务。",
          href: buildOrderFulfillmentHref("shipping"),
        },
        {
          title: "订单中心 / 批次记录",
          description: "回看导出批次与供货商报单。",
          href: buildOrderFulfillmentHref("batches"),
        },
      ]);
  }
}

function buildSummaryItems(cards: SummaryCard[]): PageSummaryStripItem[] {
  return cards.map((card, index) => ({
    key: `${card.label}-${index}`,
    label: card.label,
    value: card.value,
    note: card.note,
    href: card.href,
    emphasis: index === 0 ? "info" : index === 1 ? "success" : "default",
  }));
}

function MetricGroupSection({
  title,
  description,
  summary,
}: Readonly<{
  title: string;
  description: string;
  summary?: PaymentSummaryData | null;
}>) {
  if (!summary) {
    return null;
  }

  return (
    <SectionCard eyebrow="经营摘要" title={title} description={description}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summary.cards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            note={card.note}
            href={card.href}
          />
        ))}
      </div>
    </SectionCard>
  );
}

export function DashboardWorkbench({
  role,
  permissionCodes = [],
  navigationGroups,
  data,
  extraCards = [],
}: Readonly<{
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
  navigationGroups: NavigationGroup[];
  data: DashboardDataShape;
  extraCards?: SummaryCard[];
}>) {
  const meta = getRoleMeta(role);
  const cards = [...extraCards, ...data.cards];
  const quickEntries = getQuickEntries(role, permissionCodes);

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow={meta.eyebrow}
          title={meta.title}
          description={undefined}
          meta={
            <>
              <StatusBadge label={meta.roleNote} variant="info" />
              <StatusBadge label={meta.boundary} variant="neutral" />
            </>
          }
          className="px-4 py-2 md:px-5 md:py-2.5"
        />
      }
      summary={<PageSummaryStrip items={buildSummaryItems(cards)} className="gap-1.5" />}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <SectionCard
          title="关键入口"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {quickEntries.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[0.96rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-3.5 py-3 transition-colors hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{item.title}</p>
                    <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">{item.description}</p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 text-[var(--color-sidebar-muted)]" />
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="业务域"
        >
          <div className="space-y-3">
            {navigationGroups
              .filter((group) => group.key !== "workspace")
              .map((group) => (
                <div
                  key={group.key}
                  className="rounded-[0.96rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3"
                >
                  <p className="text-sm font-semibold text-[var(--foreground)]">{group.title}</p>
                  <p className="mt-1 text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">{group.description}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {group.sections
                      .flatMap((section) => section.items)
                      .slice(0, 4)
                      .map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] text-[var(--crm-badge-neutral-text)] transition-colors hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--color-accent)]"
                        >
                          {item.title}
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <SectionCard
          eyebrow="经营转化"
          title="核心转化指标"
          description={
            data.conversions
              ? `${data.conversions.windowLabel} · ${data.conversions.scopeLabel}`
              : "当前角色不展示完整销售转化口径。"
          }
        >
          {data.conversions ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.conversions.metrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  note={`${metric.note}（${metric.numerator} / ${metric.denominator}）`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="当前角色不展示完整转化漏斗"
              description="该角色只保留岗位相关摘要，不开放完整的销售团队转化分析。"
            />
          )}
        </SectionCard>

        <SectionCard
          eyebrow="组织排行"
          title="员工排行"
          description={
            data.ranking
              ? `${data.ranking.windowLabel} · ${data.ranking.description}`
              : "当前角色不展示团队排行。"
          }
        >
          {data.ranking ? (
            <EntityTable
              dense
              columns={[
                {
                  key: "rank",
                  title: "排名",
                  render: (row) => <span className="font-semibold text-[var(--foreground)]">#{row.rank}</span>,
                },
                {
                  key: "member",
                  title: "成员",
                  render: (row) => (
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{row.name}</p>
                      <p className="text-xs text-[var(--color-sidebar-muted)]">@{row.username}</p>
                    </div>
                  ),
                },
                {
                  key: "activity",
                  title: "活跃度",
                  render: (row) => (
                    <div className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                      <div>跟进 {row.followUpCount}</div>
                      <div>邀约 {row.invitationCount}</div>
                    </div>
                  ),
                },
                {
                  key: "result",
                  title: "结果",
                  render: (row) => (
                    <div className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                      <div>成交 {row.dealCount}</div>
                      <div>加微 {row.wechatAddedCount}</div>
                    </div>
                  ),
                },
              ]}
              rows={data.ranking.items}
              getRowKey={(row) => row.userId}
            />
          ) : (
            <EmptyState
              title="当前角色不展示排行"
              description="该角色只保留岗位摘要，不开放团队排行信息。"
            />
          )}
        </SectionCard>
      </div>

      <MetricGroupSection
        title="支付层摘要"
        description="保持支付层与订单、履约分层，首屏之后再看细分口径。"
        summary={data.paymentSummary}
      />

      <MetricGroupSection
        title="履约摘要"
        description="履约指标独立于交易和收款，不把发货状态混回订单单字段。"
        summary={data.fulfillmentSummary}
      />

      <MetricGroupSection
        title="财务预览"
        description="财务视角保持预览层，不替代 payment layer 与 fulfillment layer。"
        summary={data.financeSummary}
      />
    </WorkbenchLayout>
  );
}
