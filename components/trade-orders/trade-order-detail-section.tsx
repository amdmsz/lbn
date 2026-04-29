"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { TradeOrderRecycleDialog } from "@/components/trade-orders/trade-order-recycle-dialog";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  buildFulfillmentBatchesHref,
  buildFulfillmentShippingHref,
  buildFulfillmentTradeOrdersHref,
  type FulfillmentShippingStageView,
} from "@/lib/fulfillment/navigation";
import {
  formatCurrency,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderPaymentSchemeVariant,
  getSalesOrderReviewStatusLabel,
  getSalesOrderReviewStatusVariant,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
  getShippingReportStatusVariant,
} from "@/lib/fulfillment/metadata";
import {
  buildTradeOrderCollectionHref,
  buildTradeOrderPaymentHref,
} from "@/lib/trade-orders/execution-links";
import type { getTradeOrderDetail } from "@/lib/trade-orders/queries";
import type {
  TradeOrderRecycleGuard,
  TradeOrderRecycleReasonCode,
} from "@/lib/trade-orders/recycle-guards";
import type { RecycleFinalizePreview } from "@/lib/recycle-bin/types";

type TradeOrderDetailData = NonNullable<Awaited<ReturnType<typeof getTradeOrderDetail>>>;
type TradeOrderDetail = TradeOrderDetailData["order"];
type OperationLogItem = TradeOrderDetailData["operationLogs"][number];
type TradeOrderPaymentRecordItem = TradeOrderDetail["paymentRecords"][number];
type TradeOrderCollectionTaskItem = TradeOrderDetail["collectionTasks"][number];
type SalesOrderItem = TradeOrderDetail["salesOrders"][number];
type SalesOrderExecutionItem = NonNullable<TradeOrderDetail["executionSummary"]>["salesOrders"][number];
type TradeOrderRecycleActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
  guard?: TradeOrderRecycleGuard;
  finalizePreview?: RecycleFinalizePreview | null;
};

type BatchReference = {
  id: string;
  exportNo: string;
  exportedAt: Date;
  fileUrl: string | null;
  supplierId: string;
  supplierName: string;
};

function getTradeStatusLabel(
  value: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED",
) {
  switch (value) {
    case "DRAFT":
      return "草稿";
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已拒绝";
    case "CANCELED":
      return "已取消";
    default:
      return value;
  }
}

