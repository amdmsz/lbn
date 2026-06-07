import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import {
  ArrowUpRight,
  Banknote,
  Briefcase,
  ChevronRight,
  Crown,
  LayoutDashboard,
  PackageCheck,
  Target,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  BentoCard,
  BentoMetricCard,
  BentoMiniStat,
} from "@/components/dashboard/dashboard-bento";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import CollapsibleSection from "@/components/shared/collapsible-section";
import MetricStrip, { type MetricItem } from "@/components/shared/metric-strip";
import { PageHero } from "@/components/shared/page-hero";
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
import { cn } from "@/lib/utils";

type DashboardDataShape = {
  scopeMode: "team" | "personal" | "role" | "restricted";
  cards: SummaryCard[];
  conversions: { windowLabel: string; scopeLabel: string; metrics: ConversionMetric[] } | null;
  ranking: { windowLabel: string; description: string; items: EmployeeRankingItem[] } | null;
  paymentSummary?: PaymentSummaryData | null;
  fulfillmentSummary?: PaymentSummaryData | null;
  financeSummary?: PaymentSummaryData | null;
};

type IconComponent = ComponentType<{ className?: string }>;
type QuickEntry = { title: string; description: string; href: string };

const workspaceShellClassName = "crm-workspace-shell";

const ROLE_META: Record<RoleCode, { title: string; icon: IconComponent; boundary: string }> = {
  ADMIN: { title: "组织工作台", icon: LayoutDashboard, boundary: "组织级视角 · 全量数据" },
  SUPERVISOR: { title: "团队工作台", icon: Users, boundary: "团队级视角 · 含审核" },
  SALES: { title: "个人销售工作台", icon: Briefcase, boundary: "个人视角 · 仅本人客户" },
  OPS: { title: "运营工作台", icon: PackageCheck, boundary: "运营协同" },
  SHIPPER: { title: "履约工作台", icon: Truck, boundary: "履约执行" },
  FINANCE: { title: "财务工作台", icon: Wallet, boundary: "财务审批 · 反向凭证" },
};

const QUICK_ENTRIES_BY_ROLE: Record<RoleCode, QuickEntry[]> = {
  ADMIN: [
    { title: "客户中心", description: "看组织、团队与销售层级客户经营。", href: "/customers" },
    { title: "订单中心 / 交易单", description: "看审核、交易结构和异常订单。", href: buildOrderFulfillmentHref("trade-orders") },
    { title: "订单中心 / 发货执行", description: "看履约执行状态与报单节奏。", href: buildOrderFulfillmentHref("shipping") },
    { title: "报表中心", description: "看经营、履约和财务预览。", href: "/reports" },
  ],
  SUPERVISOR: [
    { title: "团队客户", description: "进入团队客户视图继续下钻销售。", href: "/customers" },
    { title: "待审核订单", description: "集中处理团队订单审核和结果回看。", href: buildOrderFulfillmentHref("trade-orders", { statusView: "PENDING_REVIEW" }) },
    { title: "催收任务", description: "看团队待收、逾期与回款压力。", href: "/collection-tasks" },
    { title: "履约协同", description: "跟踪团队履约和发货执行。", href: buildOrderFulfillmentHref("shipping") },
  ],
  SALES: [
    { title: "客户中心", description: "今天优先处理客户工作队列。", href: "/customers" },
    { title: "订单中心 / 交易单", description: "回看本人订单审核与成交结果。", href: buildOrderFulfillmentHref("trade-orders") },
    { title: "收款记录", description: "提交和跟踪本人客户收款。", href: "/payment-records" },
    { title: "催收任务", description: "推进尾款、COD 和运费任务。", href: "/collection-tasks" },
  ],
  OPS: [
    { title: "直播场次", description: "承接直播排期与邀约协同。", href: "/live-sessions" },
    { title: "商品中心", description: "配合查看商品信息与直播关联。", href: "/products" },
  ],
  SHIPPER: [
    { title: "订单中心 / 发货执行", description: "进入履约执行台处理任务。", href: buildOrderFulfillmentHref("shipping") },
    { title: "订单中心 / 批次记录", description: "回看导出批次与供货商报单。", href: buildOrderFulfillmentHref("batches") },
  ],
  FINANCE: [
    { title: "退款审批工作台", description: "处理待审批的退款申请, 录入实际出账流水。", href: "/finance/refunds" },
    { title: "收款记录", description: "查看 / 确认销售提交的 PaymentRecord。", href: "/payment-records" },
  ],
};

function getQuickEntries(role: RoleCode, permissionCodes: readonly ExtraPermissionCode[]): QuickEntry[] {
  const items = [...QUICK_ENTRIES_BY_ROLE[role]];
  const hasGrantedLive = canAccessLiveSessionModule(role, permissionCodes) && !canAccessLiveSessionModule(role);
  const hasGrantedProduct = canAccessProductModule(role, permissionCodes) && !canAccessProductModule(role);

  if (hasGrantedLive && !items.some((it) => it.href === "/live-sessions")) {
    items.push({ title: "直播场次", description: "额外授权的协同入口。", href: "/live-sessions" });
  }
  if (hasGrantedProduct && !items.some((it) => it.href === "/products")) {
    items.push({ title: "商品中心", description: "额外授权的商品 / SKU 入口。", href: "/products" });
  }
  return items;
}

