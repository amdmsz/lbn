/**
 * FulfillmentSnapshotCard — 订单详情 5 区聚焦后的"物流"主区单卡.
 *
 * 设计目标:
 * - 销售点进订单详情, 物流只关心两件事: 现在到哪个阶段了 + 供货商单子状态.
 * - 顶部复用 <OrderProgressTrack> 反应主流程; 下方供货商子单默认折叠.
 * - 折叠的 SupplierFulfillmentAccordion 直接嵌入卡内 (不在 5 区之外再开一节).
 */

import type { ReactNode } from "react";
import { Truck } from "lucide-react";

import { cn } from "@/lib/utils";

export type FulfillmentSnapshotCardProps = Readonly<{
  /** 顶部进度轨道 (OrderProgressTrack widget) */
  progressTrack: ReactNode;
  /** 阶段摘要描述, 例如 "已发货 1/2 · 待报单 1" */
  summaryLine?: string | null;
  /** 主行动链接 (去发货执行 / 看批次) */
  primaryActionLabel?: string;
  primaryActionHref?: string | null;
  secondaryActionLabel?: string;
  secondaryActionHref?: string | null;
  /** 供货商子单 accordion (默认折叠状态下渲染) */
  supplierAccordion: ReactNode;
}>;

export function FulfillmentSnapshotCard({
  progressTrack,
  summaryLine,
  primaryActionLabel = "去发货执行",
  primaryActionHref,
  secondaryActionLabel = "看批次记录",
  secondaryActionHref,
  supplierAccordion,
}: FulfillmentSnapshotCardProps) {
  return (
    <section
      aria-label="物流"
      className={cn("rounded-xl border border-border/60 bg-card px-4 py-3.5 shadow-sm")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
          >
            <Truck className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[15px] font-semibold text-foreground">物流</h3>
          {summaryLine ? (
            <span className="text-xs text-muted-foreground">{summaryLine}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {primaryActionHref ? (
            <a
              href={primaryActionHref}
              className="font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {primaryActionLabel}
            </a>
          ) : null}
          {secondaryActionHref ? (
            <a
              href={secondaryActionHref}
              className="font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {secondaryActionLabel}
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-3">{progressTrack}</div>

      <div className="mt-3">{supplierAccordion}</div>
    </section>
  );
}

export default FulfillmentSnapshotCard;
