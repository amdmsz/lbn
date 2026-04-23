import Link from "next/link";
import type { SalesRepBoardItem } from "@/lib/customers/queries";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";

const boardMetricClassName =
  "rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3 shadow-[var(--color-shell-shadow-sm)]";

export function SalesRepBoard({
  items,
  selectedSalesId,
  buildSalesHref,
}: Readonly<{
  items: SalesRepBoardItem[];
  selectedSalesId?: string;
  buildSalesHref: (salesId: string) => string;
}>) {
  return (
    <SectionCard
      eyebrow="销售承接"
      title="销售承接看板"
      description="先看每位销售当前客户负载和关键待办，再下钻到该销售名下客户列表。"
      anchorId="sales-board"
    >
      {items.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {items.map((sales) => {
            const isActive = selectedSalesId === sales.id;

            return (
              <article
                key={sales.id}
                className={[
                  "crm-card-muted space-y-4 border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow]",
                  isActive
                    ? "border-[rgba(122,154,255,0.2)] bg-[var(--color-shell-hover)] shadow-[var(--color-shell-shadow-md)]"
                    : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-[var(--foreground)]">
                        {sales.name}
                      </h3>
                      <StatusBadge label={`@${sales.username}`} variant="neutral" />
                    </div>
                    <p className="text-sm text-[var(--color-sidebar-muted)]">
                      {sales.teamName ? `${sales.teamName} · 销售工作台` : "销售工作台"}
                    </p>
                  </div>

                  <Link
                    href={buildSalesHref(sales.id)}
                    scroll={false}
                    className="crm-button crm-button-secondary"
                  >
                    {isActive ? "查看客户中" : "进入客户层"}
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={boardMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      当前客户数
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {sales.customerCount}
                    </p>
                  </div>
                  <div className={boardMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      新导入客户
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {sales.todayNewImportedCount}
                    </p>
                  </div>
                  <div className={boardMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      待首呼
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {sales.pendingFirstCallCount}
                    </p>
                  </div>
                  <div className={boardMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      待回访
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {sales.pendingFollowUpCount}
                    </p>
                  </div>
                  <div className={`${boardMetricClassName} sm:col-span-2`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                          待成交
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                          {sales.pendingDealCount}
                        </p>
                      </div>
                      <div className="text-right text-sm text-[var(--color-sidebar-muted)]">
                        <p className="font-medium text-[var(--foreground)]">最近跟进</p>
                        <p className="mt-1">
                          {sales.latestFollowUpAt
                            ? formatDateTime(sales.latestFollowUpAt)
                            : "暂无跟进记录"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="暂无销售成员"
          description="当前层级下还没有可以查看客户承接情况的销售成员。"
        />
      )}
    </SectionCard>
  );
}
