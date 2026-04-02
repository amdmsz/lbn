import Link from "next/link";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
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
import { getTradeOrderDetail } from "@/lib/trade-orders/queries";

type TradeOrderDetailData = NonNullable<Awaited<ReturnType<typeof getTradeOrderDetail>>>;
type TradeOrderDetail = TradeOrderDetailData["order"];
type OperationLogItem = TradeOrderDetailData["operationLogs"][number];

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

function sumCurrency(values: string[]) {
  return values.reduce((sum, current) => sum + Number(current), 0);
}

export function TradeOrderDetailSection({
  order,
  operationLogs,
  canReview,
  canContinueEdit,
  continueEditHref,
  reviewAction,
}: Readonly<{
  order: TradeOrderDetail;
  operationLogs: OperationLogItem[];
  canReview: boolean;
  canContinueEdit: boolean;
  continueEditHref?: string;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
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
  const approvedSubOrders = order.salesOrders.filter(
    (salesOrder) => salesOrder.reviewStatus === "APPROVED",
  ).length;
  const pendingSubOrders = order.salesOrders.filter(
    (salesOrder) => salesOrder.reviewStatus === "PENDING_REVIEW",
  ).length;
  const rejectedSubOrders = order.salesOrders.filter(
    (salesOrder) => salesOrder.reviewStatus === "REJECTED",
  ).length;
  const shippingInitializedCount = order.salesOrders.filter(
    (salesOrder) => salesOrder.shippingTask,
  ).length;
  const reportedCount = order.salesOrders.filter(
    (salesOrder) => salesOrder.shippingTask?.reportStatus === "REPORTED",
  ).length;
  const trackingFilledCount = order.salesOrders.filter(
    (salesOrder) => Boolean(salesOrder.shippingTask?.trackingNumber),
  ).length;
  const totalChildCollectedAmount = sumCurrency(
    order.salesOrders.map((salesOrder) => salesOrder.collectedAmount),
  );
  const totalChildRemainingAmount = sumCurrency(
    order.salesOrders.map((salesOrder) => salesOrder.remainingAmount),
  );
  const totalChildCodAmount = sumCurrency(
    order.salesOrders.map((salesOrder) => salesOrder.codAmount),
  );

  return (
    <div className="space-y-6">
      <section className="crm-section-card">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={getTradeStatusLabel(order.tradeStatus)}
            variant={getTradeStatusVariant(order.tradeStatus)}
          />
          <StatusBadge
            label={getSalesOrderPaymentSchemeLabel(order.paymentScheme)}
            variant={getSalesOrderPaymentSchemeVariant(order.paymentScheme)}
          />
          {order.tradeStatus !== "DRAFT" ? (
            <StatusBadge
              label={getSalesOrderReviewStatusLabel(order.reviewStatus)}
              variant={getSalesOrderReviewStatusVariant(order.reviewStatus)}
            />
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.76)] px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                父单摘要
              </p>
              <div className="mt-2 text-lg font-semibold tracking-tight text-black/86">
                {order.tradeNo}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5 text-sm leading-6 text-black/68">
                  <div>客户：{order.customer.name}</div>
                  <div>客户手机：{order.customer.phone}</div>
                  <div>
                    负责人：
                    {order.customer.owner?.name || order.customer.owner?.username || "未分配"}
                  </div>
                  <div>创建时间：{formatDateTime(order.createdAt)}</div>
                  <div>最近更新：{formatDateTime(order.updatedAt)}</div>
                </div>
                <div className="space-y-1.5 text-sm leading-6 text-black/68">
                  <div>收件人：{order.receiverNameSnapshot}</div>
                  <div>联系电话：{order.receiverPhoneSnapshot}</div>
                  <div>收件地址：{order.receiverAddressSnapshot}</div>
                  <div>规划 supplier 数：{plannedSupplierGroups.length}</div>
                  <div>已物化子单：{totalSubOrders}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  成交金额
                </p>
                <div className="mt-2 text-base font-semibold text-black/84">
                  {formatCurrency(order.finalAmount)}
                </div>
                <div className="mt-1 text-xs text-black/52">父单成交口径</div>
              </div>
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  待收金额
                </p>
                <div className="mt-2 text-base font-semibold text-black/84">
                  {formatCurrency(order.remainingAmount)}
                </div>
                <div className="mt-1 text-xs text-black/52">执行仍看 supplier 子单</div>
              </div>
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  COD / 保价
                </p>
                <div className="mt-2 text-base font-semibold text-black/84">
                  {formatCurrency(order.codAmount)}
                </div>
                <div className="mt-1 text-xs text-black/52">
                  保价 {order.insuranceRequired ? formatCurrency(order.insuranceAmount) : "未启用"}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {order.rejectReason || order.remark ? (
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                  审核与备注
                </p>
                <div className="mt-3 space-y-3 text-sm leading-6 text-black/66">
                  {order.rejectReason ? <div>驳回原因：{order.rejectReason}</div> : null}
                  {order.remark ? <div>父单备注：{order.remark}</div> : null}
                  {order.reviewedAt ? <div>审核时间：{formatDateTime(order.reviewedAt)}</div> : null}
                </div>
              </div>
            ) : null}

            {canContinueEdit && continueEditHref ? (
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3.5 text-sm text-black/64">
                当前父单仍可回到客户详情继续编辑。重新提交审核时，系统会按最新的 SKU / 赠品 / 套餐结构刷新 supplier 子单。
                <div className="mt-3">
                  <Link href={continueEditHref} className="crm-button crm-button-secondary">
                    回到客户详情继续编辑
                  </Link>
                </div>
              </div>
            ) : order.tradeStatus === "APPROVED" ? (
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3.5 text-sm text-black/64">
                当前父单已审核通过。shipping / payment artifacts 已按 supplier 子单初始化，后续请在对应子单或执行工作台继续推进。
              </div>
            ) : null}

            {canReview && order.tradeStatus === "PENDING_REVIEW" ? (
              <div className="grid gap-3">
                <form action={reviewAction} className="rounded-[0.95rem] border border-black/8 bg-white/74 px-4 py-3.5">
                  <input type="hidden" name="tradeOrderId" value={order.id} />
                  <input type="hidden" name="reviewStatus" value="APPROVED" />
                  <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
                  <p className="text-sm font-medium text-black/82">审核通过</p>
                  <p className="mt-1 text-xs leading-5 text-black/55">
                    审核通过后会同步所有子单镜像状态，并只初始化一次 shipping / payment artifacts。
                  </p>
                  <button type="submit" className="crm-button crm-button-primary mt-3 w-full">
                    审核通过
                  </button>
                </form>
                <form action={reviewAction} className="rounded-[0.95rem] border border-black/8 bg-white/74 px-4 py-3.5">
                  <input type="hidden" name="tradeOrderId" value={order.id} />
                  <input type="hidden" name="reviewStatus" value="REJECTED" />
                  <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
                  <p className="text-sm font-medium text-black/82">驳回父单</p>
                  <textarea name="rejectReason" rows={3} required placeholder="填写驳回原因" className="crm-textarea mt-3" />
                  <button type="submit" className="crm-button crm-button-secondary mt-3 w-full">
                    提交驳回
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">商品明细</h3>
            <p className="text-sm leading-7 text-black/60">
              父单这里展示成交父行。若是套餐，会继续展示拆出的组件及其最终落入的 supplier 子单。
            </p>
          </div>
          <div className="mt-6 grid gap-3">
            {order.items.map((item) => (
              <div key={item.id} className="rounded-[0.95rem] border border-black/8 bg-white/74 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-black/82">
                    行 {item.lineNo} / {item.titleSnapshot}
                  </div>
                  <StatusBadge label={getTradeItemTypeLabel(item.itemType)} variant={getTradeItemTypeVariant(item.itemType)} />
                </div>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-black/66 md:grid-cols-2">
                  <div>SKU：{item.skuNameSnapshot || "父行不绑定单一 SKU"}</div>
                  <div>规格：{item.specSnapshot || "无"}</div>
                  <div>数量：{item.qty}{item.unitSnapshot || ""}</div>
                  <div>列表价：{formatCurrency(item.listUnitPriceSnapshot)}</div>
                  <div>成交价：{formatCurrency(item.dealUnitPriceSnapshot)}</div>
                  <div>小计：{formatCurrency(item.subtotal)}</div>
                  <div>折扣：{formatCurrency(item.discountAmount)}</div>
                  {item.itemType === "BUNDLE" ? (
                    <>
                      <div>套餐编码：{item.bundleCodeSnapshot || "无"}</div>
                      <div>套餐版本：{item.bundleVersionSnapshot ?? "无"}</div>
                    </>
                  ) : null}
                  {item.remark ? <div className="md:col-span-2">备注：{item.remark}</div> : null}
                </div>
                {item.components.length > 0 ? (
                  <div className="mt-4 rounded-[0.9rem] border border-black/7 bg-[rgba(249,250,252,0.76)] px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
                      {item.itemType === "BUNDLE" ? "展开组件" : "执行组件"}
                    </div>
                    <div className="mt-3 grid gap-2">
                      {item.components.map((component) => {
                        const mappedSalesOrder = component.salesOrderItems[0]?.salesOrder ?? null;
                        return (
                          <div key={component.id} className="rounded-[0.8rem] border border-black/8 bg-white/82 px-3 py-2.5 text-xs text-black/60">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-medium text-black/74">
                                {component.productNameSnapshot}
                                {component.skuNameSnapshot ? ` / ${component.skuNameSnapshot}` : ""}
                              </div>
                              <div>{component.supplierNameSnapshot}</div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 leading-6">
                              <span>数量：{component.qty}{component.unitSnapshot || ""}</span>
                              <span>小计：{formatCurrency(component.allocatedSubtotal)}</span>
                              <span>
                                去向：
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

        <div className="space-y-6">
          <section className="crm-section-card">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-black/85">供应商子单</h3>
              <p className="text-sm leading-7 text-black/60">
                所有子单统一按 supplier 拆出。这里固定显示 tradeNo / subOrderNo / supplier，便于主管和销售快速识别父子关系。
              </p>
            </div>
            {order.salesOrders.length > 0 ? (
              <div className="mt-6 grid gap-4">
                {order.salesOrders.map((salesOrder) => (
                  <div key={salesOrder.id} className="rounded-[0.95rem] border border-black/8 bg-white/74 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-black/82">
                          {order.tradeNo} / {salesOrder.subOrderNo || salesOrder.orderNo}
                        </div>
                        <div className="text-xs text-black/48">{salesOrder.supplier.name}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge label={getSalesOrderReviewStatusLabel(salesOrder.reviewStatus)} variant={getSalesOrderReviewStatusVariant(salesOrder.reviewStatus)} />
                        {salesOrder.shippingTask ? (
                          <>
                            <StatusBadge label={getShippingReportStatusLabel(salesOrder.shippingTask.reportStatus)} variant={getShippingReportStatusVariant(salesOrder.shippingTask.reportStatus)} />
                            <StatusBadge label={getShippingFulfillmentStatusLabel(salesOrder.shippingTask.shippingStatus)} variant={getShippingFulfillmentStatusVariant(salesOrder.shippingTask.shippingStatus)} />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm leading-6 text-black/66 md:grid-cols-2">
                      <div>子单状态：{formatSubOrderStatus(salesOrder.subOrderStatus)}</div>
                      <div>supplier 顺位：S{String(salesOrder.supplierSequence ?? 1).padStart(2, "0")}</div>
                      <div>子单金额：{formatCurrency(salesOrder.finalAmount)}</div>
                      <div>待收金额：{formatCurrency(salesOrder.remainingAmount)}</div>
                      <div>COD：{formatCurrency(salesOrder.codAmount)}</div>
                      <div>物流单号：{salesOrder.shippingTask?.trackingNumber || "待回填"}</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {salesOrder.items.map((item) => (
                        <div key={item.id} className="rounded-[0.85rem] border border-black/8 bg-[rgba(249,250,252,0.72)] px-3 py-2.5 text-xs text-black/60">
                          {item.titleSnapshot || item.productNameSnapshot} / {item.specSnapshot || "无规格"} / 数量 {item.qty} / 小计 {formatCurrency(item.subtotal)}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Link href={`/orders/${salesOrder.id}`} className="crm-button crm-button-secondary w-full">
                        打开供应商子单详情
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <div className="rounded-[0.95rem] border border-dashed border-black/10 bg-[rgba(249,250,252,0.62)] px-4 py-4 text-sm leading-7 text-black/55">
                  当前父单尚未物化 supplier 子单。通常只有提交审核后，系统才会根据 supplier 自动拆出 SalesOrder 子单。
                </div>
                {plannedSupplierGroups.length > 0 ? (
                  <div className="grid gap-3">
                    {plannedSupplierGroups.map((group) => (
                      <div key={group.supplierId} className="rounded-[0.95rem] border border-black/8 bg-white/74 px-4 py-3">
                        <div className="text-sm font-medium text-black/82">{group.supplierName}</div>
                        <div className="mt-2 text-xs leading-5 text-black/56">
                          预计拆成 1 张子单 / 组件 {group.lineCount} 条 / 预计金额 {formatCurrency(String(group.subtotal))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="crm-section-card">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-black/85">支付 / 履约摘要</h3>
              <p className="text-sm leading-7 text-black/60">这里只做父单视角下的执行摘要，不替代 shipping 或 payment 工作台。</p>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">子单状态</p>
                <div className="mt-2 space-y-1.5 text-sm leading-6 text-black/66">
                  <div>已物化子单：{totalSubOrders}</div>
                  <div>待审核子单：{pendingSubOrders}</div>
                  <div>已审核子单：{approvedSubOrders}</div>
                  <div>已拒绝子单：{rejectedSubOrders}</div>
                </div>
              </div>
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">履约进度</p>
                <div className="mt-2 space-y-1.5 text-sm leading-6 text-black/66">
                  <div>已初始化发货：{shippingInitializedCount}</div>
                  <div>已报单：{reportedCount}</div>
                  <div>已回填物流单号：{trackingFilledCount}</div>
                  <div>父单 supplier 规划：{plannedSupplierGroups.length}</div>
                </div>
              </div>
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">支付摘要</p>
                <div className="mt-2 space-y-1.5 text-sm leading-6 text-black/66">
                  <div>子单已录金额：{formatCurrency(String(totalChildCollectedAmount))}</div>
                  <div>子单待收金额：{formatCurrency(String(totalChildRemainingAmount))}</div>
                  <div>父单待收金额：{formatCurrency(order.remainingAmount)}</div>
                </div>
              </div>
              <div className="rounded-[0.95rem] border border-black/7 bg-white/74 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">COD / 保价</p>
                <div className="mt-2 space-y-1.5 text-sm leading-6 text-black/66">
                  <div>子单 COD 合计：{formatCurrency(String(totalChildCodAmount))}</div>
                  <div>父单 COD：{formatCurrency(order.codAmount)}</div>
                  <div>父单保价：{order.insuranceRequired ? formatCurrency(order.insuranceAmount) : "未启用"}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="crm-section-card">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-black/85">操作日志</h3>
          <p className="text-sm leading-7 text-black/60">这里聚合父单、supplier 子单和已生成发货任务的关键动作，保证从成交到执行的链路可追踪。</p>
        </div>
        <div className="mt-6 grid gap-3">
          {operationLogs.length > 0 ? (
            operationLogs.map((record) => (
              <div key={record.id} className="rounded-[0.95rem] border border-black/8 bg-white/74 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-black/82">{record.module} / {record.action}</div>
                  <div className="text-xs text-black/45">{formatDateTime(record.createdAt)}</div>
                </div>
                <div className="mt-2 text-sm leading-7 text-black/62">{record.description || "无描述"}</div>
                <div className="mt-2 text-xs text-black/45">操作人：{record.actor?.name || record.actor?.username || "系统"}</div>
              </div>
            ))
          ) : (
            <div className="rounded-[0.95rem] border border-dashed border-black/10 bg-[rgba(249,250,252,0.62)] px-4 py-4 text-sm leading-7 text-black/55">
              当前暂无操作日志。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
