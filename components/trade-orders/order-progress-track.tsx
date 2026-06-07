"use client";

import {
  CheckCircle2,
  Clock,
  CreditCard,
  FileEdit,
  FileSpreadsheet,
  RefreshCcw,
  Trophy,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type OrderProgressPhase =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REPORTED"
  | "SHIPPED"
  | "COLLECTED"
  | "COMPLETED"
  | "CANCELED"
  | "REVISION_PENDING";

export type OrderProgressTrackProps = Readonly<{
  currentPhase: OrderProgressPhase;
  timestamps?: Partial<Record<OrderProgressPhase, Date | string | null>>;
  isCancel?: boolean;
}>;

type FlowPhase = Exclude<OrderProgressPhase, "CANCELED" | "REVISION_PENDING">;

type FlowNode = {
  value: FlowPhase;
  label: string;
  icon: LucideIcon;
};

// 订单主流程: 草稿 → 待审核 → 已审核 → 已报单 → 已发货 → 已收款 → 已完结
const FLOW_NODES: ReadonlyArray<FlowNode> = [
  { value: "DRAFT", label: "草稿", icon: FileEdit },
  { value: "PENDING_REVIEW", label: "待审核", icon: Clock },
  { value: "APPROVED", label: "已审核", icon: CheckCircle2 },
  { value: "REPORTED", label: "已报单", icon: FileSpreadsheet },
  { value: "SHIPPED", label: "已发货", icon: Truck },
  { value: "COLLECTED", label: "已收款", icon: CreditCard },
  { value: "COMPLETED", label: "已完结", icon: Trophy },
];

function formatTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveFlowIndex(phase: OrderProgressPhase): number {
  // CANCELED / REVISION_PENDING 不在主流程节点上, 由外层 banner / 节点高亮处理
  if (phase === "CANCELED" || phase === "REVISION_PENDING") {
    return -1;
  }

  return FLOW_NODES.findIndex((node) => node.value === phase);
}

type NodeState = "done" | "current" | "pending" | "cancel";

function nodeStateClass(state: NodeState) {
  switch (state) {
    case "done":
      return cn(
        "border-[var(--tone-success-soft-border-strong)] bg-[var(--tone-success-soft-bg)] text-[var(--color-success)]",
      );
    case "current":
      return "border-primary/40 bg-primary/10 text-primary";
    case "cancel":
      return cn(
        "border-[var(--tone-danger-soft-border)] bg-[var(--tone-danger-soft-bg)] text-[var(--color-danger)]",
      );
    case "pending":
    default:
      return "border-border/60 bg-muted/30 text-muted-foreground";
  }
}

function connectorClass(state: "done" | "pending" | "cancel") {
  switch (state) {
    case "done":
      return "bg-[var(--color-success)]/55";
    case "cancel":
      return "bg-[var(--color-danger)]/35";
    case "pending":
    default:
      return "bg-border/60";
  }
}

function nodeLabelClass(state: NodeState) {
  switch (state) {
    case "done":
      return "text-[var(--color-success)]";
    case "current":
      return "text-primary";
    case "cancel":
      return "text-[var(--color-danger)]";
    case "pending":
    default:
      return "text-muted-foreground";
  }
}

function NodeIcon({
  state,
  Icon,
}: Readonly<{ state: NodeState; Icon: LucideIcon }>) {
  if (state === "done") {
    return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  }
  if (state === "cancel") {
    return <XCircle className="h-4 w-4" aria-hidden="true" />;
  }
  if (state === "current") {
    return <Icon className="h-4 w-4" aria-hidden="true" />;
  }
  return <Icon className="h-4 w-4 opacity-70" aria-hidden="true" />;
}

export default function OrderProgressTrack({
  currentPhase,
  timestamps,
  isCancel,
}: OrderProgressTrackProps) {
  const cancel = Boolean(isCancel) || currentPhase === "CANCELED";
  const revisionPending = currentPhase === "REVISION_PENDING";
  const currentIndex = cancel ? -1 : resolveFlowIndex(currentPhase);

  return (
    <section
      aria-label="订单流程"
      className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
    >
      {cancel ? (
        <div className="flex items-center gap-2 border-b border-[var(--tone-danger-soft-border)] bg-[var(--tone-danger-soft-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--color-danger)]">
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          订单已取消, 主流程已停止
        </div>
      ) : null}
      {revisionPending ? (
        <div className="flex items-center gap-2 border-b border-[var(--tone-warning-soft-border)] bg-[var(--tone-warning-soft-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--color-warning)]">
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          撤单审批中, 待审核后回到上一节点
        </div>
      ) : null}

      {/* 桌面端: 横向 progress track */}
      <ol className="hidden px-4 py-5 md:flex md:items-start">
        {FLOW_NODES.map((node, index) => {
          const Icon = node.icon;
          const isDone = !cancel && currentIndex > index;
          const isCurrent = !cancel && currentIndex === index;
          const state: NodeState = cancel
            ? "cancel"
            : isDone
              ? "done"
              : isCurrent
                ? "current"
                : "pending";

          const timestampText = formatTimestamp(timestamps?.[node.value]);
          const titleText = timestampText
            ? `${node.label}: ${timestampText}`
            : node.label;

          const isLast = index === FLOW_NODES.length - 1;
          const connectorState: "done" | "pending" | "cancel" = cancel
            ? "cancel"
            : currentIndex > index
              ? "done"
              : "pending";

          return (
            <li
              key={node.value}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <div className="flex w-full items-center">
                {/* 左侧 spacer (第一个节点无) */}
                <div className="h-px flex-1" aria-hidden="true" />

                <div
                  title={titleText}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors",
                    nodeStateClass(state),
                    isCurrent
                      ? "ring-2 ring-primary/15 ring-offset-1 ring-offset-card"
                      : "",
                  )}
                >
                  <NodeIcon state={state} Icon={Icon} />
                </div>

                {/* 右侧连接线 (最后一个节点无) */}
                {!isLast ? (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-px flex-1",
                      connectorClass(connectorState),
                    )}
                  />
                ) : (
                  <div className="h-px flex-1" aria-hidden="true" />
                )}
              </div>

              <div className="mt-2 flex flex-col items-center px-1 text-center">
                <span
                  className={cn(
                    "text-[12.5px] font-medium leading-tight",
                    nodeLabelClass(state),
                  )}
                >
                  {node.label}
                </span>
                {timestampText ? (
                  <span className="mt-0.5 text-[10.5px] text-muted-foreground/85">
                    {timestampText}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* 移动端: 纵向 progress track */}
      <ol className="flex flex-col px-4 py-4 md:hidden">
        {FLOW_NODES.map((node, index) => {
          const Icon = node.icon;
          const isDone = !cancel && currentIndex > index;
          const isCurrent = !cancel && currentIndex === index;
          const state: NodeState = cancel
            ? "cancel"
            : isDone
              ? "done"
              : isCurrent
                ? "current"
                : "pending";

          const timestampText = formatTimestamp(timestamps?.[node.value]);
          const titleText = timestampText
            ? `${node.label}: ${timestampText}`
            : node.label;

          const isLast = index === FLOW_NODES.length - 1;
          const connectorState: "done" | "pending" | "cancel" = cancel
            ? "cancel"
            : currentIndex > index
              ? "done"
              : "pending";

          return (
            <li key={node.value} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  title={titleText}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors",
                    nodeStateClass(state),
                    isCurrent
                      ? "ring-2 ring-primary/15 ring-offset-1 ring-offset-card"
                      : "",
                  )}
                >
                  <NodeIcon state={state} Icon={Icon} />
                </div>
                {!isLast ? (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "mt-1 h-6 w-px",
                      connectorClass(connectorState),
                    )}
                  />
                ) : null}
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col pt-1.5",
                  isLast ? "pb-0" : "pb-3",
                )}
              >
                <span
                  className={cn(
                    "truncate text-[13px] font-medium leading-tight",
                    nodeLabelClass(state),
                  )}
                >
                  {node.label}
                </span>
                {timestampText ? (
                  <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {timestampText}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
