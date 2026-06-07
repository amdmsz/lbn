"use client";

/**
 * EntityTimeline 是一个通用的 vertical timeline 组件.
 *
 * 设计目标:
 * - 复用 components/trade-orders/order-timeline.tsx 的视觉(左竖线 + 节点圆点 + icon + tone),
 *   但解耦订单语义, 任何实体(客户/线索/履约任务/退货 etc.)都可以复用.
 * - 父组件负责按 TimelineKind 归并好 events[] 再传入, 该组件只负责视觉.
 *
 * 显示规则:
 * - 默认展示最近 maxVisible(默认 8) 条, 超过时末尾"展开全部"按钮, 再点击"收起".
 * - 每个节点: icon (lucide, 按 kind 不同) + tone 色 + 主标题 + 副标题 detail + 时间 + actor.
 * - href 可选, 传入则 title 渲染成 Link.
 *
 * dark mode: 颜色全部基于 tone token + dark:* 兼容。
 */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  PackageCheck,
  RotateCcw,
  Truck,
  Undo2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineKind =
  | "review"
  | "child_approved"
  | "report"
  | "ship"
  | "tracking"
  | "pay"
  | "collection"
  | "revision"
  | "refund"
  | "return";

export type EntityTimelineEvent = Readonly<{
  id: string;
  kind: TimelineKind;
  occurredAt: Date;
  title: string;
  detail?: string;
  actor?: string;
  href?: string;
}>;

type Tone =
  | "info"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "amber"
  | "neutral";

type KindMeta = Readonly<{
  icon: typeof CheckCircle2;
  tone: Tone;
}>;

const KIND_META: Record<TimelineKind, KindMeta> = {
  review: { icon: ClipboardCheck, tone: "info" },
  child_approved: { icon: CheckCircle2, tone: "success" },
  report: { icon: PackageCheck, tone: "primary" },
  ship: { icon: Truck, tone: "primary" },
  tracking: { icon: Truck, tone: "primary" },
  pay: { icon: Coins, tone: "success" },
  collection: { icon: Users, tone: "warning" },
  revision: { icon: ArrowLeftRight, tone: "warning" },
  refund: { icon: Undo2, tone: "danger" },
  return: { icon: RotateCcw, tone: "amber" },
};

const TONE_DOT_CLASSES: Record<Tone, string> = {
  info: "border-sky-300/60 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300",
  primary:
    "border-blue-300/60 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300",
  success:
    "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning:
    "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
  danger:
    "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300",
  amber:
    "border-orange-300/60 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};

const DEFAULT_VISIBLE = 8;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatOccurredAt(value: Date) {
  return DATE_TIME_FORMATTER.format(value);
}

function actorInitial(name?: string) {
  if (!name) return "?";
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

function TimelineNode({
  event,
  isLast,
}: Readonly<{
  event: EntityTimelineEvent;
  isLast: boolean;
}>) {
  const meta = KIND_META[event.kind] ?? KIND_META.review;
  const Icon = meta.icon;

  const titleNode: ReactNode = event.href ? (
    <Link
      href={event.href}
      className="text-sm font-semibold text-foreground transition-colors hover:text-primary"
    >
      {event.title}
    </Link>
  ) : (
    <span className="text-sm font-semibold text-foreground">{event.title}</span>
  );

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* 竖线 (除最后一条) */}
      {!isLast ? (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 bottom-0 w-px bg-border/70"
        />
      ) : null}

      {/* 节点圆点 + icon */}
      <span
        className={cn(
          "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          TONE_DOT_CLASSES[meta.tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {titleNode}
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatOccurredAt(event.occurredAt)}
          </span>
        </div>
        {event.detail ? (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {event.detail}
          </p>
        ) : null}
        {event.actor ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              aria-hidden
              className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground/70"
            >
              {actorInitial(event.actor)}
            </span>
            <span>{event.actor}</span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function EntityTimeline({
  events,
  maxVisible = DEFAULT_VISIBLE,
  emptyText = "暂无可展示的时间线事件。",
}: Readonly<{
  events: ReadonlyArray<EntityTimelineEvent>;
  maxVisible?: number;
  emptyText?: string;
}>) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () =>
      [...events].sort(
        (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
      ),
    [events],
  );

  const safeMaxVisible = Math.max(1, Math.floor(maxVisible));
  const visible = expanded ? sorted : sorted.slice(0, safeMaxVisible);
  const hasMore = sorted.length > safeMaxVisible;

  if (visible.length === 0) {
    return (
      <div className="border-l-2 border-dashed border-border/60 pl-4 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div>
      <ol className="space-y-0">
        {visible.map((event, index) => (
          <TimelineNode
            key={event.id}
            event={event}
            isLast={index === visible.length - 1}
          />
        ))}
      </ol>

      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            {expanded ? "收起" : `展开全部 ${sorted.length} 条`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