function getTradeStatusVariant(
  value: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED",
): StatusBadgeVariant {
  switch (value) {
    case "PENDING_REVIEW":
      return "warning";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

function getTradeItemTypeLabel(value: "SKU" | "GIFT" | "BUNDLE") {
  switch (value) {
    case "SKU":
      return "SKU";
    case "GIFT":
      return "赠品";
    case "BUNDLE":
      return "套餐";
    default:
      return value;
  }
}

function getTradeItemTypeVariant(value: "SKU" | "GIFT" | "BUNDLE"): StatusBadgeVariant {
  switch (value) {
    case "SKU":
      return "info";
    case "BUNDLE":
      return "warning";
    default:
      return "neutral";
  }
}

function formatSubOrderStatus(value: string | null) {
  if (!value) {
    return "待父单审核";
  }

  switch (value) {
    case "PENDING_PARENT_REVIEW":
      return "待父单审核";
    case "READY_FOR_FULFILLMENT":
      return "待执行";
    case "IN_FULFILLMENT":
      return "执行中";
    case "COMPLETED":
      return "已完成";
    case "CANCELED":
      return "已取消";
    default:
      return value;
  }
}

function getPaymentRecordStatusSummaryLabel(value: "SUBMITTED" | "CONFIRMED" | "REJECTED") {
  switch (value) {
    case "SUBMITTED":
      return "收款已提交";
    case "CONFIRMED":
      return "收款已确认";
    case "REJECTED":
      return "收款被驳回";
    default:
      return value;
  }
}

function getCollectionTaskTypeSummaryLabel(
  value: "BALANCE_COLLECTION" | "COD_COLLECTION" | "FREIGHT_COLLECTION" | "GENERAL_COLLECTION",
) {
  switch (value) {
    case "BALANCE_COLLECTION":
      return "尾款催收";
    case "COD_COLLECTION":
      return "COD 催收";
    case "FREIGHT_COLLECTION":
      return "运费催收";
    case "GENERAL_COLLECTION":
      return "一般催收";
    default:
      return value;
  }
}

function getCollectionTaskStatusSummaryLabel(
  value: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED",
) {
  switch (value) {
    case "PENDING":
      return "待处理";
    case "IN_PROGRESS":
      return "跟进中";
    case "COMPLETED":
      return "已完成";
    case "CANCELED":
      return "已取消";
    default:
      return value;
  }
}

function isShippingCompletedLike(
  value: "PENDING" | "READY_TO_SHIP" | "SHIPPED" | "DELIVERED" | "COMPLETED" | "CANCELED" | null,
) {
  return value === "SHIPPED" || value === "DELIVERED" || value === "COMPLETED";
}

function sumCurrency(values: string[]) {
  return values.reduce((sum, current) => sum + Number(current), 0);
}

function getBatchFileStateMeta(fileUrl: string | null) {
  if (fileUrl) {
    return {
      label: "文件可下载",
      variant: "success" as const,
    };
  }

  return {
    label: "待重新生成",
    variant: "warning" as const,
  };
}

function getSalesOrderProductSummary(items: SalesOrderItem["items"]) {
  if (items.length === 0) {
    return "暂无执行商品";
  }

  const heads = items
    .slice(0, 2)
    .map((item) => item.titleSnapshot || item.productNameSnapshot || item.skuNameSnapshot)
    .filter(Boolean);

  if (items.length <= 2) {
    return heads.join(" / ");
  }

  return `${heads.join(" / ")} 等 ${items.length} 项`;
}

function getTradeItemHeadline(item: TradeOrderDetail["items"][number]) {
  return (
    item.titleSnapshot ||
    item.bundleNameSnapshot ||
    item.productNameSnapshot ||
    item.skuNameSnapshot ||
    `成交行 ${item.lineNo}`
  );
}

function getTradeItemSubline(item: TradeOrderDetail["items"][number]) {
  const parts = [item.productNameSnapshot, item.skuNameSnapshot, item.specSnapshot].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "暂无商品摘要";
}

function getLatestBatchReferences(order: TradeOrderDetail) {
  const unique = new Map<string, BatchReference>();

  for (const salesOrder of order.salesOrders) {
    const exportBatch = salesOrder.shippingTask?.exportBatch;
    if (!exportBatch) {
      continue;
    }

    unique.set(exportBatch.id, {
      id: exportBatch.id,
      exportNo: exportBatch.exportNo,
      exportedAt: exportBatch.exportedAt,
      fileUrl: exportBatch.fileUrl,
      supplierId: salesOrder.supplier.id,
      supplierName: salesOrder.supplier.name,
    });
  }

  return Array.from(unique.values()).sort(
    (left, right) => right.exportedAt.getTime() - left.exportedAt.getTime(),
  );
}

function getTradeOrderShippingStage(
  summary: TradeOrderDetail["executionSummary"],
): FulfillmentShippingStageView | undefined {
  if (!summary) {
    return undefined;
  }

  if (summary.exceptionSubOrderCount > 0) {
    return "EXCEPTION";
  }

  if (summary.pendingTrackingSubOrderCount > 0) {
    return "PENDING_TRACKING";
  }

  if (summary.pendingReportSubOrderCount > 0) {
    return "PENDING_REPORT";
  }

  if (summary.shippedSubOrderCount > 0) {
    return "SHIPPED";
  }

  return undefined;
}

function getSalesOrderShippingStage(
  executionSummary: SalesOrderExecutionItem | undefined,
): FulfillmentShippingStageView | undefined {
  if (!executionSummary) {
    return undefined;
  }

  if (executionSummary.hasException) {
    return "EXCEPTION";
  }

  if (executionSummary.reportStatus !== "REPORTED" && !executionSummary.hasTrackingNumber) {
    return "PENDING_REPORT";
  }

  if (executionSummary.reportStatus === "REPORTED" && !executionSummary.hasTrackingNumber) {
    return "PENDING_TRACKING";
  }

  if (executionSummary.shippingStatus && isShippingCompletedLike(executionSummary.shippingStatus)) {
    return "SHIPPED";
  }

  return undefined;
}

function getShippingSummaryText(salesOrder: SalesOrderItem, executionSummary?: SalesOrderExecutionItem) {
  if (!salesOrder.shippingTask) {
    return "待初始化发货任务";
  }

  const segments = [
    getShippingReportStatusLabel(salesOrder.shippingTask.reportStatus),
    getShippingFulfillmentStatusLabel(salesOrder.shippingTask.shippingStatus),
  ];

  if (salesOrder.shippingTask.shippingProvider || salesOrder.shippingTask.trackingNumber) {
    segments.push(
      [
        salesOrder.shippingTask.shippingProvider || "物流公司待补充",
        salesOrder.shippingTask.trackingNumber || "物流单号待回填",
      ].join(" / "),
    );
  }

  if (executionSummary?.hasException) {
    segments.push("存在执行异常");
  }

  return segments.join(" / ");
}

function getTradeOrderNextAction(summary: TradeOrderDetail["executionSummary"]) {
  if (!summary) {
    return {
      label: "待审核",
      description: "父单审核后会物化 supplier 子单，并生成履约执行摘要。",
      variant: "neutral" as const,
    };
  }

  if (summary.exceptionSubOrderCount > 0) {
    return {
      label: "异常优先",
      description: "存在取消、文件缺失或状态冲突，建议先进入发货执行异常队列。",
      variant: "danger" as const,
    };
  }

  if (summary.pendingReportSubOrderCount > 0) {
    return {
      label: `待报单 ${summary.pendingReportSubOrderCount}`,
      description: "还有 supplier 子单未冻结导出，下一步进入发货执行报单池。",
      variant: "warning" as const,
    };
  }

  if (summary.pendingTrackingSubOrderCount > 0) {
    return {
      label: `待填物流 ${summary.pendingTrackingSubOrderCount}`,
      description: "已导出的 supplier 子单需要按各自物流单号分别回填。",
      variant: "warning" as const,
    };
  }

  if (summary.openCollectionSubOrderCount > 0) {
    return {
      label: `催收中 ${summary.openCollectionSubOrderCount}`,
      description: "履约推进后仍有打开中的催收任务，建议进入催收工作面。",
      variant: "info" as const,
    };
  }

  if (summary.allShipped) {
    return {
      label: "已全部发货",
      description: "所有 supplier 子单均已发货，可继续关注签收、COD 与回款结果。",
      variant: "success" as const,
    };
  }

  return {
    label: "持续跟进中",
    description: "父单已进入执行链路，请按 supplier 子单分别推进履约与收款。",
    variant: "info" as const,
  };
}

const detailLabelClassName =
  "text-xs font-medium text-muted-foreground";
const detailValueClassName =
  "text-sm font-medium text-foreground";
const detailAmountClassName =
  "font-mono text-lg font-semibold tracking-tight text-foreground";
const detailActionClassName =
  "inline-flex items-center rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary";
const subtleInlineLinkClassName =
  "text-xs font-medium text-muted-foreground transition-colors hover:text-primary";

function DetailPair({
  label,
  children,
  valueClassName = detailValueClassName,
}: Readonly<{
  label: string;
  children: ReactNode;
  valueClassName?: string;
}>) {
  return (
    <div className="space-y-1">
      <div className={detailLabelClassName}>{label}</div>
      <div className={valueClassName}>{children}</div>
    </div>
  );
}

function OverviewCard({
  eyebrow,
  title,
  children,
  footer,
}: Readonly<{
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}>) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card px-5 py-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </div>
      <div className="mt-2 font-mono text-lg font-semibold tracking-tight text-foreground">{title}</div>
      <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
      {footer ? (
        <div className="mt-4 border-t border-border/40 pt-3 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function TradeOrderItemsSection({
  order,
  bundleCount,
  giftCount,
}: Readonly<{
  order: TradeOrderDetail;
  bundleCount: number;
  giftCount: number;
}>) {
  return (
    <section className="crm-section-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">父单商品与成交信息</h3>
          <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
            这里回答“这笔成交卖了什么”。页面按 TradeOrderItem 展示销售语义，套餐和赠品只做轻量识别，
            supplier 执行拆分留在下一层查看。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.discountAmount !== "0" ? (
            <StatusBadge label={`折扣 ${formatCurrency(order.discountAmount)}`} variant="warning" />
          ) : null}
          {bundleCount > 0 ? <StatusBadge label={`套餐 ${bundleCount}`} variant="info" /> : null}
          {giftCount > 0 ? <StatusBadge label={`赠品 ${giftCount}`} variant="neutral" /> : null}
        </div>
      </div>

      <div className="mt-5 divide-y divide-border/40">
        {order.items.map((item) => (
          <div key={item.id} className="py-5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-foreground">
                    第 {item.lineNo} 行 / {getTradeItemHeadline(item)}
                  </span>
                  <StatusBadge
                    label={getTradeItemTypeLabel(item.itemType)}
                    variant={getTradeItemTypeVariant(item.itemType)}
                  />
                </div>
                <div className="text-sm leading-6 text-muted-foreground">{getTradeItemSubline(item)}</div>
              </div>
              <div className="text-right">
                <div className={detailAmountClassName}>
                  {formatCurrency(item.subtotal)}
                </div>
                <div className="text-xs text-muted-foreground">
                  成交价 {formatCurrency(item.dealUnitPriceSnapshot)} / 原价{" "}
                  {formatCurrency(item.listUnitPriceSnapshot)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailPair label="商品数量">
                {item.qty}
                {item.unitSnapshot || ""}
              </DetailPair>
              <DetailPair label="折扣金额" valueClassName="font-mono text-sm font-medium text-foreground">
                {formatCurrency(item.discountAmount)}
              </DetailPair>
              {item.itemType === "BUNDLE" && item.bundleCodeSnapshot ? (
                <DetailPair label="套餐编码">{item.bundleCodeSnapshot}</DetailPair>
              ) : null}
              {item.itemType === "BUNDLE" && item.bundleVersionSnapshot !== null ? (
                <DetailPair label="套餐版本">{item.bundleVersionSnapshot}</DetailPair>
              ) : null}
            </div>

            {item.remark ? (
              <div className="mt-4 border-l-2 border-border/50 pl-4 text-sm leading-6 text-muted-foreground">
                {item.remark}
              </div>
            ) : null}

            {item.components.length > 0 ? (
              <div className="mt-5 border-l-2 border-border/50 pl-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {item.itemType === "BUNDLE" ? "执行组件" : "执行去向"}
                </div>
                <div className="mt-3 divide-y divide-border/40">
                  {item.components.map((component) => {
                    const mappedSalesOrder = component.salesOrderItems[0]?.salesOrder ?? null;
                    return (
                      <div
                        key={component.id}
                        className="py-3 text-xs text-muted-foreground first:pt-0 last:pb-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-foreground">
                            {component.productNameSnapshot}
                            {component.skuNameSnapshot ? ` / ${component.skuNameSnapshot}` : ""}
                          </div>
                          <div className="text-xs font-medium text-muted-foreground">
                            {component.supplierNameSnapshot}
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            数量：{component.qty}
                            {component.unitSnapshot || ""}
                          </span>
                          <span className="font-mono font-medium text-foreground">
                            {formatCurrency(component.allocatedSubtotal)}
                          </span>
                          <span>
                            去向：{" "}
                            {mappedSalesOrder
                              ? `${order.tradeNo} / ${mappedSalesOrder.subOrderNo || mappedSalesOrder.orderNo} / ${mappedSalesOrder.supplier.name}`
                              : "待物化子单"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function SupplierExecutionSection({
  order,
  totalSubOrders,
  plannedSupplierCount,
  actualSupplierCount,
  executionSummaryBySalesOrderId,
  plannedSupplierGroups,
}: Readonly<{
  order: TradeOrderDetail;
  totalSubOrders: number;
  plannedSupplierCount: number;
  actualSupplierCount: number;
  executionSummaryBySalesOrderId: Map<string, SalesOrderExecutionItem>;
  plannedSupplierGroups: Array<{
    supplierId: string;
    supplierName: string;
    lineCount: number;
    subtotal: number;
  }>;
}>) {
  return (
    <section className="crm-section-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">supplier 子单执行总览</h3>
          <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
            这里不展开完整子单详情，只回答“拆成了哪些 supplier 子单、各自推进到哪、下一步去哪里处理”。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={`子单 ${totalSubOrders || plannedSupplierCount}`} variant="info" />
          <StatusBadge label={`supplier ${actualSupplierCount || plannedSupplierCount}`} variant="neutral" />
        </div>
      </div>

      {order.salesOrders.length > 0 ? (
        <div className="mt-5 divide-y divide-border/40">
          {order.salesOrders.map((salesOrder) => {
            const salesOrderExecution = executionSummaryBySalesOrderId.get(salesOrder.id);
            const latestSalesOrderBatch = salesOrder.shippingTask?.exportBatch ?? null;
            const salesOrderShippingHref = buildFulfillmentShippingHref({
              keyword: order.tradeNo,
              supplierViewId: salesOrder.supplier.id,
              stageView: getSalesOrderShippingStage(salesOrderExecution),
            });
            const salesOrderBatchHref = buildFulfillmentBatchesHref({
              keyword: latestSalesOrderBatch?.exportNo || order.tradeNo,
              supplierId: salesOrder.supplier.id,
            });

            return (
              <div
                key={salesOrder.id}
                className="py-5 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-foreground">
                      {salesOrder.supplier.name}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {order.tradeNo} / {salesOrder.subOrderNo || salesOrder.orderNo}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      label={getSalesOrderReviewStatusLabel(salesOrder.reviewStatus)}
                      variant={getSalesOrderReviewStatusVariant(salesOrder.reviewStatus)}
                    />
                    {salesOrder.shippingTask ? (
                      <>
                        <StatusBadge
                          label={getShippingReportStatusLabel(salesOrder.shippingTask.reportStatus)}
                          variant={getShippingReportStatusVariant(salesOrder.shippingTask.reportStatus)}
                        />
                        <StatusBadge
                          label={getShippingFulfillmentStatusLabel(salesOrder.shippingTask.shippingStatus)}
                          variant={getShippingFulfillmentStatusVariant(
                            salesOrder.shippingTask.shippingStatus,
                          )}
                        />
                      </>
                    ) : (
                      <StatusBadge label="待初始化发货" variant="neutral" />
                    )}
                    {salesOrderExecution?.hasException ? (
                      <StatusBadge label="执行异常" variant="danger" />
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.95fr)] lg:divide-x lg:divide-border/40">
                  <div className="space-y-3 lg:pr-5">
                    <DetailPair label="商品摘要">
                      {getSalesOrderProductSummary(salesOrder.items)}
                    </DetailPair>
                    <DetailPair label="子单状态">
                      {formatSubOrderStatus(salesOrder.subOrderStatus)}
                    </DetailPair>
                  </div>

                  <div className="grid gap-3 lg:px-5">
                    <DetailPair label="子单金额" valueClassName={detailAmountClassName}>
                      {formatCurrency(salesOrder.finalAmount)}
                    </DetailPair>
                    <DetailPair label="已录金额" valueClassName="font-mono text-sm font-medium text-foreground">
                      {formatCurrency(salesOrder.collectedAmount)}
                    </DetailPair>
                    <DetailPair label="待收金额" valueClassName="font-mono text-sm font-medium text-foreground">
                      {formatCurrency(salesOrder.remainingAmount)}
                    </DetailPair>
                    <DetailPair label="支付方案">
                      {getSalesOrderPaymentSchemeLabel(salesOrder.paymentScheme)}
                    </DetailPair>
                  </div>

                  <div className="grid gap-3 lg:pl-5">
                    <DetailPair label="发货与物流">
                      {getShippingSummaryText(salesOrder, salesOrderExecution)}
                    </DetailPair>
                    <DetailPair label="收款与催收">
                        收款记录：{salesOrderExecution?.paymentRecordCount ?? 0}
                        <span className="mx-1 text-border">/</span>
                        催收中：{salesOrderExecution?.openCollectionTaskCount ?? 0}
                    </DetailPair>
                    <DetailPair label="最近批次">
                        {latestSalesOrderBatch
                          ? `${latestSalesOrderBatch.exportNo} / ${formatDateTime(
                              latestSalesOrderBatch.exportedAt,
                            )}`
                          : "暂无批次"}
                    </DetailPair>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
                  <Link href={salesOrderShippingHref} className={subtleInlineLinkClassName}>
                    去发货执行
                  </Link>
                  <Link href={`/orders/${salesOrder.id}`} className={subtleInlineLinkClassName}>
                    查看子单详情
                  </Link>
                  <Link href={salesOrderBatchHref} className={subtleInlineLinkClassName}>
                    {latestSalesOrderBatch ? "看最近批次" : "看批次记录"}
                  </Link>
                  {latestSalesOrderBatch ? (
                    <StatusBadge
                      label={getBatchFileStateMeta(latestSalesOrderBatch.fileUrl).label}
                      variant={getBatchFileStateMeta(latestSalesOrderBatch.fileUrl).variant}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="border-l-2 border-dashed border-border/60 pl-4 text-sm leading-7 text-muted-foreground">
            当前父单尚未物化 supplier 子单。通常在提交审核后，系统才会根据 supplier 规划自动拆出
            SalesOrder 子单。
          </div>
          {plannedSupplierGroups.length > 0 ? (
            <div className="divide-y divide-border/40">
              {plannedSupplierGroups.map((group) => (
                <div
                  key={group.supplierId}
                  className="py-3 first:pt-0 last:pb-0"
                >
                  <div className="text-sm font-medium text-foreground">{group.supplierName}</div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-6 text-muted-foreground">
                    <span>规划子单 1 张</span>
                    <span>成交行 {group.lineCount} 行</span>
                    <span className="font-mono font-medium text-foreground">
                      {formatCurrency(String(group.subtotal))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FulfillmentSummaryCards({
  order,
  executionSummary,
  totalSubOrders,
  totalChildCollectedAmount,
  totalChildRemainingAmount,
  confirmedPaymentRecordCount,
  openCollectionTaskCount,
  primaryShippingHref,
  batchHref,
  latestBatch,
  latestBatchReferences,
}: Readonly<{
  order: TradeOrderDetail;
  executionSummary: TradeOrderDetail["executionSummary"];
  totalSubOrders: number;
  totalChildCollectedAmount: number;
  totalChildRemainingAmount: number;
  confirmedPaymentRecordCount: number;
  openCollectionTaskCount: number;
  primaryShippingHref: string;
  batchHref: string;
  latestBatch: BatchReference | null;
  latestBatchReferences: BatchReference[];
}>) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <OverviewCard
        eyebrow="支付与催收摘要"
        title={formatCurrency(order.remainingAmount)}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <Link href={buildTradeOrderPaymentHref(order.tradeNo)} className={subtleInlineLinkClassName}>
              去支付记录
            </Link>
            <Link
              href={buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" })}
              className={subtleInlineLinkClassName}
            >
              去催收任务
            </Link>
          </div>
        }
      >
        <div>已录金额：{formatCurrency(order.collectedAmount)}</div>
        <div>子单已录：{formatCurrency(String(totalChildCollectedAmount))}</div>
        <div>确认收款记录：{confirmedPaymentRecordCount}</div>
        <div>子单待收：{formatCurrency(String(totalChildRemainingAmount))}</div>
        <div>催收中：{openCollectionTaskCount}</div>
      </OverviewCard>

      <OverviewCard
        eyebrow="发货与物流摘要"
        title={`${executionSummary?.reportedSubOrderCount ?? 0} / ${executionSummary?.totalSubOrderCount ?? totalSubOrders} 已报单`}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <Link href={primaryShippingHref} className={subtleInlineLinkClassName}>
              去发货执行
            </Link>
            <Link
              href={buildFulfillmentShippingHref({
                keyword: order.tradeNo,
                stageView: "EXCEPTION",
              })}
              className={subtleInlineLinkClassName}
            >
              查看异常队列
            </Link>
          </div>
        }
      >
        <div>待报单：{executionSummary?.pendingReportSubOrderCount ?? 0}</div>
        <div>待物流：{executionSummary?.pendingTrackingSubOrderCount ?? 0}</div>
        <div>已发货：{executionSummary?.shippedSubOrderCount ?? 0}</div>
        <div>物流异常：{executionSummary?.exceptionSubOrderCount ?? 0}</div>
      </OverviewCard>

      <OverviewCard
        eyebrow="批次记录摘要"
        title={latestBatch ? latestBatch.exportNo : "暂无批次"}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <Link href={batchHref} className={subtleInlineLinkClassName}>
              去批次记录
            </Link>
            {latestBatch ? (
              <Link
                href={buildFulfillmentBatchesHref({ keyword: latestBatch.exportNo })}
                className={subtleInlineLinkClassName}
              >
                看最近批次
              </Link>
            ) : null}
          </div>
        }
      >
        <div>相关批次数：{latestBatchReferences.length}</div>
        <div>最近导出：{latestBatch ? formatDateTime(latestBatch.exportedAt) : "暂无"}</div>
        <div>最近 supplier：{latestBatch?.supplierName || "暂无"}</div>
        <div>
          文件状态：{latestBatch ? getBatchFileStateMeta(latestBatch.fileUrl).label : "暂无文件"}
        </div>
      </OverviewCard>
    </section>
  );
}

function ParentOrderAlertsSection({
  order,
  unreportedSubOrders,
  shippedWithoutPaymentSubOrders,
  openCollectionSubOrders,
  isClearlySplit,
  primaryShippingHref,
}: Readonly<{
  order: TradeOrderDetail;
  unreportedSubOrders: SalesOrderExecutionItem[];
  shippedWithoutPaymentSubOrders: SalesOrderExecutionItem[];
  openCollectionSubOrders: SalesOrderExecutionItem[];
  isClearlySplit: boolean;
  primaryShippingHref: string;
}>) {
  if (
    unreportedSubOrders.length === 0 &&
    shippedWithoutPaymentSubOrders.length === 0 &&
    openCollectionSubOrders.length === 0 &&
    !isClearlySplit
  ) {
    return null;
  }

  return (
    <section className="crm-section-card">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">父单级提醒</h3>
        <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
          这里只做父单层的异常与推进提醒，真正的处理仍回到对应执行页面完成。
        </p>
      </div>
      <div className="mt-5 grid gap-3">
        {unreportedSubOrders.length > 0 ? (
          <div className="border-l-2 border-amber-500/30 pl-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">仍有子单未报单</div>
                <div className="text-xs leading-6 text-muted-foreground">
                  {unreportedSubOrders.length} 个子单还未进入 supplier 报单批次。
                </div>
              </div>
              <Link
                href={buildFulfillmentShippingHref({
                  keyword: order.tradeNo,
                  stageView: "PENDING_REPORT",
                })}
                className={subtleInlineLinkClassName}
              >
                去看待报单子单
              </Link>
            </div>
          </div>
        ) : null}

        {shippedWithoutPaymentSubOrders.length > 0 ? (
          <div className="border-l-2 border-destructive/30 pl-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">已发货但未见收款</div>
                <div className="text-xs leading-6 text-muted-foreground">
                  {shippedWithoutPaymentSubOrders.length} 个子单已发货，但当前父单下还没有对应收款记录。
                </div>
              </div>
              <Link href={buildTradeOrderPaymentHref(order.tradeNo)} className={subtleInlineLinkClassName}>
                去看收款记录
              </Link>
            </div>
          </div>
        ) : null}

        {openCollectionSubOrders.length > 0 ? (
          <div className="border-l-2 border-amber-500/30 pl-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">仍有催收任务进行中</div>
                <div className="text-xs leading-6 text-muted-foreground">
                  {openCollectionSubOrders.length} 个子单仍在催收链路里，建议优先确认是否已收款未回填。
                </div>
              </div>
              <Link
                href={buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" })}
                className={subtleInlineLinkClassName}
              >
                去看催收任务
              </Link>
            </div>
          </div>
        ) : null}

        {isClearlySplit ? (
          <div className="border-l-2 border-border/60 pl-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">父单内推进状态分裂明显</div>
                <div className="text-xs leading-6 text-muted-foreground">
                  同一 tradeNo 下的子单已出现待报单、已发货、收款和催收状态并行的情况。
                </div>
              </div>
              <Link href={primaryShippingHref} className={subtleInlineLinkClassName}>
                去执行工作台继续看
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TimelineAndOperationLogSection({
  timelineEntries,
  operationLogs,
}: Readonly<{
  timelineEntries: Array<{
    id: string;
    occurredAt: Date;
    title: string;
    detail: string;
    href: string;
  }>;
  operationLogs: OperationLogItem[];
}>) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
      <section className="crm-section-card">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">关键时间线</h3>
          <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
            这里只聚合审核、子单报单、发货、收款与催收关键事件，用来快速理解这单整体推进到哪。
          </p>
        </div>
        <div className="mt-5 divide-y divide-border/40">
          {timelineEntries.length > 0 ? (
            timelineEntries.map((entry) => (
              <div
                key={entry.id}
                className="py-4 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">{entry.title}</div>
                    <div className="text-xs leading-6 text-muted-foreground">{entry.detail}</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatDateTime(entry.occurredAt)}
                    </div>
                    <Link href={entry.href} className={subtleInlineLinkClassName}>
                      查看上下文
                    </Link>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="border-l-2 border-dashed border-border/60 pl-4 text-sm text-muted-foreground">
              当前还没有可展示的关键动作时间线。
            </div>
          )}
        </div>
      </section>

      <section className="crm-section-card">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">操作日志</h3>
          <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
            这里聚合父单、supplier 子单和已生成发货任务的关键操作，保证从成交到执行的链路可追踪。
          </p>
        </div>
        <div className="mt-5 divide-y divide-border/40">
          {operationLogs.length > 0 ? (
            operationLogs.map((record) => (
              <div
                key={record.id}
                className="py-4 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {record.module} / {record.action}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(record.createdAt)}
                  </div>
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  {record.description || "无描述"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  操作人：{record.actor?.name || record.actor?.username || "系统"}
                </div>
              </div>
            ))
          ) : (
            <div className="border-l-2 border-dashed border-border/60 pl-4 text-sm text-muted-foreground">
              当前还没有操作日志记录。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function TradeOrderDetailSection({
  order,
  operationLogs,
  canReview,
  canContinueEdit,
  continueEditHref,
  reviewAction,
  moveToRecycleBinAction,
}: Readonly<{
  order: TradeOrderDetail;
  operationLogs: OperationLogItem[];
  canReview: boolean;
  canContinueEdit: boolean;
  continueEditHref?: string;
  reviewAction: (formData: FormData) => Promise<void>;
  moveToRecycleBinAction: (formData: FormData) => Promise<TradeOrderRecycleActionResult>;
}>) {
  const [notice, setNotice] = useState<TradeOrderRecycleActionResult | null>(null);
  const [recycleDialogOpen, setRecycleDialogOpen] = useState(false);
  const [recycleReason, setRecycleReason] =
    useState<TradeOrderRecycleReasonCode>("mistaken_creation");
  const [recyclePending, startRecycleTransition] = useTransition();
  const router = useRouter();
  const plannedSupplierGroups = Array.from(
    order.components.reduce<
      Map<
        string,
        {
          supplierId: string;
          supplierName: string;
          lineCount: number;
          subtotal: number;
        }
      >
    >((map, component) => {
      const current = map.get(component.supplierId) ?? {
        supplierId: component.supplierId,
        supplierName: component.supplierNameSnapshot,
        lineCount: 0,
        subtotal: 0,
      };
      current.lineCount += 1;
      current.subtotal += Number(component.allocatedSubtotal);
      map.set(component.supplierId, current);
      return map;
    }, new Map()),
  ).map(([, value]) => value);

  const totalSubOrders = order.salesOrders.length;
  const actualSupplierCount = new Set(order.salesOrders.map((salesOrder) => salesOrder.supplier.id))
    .size;
  const plannedSupplierCount = plannedSupplierGroups.length;
  const totalItemQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const directSkuCount = order.items.filter((item) => item.itemType === "SKU").length;
  const giftCount = order.items.filter((item) => item.itemType === "GIFT").length;
  const bundleCount = order.items.filter((item) => item.itemType === "BUNDLE").length;
  const totalChildCollectedAmount = sumCurrency(
    order.salesOrders.map((salesOrder) => salesOrder.collectedAmount),
  );
  const totalChildRemainingAmount = sumCurrency(
    order.salesOrders.map((salesOrder) => salesOrder.remainingAmount),
  );
  const openCollectionTaskCount = order.collectionTasks.filter(
    (task) => task.status === "PENDING" || task.status === "IN_PROGRESS",
  ).length;
  const confirmedPaymentRecordCount = order.paymentRecords.filter(
    (paymentRecord) => paymentRecord.status === "CONFIRMED",
  ).length;
  const latestBatchReferences = getLatestBatchReferences(order);
  const latestBatch = latestBatchReferences[0] ?? null;
  const executionSummary = order.executionSummary;
  const executionSummaryBySalesOrderId = new Map(
    executionSummary?.salesOrders.map((salesOrder) => [salesOrder.id, salesOrder]) ?? [],
  );
  const submitReviewLog = operationLogs.find(
    (record) => record.action === "trade_order.submitted_for_review",
  );
  const reviewDecisionLog = operationLogs.find(
    (record) =>
      record.action === "trade_order.approved" || record.action === "trade_order.rejected",
  );

  const timelineEntries = [
    submitReviewLog
      ? {
          id: `review-submit-${submitReviewLog.id}`,
          occurredAt: submitReviewLog.createdAt,
          title: "提交审核",
          detail: `${order.tradeNo} 已提交审核`,
          href: `/orders/${order.id}`,
        }
      : null,
    reviewDecisionLog
      ? {
          id: `review-result-${reviewDecisionLog.id}`,
          occurredAt: reviewDecisionLog.createdAt,
          title: reviewDecisionLog.action === "trade_order.approved" ? "审核通过" : "审核驳回",
          detail: reviewDecisionLog.description || `${order.tradeNo} 审核状态已更新`,
          href: `/orders/${order.id}`,
        }
      : null,
    ...order.salesOrders
      .filter((salesOrder) => salesOrder.shippingTask?.reportedAt)
      .map((salesOrder) => ({
        id: `reported-${salesOrder.id}`,
        occurredAt: salesOrder.shippingTask?.reportedAt ?? salesOrder.createdAt,
        title: "子单报单",
        detail: `${salesOrder.subOrderNo || salesOrder.orderNo} / ${salesOrder.supplier.name} 已报单`,
        href: buildFulfillmentShippingHref({
          keyword: order.tradeNo,
          supplierViewId: salesOrder.supplier.id,
          stageView: "PENDING_TRACKING",
        }),
      })),
    ...order.salesOrders
      .filter((salesOrder) => salesOrder.shippingTask?.shippedAt)
      .map((salesOrder) => ({
        id: `shipped-${salesOrder.id}`,
        occurredAt: salesOrder.shippingTask?.shippedAt ?? salesOrder.createdAt,
        title: "子单发货",
        detail: `${salesOrder.subOrderNo || salesOrder.orderNo} / ${salesOrder.supplier.name} 已发货`,
        href: buildFulfillmentShippingHref({
          keyword: order.tradeNo,
          supplierViewId: salesOrder.supplier.id,
          stageView: "SHIPPED",
        }),
      })),
    ...order.paymentRecords.map((paymentRecord: TradeOrderPaymentRecordItem) => ({
      id: `payment-${paymentRecord.id}`,
      occurredAt: paymentRecord.occurredAt,
      title: "收款记录",
      detail: `${paymentRecord.salesOrder?.subOrderNo || paymentRecord.salesOrder?.orderNo || "未绑定子单"} / ${getPaymentRecordStatusSummaryLabel(paymentRecord.status)} / ${formatCurrency(paymentRecord.amount)}`,
      href: buildTradeOrderPaymentHref(order.tradeNo),
    })),
    ...order.collectionTasks.map((collectionTask: TradeOrderCollectionTaskItem) => ({
      id: `collection-${collectionTask.id}`,
      occurredAt: collectionTask.createdAt,
      title: "催收任务",
      detail: `${collectionTask.salesOrder?.subOrderNo || collectionTask.salesOrder?.orderNo || "未绑定子单"} / ${getCollectionTaskTypeSummaryLabel(collectionTask.taskType)} / ${getCollectionTaskStatusSummaryLabel(collectionTask.status)}`,
      href: buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" }),
    })),
  ]
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 10);

  const unreportedSubOrders =
    executionSummary?.salesOrders.filter((salesOrder) => salesOrder.reportStatus !== "REPORTED") ??
    [];
  const shippedWithoutPaymentSubOrders =
    executionSummary?.salesOrders.filter(
      (salesOrder) =>
        isShippingCompletedLike(salesOrder.shippingStatus) && !salesOrder.hasPaymentRecord,
    ) ?? [];
  const openCollectionSubOrders =
    executionSummary?.salesOrders.filter((salesOrder) => salesOrder.openCollectionTaskCount > 0) ??
    [];
  const isClearlySplit =
    executionSummary && executionSummary.totalSubOrderCount > 1
      ? [
          executionSummary.reportedSubOrderCount > 0 &&
            executionSummary.reportedSubOrderCount < executionSummary.totalSubOrderCount,
          executionSummary.shippedSubOrderCount > 0 &&
            executionSummary.shippedSubOrderCount < executionSummary.totalSubOrderCount,
          executionSummary.paymentRecordedSubOrderCount > 0 &&
            executionSummary.paymentRecordedSubOrderCount < executionSummary.totalSubOrderCount,
          executionSummary.openCollectionSubOrderCount > 0 &&
            executionSummary.openCollectionSubOrderCount < executionSummary.totalSubOrderCount,
        ].filter(Boolean).length >= 2
      : false;

  const primaryShippingHref = buildFulfillmentShippingHref({
    keyword: order.tradeNo,
    stageView: getTradeOrderShippingStage(executionSummary),
  });
  const batchHref = buildFulfillmentBatchesHref({ keyword: order.tradeNo });
  const nextAction = getTradeOrderNextAction(executionSummary);
  const recycleGuard =
    notice?.recycleStatus === "blocked" && notice.guard ? notice.guard : order.recycleGuard;
  const finalizePreview =
    notice?.recycleStatus === "blocked" && notice.finalizePreview !== undefined
      ? notice.finalizePreview ?? null
      : order.finalizePreview;

  function openRecycleDialog() {
    setNotice((current) => (current?.recycleStatus === "blocked" ? current : null));
    setRecycleReason("mistaken_creation");
    setRecycleDialogOpen(true);
  }

  function closeRecycleDialog() {
    setRecycleDialogOpen(false);
    setRecycleReason("mistaken_creation");
  }

  function handleRecycleConfirm() {
    if (!recycleGuard.canMoveToRecycleBin) {
      return;
    }

    const formData = new FormData();
    formData.set("id", order.id);
    formData.set("reasonCode", recycleReason);

    startRecycleTransition(async () => {
      const result = await moveToRecycleBinAction(formData);

      if (
        result.recycleStatus === "created" ||
        result.recycleStatus === "already_in_recycle_bin"
      ) {
        setNotice(result);
        closeRecycleDialog();
        router.refresh();
        return;
      }

      if (result.recycleStatus === "blocked" && result.guard) {
        setNotice(result);
        return;
      }

      setNotice(result);
    });
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <section className="crm-section-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={getTradeStatusLabel(order.tradeStatus)}
                variant={getTradeStatusVariant(order.tradeStatus)}
              />
              <StatusBadge
                label={getSalesOrderReviewStatusLabel(order.reviewStatus)}
                variant={getSalesOrderReviewStatusVariant(order.reviewStatus)}
              />
              <StatusBadge
                label={getSalesOrderPaymentSchemeLabel(order.paymentScheme)}
                variant={getSalesOrderPaymentSchemeVariant(order.paymentScheme)}
              />
              {latestBatch ? (
                <StatusBadge
                  label={latestBatch.exportNo}
                  variant={getBatchFileStateMeta(latestBatch.fileUrl).variant}
                />
              ) : null}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                父单身份
              </div>
              <h2 className="mt-1 font-mono text-3xl font-semibold tracking-tight text-foreground">
                {order.tradeNo}
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                <span>客户：{order.customer.name}</span>
                <span>
                  归属销售：{order.customer.owner?.name || order.customer.owner?.username || "暂无"}
                </span>
                <span>下单时间：{formatDateTime(order.createdAt)}</span>
                <span>最近更新：{formatDateTime(order.updatedAt)}</span>
                <span>parent-first / supplier-split</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildFulfillmentTradeOrdersHref()}
              className={detailActionClassName}
            >
              返回交易单列表
            </Link>
            <Link href={primaryShippingHref} className={detailActionClassName}>
              去发货执行
            </Link>
            <Link href={batchHref} className={detailActionClassName}>
              看批次记录
            </Link>
            <button
              type="button"
              onClick={openRecycleDialog}
              className={detailActionClassName}
            >
              {recycleGuard.canMoveToRecycleBin ? "移入回收站" : "查看阻断关系"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={nextAction.label} variant={nextAction.variant} />
              <span className="text-xs font-medium text-muted-foreground">
                Parent-first execution hint
              </span>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {nextAction.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={primaryShippingHref} className={detailActionClassName}>
              去发货执行
            </Link>
            <Link
              href={buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" })}
              className={detailActionClassName}
            >
              看催收任务
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-4">
        <OverviewCard
          eyebrow="成交摘要"
          title={formatCurrency(order.finalAmount)}
          footer={
            <>
              <span>成交父单</span>
              <span className="mx-2 text-[var(--color-border-strong)]">/</span>
              <span>{getSalesOrderPaymentSchemeLabel(order.paymentScheme)}</span>
            </>
          }
        >
          <div>商品总数：{totalItemQty}</div>
          <div>成交行数：{order.items.length}</div>
          <div>折扣金额：{formatCurrency(order.discountAmount)}</div>
          <div>已录金额：{formatCurrency(order.collectedAmount)}</div>
        </OverviewCard>

        <OverviewCard
          eyebrow="子单摘要"
          title={`${totalSubOrders || plannedSupplierCount} 张子单`}
          footer={
            <>
              <span>supplier 数：{actualSupplierCount || plannedSupplierCount}</span>
              <span className="mx-2 text-[var(--color-border-strong)]">/</span>
              <span>{totalSubOrders > 0 ? "已物化执行子单" : "按规划待物化"}</span>
            </>
          }
        >
          <div>direct SKU：{directSkuCount}</div>
          <div>赠品行：{giftCount}</div>
          <div>套餐行：{bundleCount}</div>
          <div>规划 supplier：{plannedSupplierCount}</div>
        </OverviewCard>

        <OverviewCard
          eyebrow="执行摘要"
          title={`${executionSummary?.shippedSubOrderCount ?? 0} / ${executionSummary?.totalSubOrderCount ?? totalSubOrders} 已发货`}
          footer={
            latestBatch ? (
              <>
                <span>最近批次：{latestBatch.exportNo}</span>
                <span className="mx-2 text-[var(--color-border-strong)]">/</span>
                <span>{formatDateTime(latestBatch.exportedAt)}</span>
              </>
            ) : (
              "当前还没有导出批次"
            )
          }
        >
          <div>待报单：{executionSummary?.pendingReportSubOrderCount ?? 0}</div>
          <div>待物流：{executionSummary?.pendingTrackingSubOrderCount ?? 0}</div>
          <div>已发货：{executionSummary?.shippedSubOrderCount ?? 0}</div>
          <div>异常：{executionSummary?.exceptionSubOrderCount ?? 0}</div>
        </OverviewCard>

        <OverviewCard
          eyebrow="收货摘要"
          title={order.receiverNameSnapshot}
          footer={order.receiverAddressSnapshot}
        >
          <div>手机：{order.receiverPhoneSnapshot}</div>
          <div>地址：{order.receiverAddressSnapshot}</div>
        </OverviewCard>
      </section>

      {(order.remark ||
        order.rejectReason ||
        canContinueEdit ||
        (canReview && order.tradeStatus === "PENDING_REVIEW")) && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="border-l-2 border-border/50 pl-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              备注与说明
            </div>
            <div className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
              {order.remark ? <div>父单备注：{order.remark}</div> : null}
              {order.rejectReason ? <div>驳回原因：{order.rejectReason}</div> : null}
              {order.tradeStatus === "APPROVED" ? (
                <div>
                  当前父单已审核通过，后续发货、支付、催收与物流回看请进入对应执行上下文推进。
                </div>
              ) : null}
              {canContinueEdit && continueEditHref ? (
                <div>
                  当前父单仍可回到客户详情继续编辑；重新提交审核时，系统会按最新的 SKU / 赠品 /
                  套餐结构刷新 supplier 子单。
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {canContinueEdit && continueEditHref ? (
              <div className="border-l-2 border-border/50 pl-4">
                <div className="text-sm font-medium text-foreground">回到客户详情继续编辑</div>
                <div className="mt-1 text-xs leading-6 text-muted-foreground">
                  适用于草稿或驳回父单，编辑完成后再重新提交审核。
                </div>
                <div className="mt-3">
                  <Link href={continueEditHref} className={detailActionClassName}>
                    去客户详情继续编辑
                  </Link>
                </div>
              </div>
            ) : null}

            {canReview && order.tradeStatus === "PENDING_REVIEW" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <form
                  action={reviewAction}
                  className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3.5"
                >
                  <input type="hidden" name="tradeOrderId" value={order.id} />
                  <input type="hidden" name="reviewStatus" value="APPROVED" />
                  <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
                  <div className="text-sm font-medium text-[var(--foreground)]">审核通过</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--color-sidebar-muted)]">
                    通过后会同步子单镜像状态，并只初始化一次 shipping / payment artifacts。
                  </div>
                  <button type="submit" className="crm-button crm-button-primary mt-3 w-full">
                    审核通过
                  </button>
                </form>

                <form
                  action={reviewAction}
                  className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3.5"
                >
                  <input type="hidden" name="tradeOrderId" value={order.id} />
                  <input type="hidden" name="reviewStatus" value="REJECTED" />
                  <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
                  <div className="text-sm font-medium text-[var(--foreground)]">驳回父单</div>
                  <textarea
                    name="rejectReason"
                    rows={3}
                    required
                    placeholder="填写驳回原因"
                    className="crm-textarea mt-3"
                  />
                  <button type="submit" className="crm-button crm-button-secondary mt-3 w-full">
                    提交驳回
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </section>
      )}
      <TradeOrderItemsSection
        order={order}
        bundleCount={bundleCount}
        giftCount={giftCount}
      />
      <SupplierExecutionSection
        order={order}
        totalSubOrders={totalSubOrders}
        plannedSupplierCount={plannedSupplierCount}
        actualSupplierCount={actualSupplierCount}
        executionSummaryBySalesOrderId={executionSummaryBySalesOrderId}
        plannedSupplierGroups={plannedSupplierGroups}
      />


      <FulfillmentSummaryCards
        order={order}
        executionSummary={executionSummary}
        totalSubOrders={totalSubOrders}
        totalChildCollectedAmount={totalChildCollectedAmount}
        totalChildRemainingAmount={totalChildRemainingAmount}
        confirmedPaymentRecordCount={confirmedPaymentRecordCount}
        openCollectionTaskCount={openCollectionTaskCount}
        primaryShippingHref={primaryShippingHref}
        batchHref={batchHref}
        latestBatch={latestBatch}
        latestBatchReferences={latestBatchReferences}
      />

      <ParentOrderAlertsSection
        order={order}
        unreportedSubOrders={unreportedSubOrders}
        shippedWithoutPaymentSubOrders={shippedWithoutPaymentSubOrders}
        openCollectionSubOrders={openCollectionSubOrders}
        isClearlySplit={isClearlySplit}
        primaryShippingHref={primaryShippingHref}
      />

      <TimelineAndOperationLogSection
        timelineEntries={timelineEntries}
        operationLogs={operationLogs}
      />


      <TradeOrderRecycleDialog
        open={recycleDialogOpen}
        item={{
          tradeNo: order.tradeNo,
          customerName: order.customer.name,
          receiverName: order.receiverNameSnapshot,
          receiverPhone: order.receiverPhoneSnapshot,
          tradeStatus: order.tradeStatus,
          reviewStatus: order.reviewStatus,
          updatedAt: order.updatedAt,
        }}
        guard={recycleGuard}
        finalizePreview={finalizePreview ?? null}
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        onConfirm={handleRecycleConfirm}
        pending={recyclePending}
      />
    </div>
  );
}
