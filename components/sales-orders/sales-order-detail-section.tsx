import Link from "next/link";
import { SalesOrderPaymentSection } from "@/components/payments/sales-order-payment-section";
import { LogisticsTracePanel } from "@/components/shipping/logistics-trace-panel";
import { SalesOrderForm } from "@/components/sales-orders/sales-order-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  formatCurrency,
  getCodCollectionStatusLabel,
  getCodCollectionStatusVariant,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderPaymentSchemeVariant,
  getSalesOrderReviewStatusLabel,
  getSalesOrderReviewStatusVariant,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
  getShippingReportStatusVariant,
  salesOrderPaymentSchemeOptions,
} from "@/lib/fulfillment/metadata";
import {
  getPaymentRecordStatusLabel,
  getPaymentRecordStatusVariant,
} from "@/lib/payments/metadata";

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
};

type SkuOption = {
  id: string;
  skuCode: string;
  skuName: string;
  specText: string;
  unit: string;
  defaultUnitPrice: string;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: string;
  product: {
    id: string;
    name: string;
    supplier: {
      id: string;
      name: string;
    };
  };
};

type OrderDetail = {
  id: string;
  orderNo: string;
  tradeOrderId: string | null;
  subOrderNo: string | null;
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  paymentScheme:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  listAmount: string;
  dealAmount: string;
  discountAmount: string;
  finalAmount: string;
  depositAmount: string;
  collectedAmount: string;
  paidAmount: string;
  remainingAmount: string;
  codAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
  discountReason: string | null;
  receiverNameSnapshot: string;
  receiverPhoneSnapshot: string;
  receiverAddressSnapshot: string;
  reviewedAt: Date | null;
  rejectReason: string | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: CustomerOption;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  supplier: {
    id: string;
    name: string;
  };
  tradeOrder: {
    id: string;
    tradeNo: string;
  } | null;
  reviewer: {
    id: string;
    name: string;
    username: string;
  } | null;
  items: Array<{
    id: string;
    itemTypeSnapshot: "SKU" | "GIFT" | "BUNDLE" | null;
    titleSnapshot: string | null;
    exportDisplayNameSnapshot: string | null;
    productId: string;
    skuId: string;
    productNameSnapshot: string;
    skuNameSnapshot: string;
    specSnapshot: string;
    unitSnapshot: string;
    listPriceSnapshot: string;
    dealPriceSnapshot: string;
    qty: number;
    subtotal: string;
  }>;
  giftItems: Array<{
    id: string;
    giftName: string;
    qty: number;
    remark: string | null;
  }>;
  paymentPlans: Array<{
    id: string;
    sourceType: "SALES_ORDER" | "GIFT_RECORD";
    subjectType: "GOODS" | "FREIGHT";
    stageType: "FULL" | "DEPOSIT" | "BALANCE";
    collectionChannel: "PREPAID" | "COD";
    plannedAmount: string;
    submittedAmount: string;
    confirmedAmount: string;
    remainingAmount: string;
    dueAt: Date | null;
    status: "PENDING" | "SUBMITTED" | "PARTIALLY_COLLECTED" | "COLLECTED" | "CANCELED";
    remark: string | null;
    codCollectionRecord: {
      id: string;
      status:
        | "PENDING_COLLECTION"
        | "COLLECTED"
        | "EXCEPTION"
        | "REJECTED"
        | "UNCOLLECTED";
      expectedAmount: string;
      collectedAmount: string;
      occurredAt: Date | null;
      remark: string | null;
      paymentRecord: {
        id: string;
        amount: string;
        status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
        occurredAt: Date;
        remark: string | null;
      } | null;
    } | null;
    paymentRecords: Array<{
      id: string;
      amount: string;
      channel:
        | "ORDER_FORM_DECLARED"
        | "BANK_TRANSFER"
        | "WECHAT_TRANSFER"
        | "ALIPAY_TRANSFER"
        | "COD"
        | "CASH"
        | "OTHER";
      status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
      occurredAt: Date;
      referenceNo: string | null;
      remark: string | null;
      submittedBy: {
        id: string;
        name: string;
        username: string;
      };
      confirmedBy: {
        id: string;
        name: string;
        username: string;
      } | null;
    }>;
    collectionTasks: Array<{
      id: string;
      taskType:
        | "BALANCE_COLLECTION"
        | "COD_COLLECTION"
        | "FREIGHT_COLLECTION"
        | "GENERAL_COLLECTION";
      status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
      ownerId: string;
      dueAt: Date | null;
      nextFollowUpAt: Date | null;
      lastContactAt: Date | null;
      closedAt: Date | null;
      remark: string | null;
      owner: {
        id: string;
        name: string;
        username: string;
      };
    }>;
  }>;
  shippingTask: {
    id: string;
    reportStatus: "PENDING" | "REPORTED";
    shippingStatus:
      | "PENDING"
      | "READY_TO_SHIP"
      | "SHIPPED"
      | "DELIVERED"
      | "COMPLETED"
      | "CANCELED";
    shippingProvider: string | null;
    trackingNumber: string | null;
    reportedAt: Date | null;
    shippedAt: Date | null;
    exportBatch: {
      id: string;
      exportNo: string;
    } | null;
    codCollectionRecords: Array<{
      id: string;
      status:
        | "PENDING_COLLECTION"
        | "COLLECTED"
        | "EXCEPTION"
        | "REJECTED"
        | "UNCOLLECTED";
      expectedAmount: string;
      collectedAmount: string;
      occurredAt: Date | null;
      remark: string | null;
      paymentRecord: {
        id: string;
        amount: string;
        status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
        occurredAt: Date;
      } | null;
    }>;
  } | null;
  logisticsFollowUpTasks: Array<{
    id: string;
    status: "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELED";
    intervalDays: number;
    nextTriggerAt: Date;
    lastTriggeredAt: Date | null;
    lastFollowedUpAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    remark: string | null;
    owner: {
      id: string;
      name: string;
      username: string;
    };
  }>;
};

