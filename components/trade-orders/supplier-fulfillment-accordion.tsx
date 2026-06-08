"use client";

/**
 * SupplierFulfillmentAccordion 替代订单详情中"supplier 子单执行总览"section
 * 以及底部三个独立摘要卡 (支付/发货/批次).
 *
 * 设计目标 (来自 DESIGN.md):
 * - 用 chip 流 + 折叠卡片承载子单, 默认收起, 避免 12 行字段堆.
 * - 顶部 1 行 summary chip 替代 3 个独立摘要卡.
 * - 展开后 4 个 mini panel: 商品 / 支付 / 发货 / 批次, 每行只保留关键字段.
 *
 * 数据 normalize 由父组件完成, 该组件只负责视觉.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Boxes,
  ChevronDown,
  CircleDot,
  Coins,
  PackageCheck,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { formatDateTime } from "@/lib/customers/metadata";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";
import { StatusBadge } from "@/components/shared/status-badge";

export type SupplierFulfillmentItem = Readonly<{
  id: string;
  supplierName: string;
  subOrderNo: string;
  finalAmount: string;
  collectedAmount: string;
  remainingAmount: string;
  paymentSchemeLabel: string;
  productSummary: string;
  reviewStatusLabel: string;
  reviewStatusVariant: StatusBadgeVariant;
  reportStatusLabel?: string;
  reportStatusVariant?: StatusBadgeVariant;
  shippingStatusLabel?: string;
  shippingStatusVariant?: StatusBadgeVariant;
  hasException: boolean;
  shippingProvider?: string | null;
  trackingNumber?: string | null;
  shippingPackageSummary?: string | null;
  paymentRecordCount: number;
  openCollectionTaskCount: number;
  latestBatchExportNo?: string | null;
  latestBatchExportedAt?: Date | null;
  latestBatchFileReady?: boolean;
  shippingHref: string;
  batchHref: string;
  detailHref: string;
}>;

export type SupplierFulfillmentSummary = Readonly<{
  subOrderCount: number;
  supplierCount: number;
  totalAmount: string;
  shippedCount: number;
  pendingReportCount: number;
  pendingTrackingCount: number;
  exceptionCount: number;
}>;

function MiniRowIcon({
  Icon,
  tone = "neutral",
}: Readonly<{
  Icon: typeof Truck;
  tone?: "primary" | "success" | "warning" | "neutral";
}>) {
  const cls = {
    primary: "text-blue-600 dark:text-blue-300",
    success: "text-emerald-600 dark:text-emerald-300",
    warning: "text-amber-600 dark:text-amber-300",
    neutral: "text-muted-foreground",
  }[tone];
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", cls)} />;
}

function MiniPanelRow({
  icon,
  label,
  children,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="flex h-5 items-center">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-sm leading-5 text-foreground">{children}</div>
      </div>
    </div>
  );
}

function SupplierCard({ item }: Readonly<{ item: SupplierFulfillmentItem }>) {
  const [open, setOpen] = useState(false);

  const shippedChipLabel = item.shippingStatusLabel ?? "待发货";
  const shippedChipVariant: StatusBadgeVariant =
    item.shippingStatusVariant ?? "neutral";

  return (
    <div className="rounded-xl border border-border/60 bg-card transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {item.supplierName}
          </span>
          <StatusBadge
            label={item.reviewStatusLabel}
            variant={item.reviewStatusVariant}
          />
          <StatusBadge label={shippedChipLabel} variant={shippedChipVariant} />
          {item.hasException ? (
            <StatusBadge label="执行异常" variant="danger" />
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <span className="font-mono text-base font-semibold tracking-tight text-foreground">
              {formatCurrency(item.finalAmount)}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open ? "rotate-180" : "",
              )}
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono">{item.subOrderNo}</span>
          {item.latestBatchExportNo ? (
            <>
              <span className="text-border">/</span>
              <span>最近批次 {item.latestBatchExportNo}</span>
            </>
          ) : null}
          {item.openCollectionTaskCount > 0 ? (
            <>
              <span className="text-border">/</span>
              <span className="text-amber-700 dark:text-amber-300">
                催收中 {item.openCollectionTaskCount}
              </span>
            </>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border/60 px-4 py-3">
          <MiniPanelRow
            icon={<MiniRowIcon Icon={Boxes} tone="neutral" />}
            label="商品"
          >
            {item.productSummary}
          </MiniPanelRow>
          <MiniPanelRow
            icon={<MiniRowIcon Icon={Coins} tone="success" />}
            label="收款"
          >
            <span className="font-mono">{formatCurrency(item.collectedAmount)}</span>
            <span className="mx-1.5 text-border">/</span>
            <span className="text-muted-foreground">待收 </span>
            <span className="font-mono">{formatCurrency(item.remainingAmount)}</span>
            <span className="mx-2 text-border">·</span>
            <span className="text-xs text-muted-foreground">
              {item.paymentSchemeLabel} · 收款 {item.paymentRecordCount} 条
            </span>
          </MiniPanelRow>
          <MiniPanelRow
            icon={<MiniRowIcon Icon={Truck} tone="primary" />}
            label="发货 / 物流"
          >
            <div className="flex flex-wrap items-center gap-2">
              {item.reportStatusLabel ? (
                <StatusBadge
                  label={item.reportStatusLabel}
                  variant={item.reportStatusVariant ?? "neutral"}
                />
              ) : null}
              <span className="text-sm">
                {item.shippingProvider || "物流公司待补充"}
                <span className="mx-1.5 text-border">/</span>
                <span className={item.trackingNumber ? "" : "text-muted-foreground"}>
                  {item.trackingNumber || "单号待回填"}
                </span>
              </span>
              {item.shippingPackageSummary ? (
                <span className="text-xs text-muted-foreground">
                  {item.shippingPackageSummary}
                </span>
              ) : null}
            </div>
          </MiniPanelRow>
          <MiniPanelRow
            icon={<MiniRowIcon Icon={PackageCheck} tone="primary" />}
            label="批次"
          >
            {item.latestBatchExportNo ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{item.latestBatchExportNo}</span>
                {item.latestBatchExportedAt ? (
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.latestBatchExportedAt)}
                  </span>
                ) : null}
                <StatusBadge
                  label={item.latestBatchFileReady ? "文件可下载" : "待重新生成"}
                  variant={item.latestBatchFileReady ? "success" : "warning"}
                />
              </div>
            ) : (
              <span className="text-muted-foreground">暂无导出批次</span>
            )}
          </MiniPanelRow>

          <div className="flex flex-wrap gap-3 pt-2 text-xs">
            <Link
              href={item.shippingHref}
              className="font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              去发货执行
            </Link>
            <Link
              href={item.detailHref}
              className="font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              查看子单详情
            </Link>
            <Link
              href={item.batchHref}
              className="font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              看批次记录
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  tone = "neutral",
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
}>) {
  const toneClass = {
    primary: "border-blue-200 text-blue-700 dark:border-blue-500/40 dark:text-blue-300",
    success:
      "border-emerald-200 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300",
    warning: "border-amber-200 text-amber-700 dark:border-amber-500/40 dark:text-amber-300",
    danger: "border-rose-200 text-rose-700 dark:border-rose-500/40 dark:text-rose-300",
    neutral: "border-border text-muted-foreground",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs",
        toneClass,
      )}
    >
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

export function SupplierFulfillmentAccordion({
  items,
  summary,
  emptyHint = "当前父单尚未物化 supplier 子单。",
}: Readonly<{
  items: ReadonlyArray<SupplierFulfillmentItem>;
  summary: SupplierFulfillmentSummary;
  emptyHint?: string;
}>) {
  return (
    <section aria-label="供货商子单" className="space-y-3">
      {/* 折叠态: 单 chip 行 (子单 / supplier / 总额); "已发货 X/Y" 与异常
          状态由物流卡进度轨道独立表达, 此处不再重复; 也不用浅蓝色强调技术信息 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          供货商子单
        </span>
        <SummaryChip
          icon={<CircleDot className="h-3 w-3" />}
          label="子单"
          value={summary.subOrderCount}
          tone="neutral"
        />
        <SummaryChip
          icon={<Boxes className="h-3 w-3" />}
          label="supplier"
          value={summary.supplierCount}
          tone="neutral"
        />
        <SummaryChip
          icon={<Coins className="h-3 w-3" />}
          label="总额"
          value={formatCurrency(summary.totalAmount)}
          tone="success"
        />
        {summary.exceptionCount > 0 ? (
          <SummaryChip
            icon={<CircleDot className="h-3 w-3" />}
            label="异常"
            value={summary.exceptionCount}
            tone="danger"
          />
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="border-l-2 border-dashed border-border/60 pl-4 text-sm text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <SupplierCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
