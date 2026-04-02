import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
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
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} href={card.href} />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Object.entries(groupedCounts).map(([kind, count]) => (
          <section key={kind} className="crm-subtle-panel">
            <p className="crm-eyebrow">{getExceptionKindLabel(kind as FinanceExceptionKind)}</p>
            <p className="mt-3 text-2xl font-semibold text-black/84">{count}</p>
          </section>
        ))}
      </div>

      <div className="crm-subtle-panel">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={scopeLabel} variant="info" />
          <StatusBadge label="来源说明已展开" variant="warning" />
          <StatusBadge label="所有异常均提供跳转入口" variant="success" />
        </div>
      </div>

      {items.length > 0 ? (
        <div className="crm-table-shell">
          <table className="crm-table">
            <thead>
              <tr>
                <th>异常类型</th>
                <th>来源单据</th>
                <th>来源说明</th>
                <th>优先级</th>
                <th>跳转</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.sourceKey}>
                  <td>
                    <div className="font-medium text-black/82">{item.title}</div>
                    <div className="mt-1 text-xs text-black/45">
                      {getExceptionKindLabel(item.kind)}
                    </div>
                  </td>
                  <td>
                    <div className="font-medium text-black/82">{item.sourceLabel}</div>
                    <div className="mt-1 text-xs text-black/45">{item.sourceDescription}</div>
                  </td>
                  <td>
                    <div className="text-sm leading-7 text-black/62">{item.explanation}</div>
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
    </div>
  );
}
