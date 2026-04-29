import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import {
  BentoCard,
  BentoGrid,
  BentoMetricCard,
  BentoMiniStat,
} from "@/components/dashboard/dashboard-bento";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
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

const workspaceShellClassName = "crm-workspace-shell";

function getRoleMeta(role: RoleCode) {
  switch (role) {
    case "ADMIN":
      return {
        eyebrow: "组织驾驶舱",
        title: "组织工作台",
        roleNote: "组织级视角",
        boundary: "可查看全量组织数据与系统设置。",
      };
    case "SUPERVISOR":
      return {
        eyebrow: "团队经营台",
        title: "团队工作台",
        roleNote: "团队级视角",
        boundary: "仅查看本人团队范围，保留审核与协同权限。",
      };
    case "SALES":
      return {
        eyebrow: "个人客户工作台",
        title: "个人销售工作台",
        roleNote: "个人视角",
        boundary: "只看本人客户，不进入团队级经营或履约执行台。",
      };
    case "OPS":
      return {
        eyebrow: "运营协同台",
        title: "运营工作台",
        roleNote: "运营协同",
        boundary: "不扩展销售客户和收款权限。",
      };
    case "SHIPPER":
      return {
        eyebrow: "履约执行台",
        title: "履约工作台",
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
    <BentoCard
      eyebrow="经营摘要"
      title={title}
      description={description}
      className="md:col-span-3 lg:col-span-4"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.cards.map((card) => (
          <BentoMiniStat
            key={card.label}
            label={card.label}
            value={card.value}
            note={card.note}
          />
        ))}
      </div>
    </BentoCard>
  );
}

function RankingList({
  ranking,
}: Readonly<{
  ranking: NonNullable<DashboardDataShape["ranking"]>;
}>) {
  return (
    <div className="space-y-2">
      {ranking.items.map((row) => (
        <div
          key={row.userId}
          className="grid grid-cols-12 gap-3 rounded-2xl border border-border bg-muted/25 p-3"
        >
          <div className="col-span-2 font-mono text-sm font-semibold text-foreground">
            #{row.rank}
          </div>
          <div className="col-span-5 min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
            <p className="text-xs text-muted-foreground">@{row.username}</p>
          </div>
          <div className="col-span-5 text-right text-xs leading-5 text-muted-foreground">
            <div>跟进 {row.followUpCount} · 邀约 {row.invitationCount}</div>
            <div>成交 {row.dealCount} · 加微 {row.wechatAddedCount}</div>
          </div>
        </div>
      ))}
    </div>
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
        <div className={workspaceShellClassName}>
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
            className="border-border bg-card px-4 py-3 shadow-sm md:px-5"
          />
        </div>
      }
    >
      <div className={workspaceShellClassName}>
        <BentoGrid>
          {cards.map((card, index) => (
            <BentoMetricCard
              key={`${card.label}-${index}`}
              label={card.label}
              value={card.value}
              note={card.note}
              href={card.href}
              tone={index === 0 ? "primary" : index === 1 ? "success" : "muted"}
            />
          ))}

          <BentoCard
            title="关键入口"
            className="md:col-span-2 lg:col-span-2 lg:row-span-2"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {quickEntries.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-2xl border border-border bg-muted/25 px-4 py-3 transition hover:border-primary/30 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
                  </div>
                </Link>
              ))}
            </div>
          </BentoCard>

          <BentoCard title="业务域" className="md:col-span-1 lg:col-span-2">
            <div className="space-y-3">
              {navigationGroups
                .filter((group) => group.key !== "workspace")
                .map((group) => (
                  <div
                    key={group.key}
                    className="rounded-2xl border border-border bg-muted/25 px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-foreground">{group.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {group.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {group.sections
                        .flatMap((section) => section.items)
                        .slice(0, 4)
                        .map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="inline-flex h-7 items-center rounded-full border border-border bg-card px-2.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-primary"
                          >
                            {item.title}
                          </Link>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </BentoCard>

          <BentoCard
            eyebrow="经营转化"
            title="核心转化指标"
            description={
              data.conversions
                ? `${data.conversions.windowLabel} · ${data.conversions.scopeLabel}`
                : "当前角色不展示完整销售转化口径。"
            }
            className="md:col-span-3 lg:col-span-2"
          >
            {data.conversions ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.conversions.metrics.map((metric) => (
                  <BentoMiniStat
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    note={`${metric.note} (${metric.numerator} / ${metric.denominator})`}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="当前角色不展示完整转化漏斗"
                description="该角色只保留岗位相关摘要，不开放完整的销售团队转化分析。"
              />
            )}
          </BentoCard>

          <BentoCard
            eyebrow="组织排行"
            title="员工排行"
            description={
              data.ranking
                ? `${data.ranking.windowLabel} · ${data.ranking.description}`
                : "当前角色不展示团队排行。"
            }
            actions={
              data.ranking ? (
                <Link
                  href="/reports"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  报表
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ) : null
            }
            className="md:col-span-3 lg:col-span-2"
          >
            {data.ranking ? (
              <RankingList ranking={data.ranking} />
            ) : (
              <EmptyState
                title="当前角色不展示排行"
                description="该角色只保留岗位摘要，不开放团队排行信息。"
              />
            )}
          </BentoCard>

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
        </BentoGrid>
      </div>
    </WorkbenchLayout>
  );
}
