"use client";

/**
 * TradeOrderDetailSection — 订单详情主体, 5 区聚焦版.
 *
 * 销售点进订单详情时, 第一屏只关心 5 件事:
 *   1. 下单人 (客户卡片): 头像 + 姓名 + 电话 + 销售归属
 *   2. 商品 (折叠技术 ID 后的成交行)
 *   3. 收货地址 (单卡)
 *   4. 付款情况 (回款进度 + 最近 1-2 条记录, 详情进入"查看全部")
 *   5. 物流 (进度时间线 + 供货商子单默认折叠)
 *
 * 其他字段 (订单号 hero / 4 metric grid / ActionZone / Timeline) 全部下沉到
 * <OrderDetailsDrawer> 折叠抽屉, 不在第一屏抢注意力.
 *
 * 异常 banner 只在父单出现待处理时显示; 重复 status badge / "父单身份" eyebrow /
 * "支持父单审核" 这类技术语义统一不再渲染. 派生 helper 抽到
 * lib/trade-orders/detail-helpers.ts 以让主组件聚焦视觉/编排.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ShippingReturnActionResult } from "@/app/(dashboard)/shipping/returns/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import ShippingReturnPanel, {
  type ShippingReturnPanelData,
} from "@/components/shipping/shipping-return-panel";
import { TradeOrderRecycleDialog } from "@/components/trade-orders/trade-order-recycle-dialog";
import { AddressCompactCard } from "@/components/trade-orders/address-compact-card";
import { CustomerCompactCard } from "@/components/trade-orders/customer-compact-card";
import { FulfillmentSnapshotCard } from "@/components/trade-orders/fulfillment-snapshot-card";
import { OrderDetailsDrawer } from "@/components/trade-orders/order-details-drawer";
import { OrderHero } from "@/components/trade-orders/order-hero";
import {
  OrderActionZone,
  type OrderActionZoneTab,
} from "@/components/trade-orders/order-action-zone";
import { OrderItemCard } from "@/components/trade-orders/order-item-card";
import { OrderMetricGrid } from "@/components/trade-orders/order-metric-grid";
import OrderProgressTrack from "@/components/trade-orders/order-progress-track";
import { OrderTimeline } from "@/components/trade-orders/order-timeline";
import { PaymentSnapshotCard } from "@/components/trade-orders/payment-snapshot-card";
import {
  SupplierFulfillmentAccordion,
  type SupplierFulfillmentSummary,
} from "@/components/trade-orders/supplier-fulfillment-accordion";
import {
  buildFulfillmentBatchesHref,
  buildFulfillmentShippingHref,
  buildFulfillmentTradeOrdersHref,
} from "@/lib/fulfillment/navigation";
import {
  formatCurrency,
  getSalesOrderPaymentSchemeLabel,
} from "@/lib/fulfillment/metadata";
import {
  buildTradeOrderCollectionHref,
  buildTradeOrderPaymentHref,
} from "@/lib/trade-orders/execution-links";
import {
  buildFulfillmentSummaryLine,
  buildPaymentSnapshotRecords,
  buildSupplierAccordionItems,
  buildTimelineEvents,
  getTradeOrderShippingStage,
  isShippingCompletedLike,
  resolveOrderProgressPhase,
  resolveOrderProgressTimestamps,
} from "@/lib/trade-orders/detail-helpers";
import { cn } from "@/lib/utils";
import type { getTradeOrderDetail } from "@/lib/trade-orders/queries";
import type { getActiveShippingReturnForTradeOrder } from "@/lib/shipping/returns";
import type {
  TradeOrderRecycleGuard,
  TradeOrderRecycleReasonCode,
} from "@/lib/trade-orders/recycle-guards";
import type { RecycleFinalizePreview } from "@/lib/recycle-bin/types";

type TradeOrderDetailData = NonNullable<Awaited<ReturnType<typeof getTradeOrderDetail>>>;
type TradeOrderDetail = TradeOrderDetailData["order"];
type OperationLogItem = TradeOrderDetailData["operationLogs"][number];
export type ActiveShippingReturn = Awaited<
  ReturnType<typeof getActiveShippingReturnForTradeOrder>
>;
type TradeOrderRecycleActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
  guard?: TradeOrderRecycleGuard;
  finalizePreview?: RecycleFinalizePreview | null;
};

const drawerActionClassName =
  "inline-flex items-center rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary";

// ---------------- 子区: 商品行 ----------------

function TradeOrderItemsSection({ order }: Readonly<{ order: TradeOrderDetail }>) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-foreground">商品</h3>
        {order.discountAmount !== "0" ? (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            含折扣 {formatCurrency(order.discountAmount)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2.5">
        {order.items.map((item) => {
          const supplierName =
            item.components.length > 0
              ? Array.from(
                  new Set(
                    item.components
                      .map((c) => c.supplierNameSnapshot?.trim())
                      .filter((v): v is string => Boolean(v)),
                  ),
                ).join(" / ")
              : "";
          return (
            <OrderItemCard
              key={item.id}
              itemType={item.itemType}
              lineNo={item.lineNo}
              titleSnapshot={item.titleSnapshot}
              productNameSnapshot={item.productNameSnapshot}
              skuNameSnapshot={item.skuNameSnapshot}
              specSnapshot={item.specSnapshot}
              unitSnapshot={item.unitSnapshot}
              qty={item.qty}
              unitPrice={formatCurrency(item.dealUnitPriceSnapshot)}
              subtotal={formatCurrency(item.subtotal)}
              discountAmount={formatCurrency(item.discountAmount)}
              supplierName={supplierName}
              bundleCode={item.bundleCodeSnapshot}
              remark={item.remark}
            />
          );
        })}
      </div>
    </section>
  );
}

// ---------------- 子区: 备注 / 继续编辑 / 审核 (PENDING_REVIEW 时) ----------------

function OrderNotesAndReviewSection({
  order,
  canReview,
  canContinueEdit,
  continueEditHref,
  reviewAction,
}: Readonly<{
  order: TradeOrderDetail;
  canReview: boolean;
  canContinueEdit: boolean;
  continueEditHref?: string;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
  const showReviewForm = canReview && order.tradeStatus === "PENDING_REVIEW";
  if (!order.remark && !order.rejectReason && !canContinueEdit && !showReviewForm) {
    return null;
  }
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
      <div className="border-l-2 border-border/50 pl-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          备注与说明
        </div>
        <div className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
          {order.remark ? <div>父单备注：{order.remark}</div> : null}
          {order.rejectReason ? <div>驳回原因：{order.rejectReason}</div> : null}
          {canContinueEdit && continueEditHref ? (
            <div>当前父单仍可回到客户详情继续编辑；重新提交审核会按最新结构刷新子单。</div>
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
              <Link href={continueEditHref} className={drawerActionClassName}>
                去客户详情继续编辑
              </Link>
            </div>
          </div>
        ) : null}

        {showReviewForm ? (
          <div className="grid gap-3 md:grid-cols-2">
            <form
              action={reviewAction}
              className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3.5"
            >
              <input type="hidden" name="tradeOrderId" value={order.id} />
              <input type="hidden" name="reviewStatus" value="APPROVED" />
              <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
              <div className="text-sm font-medium text-foreground">审核通过</div>
              <button type="submit" className="crm-button crm-button-primary mt-3 w-full">
                审核通过
              </button>
            </form>

            <form
              action={reviewAction}
              className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3.5"
            >
              <input type="hidden" name="tradeOrderId" value={order.id} />
              <input type="hidden" name="reviewStatus" value="REJECTED" />
              <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
              <div className="text-sm font-medium text-foreground">驳回父单</div>
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
  );
}

// ---------------- 子区: 异常 banner (仅在有问题时显示) ----------------

function ParentOrderAlertsSection({
  order,
  unreportedCount,
  shippedWithoutPaymentCount,
  openCollectionCount,
}: Readonly<{
  order: TradeOrderDetail;
  unreportedCount: number;
  shippedWithoutPaymentCount: number;
  openCollectionCount: number;
}>) {
  if (
    unreportedCount === 0 &&
    shippedWithoutPaymentCount === 0 &&
    openCollectionCount === 0
  ) {
    return null;
  }
  type AlertChip = { key: string; label: string; href: string; tone: "warning" | "danger" };
  const chips: AlertChip[] = [];
  if (unreportedCount > 0) {
    chips.push({
      key: "unreported",
      label: `待报单 ${unreportedCount}`,
      href: buildFulfillmentShippingHref({
        keyword: order.tradeNo,
        stageView: "PENDING_REPORT",
      }),
      tone: "warning",
    });
  }
  if (shippedWithoutPaymentCount > 0) {
    chips.push({
      key: "shipped-no-payment",
      label: `已发货未收款 ${shippedWithoutPaymentCount}`,
      href: buildTradeOrderPaymentHref(order.tradeNo),
      tone: "danger",
    });
  }
  if (openCollectionCount > 0) {
    chips.push({
      key: "open-collection",
      label: `催收中 ${openCollectionCount}`,
      href: buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" }),
      tone: "warning",
    });
  }
  return (
    <section
      aria-label="父单级提醒"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-6 py-3 shadow-sm"
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        待处理
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            chip.tone === "danger"
              ? "border-[var(--tone-danger-soft-border)] bg-[var(--tone-danger-soft-bg)] text-[var(--color-danger)] hover:border-[var(--color-danger)]"
              : "border-amber-300/70 bg-amber-50/40 text-amber-700 hover:border-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
          )}
        >
          {chip.label}
        </Link>
      ))}
    </section>
  );
}

// ---------------- 主组件 ----------------

export function TradeOrderDetailSection(
  props: Readonly<{
    order: TradeOrderDetail;
    operationLogs: OperationLogItem[];
    canReview: boolean;
    canContinueEdit: boolean;
    continueEditHref?: string;
    reviewAction: (formData: FormData) => Promise<void>;
    moveToRecycleBinAction: (formData: FormData) => Promise<TradeOrderRecycleActionResult>;
    revisionPanel?: React.ReactNode;
    activeShippingReturn?: ActiveShippingReturn;
    canRequestShippingReturn?: boolean;
    canReviewShippingReturn?: boolean;
    currentUserId?: string;
    requestShippingReturnAction?: (formData: FormData) => Promise<ShippingReturnActionResult>;
    reviewShippingReturnAction?: (formData: FormData) => Promise<ShippingReturnActionResult>;
    cancelShippingReturnAction?: (formData: FormData) => Promise<ShippingReturnActionResult>;
  }>,
) {
  const {
    order,
    operationLogs,
    canReview,
    canContinueEdit,
    continueEditHref,
    reviewAction,
    moveToRecycleBinAction,
    revisionPanel,
    activeShippingReturn,
    canRequestShippingReturn,
    canReviewShippingReturn,
    currentUserId,
    requestShippingReturnAction,
    reviewShippingReturnAction,
    cancelShippingReturnAction,
  } = props;
  const [notice, setNotice] = useState<TradeOrderRecycleActionResult | null>(null);
  const [recycleDialogOpen, setRecycleDialogOpen] = useState(false);
  const [recycleReason, setRecycleReason] =
    useState<TradeOrderRecycleReasonCode>("mistaken_creation");
  const [recyclePending, startRecycleTransition] = useTransition();
  const router = useRouter();

  // ---- 派生计算 ----
  const totalSubOrders = order.salesOrders.length;
  const plannedSupplierCount = new Set(
    order.components.map((component) => component.supplierId),
  ).size;
  const actualSupplierCount = new Set(
    order.salesOrders.map((salesOrder) => salesOrder.supplier.id),
  ).size;
  const confirmedPaymentRecordCount = order.paymentRecords.filter(
    (record) => record.status === "CONFIRMED",
  ).length;
  const openCollectionTaskCount = order.collectionTasks.filter(
    (task) => task.status === "PENDING" || task.status === "IN_PROGRESS",
  ).length;
  const executionSummary = order.executionSummary;

  const totalAmountNumber = Number(order.finalAmount) || 0;
  const collectedAmountNumber = Number(order.collectedAmount) || 0;
  const paidPercent =
    totalAmountNumber > 0 ? (collectedAmountNumber / totalAmountNumber) * 100 : 0;

  // 派生数据全部由 detail-helpers 模块完成
  const paymentSnapshotRecords = buildPaymentSnapshotRecords(order);
  const paymentSnapshotTotal = paymentSnapshotRecords.length;
  const timelineEvents = buildTimelineEvents(order, operationLogs);
  const supplierAccordionItems = buildSupplierAccordionItems(order);
  const fulfillmentSummaryLine = buildFulfillmentSummaryLine(executionSummary);

  const supplierAccordionSummary: SupplierFulfillmentSummary = {
    subOrderCount: totalSubOrders || plannedSupplierCount,
    supplierCount: actualSupplierCount || plannedSupplierCount,
    totalAmount: order.finalAmount,
    shippedCount: executionSummary?.shippedSubOrderCount ?? 0,
    pendingReportCount: executionSummary?.pendingReportSubOrderCount ?? 0,
    pendingTrackingCount: executionSummary?.pendingTrackingSubOrderCount ?? 0,
    exceptionCount: executionSummary?.exceptionSubOrderCount ?? 0,
  };

  const unreportedCount =
    executionSummary?.salesOrders.filter(
      (salesOrder) => salesOrder.reportStatus !== "REPORTED",
    ).length ?? 0;
  const shippedWithoutPaymentCount =
    executionSummary?.salesOrders.filter(
      (salesOrder) =>
        isShippingCompletedLike(salesOrder.shippingStatus) && !salesOrder.hasPaymentRecord,
    ).length ?? 0;
  const openCollectionCount =
    executionSummary?.salesOrders.filter(
      (salesOrder) => salesOrder.openCollectionTaskCount > 0,
    ).length ?? 0;

  const primaryShippingHref = buildFulfillmentShippingHref({
    keyword: order.tradeNo,
    stageView: getTradeOrderShippingStage(executionSummary),
  });
  const batchHref = buildFulfillmentBatchesHref({ keyword: order.tradeNo });
  const progressPhase = resolveOrderProgressPhase(order, executionSummary);
  const progressTimestamps = resolveOrderProgressTimestamps(order);
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

  // ---- 退货面板上下文 ----
  const primaryShippingTaskId =
    order.salesOrders.find(
      (salesOrder) => salesOrder.shippingTask?.shippedAt != null,
    )?.shippingTask?.id ?? null;
  const shippingReturnPanelData: ShippingReturnPanelData | null = activeShippingReturn
    ? {
        id: activeShippingReturn.id,
        status: activeShippingReturn.status,
        reason: activeShippingReturn.reason,
        reasonDetail: activeShippingReturn.reasonDetail,
        expectedRefundAmount:
          typeof activeShippingReturn.expectedRefundAmount === "string"
            ? activeShippingReturn.expectedRefundAmount
            : activeShippingReturn.expectedRefundAmount.toString(),
        requestedAt: activeShippingReturn.requestedAt,
        requester: activeShippingReturn.requester,
        reviewedAt: activeShippingReturn.reviewedAt,
        reviewer: activeShippingReturn.reviewer,
        reviewNote: activeShippingReturn.reviewNote,
        rejectReason: activeShippingReturn.rejectReason,
        returnTrackingNumber: activeShippingReturn.returnTrackingNumber,
        returnCarrier: activeShippingReturn.returnCarrier,
        trackingFilledAt: activeShippingReturn.trackingFilledAt,
        receivedAt: activeShippingReturn.receivedAt,
        receivedRemark: activeShippingReturn.receivedRemark,
        refundRequestId: activeShippingReturn.refundRequestId,
        shippingTaskId: activeShippingReturn.shippingTaskId,
      }
    : null;
  const showShippingReturnPanel =
    (primaryShippingTaskId !== null || shippingReturnPanelData !== null) &&
    requestShippingReturnAction !== undefined &&
    reviewShippingReturnAction !== undefined &&
    cancelShippingReturnAction !== undefined &&
    currentUserId !== undefined;

  // ---- ActionZone tabs (调整 / 退货) ----
  const actionZoneTabs: OrderActionZoneTab[] = (() => {
    const tabs: OrderActionZoneTab[] = [];
    if (revisionPanel) {
      tabs.push({
        key: "revision",
        available: true,
        active: order.tradeStatus === "REVISION_PENDING",
        hint:
          order.tradeStatus === "REVISION_PENDING"
            ? "撤单申请正在审批中, 主管复审后会逆向所有履约/收款。"
            : "客户反悔或需调整数量时, 在此发起撤单 / 减量申请。",
        content: revisionPanel,
      });
    }
    if (showShippingReturnPanel) {
      tabs.push({
        key: "return",
        available: true,
        active: shippingReturnPanelData !== null,
        hint:
          shippingReturnPanelData !== null
            ? "已存在退货流程, 跟进运单回填与到仓确认。"
            : "客户已收货但要求退回时, 在此发起退货申请。",
        content: (
          <ShippingReturnPanel
            tradeOrderId={order.id}
            customerId={order.customer.id}
            primaryShippingTaskId={primaryShippingTaskId}
            activeShippingReturn={shippingReturnPanelData}
            canRequest={canRequestShippingReturn ?? false}
            canReview={canReviewShippingReturn ?? false}
            currentUserId={currentUserId ?? ""}
            requestAction={requestShippingReturnAction!}
            reviewAction={reviewShippingReturnAction!}
            cancelAction={cancelShippingReturnAction!}
          />
        ),
      });
    }
    return tabs;
  })();

  const paymentViewAllHref = buildTradeOrderPaymentHref(order.tradeNo);
  const collectionsHref = buildTradeOrderCollectionHref(order.tradeNo, {
    statusView: "OPEN",
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      {/* 异常 banner: 仅在有问题时出现 */}
      <ParentOrderAlertsSection
        order={order}
        unreportedCount={unreportedCount}
        shippedWithoutPaymentCount={shippedWithoutPaymentCount}
        openCollectionCount={openCollectionCount}
      />

      {/* 1. 下单人 */}
      <CustomerCompactCard
        customerId={order.customer.id}
        customerName={order.customer.name}
        customerPhone={order.customer.phone}
        owner={order.customer.owner}
      />

      {/* 2 + 3 桌面端并排: 商品 (左) + 收货地址 (右), 移动端依次堆叠 */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <TradeOrderItemsSection order={order} />
        <AddressCompactCard
          receiverName={order.receiverNameSnapshot}
          receiverPhone={order.receiverPhoneSnapshot}
          receiverAddress={order.receiverAddressSnapshot}
        />
      </div>

      {/* 4 + 5 桌面端并排: 付款 + 物流 */}
      <div className="grid gap-6 xl:grid-cols-2">
        <PaymentSnapshotCard
          totalAmount={formatCurrency(order.finalAmount)}
          collectedAmount={formatCurrency(order.collectedAmount)}
          remainingAmount={formatCurrency(order.remainingAmount)}
          paymentSchemeLabel={getSalesOrderPaymentSchemeLabel(order.paymentScheme)}
          paidPercent={paidPercent}
          records={paymentSnapshotRecords}
          recordsTotal={paymentSnapshotTotal}
          viewAllHref={paymentViewAllHref}
          collectionsHref={openCollectionTaskCount > 0 ? collectionsHref : null}
        />

        <FulfillmentSnapshotCard
          progressTrack={
            <OrderProgressTrack
              currentPhase={progressPhase}
              timestamps={progressTimestamps}
            />
          }
          summaryLine={fulfillmentSummaryLine}
          primaryActionHref={primaryShippingHref}
          secondaryActionHref={batchHref}
          supplierAccordion={
            <SupplierFulfillmentAccordion
              items={supplierAccordionItems}
              summary={supplierAccordionSummary}
              emptyHint={
                plannedSupplierCount > 0
                  ? `当前父单尚未物化 supplier 子单 (规划 ${plannedSupplierCount} 个 supplier)。提交审核后自动生成。`
                  : "当前父单尚未物化 supplier 子单。"
              }
            />
          }
        />
      </div>

      <OrderNotesAndReviewSection
        order={order}
        canReview={canReview}
        canContinueEdit={canContinueEdit}
        continueEditHref={continueEditHref}
        reviewAction={reviewAction}
      />

      {/* 折叠抽屉: 订单号 hero / 4 metric grid / ActionZone / Timeline / 快捷入口 */}
      <OrderDetailsDrawer
        hint={timelineEvents.length > 0 ? `${timelineEvents.length} 条时间线` : null}
      >
        <OrderHero
          tradeNo={order.tradeNo}
          tradeStatus={order.tradeStatus}
          reviewStatus={order.reviewStatus}
          createdAt={order.createdAt}
          finalAmount={order.finalAmount}
          collectedAmount={order.collectedAmount}
          remainingAmount={order.remainingAmount}
          customer={{
            name: order.customer.name,
            owner: order.customer.owner
              ? { name: order.customer.owner.name, username: order.customer.owner.username }
              : null,
          }}
          hasActiveRevision={order.tradeStatus === "REVISION_PENDING"}
          activeShippingReturnStatus={shippingReturnPanelData?.status ?? null}
        />

        <OrderMetricGrid
          totalAmount={formatCurrency(order.finalAmount)}
          collectedAmount={formatCurrency(order.collectedAmount)}
          remainingAmount={formatCurrency(order.remainingAmount)}
          totalSubOrders={executionSummary?.totalSubOrderCount ?? totalSubOrders}
          shippedSubOrders={executionSummary?.shippedSubOrderCount ?? 0}
          pendingSubOrders={
            (executionSummary?.pendingReportSubOrderCount ?? 0) +
            (executionSummary?.pendingTrackingSubOrderCount ?? 0)
          }
          exceptionSubOrders={executionSummary?.exceptionSubOrderCount ?? 0}
          tooltips={{
            amount: `成交 ${order.items.length} 行 · 折扣 ${formatCurrency(order.discountAmount)} · ${getSalesOrderPaymentSchemeLabel(order.paymentScheme)}`,
            payment: `已确认 ${confirmedPaymentRecordCount} 条 · 催收中 ${openCollectionTaskCount}`,
            fulfillment: `待报单 ${executionSummary?.pendingReportSubOrderCount ?? 0} · 待物流 ${executionSummary?.pendingTrackingSubOrderCount ?? 0}`,
            exception: `待报单 ${executionSummary?.pendingReportSubOrderCount ?? 0} · 待物流 ${executionSummary?.pendingTrackingSubOrderCount ?? 0}`,
          }}
        />

        <OrderActionZone tabs={actionZoneTabs} />

        {/* 快捷入口 (返回 / 发货 / 批次 / 回收) */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={buildFulfillmentTradeOrdersHref()} className={drawerActionClassName}>
            返回交易单列表
          </Link>
          <Link href={primaryShippingHref} className={drawerActionClassName}>
            去发货执行
          </Link>
          <Link href={batchHref} className={drawerActionClassName}>
            看批次记录
          </Link>
          <Link href={collectionsHref} className={drawerActionClassName}>
            看催收任务
          </Link>
          <button
            type="button"
            onClick={openRecycleDialog}
            className={drawerActionClassName}
          >
            {recycleGuard.canMoveToRecycleBin ? "移入回收站" : "查看阻断关系"}
          </button>
        </div>

        <OrderTimeline events={timelineEvents} />
      </OrderDetailsDrawer>

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
