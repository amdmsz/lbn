"use client";

import Link from "next/link";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import type { CustomerCenterFilters } from "@/lib/customers/queries";
import type { CustomerQueueKey } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

export type CustomerQueueTabItem = {
  key: CustomerQueueKey;
  label: string;
  count: number;
};

type CustomerQueueTabsProps = {
  items: CustomerQueueTabItem[];
  activeKey: CustomerQueueKey;
  /** 当前列表过滤态, 切 queue 时复用其余条件 (search / grade / ...). */
  filters: CustomerCenterFilters;
  className?: string;
};

const numberFormatter = new Intl.NumberFormat("zh-CN");

/**
 * 客户队列横向 tab. 纯展示 — 切换走 next/link href (queue 落进 URL),
 * 不持有任何本地状态, 不碰 customers-table / workbench / dialog.
 *
 * 移动端 overflow-x-auto 可横滑; active = 实心主色 chip, 非 active = 描边 chip.
 */
export function CustomerQueueTabs({
  items,
  activeKey,
  filters,
  className,
}: CustomerQueueTabsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="客户队列"
      className={cn(
        "-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;
        // 切 queue 回到第 1 页, 其余过滤条件保持.
        const href = buildCustomersHref(filters, { queue: item.key, page: 1 });

        return (
          <Link
            key={item.key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5",
              "text-[0.8125rem] transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--info-hsl)/0.45)]",
              isActive
                ? "bg-primary font-medium text-primary-foreground"
                : "border border-border bg-transparent font-normal text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{item.label}</span>
            <span
              className={cn(
                "tabular-nums",
                isActive ? "text-primary-foreground/85" : "text-muted-foreground/75",
              )}
            >
              {numberFormatter.format(item.count)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
