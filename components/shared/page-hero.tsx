import type { ReactNode } from "react";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

// 通用页面 Hero widget
//
// 设计原则:
// - 左: icon (avatar 占位或 lucide icon) + title + subtitle 灰字
// - 中: primaryBadge (1 个最重要状态, 不堆叠 5-7 个徽章)
// - 右: rightMetric (label 小灰 + value 大字)
// - 顶部 actions slot (可选, 一般放 1-2 个主操作按钮)
// - bg-card rounded-xl border + 极淡 primary 渐变光晕 ::before
// - 适配 customer / lead / dashboard / 通用详情页
// - server component, 走 globals.css token + 纯 CSS keyframes
// - 动画一律 mount-once / 慢 pulse, 不引入 framer-motion

export type PageHeroIcon =
  | { kind: "avatar"; text: string }
  | { kind: "node"; node: ReactNode };

export type PageHeroBadge = Readonly<{
  label: string;
  variant?: StatusBadgeVariant;
}>;

export type PageHeroMetric = Readonly<{
  label: string;
  value: ReactNode;
  /** 可选的辅助小灰字, 例如 "已收 200 / 待收 800" */
  hint?: ReactNode;
}>;

export type PageHeroProps = Readonly<{
  /** 左侧图标: 文字头像 or 自定义 ReactNode (例如 lucide icon) */
  icon: PageHeroIcon;
  /** 主标题, 例如客户名 / 线索名 / 工作台名 */
  title: string;
  /** 副标题, 一般是销售名 + 时间 / 联系方式 / 数据描述 */
  subtitle?: ReactNode;
  /** 最重要的单一状态; 不要堆叠 */
  primaryBadge?: PageHeroBadge;
  /** 右侧大字指标, 例如金额 / 数量 / 转化率 */
  rightMetric?: PageHeroMetric;
  /** 右上 actions 槽位, 一般 1-2 个按钮 */
  actions?: ReactNode;
  className?: string;
}>;

function AvatarIcon({ text }: { text: string }) {
  const ch = text.trim().slice(0, 1) || "·";
  return (
    <div
      aria-hidden="true"
      className="crm-hero-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-sm font-semibold text-foreground"
    >
      {ch}
    </div>
  );
}

function NodeIcon({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="crm-hero-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-foreground"
    >
      {children}
    </div>
  );
}

export function PageHero({
  icon,
  title,
  subtitle,
  primaryBadge,
  rightMetric,
  actions,
  className,
}: PageHeroProps) {
  const hasMiddle = Boolean(primaryBadge || actions);
  const hasRight = Boolean(rightMetric);

  let gridCols = "lg:grid-cols-1";
  if (hasMiddle && hasRight) {
    gridCols = "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]";
  } else if (hasMiddle) {
    gridCols = "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]";
  } else if (hasRight) {
    gridCols = "lg:grid-cols-[minmax(0,1fr)_auto]";
  }

  return (
    <section
      className={cn(
        "crm-page-hero rounded-xl border border-border/60 bg-card p-6",
        className,
      )}
    >
      <div className={cn("grid gap-6 lg:items-center", gridCols)}>
        {/* 左: icon + title + subtitle (title 用 type-title 18px, tighter tracking + leading-tight) */}
        <div className="flex min-w-0 items-center gap-4">
          {icon.kind === "avatar" ? (
            <AvatarIcon text={icon.text} />
          ) : (
            <NodeIcon>{icon.node}</NodeIcon>
          )}
          <div className="min-w-0 space-y-1">
            <div className="truncate text-[1.125rem] font-semibold leading-[1.15] tracking-[-0.012em] text-foreground">
              {title}
            </div>
            {subtitle ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] leading-normal text-muted-foreground">
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>

        {/* 中: primaryBadge + actions (mobile 时 actions chip 流, 一行折叠) */}
        {hasMiddle ? (
          <div className="min-w-0 space-y-2">
            {primaryBadge ? (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  aria-hidden="true"
                  className="crm-hero-dot"
                />
                <StatusBadge
                  label={primaryBadge.label}
                  variant={primaryBadge.variant ?? "neutral"}
                />
              </div>
            ) : null}
            {actions ? (
              <div className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 右: rightMetric — label 小灰, value tabular-nums display 30px + hover 微深化 */}
        {hasRight && rightMetric ? (
          <div className="lg:text-right">
            <div className="text-xs font-medium text-muted-foreground">
              {rightMetric.label}
            </div>
            <div
              className="crm-hero-metric-value mt-1.5 text-[1.875rem] font-semibold leading-none tracking-[-0.018em]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {rightMetric.value}
            </div>
            {rightMetric.hint ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground lg:justify-end">
                {rightMetric.hint}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default PageHero;
