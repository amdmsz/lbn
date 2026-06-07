import type { ReactNode } from "react";
import { CustomerOwnerTransferPanel } from "@/components/customers/customer-owner-transfer-panel";
import {
  OverviewSummaryCard,
  PortraitActionLink,
  type PortraitSignal,
  type SummaryCard,
} from "@/components/customers/customer-dossier-primitives";
import { CustomerOwnershipHistory } from "@/components/customers/customer-ownership-history";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/shared/status-badge";

// 单行 micro stat 卡片，aside 网格使用
function StatTile({ item }: { item: PortraitSignal }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/30 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {item.label}
      </p>
      <p className="mt-1 text-[13px] font-semibold leading-5 text-foreground">
        {item.value}
      </p>
      {item.description ? (
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {item.description}
        </p>
      ) : null}
    </div>
  );
}

export type CustomerDetailSidebarPrimaryAction = Readonly<{
  label: string;
  href: string;
  description: string;
  secondaryLabel: string;
  secondaryHref: string;
}>;

export type CustomerDetailSidebarOwnership = Readonly<{
  currentOwnerLabel: string;
  teamLabel: string;
  protectedUntilLabel: string;
  ownershipLabel: string;
  ownershipBadgeVariant: StatusBadgeVariant;
}>;

export type CustomerDetailSidebarTrade = Readonly<{
  totalAmountLabel: string;
  totalOrderCount: number;
  latestSummary: string;
}>;

export type CustomerDetailSidebarOwnershipHistoryProps = Readonly<{
  totalCount: number;
  events: Parameters<typeof CustomerOwnershipHistory>[0]["events"];
  archives: Parameters<typeof CustomerOwnershipHistory>[0]["archives"];
  transferSlot: ReactNode;
}>;

export function CustomerDetailSidebar({
  profileHref,
  primaryAction,
  ownership,
  trade,
  signals,
  ownershipHistory,
  summaryCards,
  recycleSlot,
  forceDeleteSlot,
}: Readonly<{
  profileHref: string;
  primaryAction: CustomerDetailSidebarPrimaryAction;
  ownership: CustomerDetailSidebarOwnership;
  trade: CustomerDetailSidebarTrade;
  signals: ReadonlyArray<PortraitSignal>;
  ownershipHistory: CustomerDetailSidebarOwnershipHistoryProps;
  summaryCards: ReadonlyArray<SummaryCard>;
  recycleSlot?: ReactNode;
  forceDeleteSlot?: ReactNode;
}>) {
  return (
    <aside className="min-w-0 lg:col-span-4">
      <div className="sticky top-6 space-y-4">
        {/* 1. Command Center */}
        <section className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Command Center
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">
                {primaryAction.label}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                {primaryAction.description}
              </p>
            </div>
            <PortraitActionLink href={profileHref} label="档案" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <PortraitActionLink
              href={primaryAction.href}
              label={primaryAction.label}
              emphasis="primary"
            />
            <PortraitActionLink
              href={primaryAction.secondaryHref}
              label={primaryAction.secondaryLabel}
            />
          </div>
        </section>

        {/* 2. Quick Stats */}
        <section className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Quick Stats
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">
                经营快照
              </h2>
            </div>
            <StatusBadge
              label={ownership.ownershipLabel}
              variant={ownership.ownershipBadgeVariant}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {signals.map((item) => (
              <StatTile key={item.label} item={item} />
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-border/40 bg-background/50 px-3 py-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  累计成交
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {trade.totalAmountLabel}
                </p>
              </div>
              <p className="pb-0.5 text-[12px] font-medium tabular-nums text-muted-foreground">
                {trade.totalOrderCount} 笔
              </p>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
              {trade.latestSummary}
            </p>
          </div>
        </section>

        {/* 3. Ownership */}
        <section className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Ownership
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">
                经营归属
              </h2>
              <p className="mt-1 text-sm font-medium leading-5 text-foreground">
                {ownership.currentOwnerLabel}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {ownership.teamLabel} / 保护期 {ownership.protectedUntilLabel}
              </p>
            </div>
          </div>

          {ownershipHistory.transferSlot}

          <CustomerOwnershipHistory
            totalCount={ownershipHistory.totalCount}
            events={ownershipHistory.events}
            archives={ownershipHistory.archives}
          />
        </section>

        {/* 4. summary cards */}
        <div className="grid gap-2">
          {summaryCards.map((card) => (
            <OverviewSummaryCard
              key={card.label ?? card.eyebrow ?? card.href}
              card={card}
            />
          ))}
        </div>

        {recycleSlot}
        {forceDeleteSlot}
      </div>
    </aside>
  );
}

// Re-export so callers don't need a second import path
export { CustomerOwnerTransferPanel };
