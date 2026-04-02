import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import type {
  ConversionMetric,
  EmployeeRankingItem,
  PaymentSummaryData,
  ReportDefinition,
  SummaryCard,
} from "@/lib/reports/queries";

type ConversionSection =
  | {
      windowLabel: string;
      scopeLabel: string;
      metrics: ConversionMetric[];
    }
  | null;

type RankingSection =
  | {
      windowLabel: string;
      description: string;
      items: EmployeeRankingItem[];
    }
  | null;

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
    <div className="space-y-5">
      <DataTableWrapper
        title="核心摘要"
        description={`按${scopeLabel}展示当前角色最常用的经营与执行指标。`}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {cards.map((card) => (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              note={card.note}
              href={card.href}
            />
          ))}
        </div>
      </DataTableWrapper>

      {fulfillmentSummary ? (
        <DataTableWrapper title="履约摘要" description={fulfillmentSummary.description}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {fulfillmentSummary.cards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                note={card.note}
                href={card.href}
              />
            ))}
          </div>
        </DataTableWrapper>
      ) : null}

      {paymentSummary ? (
        <DataTableWrapper title="支付层摘要" description={paymentSummary.description}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paymentSummary.cards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                note={card.note}
                href={card.href}
              />
            ))}
          </div>
        </DataTableWrapper>
      ) : null}

      {financeSummary ? (
        <DataTableWrapper title="财务预览" description={financeSummary.description}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {financeSummary.cards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                note={card.note}
                href={card.href}
              />
            ))}
          </div>
        </DataTableWrapper>
      ) : null}

      <DataTableWrapper
        title="基础转化指标"
        description={
          conversions
            ? `统计窗口：${conversions.windowLabel} / ${conversions.scopeLabel}`
            : `当前视角：${scopeLabel}`
        }
      >
        {conversions ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {conversions.metrics.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                note={`${metric.note} (${metric.numerator} / ${metric.denominator})`}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="当前角色不展示完整销售转化指标"
            description={
              restrictedMessage ??
              "该角色只保留岗位相关的执行摘要，不开放完整销售漏斗和团队转化报表。"
            }
          />
        )}
      </DataTableWrapper>

      <DataTableWrapper
        title="员工排行"
        description={
          ranking
            ? `${ranking.windowLabel} / ${ranking.description}`
            : `当前视角：${scopeLabel}`
        }
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
                    <td className="font-medium text-black/80">#{item.rank}</td>
                    <td>
                      <div>{item.name}</div>
                      <div className="text-xs text-black/45">@{item.username}</div>
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
      </DataTableWrapper>

      {definitions ? (
        <DataTableWrapper
          title="统计口径"
          description="首页报表只基于现有正式模型做轻量聚合，不引入额外分析体系。"
        >
          <div className="space-y-3">
            {definitions.map((definition) => (
              <div key={definition.label} className="crm-subtle-panel">
                <p className="text-sm font-medium text-black/80">{definition.label}</p>
                <p className="mt-2 text-sm leading-7 text-black/60">
                  {definition.description}
                </p>
              </div>
            ))}
          </div>
        </DataTableWrapper>
      ) : null}
    </div>
  );
}
