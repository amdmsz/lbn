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
  // return 历史叫 amber, 收敛到 warning, 不再多一档橙色
  return: { icon: RotateCcw, tone: "warning" },
};

// 全部走 globals.css 4 状态 tone token (--tone-*-soft-bg / -border / -text).
// primary 复用 --primary; neutral 走 muted 灰. 不再硬编码 sky/blue/emerald/amber/rose/orange.
const TONE_DOT_CLASSES: Record<Tone, string> = {
  info: "border-[var(--tone-info-soft-border-strong)] bg-[var(--tone-info-soft-bg)] text-[var(--tone-info-soft-text)]",
  primary:
    "border-primary/30 bg-primary/10 text-primary",
  success:
    "border-[var(--tone-success-soft-border-strong)] bg-[var(--tone-success-soft-bg)] text-[var(--tone-success-soft-text)]",
  warning:
    "border-[var(--tone-warning-soft-border-strong)] bg-[var(--tone-warning-soft-bg)] text-[var(--tone-warning-soft-text)]",
  danger:
    "border-[var(--tone-danger-soft-border-strong)] bg-[var(--tone-danger-soft-bg)] text-[var(--tone-danger-soft-text)]",
  // amber 继续暴露给历史调用方, 实质收敛到 warning token
  amber:
    "border-[var(--tone-warning-soft-border-strong)] bg-[var(--tone-warning-soft-bg)] text-[var(--tone-warning-soft-text)]",
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
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* 竖线 (除最后一条) */}
      {!isLast ? (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 bottom-0 w-px bg-border/60"
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
          <span
            className="text-xs text-muted-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatOccurredAt(event.occurredAt)}
          </span>
        </div>
        {event.detail ? (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {event.detail}
          </p>
        ) : null}
        {event.actor ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
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
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {expanded ? "收起" : `展开全部 ${sorted.length} 条`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
