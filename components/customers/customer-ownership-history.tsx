"use client";

import CollapsibleSection from "@/components/shared/collapsible-section";
import {
  getCustomerOwnershipModeLabel,
  ownershipEventReasonLabels,
} from "@/lib/customers/public-pool-metadata";
import { formatDateTime } from "@/lib/customers/metadata";

type OwnerLite = { name: string; username: string } | null | undefined;

export type OwnershipEvent = Readonly<{
  id: string;
  reason: keyof typeof ownershipEventReasonLabels;
  createdAt: Date;
  fromOwner: OwnerLite;
  toOwner: OwnerLite;
  fromOwnershipMode: Parameters<typeof getCustomerOwnershipModeLabel>[0] | null;
  toOwnershipMode: Parameters<typeof getCustomerOwnershipModeLabel>[0] | null;
  actor: OwnerLite;
  team: { name: string } | null;
  note: string | null;
}>;

export type OwnershipHistoryArchive = Readonly<{
  id: string;
  sourceCustomerName: string;
  sourceCustomerPhone: string;
  sourceOwnerLabel: string | null;
  reason: string;
  createdAt: Date;
  createdBy: OwnerLite;
  snapshotOwnershipEventsCount: number;
}>;

function formatOwner(owner: OwnerLite, mode: ReturnType<typeof getCustomerOwnershipModeLabel> | null) {
  if (owner) {
    return `${owner.name} (@${owner.username})`;
  }

  if (mode) {
    return mode;
  }

  return "未分配";
}

function formatActor(actor: OwnerLite) {
  return actor ? `${actor.name} (@${actor.username})` : "系统";
}

export function CustomerOwnershipHistory({
  events,
  archives,
  totalCount,
}: Readonly<{
  events: ReadonlyArray<OwnershipEvent>;
  archives: ReadonlyArray<OwnershipHistoryArchive>;
  totalCount: number;
}>) {
  return (
    <CollapsibleSection
      title="历史负责人"
      description={`${totalCount} 条流转记录`}
      className="mt-3 border-0 p-0 shadow-none"
      contentClassName="border-t-0 mt-2 pt-2"
    >
      {events.length === 0 && archives.length === 0 ? (
        <p className="rounded-xl border border-border/40 bg-muted/25 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
          暂无负责人流转记录，后续分配、回收、认领和移交都会沉淀在这里。
        </p>
      ) : null}

      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-border/40 bg-muted/25 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-foreground">
                <span>
                  {formatOwner(
                    event.fromOwner,
                    event.fromOwnershipMode
                      ? getCustomerOwnershipModeLabel(event.fromOwnershipMode)
                      : null,
                  )}
                </span>
                <span className="text-muted-foreground">-&gt;</span>
                <span>
                  {formatOwner(
                    event.toOwner,
                    event.toOwnershipMode
                      ? getCustomerOwnershipModeLabel(event.toOwnershipMode)
                      : null,
                  )}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {ownershipEventReasonLabels[event.reason]} / {formatDateTime(event.createdAt)}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                操作人 {formatActor(event.actor)}
                {event.team ? ` / ${event.team.name}` : ""}
              </p>
              {event.note ? (
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {event.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {archives.length > 0 ? (
        <div className="mt-2 space-y-2">
          {archives.map((archive) => (
            <div
              key={archive.id}
              className="rounded-xl border border-border/40 bg-muted/25 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-foreground">
                <span>历史客户档案</span>
                <span className="text-muted-foreground">/</span>
                <span>{archive.sourceOwnerLabel ?? "原负责人暂无"}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {archive.sourceCustomerName} / {archive.sourceCustomerPhone}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {archive.reason} / {formatDateTime(archive.createdAt)}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {archive.snapshotOwnershipEventsCount > 0
                  ? `保留 ${archive.snapshotOwnershipEventsCount} 条旧归属事件`
                  : "保留原负责人快照"}
                {archive.createdBy ? ` / 操作人 ${formatActor(archive.createdBy)}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </CollapsibleSection>
  );
}
