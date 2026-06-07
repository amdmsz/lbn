/**
 * MetricStrip 是横向单行密度更高的紧凑指标栏 (1-4 项).
 *
 * 设计目标:
 * - 参考 `components/trade-orders/order-metric-grid.tsx` 的 token 分层与 ring/bar 微图,
 *   但缩成 strip: 单行更密, 用于页面顶部或 section 顶部的紧凑核心指标条.
 * - 每个 metric: 小字 label + 大字 value, 可选 mini ring (环形百分比) 或 mini bar (进度条).
 * - tone 仅控制 icon 强调色 / ring / bar 颜色, value 文字色保持 foreground, 避免色彩噪点.
 *
 * Layout:
 * - 桌面 lg 4 列, 平板 sm 2 列, 移动端单列.
 * - 容器: bg-card rounded-xl border p-4 gap-4.
 * - 每个 tile 在 strip 内不再额外加边框, 通过左侧 1px 分隔线分组 (除首项).
 *
 * Dark mode: 颜色走 token (text-foreground / muted-foreground / emerald/amber/rose -*),
 * 不要硬编码 hex.
 */

import { cn } from "@/lib/utils";

export type MetricTone = "primary" | "success" | "warning" | "danger" | "neutral";

export type MetricItem = {
  /** 上方小字标题 */
  label: string;
  /** 大字主数值, 调用方负责格式化 (¥1,234 / 6 张 / 0 等) */
  value: string;
  /** tone 控制 ring/bar 配色; 不影响主数值文字色 (始终 foreground) */
  tone?: MetricTone;
  /** 可选 mini 可视化形态: ring (环形百分比) 或 bar (横向进度条) */
  mini?: "ring" | "bar";
  /** ring/bar 当前值, 与 ringMax 共同计算比例 (0..1) */
  ringValue?: number;
  /** ring/bar 满值, 默认 100 */
  ringMax?: number;
};

export type MetricStripProps = {
  /** 最多 4 个 metric; 超出会被截断 */
  metrics: MetricItem[];
  /** 容器附加 className */
  className?: string;
  /** 可访问性 aria-label, 默认 "核心指标" */
  ariaLabel?: string;
};

const toneStyles: Record<
  MetricTone,
  {
    ringStroke: string;
    barFill: string;
    accent: string;
  }
> = {
  primary: {
    ringStroke: "stroke-primary",
    barFill: "bg-primary",
    accent: "text-primary",
  },
  success: {
    ringStroke: "stroke-emerald-500 dark:stroke-emerald-400",
    barFill: "bg-emerald-500 dark:bg-emerald-400",
    accent: "text-emerald-600 dark:text-emerald-300",
  },
  warning: {
    ringStroke: "stroke-amber-500 dark:stroke-amber-400",
    barFill: "bg-amber-500 dark:bg-amber-400",
    accent: "text-amber-600 dark:text-amber-300",
  },
  danger: {
    ringStroke: "stroke-rose-500 dark:stroke-rose-400",
    barFill: "bg-rose-500 dark:bg-rose-400",
    accent: "text-rose-600 dark:text-rose-300",
  },
  neutral: {
    ringStroke: "stroke-muted-foreground/60",
    barFill: "bg-muted-foreground/60",
    accent: "text-muted-foreground",
  },
};

function clampRatio(ratio: number) {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

function computeRatio(value: number | undefined, max: number | undefined) {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const m = typeof max === "number" && Number.isFinite(max) && max > 0 ? max : 100;
  return clampRatio(v / m);
}

function MiniRing({
  ratio,
  tone,
}: Readonly<{ ratio: number; tone: MetricTone }>) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dash = clampRatio(ratio) * circumference;
  const remainder = circumference - dash;
  const styles = toneStyles[tone];
  const pct = Math.round(clampRatio(ratio) * 100);

  return (
    <div className="relative h-10 w-10 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          className="fill-none stroke-border/60"
          strokeWidth="3.5"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          className={cn("fill-none transition-all", styles.ringStroke)}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${remainder}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-foreground">
        {pct}%
      </span>
    </div>
  );
}

function MiniBar({
  ratio,
  tone,
}: Readonly<{ ratio: number; tone: MetricTone }>) {
  const pct = Math.round(clampRatio(ratio) * 100);
  const styles = toneStyles[tone];
  return (
    <div className="mt-2 w-full" aria-hidden="true">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={cn("h-full rounded-full transition-all", styles.barFill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MetricTile({
  item,
  isFirst,
}: Readonly<{ item: MetricItem; isFirst: boolean }>) {
  const tone: MetricTone = item.tone ?? "neutral";
  const styles = toneStyles[tone];
  const hasRing = item.mini === "ring";
  const hasBar = item.mini === "bar";
  const ratio =
    hasRing || hasBar ? computeRatio(item.ringValue, item.ringMax) : 0;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col px-0 sm:px-1",
        !isFirst && "sm:border-l sm:border-border/50 sm:pl-4 lg:pl-4",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.14em]",
              tone === "neutral" ? "text-muted-foreground" : styles.accent,
            )}
          >
            {item.label}
          </div>
          <div className="mt-1 truncate font-mono text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground">
            {item.value}
          </div>
        </div>
        {hasRing ? <MiniRing ratio={ratio} tone={tone} /> : null}
      </div>
      {hasBar ? <MiniBar ratio={ratio} tone={tone} /> : null}
    </div>
  );
}

export default function MetricStrip({
  metrics,
  className,
  ariaLabel = "核心指标",
}: MetricStripProps) {
  const items = metrics.slice(0, 4);
  if (items.length === 0) return null;

  // 1-4 metric 紧凑栏: 移动端单列, sm 2 列, lg 全列 (1-4 自适应).
  const lgColsClass =
    items.length === 1
      ? "lg:grid-cols-1"
      : items.length === 2
        ? "lg:grid-cols-2"
        : items.length === 3
          ? "lg:grid-cols-3"
          : "lg:grid-cols-4";

  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "grid gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm",
        "sm:grid-cols-2",
        lgColsClass,
        className,
      )}
    >
      {items.map((item, index) => (
        <MetricTile
          key={`${item.label}-${index}`}
          item={item}
          isFirst={index === 0}
        />
      ))}
    </section>
  );
}
