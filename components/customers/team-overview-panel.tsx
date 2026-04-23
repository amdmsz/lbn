import Link from "next/link";
import type { TeamOverviewItem } from "@/lib/customers/queries";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";

const teamMetricClassName =
  "rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3 shadow-[var(--color-shell-shadow-sm)]";

export function TeamOverviewPanel({
  items,
  selectedTeamId,
  buildTeamHref,
}: Readonly<{
  items: TeamOverviewItem[];
  selectedTeamId?: string;
  buildTeamHref: (teamId: string) => string;
}>) {
  return (
    <SectionCard
      eyebrow="组织视图"
      title="团队客户分布"
      description="从组织层先看各团队承接量、待跟进压力和当前主管归属，再继续下钻到销售。"
      anchorId="team-overview"
    >
      {items.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((team) => {
            const isActive = selectedTeamId === team.id;

            return (
              <article
                key={team.id}
                className={[
                  "crm-card-muted space-y-4 border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow]",
                  isActive
                    ? "border-[rgba(122,154,255,0.2)] bg-[var(--color-shell-hover)] shadow-[var(--color-shell-shadow-md)]"
                    : "",
                ].join(" ")}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[var(--foreground)]">
                        {team.name}
                      </h3>
                      <StatusBadge label={team.code} variant="neutral" />
                      <StatusBadge label={`${team.salesCount} 位销售`} variant="info" />
                    </div>
                    <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                      {team.description?.trim() || "当前团队暂无补充说明。"}
                    </p>
                    <p className="text-sm text-[var(--color-sidebar-muted)]">
                      团队主管：
                      {team.supervisor
                        ? ` ${team.supervisor.name} (@${team.supervisor.username})`
                        : " 暂未指定"}
                    </p>
                  </div>

                  <Link
                    href={buildTeamHref(team.id)}
                    scroll={false}
                    className="crm-button crm-button-secondary"
                  >
                    {isActive ? "已进入团队层" : "查看团队"}
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className={teamMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      客户总数
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {team.customerCount}
                    </p>
                  </div>
                  <div className={teamMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      今日新导入
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {team.todayNewImportedCount}
                    </p>
                  </div>
                  <div className={teamMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      待首呼
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {team.pendingFirstCallCount}
                    </p>
                  </div>
                  <div className={teamMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      待回访
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {team.pendingFollowUpCount}
                    </p>
                  </div>
                  <div className={teamMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      待邀约
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {team.pendingInvitationCount}
                    </p>
                  </div>
                  <div className={teamMetricClassName}>
                    <p className="text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
                      待成交
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {team.pendingDealCount}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="暂无可见团队"
          description="当前角色下还没有可以进入的团队客户视图。"
        />
      )}
    </SectionCard>
  );
}
