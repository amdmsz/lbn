import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  getCollectionTaskStatusLabel,
  getCollectionTaskStatusVariant,
  getCollectionTaskTypeLabel,
  getCollectionTaskTypeVariant,
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
  taskType: "BALANCE_COLLECTION" | "COD_COLLECTION" | "FREIGHT_COLLECTION" | "GENERAL_COLLECTION";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  count: number;
};

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
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} href={card.href} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {operationalCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} href={card.href} />
        ))}
      </div>

      <div className="crm-subtle-panel">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={scopeLabel} variant="info" />
          <StatusBadge label="只读对账预览" variant="warning" />
        </div>
      </div>

      <section className="space-y-4">
        <div className="crm-section-heading">
          <p className="crm-eyebrow">对账口径</p>
          <h2 className="crm-section-title">指标定义</h2>
          <p className="crm-section-copy">
            当前页面只提供 payment layer 与 fulfillment layer 的聚合视图，不承担完整财务记账。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {metricDefinitions.map((item) => (
            <div key={item.label} className="crm-subtle-panel">
              <p className="text-sm font-semibold text-black/82">{item.label}</p>
              <p className="mt-2 text-sm leading-7 text-black/60">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="crm-section-heading">
          <p className="crm-eyebrow">计划拆分</p>
          <h2 className="crm-section-title">PaymentPlan 聚合</h2>
          <p className="crm-section-copy">
            用来源、标的和收款渠道拆开看应收、已确认和待收，帮助人工预览对账结构。
          </p>
        </div>

        {sourceBreakdown.length > 0 ? (
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
                    <td>{getPaymentSourceLabel(item.sourceType)}</td>
                    <td>{getPaymentPlanSubjectLabel(item.subjectType)}</td>
                    <td>{getPaymentCollectionChannelLabel(item.collectionChannel)}</td>
                    <td>{item.count}</td>
                    <td>{item.plannedAmount}</td>
                    <td>{item.confirmedAmount}</td>
                    <td>{item.remainingAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="暂无可对账计划"
            description="当前范围内没有可用于 finance 对账预览的 PaymentPlan。"
          />
        )}
      </section>

      <section className="space-y-4">
        <div className="crm-section-heading">
          <p className="crm-eyebrow">任务拆分</p>
          <h2 className="crm-section-title">CollectionTask 聚合</h2>
          <p className="crm-section-copy">
            这里不替代催收工作台，只展示对账视角下的任务数量分布。
          </p>
        </div>

        {collectionTaskBreakdown.length > 0 ? (
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
                    <td>
                      <StatusBadge
                        label={getCollectionTaskTypeLabel(item.taskType)}
                        variant={getCollectionTaskTypeVariant(item.taskType)}
                      />
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
        ) : (
          <EmptyState
            title="暂无催收任务分布"
            description="当前范围内没有 CollectionTask，或全部任务已被排除在 finance scope 之外。"
          />
        )}
      </section>
    </div>
  );
}
