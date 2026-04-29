import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { SmartLink } from "@/components/shared/smart-link";
import type {
  ConversionMetric,
  EmployeeRankingItem,
  PaymentSummaryData,
  ReportDefinition,
  SummaryCard,
} from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type ConversionSection = {
  windowLabel: string;
  scopeLabel: string;
  metrics: ConversionMetric[];
} | null;

type RankingSection = {
  windowLabel: string;
  description: string;
  items: EmployeeRankingItem[];
} | null;

type ReportMetricTone = "default" | "info" | "success" | "warning";

type ReportMetricItem = {
  key?: string;
  label: string;
  value: string;
  note?: string;
  href?: string;
  tone?: ReportMetricTone;
};

const reportMetricToneClassName: Record<ReportMetricTone, string> = {
  default: "hover:border-primary/30",
  info: "hover:border-primary/35",
  success: "hover:border-emerald-400/40",
  warning: "hover:border-amber-400/40",
};

type ReportMetricVariant = "panel" | "bare";
type ReportMetricDensity = "large" | "compact";

function toSummaryItems(
  cards: SummaryCard[],
  tone: ReportMetricTone = "default",
): ReportMetricItem[] {
  return cards.map((card, index) => ({
    key: `${card.label}-${index}`,
    label: card.label,
    value: card.value,
    note: card.note,
    href: card.href,
    tone,
  }));
}

function toConversionItems(metrics: ConversionMetric[]): ReportMetricItem[] {
  return metrics.map((metric, index) => ({
    key: `${metric.label}-${index}`,
    label: metric.label,
    value: metric.value,
    note: `${metric.note} · ${metric.numerator}/${metric.denominator}`,
    tone: "default",
  }));
}

function ReportMetricTile({
  item,
  variant = "panel",
  density = "large",
}: Readonly<{
  item: ReportMetricItem;
  variant?: ReportMetricVariant;
  density?: ReportMetricDensity;
}>) {
  const isBare = variant === "bare";
  const tileClassName = cn(
    "group flex min-w-0 flex-col justify-between",
    isBare
      ? "min-h-[5.75rem]"
      : "min-h-[8.25rem] rounded-xl border border-border/40 bg-background/50 p-4 transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-[1px] hover:bg-background hover:shadow-sm",
    !isBare ? reportMetricToneClassName[item.tone ?? "default"] : "",
  );
  const content = (
    <div className={tileClassName}>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {item.label}
        </p>
        <p
          className={cn(
            "whitespace-nowrap font-mono font-bold tracking-tighter text-foreground",
            density === "compact" ? "text-2xl" : "text-3xl",
          )}
        >
          {item.value}
        </p>
      </div>
      {item.note ? (
        <p
          title={item.note}
          className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground/50"
        >
          {item.note}
        </p>
      ) : null}
    </div>
  );

  if (!item.href) {
    return content;
  }

  return (
    <SmartLink href={item.href} className="block h-full">
      {content}
    </SmartLink>
  );
}

function ReportMetricGrid({
  items,
  className,
  variant = "panel",
  density = "large",
}: Readonly<{
  items: ReportMetricItem[];
  className?: string;
  variant?: ReportMetricVariant;
  density?: ReportMetricDensity;
}>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((item, index) => (
        <ReportMetricTile
          key={item.key ?? `${item.label}-${index}`}
          item={item}
          variant={variant}
          density={density}
        />
      ))}
    </div>
  );
}

function DomainSummaryCard({
  title,
  description,
  summary,
  tone = "default",
}: Readonly<{
  title: string;
  description: string;
  summary: PaymentSummaryData;
  tone?: ReportMetricTone;
}>) {
  return (
    <SectionCard
      title={title}
      description={description}
      density="compact"
      className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
      contentClassName="p-3 md:p-4"
    >
      <ReportMetricGrid
        items={toSummaryItems(summary.cards, tone)}
        variant="bare"
        density="compact"
        className="grid-cols-2 gap-6 lg:grid-cols-3 xl:grid-cols-3"
      />
    </SectionCard>
  );
}

