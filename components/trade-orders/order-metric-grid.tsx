/**
 * OrderMetricGrid 是订单详情页的核心指标可视化网格.
 *
 * 设计目标 (来自 DESIGN.md + 用户反馈):
 * - 用 4 张横向 metric card 替代旧 OverviewCard 4 卡的"运维监控面板"垂直字段堆.
 * - 每张卡片视觉占比由 "大 icon + 大字数值 + 可视化(环形/进度条)" 主导, 而不是文字罗列.
 * - 不展示内部 metadata (direct SKU=2 / 套餐行=0 / 赠品行=0 / 规划 supplier),
 *   这些放到二级 hover/tooltip 表达 (`tooltip` 字段).
 * - 颜色仅在状态出现 (success/warning/danger) 时才落色; 默认 muted, 避免色彩噪点.
 *
 * Layout:
 * - 桌面 4 列 (lg 起), 移动端 2x2 网格.
 * - 卡片样式: rounded-xl border bg-card shadow-sm; 不做 hover translate.
 * - 仅当数值具备"分子/分母"语义时, 才出现进度条; 仅当数值具备"环形比例"语义时才出环形.
 *
 * Dark mode: 全部颜色走 tone token (text-foreground / muted-foreground /
 * text-emerald-* / text-amber-* / text-rose-*), 不要硬编码 hex.
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CircleDollarSign,
  PackageCheck,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

type ToneKey = "primary" | "success" | "warning" | "danger" | "neutral";

const toneStyles: Record<
  ToneKey,
  {
    iconBg: string;
    iconText: string;
    valueText: string;
    ringStroke: string;
    barFill: string;
  }
> = {
  primary: {
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    valueText: "text-foreground",
    ringStroke: "stroke-primary",
    barFill: "bg-primary",
  },
  success: {
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    iconText: "text-emerald-600 dark:text-emerald-300",
    valueText: "text-foreground",
    ringStroke: "stroke-emerald-500 dark:stroke-emerald-400",
    barFill: "bg-emerald-500 dark:bg-emerald-400",
  },
  warning: {
    iconBg: "bg-amber-500/10 dark:bg-amber-500/15",
    iconText: "text-amber-600 dark:text-amber-300",
    valueText: "text-foreground",
    ringStroke: "stroke-amber-500 dark:stroke-amber-400",
    barFill: "bg-amber-500 dark:bg-amber-400",
  },
  danger: {
    iconBg: "bg-rose-500/10 dark:bg-rose-500/15",
    iconText: "text-rose-600 dark:text-rose-300",
    valueText: "text-foreground",
    ringStroke: "stroke-rose-500 dark:stroke-rose-400",
    barFill: "bg-rose-500 dark:bg-rose-400",
  },
  neutral: {
    iconBg: "bg-muted/40",
    iconText: "text-muted-foreground",
    valueText: "text-foreground",
    ringStroke: "stroke-muted-foreground/60",
    barFill: "bg-muted-foreground/60",
  },
};

type MetricVisual =
  | { kind: "ring"; ratio: number; centerLabel?: string }
  | { kind: "bar"; ratio: number; trailLabel?: string }
  | { kind: "none" };

type MetricItem = {
  /** 卡片左上小字标题 */
  label: string;
  /** 大字主数值, 调用方负责格式化 (¥1,234.00 / 6 张 / 0 等) */
  value: string;
  /** 大字下面的一行小字, 用来给数值添加上下文 */
  hint?: string;
  /** lucide icon, 落在左上角的方块图标位 */
  icon: LucideIcon;
  /** tone 控制 icon 配色 + 进度色; 不影响主数值文字色 (始终 foreground) */
  tone: ToneKey;
  /** 鼠标 hover 显示的二级 metadata, 用来吸收旧 UI 里的"内部口径"字段 */
  tooltip?: string;
  /** 可视化, 仅在有分子/分母语义时出现 */
  visual?: MetricVisual;
};

export type OrderMetricGridInput = Readonly<{
  /** 成交金额, 已格式化字符串 (如 ¥1,234.00) */
  totalAmount: string;
  /** 已收金额, 已格式化字符串 */
  collectedAmount: string;
  /** 待收金额, 已格式化字符串 */
  remainingAmount: string;
  /** 子单总数 */
  totalSubOrders: number;
  /** 已发子单数 (含 SHIPPED 之后的状态) */
  shippedSubOrders: number;
  /** 待发子单数 (未报单 + 待物流) */
  pendingSubOrders: number;
  /** 异常子单数 */
  exceptionSubOrders: number;
  /** 可选二级 metadata, 用于 tooltip */
  tooltips?: Partial<{
    amount: string;
    payment: string;
    fulfillment: string;
    exception: string;
  }>;
}>;

