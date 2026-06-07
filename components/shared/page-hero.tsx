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
// - bg-card rounded-xl border, 不做渐变, 不做 hover translate
// - 适配 customer / lead / dashboard / 通用详情页
// - server component 即可, 走 globals.css token

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
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-base font-semibold text-foreground"
    >
      {ch}
    </div>
  );
}

function NodeIcon({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-foreground"
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
        "rounded-xl border border-border/60 bg-card p-6 shadow-sm",
        className,
      )}
    >
      <div className={cn("grid gap-6 lg:items-center", gridCols)}>
        {/* 左: icon + title + subtitle */}
        <div className="flex min-w-0 items-center gap-3">
          {icon.kind === "avatar" ? (
            <AvatarIcon text={icon.text} />
          ) : (
            <NodeIcon>{icon.node}</NodeIcon>
          )}
          <div className="min-w-0 space-y-1">
            <div className="truncate text-base font-semibold text-foreground">
              {title}
            </div>
            {subtitle ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>

        {/* 中: primaryBadge + actions */}
        {hasMiddle ? (
          <div className="min-w-0 space-y-2">
            {primaryBadge ? (
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge
                  label={primaryBadge.label}
                  variant={primaryBadge.variant ?? "neutral"}
                />
              </div>
            ) : null}
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        ) : null}

        {/* 右: rightMetric */}
        {hasRight && rightMetric ? (
          <div className="lg:text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {rightMetric.label}
            </div>
            <div className="mt-1 font-mono text-3xl font-semibold tracking-tight text-foreground">
              {rightMetric.value}
            </div>
            {rightMetric.hint ? (
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground lg:justify-end">
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