type OperationLogItem = {
  id: string;
  module: string;
  action: string;
  description: string | null;
  createdAt: Date;
  actor: {
    name: string;
    username: string;
  } | null;
};

type PaymentOwnerOption = {
  id: string;
  name: string;
  username: string;
};

function getLogisticsTaskStatusLabel(
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELED",
) {
  switch (status) {
    case "IN_PROGRESS":
      return "跟进中";
    case "DONE":
      return "已完成";
    case "CANCELED":
      return "已取消";
    case "PENDING":
    default:
      return "待处理";
  }
}

function getLogisticsTaskStatusVariant(
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELED",
) {
  switch (status) {
    case "IN_PROGRESS":
      return "info" as const;
    case "DONE":
      return "success" as const;
    case "CANCELED":
      return "neutral" as const;
    case "PENDING":
    default:
      return "warning" as const;
  }
}

function getExecutionLineTypeLabel(itemType: OrderDetail["items"][number]["itemTypeSnapshot"]) {
  switch (itemType) {
    case "GIFT":
      return "赠品执行行";
    case "BUNDLE":
      return "套餐展开行";
    case "SKU":
    default:
      return "普通商品行";
  }
}

function getExecutionLineTypeVariant(
  itemType: OrderDetail["items"][number]["itemTypeSnapshot"],
) {
  switch (itemType) {
    case "GIFT":
      return "neutral" as const;
    case "BUNDLE":
      return "warning" as const;
    case "SKU":
    default:
      return "info" as const;
  }
}

function getExecutionLineTitle(item: OrderDetail["items"][number]) {
  return item.titleSnapshot?.trim() || `${item.productNameSnapshot} / ${item.skuNameSnapshot}`;
}

function getExecutionLineSemantics(item: OrderDetail["items"][number]) {
  switch (item.itemTypeSnapshot) {
    case "GIFT":
      return "来自订单赠品执行组件，金额为 0，但会随当前供应商子单进入履约、导出和物流回看。";
    case "BUNDLE":
      return "来自套餐展开后的执行组件，当前子单只承接落到本供应商的套餐部分，不回退成父单视角。";
    case "SKU":
    default:
      return "来自普通商品成交行，由当前供应商子单直接承接执行。";
  }
}

