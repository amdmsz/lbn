import { EmptyState } from "@/components/shared/empty-state";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { SectionCard } from "@/components/shared/section-card";
import type {
  ConversionMetric,
  EmployeeRankingItem,
  PaymentSummaryData,
  ReportDefinition,
  SummaryCard,
} from "@/lib/reports/queries";

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

function toSummaryItems(
  cards: SummaryCard[],
  emphasis: PageSummaryStripItem["emphasis"] = "default",
): PageSummaryStripItem[] {
  return cards.map((card, index) => ({
    key: `${card.label}-${index}`,
    label: card.label,
    value: card.value,
    note: card.note,
    href: card.href,
    emphasis,
  }));
}

function toConversionItems(
  metrics: ConversionMetric[],
): PageSummaryStripItem[] {
  return metrics.map((metric, index) => ({
    key: `${metric.label}-${index}`,
    label: metric.label,
    value: metric.value,
    note: `${metric.note} · ${metric.numerator}/${metric.denominator}`,
    emphasis: "default",
  }));
}

function DomainSummaryCard({
  title,
  description,
  summary,
  emphasis = "default",
}: Readonly<{
  title: string;
  description: string;
  summary: PaymentSummaryData;
  emphasis?: PageSummaryStripItem["emphasis"];
}>) {
  return (
    <SectionCard
      title={title}
      description={description}
      density="compact"
      className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
      contentClassName="p-3 md:p-4"
    >
      <PageSummaryStrip
        items={toSummaryItems(summary.cards, emphasis)}
        className="gap-2.5 xl:grid-cols-3"
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
      <PageSummaryStrip
        items={toSummaryItems(cards)}
        className="gap-2.5 2xl:grid-cols-5"
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {fulfillmentSummary ? (
          <DomainSummaryCard
            title="履约摘要"
            description={fulfillmentSummary.description}
            summary={fulfillmentSummary}
            emphasis="info"
          />
        ) : null}

        {paymentSummary ? (
          <DomainSummaryCard
            title="支付摘要"
            description={paymentSummary.description}
            summary={paymentSummary}
            emphasis="success"
          />
        ) : null}

        {financeSummary ? (
          <DomainSummaryCard
            title="财务预览"
            description={financeSummary.description}
            summary={financeSummary}
            emphasis="warning"
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
          <PageSummaryStrip
            items={toConversionItems(conversions.metrics)}
            className="gap-2.5 xl:grid-cols-4"
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
          <div className="grid gap-2.5 md:grid-cols-2">
            {definitions.map((definition) => (
              <div
                key={definition.label}
                className="crm-subtle-panel rounded-[0.98rem] px-4 py-3"
              >
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {definition.label}
                </p>
                <p className="mt-1.5 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
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