function clampRatio(ratio: number) {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

function MiniRing({
  ratio,
  tone,
  centerLabel,
}: Readonly<{
  ratio: number;
  tone: ToneKey;
  centerLabel?: string;
}>) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = clampRatio(ratio) * circumference;
  const remainder = circumference - dash;
  const styles = toneStyles[tone];

  return (
    <div className="relative h-12 w-12 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={radius}
          className="fill-none stroke-border/60"
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          className={cn("fill-none transition-all", styles.ringStroke)}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${remainder}`}
        />
      </svg>
      {centerLabel ? (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
          {centerLabel}
        </span>
      ) : null}
    </div>
  );
}

function MiniBar({
  ratio,
  tone,
  trailLabel,
}: Readonly<{
  ratio: number;
  tone: ToneKey;
  trailLabel?: string;
}>) {
  const pct = Math.round(clampRatio(ratio) * 100);
  const styles = toneStyles[tone];
  return (
    <div className="mt-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-border/60"
        aria-hidden="true"
      >
        <div
          className={cn("h-full rounded-full transition-all", styles.barFill)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {trailLabel ? (
        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {trailLabel}
        </div>
      ) : null}
    </div>
  );
}

function MetricCardItem({ item }: Readonly<{ item: MetricItem }>) {
  const styles = toneStyles[item.tone];
  const Icon = item.icon;

  return (
    <div
      title={item.tooltip}
      className="group rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm transition-[border-color,background-color] duration-150 hover:border-primary/30 hover:bg-muted/10"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            styles.iconBg,
          )}
        >
          <Icon className={cn("h-4.5 w-4.5", styles.iconText)} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </div>
          <div className={cn("mt-1 font-mono text-[1.5rem] font-semibold leading-tight tracking-tight", styles.valueText)}>
            {item.value}
          </div>
        </div>
        {item.visual?.kind === "ring" ? (
          <MiniRing
            ratio={item.visual.ratio}
            tone={item.tone}
            centerLabel={item.visual.centerLabel}
          />
        ) : null}
      </div>

      {item.hint ? (
        <div className="mt-2 truncate text-xs leading-5 text-muted-foreground">
          {item.hint}
        </div>
      ) : null}

      {item.visual?.kind === "bar" ? (
        <MiniBar
          ratio={item.visual.ratio}
          tone={item.tone}
          trailLabel={item.visual.trailLabel}
        />
      ) : null}
    </div>
  );
}

export function OrderMetricGrid(props: OrderMetricGridInput) {
  const {
    totalAmount,
    collectedAmount,
    remainingAmount,
    totalSubOrders,
    shippedSubOrders,
    pendingSubOrders,
    exceptionSubOrders,
    tooltips,
  } = props;

  // 推导: 已收金额 / (已收 + 待收) 作为环形比例.
  // 若纯文本字符串无法 parse, 落回 0.
  const collectedNum = parseAmount(collectedAmount);
  const remainingNum = parseAmount(remainingAmount);
  const paymentDenominator = collectedNum + remainingNum;
  const paymentRatio = paymentDenominator > 0 ? collectedNum / paymentDenominator : 0;
  const paymentPctLabel = `${Math.round(clampRatio(paymentRatio) * 100)}%`;

  const fulfillmentRatio =
    totalSubOrders > 0 ? shippedSubOrders / totalSubOrders : 0;
  const fulfillmentTrail = totalSubOrders > 0 ? `已发 ${shippedSubOrders} / ${totalSubOrders}` : "暂无子单";

  const exceptionTone: ToneKey =
    exceptionSubOrders > 0 ? "danger" : pendingSubOrders > 0 ? "warning" : "success";
  const exceptionLabel =
    exceptionSubOrders > 0
      ? `${exceptionSubOrders}`
      : pendingSubOrders > 0
        ? `${pendingSubOrders}`
        : "0";
  const exceptionHint =
    exceptionSubOrders > 0
      ? "需要优先进入异常队列"
      : pendingSubOrders > 0
        ? `还有 ${pendingSubOrders} 个子单待推进`
        : "所有子单进展正常";

  const items: MetricItem[] = [
    {
      label: "成交金额",
      value: totalAmount,
      hint: "父单成交总额",
      icon: CircleDollarSign,
      tone: "primary",
      tooltip: tooltips?.amount,
    },
    {
      label: "回款进度",
      value: collectedAmount,
      hint: `待收 ${remainingAmount}`,
      icon: Wallet,
      tone: paymentRatio >= 1 ? "success" : paymentRatio > 0 ? "primary" : "neutral",
      tooltip: tooltips?.payment,
      visual: {
        kind: "ring",
        ratio: paymentRatio,
        centerLabel: paymentPctLabel,
      },
    },
    {
      label: "履约进度",
      value: totalSubOrders > 0 ? `${shippedSubOrders} / ${totalSubOrders}` : "0",
      hint: totalSubOrders > 0 ? `子单 ${totalSubOrders} 张` : "尚未物化子单",
      icon: PackageCheck,
      tone:
        totalSubOrders === 0
          ? "neutral"
          : shippedSubOrders === totalSubOrders
            ? "success"
            : "primary",
      tooltip: tooltips?.fulfillment,
      visual: { kind: "bar", ratio: fulfillmentRatio, trailLabel: fulfillmentTrail },
    },
    {
      label: exceptionSubOrders > 0 ? "异常待处理" : "状态",
      value: exceptionLabel,
      hint: exceptionHint,
      icon: AlertTriangle,
      tone: exceptionTone,
      tooltip: tooltips?.exception,
    },
  ];

  return (
    <section
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="订单核心指标"
    >
      {items.map((item) => (
        <MetricCardItem key={item.label} item={item} />
      ))}
    </section>
  );
}

function parseAmount(value: string): number {
  if (!value) return 0;
  // 兼容 "¥1,234.56", "1234.56", "1,234" 等
  const cleaned = value.replace(/[^\d.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}