export function SalesOrderDetailSection({
  order,
  skuOptions,
  paymentOwnerOptions,
  operationLogs,
  canResubmit,
  canReview,
  canAccessShippingCenter,
  canSubmitPaymentRecord,
  canConfirmPaymentRecord,
  canManageCollectionTasks,
  canManageLogisticsFollowUp,
  saveAction,
  reviewAction,
  submitPaymentRecordAction,
  reviewPaymentRecordAction,
  upsertCollectionTaskAction,
  updateCollectionTaskAction,
  updateLogisticsFollowUpTaskAction,
}: Readonly<{
  order: OrderDetail;
  skuOptions: SkuOption[];
  paymentOwnerOptions: PaymentOwnerOption[];
  operationLogs: OperationLogItem[];
  canResubmit: boolean;
  canReview: boolean;
  canAccessShippingCenter: boolean;
  canSubmitPaymentRecord: boolean;
  canConfirmPaymentRecord: boolean;
  canManageCollectionTasks: boolean;
  canManageLogisticsFollowUp: boolean;
  saveAction: (formData: FormData) => Promise<void>;
  reviewAction: (formData: FormData) => Promise<void>;
  submitPaymentRecordAction: (formData: FormData) => Promise<void>;
  reviewPaymentRecordAction: (formData: FormData) => Promise<void>;
  upsertCollectionTaskAction: (formData: FormData) => Promise<void>;
  updateCollectionTaskAction: (formData: FormData) => Promise<void>;
  updateLogisticsFollowUpTaskAction: (formData: FormData) => Promise<void>;
}>) {
  const primaryItem =
    order.items.find(
      (item) =>
        Number(item.dealPriceSnapshot) > 0 || Number(item.listPriceSnapshot) > 0,
    ) ?? order.items[0];
  const shippingTask = order.shippingTask;
  const latestCodRecord = shippingTask?.codCollectionRecords[0] ?? null;
  const tradeNo = order.tradeOrder?.tradeNo ?? null;
  const subOrderNo = order.subOrderNo || order.orderNo;

  return (
    <div className="space-y-6">
      <section className="crm-section-card">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={getSalesOrderReviewStatusLabel(order.reviewStatus)}
            variant={getSalesOrderReviewStatusVariant(order.reviewStatus)}
          />
          <StatusBadge
            label={getSalesOrderPaymentSchemeLabel(order.paymentScheme)}
            variant={getSalesOrderPaymentSchemeVariant(order.paymentScheme)}
          />
          {order.shippingTask ? (
            <>
              <StatusBadge
                label={getShippingReportStatusLabel(order.shippingTask.reportStatus)}
                variant={getShippingReportStatusVariant(order.shippingTask.reportStatus)}
              />
              <StatusBadge
                label={getShippingFulfillmentStatusLabel(order.shippingTask.shippingStatus)}
                variant={getShippingFulfillmentStatusVariant(order.shippingTask.shippingStatus)}
              />
            </>
          ) : null}
        </div>

        {order.tradeOrder?.tradeNo ? (
          <div className="mt-4 rounded-2xl border border-black/8 bg-white/72 px-4 py-3 text-sm text-black/68">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  成交主单
                </div>
                <div className="mt-1 font-medium text-black/80">{tradeNo}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  子单编号
                </div>
                <div className="mt-1 font-medium text-black/80">{subOrderNo}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  供货商
                </div>
                <div className="mt-1 font-medium text-black/80">{order.supplier.name}</div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-6 text-black/52">
              当前页面仍然是供应商子单详情。审核、支付和履约结果会回流到父单，但这里继续承接子单执行事实。
            </p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="crm-subtle-panel">
            <p className="crm-detail-label">订单基础</p>
            <div className="mt-3 space-y-2 text-sm text-black/70">
              <div>成交主单：{tradeNo || "当前仍为单 SalesOrder 结构"}</div>
              <div>子单编号：{subOrderNo}</div>
              <div>客户：{order.customer.name}</div>
              <div>供货商：{order.supplier.name}</div>
              <div>下单人：{order.owner?.name || order.customer.owner?.name || "未指派"}</div>
              <div>创建时间：{formatDateTime(order.createdAt)}</div>
              <div>更新时间：{formatDateTime(order.updatedAt)}</div>
            </div>
          </div>

          <div className="crm-subtle-panel">
            <p className="crm-detail-label">价格与收款</p>
            <div className="mt-3 space-y-2 text-sm text-black/70">
              <div>原价小计：{formatCurrency(order.listAmount)}</div>
              <div>成交小计：{formatCurrency(order.dealAmount)}</div>
              <div>优惠金额：{formatCurrency(order.discountAmount)}</div>
              <div>定金金额：{formatCurrency(order.depositAmount)}</div>
              <div>已录入金额：{formatCurrency(order.collectedAmount)}</div>
              <div>已确认金额：{formatCurrency(order.paidAmount)}</div>
              <div>待收金额：{formatCurrency(order.remainingAmount)}</div>
              <div>代收金额：{formatCurrency(order.codAmount)}</div>
            </div>
            <p className="mt-3 text-xs leading-6 text-black/45">
              以上金额字段由 payment layer 同步回写，仅作为列表与详情摘要；计划、记录、催收任务仍以 PaymentPlan /
              PaymentRecord / CollectionTask 为准。
            </p>
          </div>

          <div className="crm-subtle-panel">
            <p className="crm-detail-label">收件与保价</p>
            <div className="mt-3 space-y-2 text-sm text-black/70">
              <div>收件人：{order.receiverNameSnapshot}</div>
              <div>电话：{order.receiverPhoneSnapshot}</div>
              <div>地址：{order.receiverAddressSnapshot}</div>
              <div>保价：{order.insuranceRequired ? "需要" : "不需要"}</div>
              <div>保价金额：{formatCurrency(order.insuranceAmount)}</div>
              <div>物流单号：{order.shippingTask?.trackingNumber || "未回填"}</div>
            </div>
          </div>
        </div>

        {order.discountReason || order.remark || order.rejectReason ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">优惠原因</p>
              <p className="mt-2 text-sm leading-7 text-black/70">
                {order.discountReason || "未填写"}
              </p>
            </div>
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">订单备注</p>
              <p className="mt-2 text-sm leading-7 text-black/70">{order.remark || "无"}</p>
            </div>
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">审核结果</p>
              <p className="mt-2 text-sm leading-7 text-black/70">
                {order.reviewStatus === "REJECTED"
                  ? `驳回原因：${order.rejectReason || "未填写"}`
                  : order.reviewedAt
                    ? `审核时间：${formatDateTime(order.reviewedAt)}`
                    : "待审核"}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <SalesOrderPaymentSection
        orderId={order.id}
        paymentPlans={order.paymentPlans}
        paymentOwnerOptions={paymentOwnerOptions}
        canSubmitPaymentRecord={canSubmitPaymentRecord}
        canConfirmPaymentRecord={canConfirmPaymentRecord}
        canManageCollectionTasks={canManageCollectionTasks}
        submitPaymentRecordAction={submitPaymentRecordAction}
        reviewPaymentRecordAction={reviewPaymentRecordAction}
        upsertCollectionTaskAction={upsertCollectionTaskAction}
        updateCollectionTaskAction={updateCollectionTaskAction}
      />

      <section className="crm-section-card">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-black/85">子单执行快照</h3>
          <p className="text-sm leading-7 text-black/60">
            当前详情继续展示供应商子单承接到的执行行。普通 SKU、订单赠品和套餐展开组件都会以执行快照形式保留，避免后续主数据变化污染历史交易。
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="crm-subtle-panel">
            <p className="crm-detail-label">执行行快照</p>
            <div className="mt-3 space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getExecutionLineTypeLabel(item.itemTypeSnapshot)}
                      variant={getExecutionLineTypeVariant(item.itemTypeSnapshot)}
                    />
                    <div className="font-medium text-black/80">{getExecutionLineTitle(item)}</div>
                  </div>
                  <div className="mt-2 text-sm leading-7 text-black/60">
                    {getExecutionLineSemantics(item)}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-black/60 md:grid-cols-2">
                    <div>商品：{item.productNameSnapshot}</div>
                    <div>SKU：{item.skuNameSnapshot}</div>
                    <div>规格：{item.specSnapshot}</div>
                    <div>
                      数量：{item.qty}
                      {item.unitSnapshot}
                    </div>
                    <div>原价：{formatCurrency(item.listPriceSnapshot)}</div>
                    <div>成交价：{formatCurrency(item.dealPriceSnapshot)}</div>
                    <div className="md:col-span-2">小计：{formatCurrency(item.subtotal)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="crm-subtle-panel">
            <p className="crm-detail-label">历史兼容赠品记录</p>
            <p className="mt-2 text-sm leading-7 text-black/60">
              这里仅保留旧 `SalesOrderGiftItem` 的历史兼容展示。TradeOrder 新写路径下的赠品已经作为左侧 `GIFT` 执行行进入当前子单。
            </p>
            <div className="mt-3 space-y-3">
              {order.giftItems.length > 0 ? (
                order.giftItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="font-medium text-black/80">
                      {item.giftName} x {item.qty}
                    </div>
                    <div className="mt-1 text-sm text-black/60">{item.remark || "无备注"}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                  当前子单没有历史兼容赠品记录。若赠品来自新写路径，请在左侧 `GIFT` 执行行中查看。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* legacy shipping block disabled during M14 migration
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">发货与物流</h3>
            <p className="text-sm leading-7 text-black/60">
              报单状态与发货状态分层维护。只有回填物流单号后，订单才进入已发货。
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">发货任务</p>
              <div className="mt-3 space-y-2 text-sm text-black/70">
                <div>任务编号：{shippingTask.id}</div>
                <div>
                  报单时间：
                  {shippingTask.reportedAt
                    ? formatDateTime(shippingTask.reportedAt)
                    : "未报单"}
                </div>
                <div>
                  发货时间：
                  {shippingTask.shippedAt
                    ? formatDateTime(shippingTask.shippedAt)
                    : "未发货"}
                </div>
              </div>
            </div>

            <div className="crm-subtle-panel">
              <p className="crm-detail-label">物流信息</p>
              <div className="mt-3 space-y-2 text-sm text-black/70">
                <div>承运商：{shippingTask.shippingProvider || "未填写"}</div>
                <div>物流单号：{shippingTask.trackingNumber || "未回填"}</div>
              </div>
            </div>

            <div className="crm-subtle-panel">
              <p className="crm-detail-label">后续动作</p>
              <div className="mt-3 space-y-2 text-sm text-black/70">
                <div>物流跟进任务数：{order.logisticsFollowUpTasks.length}</div>
                {canAccessShippingCenter ? (
                  <Link href="/shipping" className="crm-text-link">
                    进入发货中心
                  </Link>
                ) : (
                  <Link href={`/customers/${order.customer.id}?tab=orders`} className="crm-text-link">
                    返回客户订单页
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {order.logisticsFollowUpTasks.length > 0 ? (
              order.logisticsFollowUpTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getLogisticsTaskStatusLabel(task.status)}
                      variant={getLogisticsTaskStatusVariant(task.status)}
                    />
                    <span className="text-xs text-black/45">每 {task.intervalDays} 天提醒一次</span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-black/65">
                    <div>下次触发：{formatDateTime(task.nextTriggerAt)}</div>
                    <div>
                      最近触发：{task.lastTriggeredAt ? formatDateTime(task.lastTriggeredAt) : "尚未触发"}
                    </div>
                    <div>
                      最近跟进：{task.lastFollowedUpAt ? formatDateTime(task.lastFollowedUpAt) : "尚未登记"}
                    </div>
                    <div>备注：{task.remark || "无"}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                首次回填物流单号后，系统会自动创建物流跟进任务。
              </div>
            )}
          </div>
        </section>
      */}

      {shippingTask ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">发货与物流</h3>
            <p className="text-sm leading-7 text-black/60">
              报单状态与发货状态分层维护。只有回填物流单号后，订单才能进入已发货及后续状态；COD 回款状态也在这里回流展示。
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">履约摘要</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge
                  label={getShippingReportStatusLabel(shippingTask.reportStatus)}
                  variant={getShippingReportStatusVariant(shippingTask.reportStatus)}
                />
                <StatusBadge
                  label={getShippingFulfillmentStatusLabel(shippingTask.shippingStatus)}
                  variant={getShippingFulfillmentStatusVariant(shippingTask.shippingStatus)}
                />
                {latestCodRecord ? (
                  <StatusBadge
                    label={getCodCollectionStatusLabel(latestCodRecord.status)}
                    variant={getCodCollectionStatusVariant(latestCodRecord.status)}
                  />
                ) : null}
              </div>
              <div className="mt-3 space-y-2 text-sm text-black/70">
                <div>任务编号：{shippingTask.id}</div>
                <div>报单批次：{shippingTask.exportBatch?.exportNo || "未导出"}</div>
                <div>
                  报单时间：
                  {shippingTask.reportedAt
                    ? formatDateTime(shippingTask.reportedAt)
                    : "未报单"}
                </div>
                <div>
                  发货时间：
                  {shippingTask.shippedAt
                    ? formatDateTime(shippingTask.shippedAt)
                    : "未发货"}
                </div>
              </div>
            </div>

            <div className="crm-subtle-panel">
              <p className="crm-detail-label">物流信息</p>
              <div className="mt-3 space-y-2 text-sm text-black/70">
                <div>承运商：{shippingTask.shippingProvider || "未填写"}</div>
                <div>物流单号：{shippingTask.trackingNumber || "未回填"}</div>
                <div>订单 COD 金额：{formatCurrency(order.codAmount)}</div>
                {latestCodRecord ? (
                  <>
                    <div>COD 应回款：{formatCurrency(latestCodRecord.expectedAmount)}</div>
                    <div>COD 已登记：{formatCurrency(latestCodRecord.collectedAmount)}</div>
                    <div>
                      最近登记：
                      {latestCodRecord.occurredAt
                        ? formatDateTime(latestCodRecord.occurredAt)
                        : "未登记"}
                    </div>
                  </>
                ) : Number(order.codAmount) > 0 ? (
                  <div>COD 状态：待发货后创建回款记录</div>
                ) : null}
              </div>
              {latestCodRecord?.paymentRecord ? (
                <div className="mt-4 rounded-2xl border border-black/8 bg-white/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getPaymentRecordStatusLabel(latestCodRecord.paymentRecord.status)}
                      variant={getPaymentRecordStatusVariant(latestCodRecord.paymentRecord.status)}
                    />
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-black/65">
                    <div>回款记录金额：{formatCurrency(latestCodRecord.paymentRecord.amount)}</div>
                    <div>
                      记录时间：{formatDateTime(latestCodRecord.paymentRecord.occurredAt)}
                    </div>
                    <div>备注：{latestCodRecord.remark || "无"}</div>
                  </div>
                </div>
              ) : null}
              <LogisticsTracePanel
                shippingTaskId={shippingTask.id}
                shippingProvider={shippingTask.shippingProvider}
                trackingNumber={shippingTask.trackingNumber}
                className="mt-4"
                title="查看完整物流轨迹"
              />
            </div>

            <div className="crm-subtle-panel">
              <p className="crm-detail-label">执行入口</p>
              <div className="mt-3 space-y-2 text-sm text-black/70">
                <div>物流跟进任务数：{order.logisticsFollowUpTasks.length}</div>
                {canAccessShippingCenter ? (
                  <Link href="/shipping" className="crm-text-link">
                    进入发货中心
                  </Link>
                ) : (
                  <Link href={`/customers/${order.customer.id}?tab=orders`} className="crm-text-link">
                    返回客户订单页
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {order.logisticsFollowUpTasks.length > 0 ? (
              order.logisticsFollowUpTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getLogisticsTaskStatusLabel(task.status)}
                      variant={getLogisticsTaskStatusVariant(task.status)}
                    />
                    <span className="text-xs text-black/45">每 {task.intervalDays} 天提醒一次</span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-black/65">
                    <div>负责人：{task.owner.name || task.owner.username}</div>
                    <div>下次触发：{formatDateTime(task.nextTriggerAt)}</div>
                    <div>
                      最近触发：
                      {task.lastTriggeredAt ? formatDateTime(task.lastTriggeredAt) : "尚未触发"}
                    </div>
                    <div>
                      最近跟进：
                      {task.lastFollowedUpAt ? formatDateTime(task.lastFollowedUpAt) : "尚未登记"}
                    </div>
                    <div>备注：{task.remark || "无"}</div>
                  </div>
                  {canManageLogisticsFollowUp ? (
                    <form action={updateLogisticsFollowUpTaskAction} className="mt-3 grid gap-3 lg:grid-cols-4">
                      <input type="hidden" name="logisticsFollowUpTaskId" value={task.id} />
                      <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
                      <label className="space-y-2">
                        <span className="crm-label">状态</span>
                        <select name="status" defaultValue={task.status} className="crm-select">
                          <option value="PENDING">待跟进</option>
                          <option value="IN_PROGRESS">跟进中</option>
                          <option value="DONE">已完成</option>
                          <option value="CANCELED">关闭</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="crm-label">下次触发</span>
                        <input
                          type="date"
                          name="nextTriggerAt"
                          defaultValue={task.nextTriggerAt.toISOString().slice(0, 10)}
                          className="crm-input"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="crm-label">最近跟进</span>
                        <input
                          type="date"
                          name="lastFollowedUpAt"
                          defaultValue={task.lastFollowedUpAt?.toISOString().slice(0, 10) ?? ""}
                          className="crm-input"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="crm-label">备注</span>
                        <input
                          name="remark"
                          defaultValue={task.remark || ""}
                          className="crm-input"
                        />
                      </label>
                      <div className="lg:col-span-4">
                        <button type="submit" className="crm-button crm-button-secondary w-full">
                          保存物流跟进
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                首次回填物流单号后，系统会自动创建物流跟进任务。
              </div>
            )}
          </div>
        </section>
      ) : null}

      {canResubmit && primaryItem ? (
        <section className="crm-section-card">
          <SalesOrderForm
            saveAction={saveAction}
            skuOptions={skuOptions}
            paymentSchemeOptions={salesOrderPaymentSchemeOptions}
            fixedCustomer={order.customer}
            initialValues={{
              id: order.id,
              skuId: primaryItem.skuId,
              qty: primaryItem.qty,
              dealPrice: primaryItem.dealPriceSnapshot,
              discountReason: order.discountReason ?? "",
              giftName: order.giftItems[0]?.giftName ?? "",
              giftQty: order.giftItems[0]?.qty ?? 0,
              giftRemark: order.giftItems[0]?.remark ?? "",
              paymentScheme: order.paymentScheme,
              depositAmount: order.depositAmount,
              receiverName: order.receiverNameSnapshot,
              receiverPhone: order.receiverPhoneSnapshot,
              receiverAddress: order.receiverAddressSnapshot,
              insuranceRequired: order.insuranceRequired,
              insuranceAmount: order.insuranceAmount,
              remark: order.remark ?? "",
            }}
            submitLabel="重新提交审核"
            helperText="驳回订单可在此修改并重新提交，提交后会回到待审核状态。"
            redirectTo={`/orders/${order.id}`}
          />
        </section>
      ) : null}

      {canReview && order.reviewStatus === "PENDING_REVIEW" ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">订单审核</h3>
            <p className="text-sm leading-7 text-black/60">
              {order.tradeOrder?.tradeNo
                ? "当前子单走成交主单审核链。通过后会统一初始化子单的 shipping/payment artifacts；驳回后需回到客户成交表单重提。"
                : "审核通过后会激活主 ShippingTask；驳回后销售可修改并重新提交。所有审核动作都会进入 OperationLog。"}
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <form action={reviewAction} className="crm-subtle-panel space-y-3">
              <input type="hidden" name="salesOrderId" value={order.id} />
              <input type="hidden" name="reviewStatus" value="APPROVED" />
              <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
              <p className="crm-detail-label">通过审核</p>
              <p className="text-sm leading-7 text-black/60">
                审核通过后，订单进入发货池，等待发货员报单和回填物流。
              </p>
              <button type="submit" className="crm-button crm-button-primary">
                审核通过
              </button>
            </form>

            <form action={reviewAction} className="crm-subtle-panel space-y-3">
              <input type="hidden" name="salesOrderId" value={order.id} />
              <input type="hidden" name="reviewStatus" value="REJECTED" />
              <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
              <p className="crm-detail-label">驳回订单</p>
              <textarea
                name="rejectReason"
                rows={3}
                required
                placeholder="填写驳回原因"
                className="crm-textarea"
              />
              <button type="submit" className="crm-button crm-button-secondary">
                提交驳回
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section className="crm-section-card">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-black/85">操作日志</h3>
          <p className="text-sm leading-7 text-black/60">
            订单、审核、收款、发货和物流跟进等关键动作都会完整留痕，便于追溯责任链路。
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {operationLogs.length > 0 ? (
            operationLogs.map((record) => (
              <div key={record.id} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-black/80">
                    {record.module} / {record.action}
                  </div>
                  <div className="text-xs text-black/45">{formatDateTime(record.createdAt)}</div>
                </div>
                <div className="mt-2 text-sm leading-7 text-black/60">
                  {record.description || "无描述"}
                </div>
                <div className="mt-2 text-xs text-black/45">
                  操作人：{record.actor?.name || record.actor?.username || "系统"}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
              当前暂无操作日志。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
