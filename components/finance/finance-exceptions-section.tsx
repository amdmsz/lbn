import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import type {
  FinanceExceptionKind,
  FinanceExceptionSeverity,
} from "@/lib/finance/queries";

type FinanceCard = {
  label: string;
  value: string;
  note: string;
  href?: string;
};

type FinanceExceptionItem = {
  kind: FinanceExceptionKind;
  severity: FinanceExceptionSeverity;
  title: string;
  sourceKey: string;
  sourceLabel: string;
  sourceDescription: string;
  explanation: string;
  href: string;
  hrefLabel: string;
  createdAt: Date | null;
};

const orderedExceptionKinds: FinanceExceptionKind[] = [
  "SHIPPED_WITHOUT_PAYMENT_PLAN",
  "DELIVERED_COD_UNPAID",
  "REJECTED_ORDER_ACTIVE_COLLECTION",
  "STALE_GIFT_FREIGHT_COLLECTION",
  "PAYMENT_PLAN_ORDER_MISMATCH",
];

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

function getExceptionKindLabel(kind: FinanceExceptionKind) {
  switch (kind) {
    case "SHIPPED_WITHOUT_PAYMENT_PLAN":
      return "已发货无计划";
    case "DELIVERED_COD_UNPAID":
      return "签收后 COD 未回款";
    case "REJECTED_ORDER_ACTIVE_COLLECTION":
      return "驳回单仍有催收";
    case "STALE_GIFT_FREIGHT_COLLECTION":
      return "礼品运费待收过久";
    case "PAYMENT_PLAN_ORDER_MISMATCH":
      return "订单摘要不一致";
    default:
      return kind;
  }
}

function getSeverityLabel(severity: FinanceExceptionSeverity) {
  switch (severity) {
    case "danger":
      return "高优先级";
    case "warning":
      return "中优先级";
    case "info":
      return "需核对";
    default:
      return severity;
  }
}

export function FinanceExceptionsSection({
  scopeLabel,
  summaryCards,
  groupedCounts,
  items,
}: Readonly<{
  scopeLabel: string;
  summaryCards: FinanceCard[];
  groupedCounts: Record<FinanceExceptionKind, number>;
  items: FinanceExceptionItem[];
}>) {
  return (
    <div className="space-y-4">
      <PageSummaryStrip
        items={toSummaryItems(summaryCards)}
        className="gap-2.5 xl:grid-cols-3"
      />

      <SectionCard
        title="异常分布"
        description={`${scopeLabel} · 按规则查看当前异常密度。`}
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
          {orderedExceptionKinds.map((kind) => (
            <div
              key={kind}
              className="rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 shadow-[var(--color-shell-shadow-sm)]"
            >
              <p className="text-[11px] font-medium leading-5 text-[var(--color-sidebar-muted)]">
                {getExceptionKindLabel(kind)}
              </p>
              <p className="mt-2 text-[1.5rem] font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                {groupedCounts[kind]}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="异常列表"
        description="统一回流到订单或礼品链路处理。"
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        {items.length > 0 ? (
          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>异常</th>
                  <th>来源</th>
                  <th>说明</th>
                  <th>优先级</th>
                  <th>跳转</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.sourceKey}>
                    <td>
                      <div className="font-medium text-[var(--foreground)]">
                        {item.title}
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-sidebar-muted)]">
                        {getExceptionKindLabel(item.kind)}
                      </div>
                      {item.createdAt ? (
                        <div className="mt-1 text-xs text-[var(--color-sidebar-muted)]">
                          记录时间：{formatDateTime(item.createdAt)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="font-medium text-[var(--foreground)]">
                        {item.sourceLabel}
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-sidebar-muted)]">
                        {item.sourceDescription}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                        {item.explanation}
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        label={getSeverityLabel(item.severity)}
                        variant={item.severity}
                      />
                    </td>
                    <td>
                      <Link href={item.href} className="crm-text-link">
                        {item.hrefLabel}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="暂无财务异常"
            description="当前 finance scope 下没有识别到异常订单、异常收款或异常履约。"
          />
        )}
      </SectionCard>
    </div>
  );
}
