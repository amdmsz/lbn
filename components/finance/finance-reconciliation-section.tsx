import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { FiltersPanel } from "@/components/shared/filters-panel";
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

type SalesOption = {
  id: string;
  name: string;
  username: string;
};

type FinanceReconciliationExportDefaults = {
  salesId: string;
  assignedFrom: string;
  assignedTo: string;
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

const inlineFieldClassName =
  "group flex h-9 min-w-0 items-center gap-2 rounded-[12px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 transition-[border-color,background-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-sm)] focus-within:border-[var(--color-accent-soft)] focus-within:bg-[var(--color-shell-hover)] focus-within:shadow-[var(--color-shell-shadow-sm)]";

function InlineSelectControl({
  label,
  name,
  defaultValue,
  children,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}>) {
  return (
    <label className={inlineFieldClassName}>
      <span className="shrink-0 text-[12px] font-medium text-[var(--color-sidebar-muted)]">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="crm-select h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 pr-5 text-[13px] text-[var(--foreground)] shadow-none outline-none focus:ring-0"
      >
        {children}
      </select>
    </label>
  );
}

function InlineDateControl({
  label,
  name,
  defaultValue,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: string;
}>) {
  return (
    <label className={inlineFieldClassName}>
      <span className="shrink-0 text-[12px] font-medium text-[var(--color-sidebar-muted)]">
        {label}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[13px] text-[var(--foreground)] outline-none focus:ring-0"
      />
    </label>
  );
}

export function FinanceReconciliationSection({
  scopeLabel,
  summaryCards,
  operationalCards,
  metricDefinitions,
  sourceBreakdown,
  collectionTaskBreakdown,
  salesOptions,
  exportDefaults,
}: Readonly<{
  scopeLabel: string;
  summaryCards: FinanceCard[];
  operationalCards: FinanceCard[];
  metricDefinitions: FinanceMetricDefinition[];
  sourceBreakdown: FinanceSourceBreakdownItem[];
  collectionTaskBreakdown: FinanceCollectionTaskBreakdownItem[];
  salesOptions: SalesOption[];
  exportDefaults: FinanceReconciliationExportDefaults;
}>) {
  return (
    <div className="space-y-4">
      <FiltersPanel
        title="客户对账导出"
        description="按销售员和客户分配日期导出客户、沟通、商品、订单、付款与物流摘要。"
        density="compact"
        className="rounded-[0.95rem] border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)]"
      >
        <form
          method="get"
          action="/finance/reconciliation/export"
          className="space-y-2.5"
        >
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(2,minmax(0,0.82fr))_auto]">
            <InlineSelectControl
              label="销售员"
              name="salesId"
              defaultValue={exportDefaults.salesId}
            >
              <option value="">全部销售</option>
              {salesOptions.map((sales) => (
                <option key={sales.id} value={sales.id}>
                  {sales.name || sales.username}
                </option>
              ))}
            </InlineSelectControl>

            <InlineDateControl
              label="开始"
              name="assignedFrom"
              defaultValue={exportDefaults.assignedFrom}
            />
            <InlineDateControl
              label="结束"
              name="assignedTo"
              defaultValue={exportDefaults.assignedTo}
            />

            <button
              type="submit"
              className="crm-button crm-button-primary inline-flex min-h-9 items-center justify-center gap-2 px-3 py-2 text-sm md:col-span-2 xl:col-span-1"
            >
              <Download className="h-4 w-4" />
              导出 CSV
            </button>
          </div>
          <p className="text-[12px] text-[var(--color-sidebar-muted)]">
            {scopeLabel} · 日期口径：客户最新分配到当前销售的时间。
          </p>
        </form>
      </FiltersPanel>

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
