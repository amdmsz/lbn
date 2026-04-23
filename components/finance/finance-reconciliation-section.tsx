import { EmptyState } from "@/components/shared/empty-state";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  getCollectionTaskStatusLabel,
  getCollectionTaskStatusVariant,
  getCollectionTaskTypeLabel,
  getPaymentCollectionChannelLabel,
  getPaymentPlanSubjectLabel,
  getPaymentSourceLabel,
} from "@/lib/payments/metadata";

type FinanceCard = {
  label: string;
  value: string;
  note: string;
  href?: string;
};

type FinanceMetricDefinition = {
  label: string;
  description: string;
};

type FinanceSourceBreakdownItem = {
  sourceType: "SALES_ORDER" | "GIFT_RECORD";
  subjectType: "GOODS" | "FREIGHT";
  collectionChannel: "PREPAID" | "COD";
  plannedAmount: string;
  confirmedAmount: string;
  remainingAmount: string;
  count: number;
};

type FinanceCollectionTaskBreakdownItem = {
  taskType:
    | "BALANCE_COLLECTION"
    | "COD_COLLECTION"
    | "FREIGHT_COLLECTION"
    | "GENERAL_COLLECTION";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  count: number;
};

function toSummaryItems(cards: FinanceCard[]): PageSummaryStripItem[] {
  return cards.map((card, index) => ({
    key: `${card.label}-${index}`,
    label: card.label,
    value: card.value,
    note: card.note,
    href: card.href,
    emphasis: "default",
  }));
}

export function FinanceReconciliationSection({
  scopeLabel,
  summaryCards,
  operationalCards,
  metricDefinitions,
  sourceBreakdown,
  collectionTaskBreakdown,
}: Readonly<{
  scopeLabel: string;
  summaryCards: FinanceCard[];
  operationalCards: FinanceCard[];
  metricDefinitions: FinanceMetricDefinition[];
  sourceBreakdown: FinanceSourceBreakdownItem[];
  collectionTaskBreakdown: FinanceCollectionTaskBreakdownItem[];
}>) {
  return (
    <div className="space-y-4">
      <PageSummaryStrip
        items={toSummaryItems(summaryCards)}
        className="gap-2.5 xl:grid-cols-4"
      />

      <PageSummaryStrip
        items={toSummaryItems(operationalCards)}
        className="gap-2.5 xl:grid-cols-4"
      />

      <SectionCard
        title="指标口径"
        description={`${scopeLabel} · 只读聚合 payment 与 collection。`}
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        <div className="grid gap-2.5 md:grid-cols-2">
          {metricDefinitions.map((item) => (
            <div
              key={item.label}
              className="rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 shadow-[var(--color-shell-shadow-sm)]"
            >
              <p className="text-sm font-medium text-[var(--foreground)]">
                {item.label}
              </p>
              <p className="mt-1.5 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="PaymentPlan 聚合"
        description="按来源、标的与渠道查看应收、已确认与待收。"
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        {sourceBreakdown.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[12px] text-[var(--color-sidebar-muted)]">
              共 {sourceBreakdown.length} 个来源组合
            </p>

            <div className="crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>来源</th>
                    <th>标的</th>
                    <th>渠道</th>
                    <th>计划数</th>
                    <th>应收金额</th>
                    <th>已确认金额</th>
                    <th>待收金额</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceBreakdown.map((item) => (
                    <tr
                      key={`${item.sourceType}-${item.subjectType}-${item.collectionChannel}`}
                    >
                      <td className="font-medium text-[var(--foreground)]">
                        {getPaymentSourceLabel(item.sourceType)}
                      </td>
                      <td>{getPaymentPlanSubjectLabel(item.subjectType)}</td>
                      <td>
                        {getPaymentCollectionChannelLabel(
                          item.collectionChannel,
                        )}
                      </td>
                      <td>{item.count}</td>
                      <td>{item.plannedAmount}</td>
                      <td>{item.confirmedAmount}</td>
                      <td>{item.remainingAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            title="暂无可对账计划"
            description="当前范围内没有可用于对账预览的 PaymentPlan。"
          />
        )}
      </SectionCard>

      <SectionCard
        title="CollectionTask 聚合"
        description="只看 finance 视角下的催收任务分布。"
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        {collectionTaskBreakdown.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[12px] text-[var(--color-sidebar-muted)]">
              共 {collectionTaskBreakdown.length} 个任务分组
            </p>

            <div className="crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>任务类型</th>
                    <th>状态</th>
                    <th>数量</th>
                  </tr>
                </thead>
                <tbody>
                  {collectionTaskBreakdown.map((item) => (
                    <tr key={`${item.taskType}-${item.status}`}>
                      <td className="font-medium text-[var(--foreground)]">
                        {getCollectionTaskTypeLabel(item.taskType)}
                      </td>
                      <td>
                        <StatusBadge
                          label={getCollectionTaskStatusLabel(item.status)}
                          variant={getCollectionTaskStatusVariant(item.status)}
                        />
                      </td>
                      <td>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            title="暂无催收任务分布"
            description="当前范围内没有 CollectionTask，或全部任务已被排除在 finance scope 之外。"
          />
        )}
      </SectionCard>
    </div>
  );
}