export function ReportOverview({
  cards,
  conversions,
  ranking,
  paymentSummary,
  fulfillmentSummary,
  financeSummary,
  definitions,
  scopeLabel,
  restrictedMessage,
}: Readonly<{
  cards: SummaryCard[];
  conversions: ConversionSection;
  ranking: RankingSection;
  paymentSummary?: PaymentSummaryData | null;
  fulfillmentSummary?: PaymentSummaryData | null;
  financeSummary?: PaymentSummaryData | null;
  definitions?: ReportDefinition[];
  scopeLabel: string;
  restrictedMessage?: string;
}>) {
  return (
    <div className="space-y-4">
      <ReportMetricGrid
        items={toSummaryItems(cards)}
        className="2xl:grid-cols-5"
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {fulfillmentSummary ? (
          <DomainSummaryCard
            title="履约摘要"
            description={fulfillmentSummary.description}
            summary={fulfillmentSummary}
            tone="info"
          />
        ) : null}

        {paymentSummary ? (
          <DomainSummaryCard
            title="支付摘要"
            description={paymentSummary.description}
            summary={paymentSummary}
            tone="success"
          />
        ) : null}

        {financeSummary ? (
          <DomainSummaryCard
            title="财务预览"
            description={financeSummary.description}
            summary={financeSummary}
            tone="warning"
          />
        ) : null}
      </div>

      <SectionCard
        title="转化概览"
        description={
          conversions
            ? `${conversions.windowLabel} · ${conversions.scopeLabel}`
            : `当前视角：${scopeLabel}`
        }
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        {conversions ? (
          <ReportMetricGrid
            items={toConversionItems(conversions.metrics)}
            variant="bare"
            density="compact"
            className="grid-cols-2 gap-6 lg:grid-cols-4 xl:grid-cols-4"
          />
        ) : (
          <EmptyState
            title="当前角色不展示完整销售转化指标"
            description={
              restrictedMessage ??
              "该角色只保留岗位相关的执行摘要，不开放完整销售漏斗和团队转化报表。"
            }
          />
        )}
      </SectionCard>

      <SectionCard
        title="员工排行"
        description={
          ranking
            ? `${ranking.windowLabel} · ${ranking.description}`
            : `当前视角：${scopeLabel}`
        }
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        {ranking && ranking.items.length > 0 ? (
          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>员工</th>
                  <th>跟进数</th>
                  <th>成交数</th>
                  <th>邀约数</th>
                  <th>加微数</th>
                </tr>
              </thead>
              <tbody>
                {ranking.items.map((item) => (
                  <tr key={item.userId}>
                    <td className="font-medium text-[var(--foreground)]">
                      #{item.rank}
                    </td>
                    <td>
                      <div className="font-medium text-[var(--foreground)]">
                        {item.name}
                      </div>
                      <div className="text-xs text-[var(--color-sidebar-muted)]">
                        @{item.username}
                      </div>
                    </td>
                    <td>{item.followUpCount}</td>
                    <td>{item.dealCount}</td>
                    <td>{item.invitationCount}</td>
                    <td>{item.wechatAddedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              ranking
                ? "当前统计窗口暂无员工排行数据"
                : "当前角色不展示团队员工排行"
            }
            description={
              ranking
                ? "近 30 天内还没有可用于排行的跟进、成交、邀约或加微数据。"
                : "销售角色只看个人摘要；OPS 和 SHIPPER 默认不获得销售团队排行。"
            }
          />
        )}
      </SectionCard>

      {definitions ? (
        <SectionCard
          title="口径"
          description="仅保留当前正式模型下的统计定义。"
          density="compact"
          className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
          contentClassName="p-3 md:p-4"
        >
          <div className="grid gap-x-8 md:grid-cols-2">
            {definitions.map((definition) => (
              <div
                key={definition.label}
                className="mb-3 border-b border-border/30 pb-3"
              >
                <p className="text-sm font-semibold text-foreground">
                  {definition.label}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {definition.description}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