function cardToMetric(card: SummaryCard, index: number): MetricItem {
  return {
    label: card.label,
    value: card.value,
    tone: index === 0 ? "primary" : index === 1 ? "success" : "neutral",
  };
}

function SectionTitle({
  icon: Icon,
  title,
  hint,
  actions,
}: Readonly<{ icon: IconComponent; title: string; hint?: string; actions?: ReactNode }>) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
        {hint ? <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {hint}</span> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

function CompactEmpty({ text }: Readonly<{ text: string }>) {
  return (
    <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function RankingList({ items }: Readonly<{ items: EmployeeRankingItem[] }>) {
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.userId} className="grid grid-cols-12 gap-3 rounded-xl border border-border bg-muted/25 p-3">
          <div className="col-span-2 font-mono text-sm font-semibold text-foreground">#{row.rank}</div>
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

function PaymentSummaryBlock({
  icon,
  title,
  summary,
}: Readonly<{ icon: IconComponent; title: string; summary?: PaymentSummaryData | null }>) {
  if (!summary) return null;
  return (
    <BentoCard className="md:col-span-3 lg:col-span-4">
      <SectionTitle icon={icon} title={title} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.cards.map((card) => (
          <BentoMiniStat key={card.label} label={card.label} value={card.value} note={card.note} />
        ))}
      </div>
    </BentoCard>
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
  const meta = ROLE_META[role];
  const cards = [...extraCards, ...data.cards];
  const stripCards = cards.slice(0, 4);
  const restCards = cards.slice(4);
  const quickEntries = getQuickEntries(role, permissionCodes);
  const businessGroups = navigationGroups.filter((g) => g.key !== "workspace");

  return (
    <WorkbenchLayout
      header={
        <div className={workspaceShellClassName}>
          <PageHero
            icon={{ kind: "node", node: <meta.icon className="h-5 w-5" /> }}
            title={meta.title}
            primaryBadge={{ label: meta.boundary, variant: "info" }}
          />
        </div>
      }
    >
      <div className={cn(workspaceShellClassName, "space-y-4")}>
        {stripCards.length > 0 ? (
          <MetricStrip metrics={stripCards.map(cardToMetric)} ariaLabel={`${meta.title}核心指标`} />
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {restCards.map((card, index) => (
            <BentoMetricCard
              key={`${card.label}-${index}`}
              label={card.label}
              value={card.value}
              note={card.note}
              href={card.href}
              tone="muted"
            />
          ))}

          <BentoCard
            className={cn(
              "md:col-span-2 lg:col-span-2",
              restCards.length === 0 ? "lg:row-span-1" : "lg:row-span-2",
            )}
          >
            <SectionTitle icon={Target} title="关键入口" />
            <div className="grid gap-3 md:grid-cols-2">
              {quickEntries.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs leading-5 text-muted-foreground">{item.description}</p>
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </BentoCard>

          <BentoCard className="md:col-span-3 lg:col-span-2">
            <SectionTitle
              icon={Target}
              title="核心转化指标"
              hint={data.conversions ? `${data.conversions.windowLabel} · ${data.conversions.scopeLabel}` : undefined}
            />
            {data.conversions ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.conversions.metrics.map((m) => (
                  <BentoMiniStat
                    key={m.label}
                    label={m.label}
                    value={m.value}
                    note={`${m.note} (${m.numerator} / ${m.denominator})`}
                  />
                ))}
              </div>
            ) : (
              <CompactEmpty text="当前角色不展示完整转化漏斗。" />
            )}
          </BentoCard>

          <BentoCard className="md:col-span-3 lg:col-span-2">
            <SectionTitle
              icon={Crown}
              title="员工排行"
              hint={data.ranking ? `${data.ranking.windowLabel} · ${data.ranking.description}` : undefined}
              actions={
                data.ranking ? (
                  <Link
                    href="/reports"
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    报表
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null
              }
            />
            {data.ranking ? <RankingList items={data.ranking.items} /> : <CompactEmpty text="当前角色不展示团队排行。" />}
          </BentoCard>

          <PaymentSummaryBlock icon={Banknote} title="支付层摘要" summary={data.paymentSummary} />
          <PaymentSummaryBlock icon={Truck} title="履约摘要" summary={data.fulfillmentSummary} />
          <PaymentSummaryBlock icon={Wallet} title="财务预览" summary={data.financeSummary} />
        </div>

        {businessGroups.length > 0 ? (
          <CollapsibleSection
            title="业务域导航"
            description={`${businessGroups.length} 个域 · 展开查看分组入口`}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {businessGroups.map((group) => (
                <div key={group.key} className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{group.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{group.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {group.sections
                      .flatMap((section) => section.items)
                      .slice(0, 8)
                      .map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="inline-flex h-7 items-center rounded-full border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted hover:text-primary"
                        >
                          {item.title}
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        ) : null}
      </div>
    </WorkbenchLayout>
  );
}
