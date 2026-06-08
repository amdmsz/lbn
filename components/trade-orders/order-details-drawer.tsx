"use client";

/**
 * OrderDetailsDrawer — 5 区聚焦后, 把"订单号 hero / 4 metric grid / ActionZone tabs /
 * Timeline 全展开"这些次级信息折叠成"查看更多"抽屉.
 *
 * 设计目标:
 * - 5 大主区 (下单人 / 商品 / 地址 / 付款 / 物流) 是销售点进来第一屏要看到的;
 *   其余 dashboard 化的信息默认收起, 销售要时再展开.
 * - 不再用 PageHeader 之外的二级 hero / 4 张 metric grid 抢主区注意力.
 * - 折叠 toggle + children 区, 单按钮 (展开 / 收起).
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type OrderDetailsDrawerProps = Readonly<{
  /** "查看订单元信息 (订单号 / 金额 / 行动区 / 时间线)" */
  triggerLabel?: string;
  /** 默认是否展开 (例如有未读操作日志时由父组件设为 true) */
  defaultOpen?: boolean;
  /** 抽屉内的次级 widget 序列 (hero / metric grid / action zone / timeline) */
  children: ReactNode;
  /** 收起时显示的右侧 hint 文本 (例如 "12 条时间线") */
  hint?: string | null;
}>;

export function OrderDetailsDrawer({
  triggerLabel = "更多",
  defaultOpen = false,
  children,
  hint,
}: OrderDetailsDrawerProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      aria-label="订单更多信息"
      className={cn("rounded-xl border border-border/60 bg-card shadow-sm")}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left"
      >
        <span className="text-sm font-medium text-foreground">{triggerLabel}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {hint ? <span>{hint}</span> : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open ? "rotate-180" : "",
            )}
            aria-hidden="true"
          />
        </span>
      </button>
      {open ? (
        <div className="space-y-6 border-t border-border/60 px-6 py-6">{children}</div>
      ) : null}
    </section>
  );
}

export default OrderDetailsDrawer;
