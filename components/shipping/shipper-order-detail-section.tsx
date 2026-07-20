import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  formatCurrency,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderReviewStatusLabel,
  getSalesOrderReviewStatusVariant,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
  getShippingReportStatusVariant,
} from "@/lib/fulfillment/metadata";
import { summarizeShippingPackageSnapshots } from "@/lib/shipping/package-snapshots";
import type { ShipperOrderDetail } from "@/lib/shipping/order-detail";

function getUserLabel(user: ShipperOrderDetail["owner"]) {
  return user ? user.name || user.username : "未指派";
}

function getItemTitle(item: ShipperOrderDetail["items"][number]) {
  return (
    item.titleSnapshot?.trim() ||
    item.exportDisplayNameSnapshot?.trim() ||
    item.skuNameSnapshot
  );
}

function getItemTypeLabel(
  itemType: ShipperOrderDetail["items"][number]["itemTypeSnapshot"],
) {
  switch (itemType) {
    case "GIFT":
      return "赠品";
    case "BUNDLE":
      return "套餐组件";
    case "SKU":
    default:
      return "普通商品";
  }
}

function buildOrderRemarks(order: ShipperOrderDetail) {
  const seen = new Set<string>();
  const remarks: Array<{ label: string; value: string }> = [];

  const append = (label: string, value: string | null | undefined) => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    remarks.push({ label, value: normalized });
  };

  append("订单备注", order.remark);
  append("父单备注", order.tradeOrder?.remark);
  append("发货备注", order.shippingTask?.remark);

  return remarks;
}

export function ShipperOrderDetailSection({
  order,
}: Readonly<{ order: ShipperOrderDetail }>) {
  const salesperson = order.owner ?? order.customer.owner;
  const remarks = buildOrderRemarks(order);
  const shippingTask = order.shippingTask;
  const subOrderNo = order.subOrderNo || order.orderNo;

  return (
    <div className="space-y-4">
      <SectionCard
        title="订单执行信息"
        description="发货只读视图，仅展示当前子单履约所需信息。"
        actions={
          <>
            <StatusBadge
              label={getSalesOrderReviewStatusLabel(order.reviewStatus)}
              variant={getSalesOrderReviewStatusVariant(order.reviewStatus)}
            />
            {shippingTask ? (
              <>
                <StatusBadge
                  label={getShippingReportStatusLabel(shippingTask.reportStatus)}
                  variant={getShippingReportStatusVariant(shippingTask.reportStatus)}
                />
                <StatusBadge
                  label={getShippingFulfillmentStatusLabel(
                    shippingTask.shippingStatus,
                  )}
                  variant={getShippingFulfillmentStatusVariant(
                    shippingTask.shippingStatus,
                  )}
                />
              </>
            ) : null}
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="crm-subtle-panel">
            <div className="crm-detail-label">订单编号</div>
            <div className="mt-2 font-medium text-foreground">{subOrderNo}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              父单 {order.tradeOrder?.tradeNo || "无父单编号"}
            </div>
          </div>
          <div className="crm-subtle-panel">
            <div className="crm-detail-label">业务员</div>
            <div className="mt-2 font-medium text-foreground">
              {getUserLabel(salesperson)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              客户 {order.customer.name}
            </div>
          </div>
          <div className="crm-subtle-panel">
            <div className="crm-detail-label">供货商</div>
            <div className="mt-2 font-medium text-foreground">
              {order.supplier.name}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              下单 {formatDateTime(order.createdAt)}
            </div>
          </div>
          <div className="crm-subtle-panel">
            <div className="crm-detail-label">金额 / 付款</div>
            <div className="mt-2 font-medium text-foreground">
              {formatCurrency(order.finalAmount)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {getSalesOrderPaymentSchemeLabel(order.paymentScheme)} · COD{" "}
              {formatCurrency(order.codAmount)}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-4 py-3">
          <div className="crm-detail-label">备注</div>
          {remarks.length > 0 ? (
            <div className="mt-2 space-y-1.5 text-sm leading-6 text-foreground/80">
              {remarks.map((remark) => (
                <div key={`${remark.label}:${remark.value}`}>
                  <span className="font-medium text-foreground">
                    {remark.label}：
                  </span>
                  {remark.value}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-muted-foreground">暂无备注</div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="商品明细"
        description="不同商品独立展示，数量与商品逐行对应。"
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border-soft)]">
          <table className="min-w-full divide-y divide-[var(--color-border-soft)] text-sm">
            <thead className="bg-[var(--color-panel-soft)] text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">商品</th>
                <th className="px-4 py-2.5 font-medium">规格</th>
                <th className="px-4 py-2.5 font-medium">数量</th>
                <th className="px-4 py-2.5 font-medium">商品备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)] bg-[var(--color-panel)]">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-foreground">
                      {getItemTitle(item)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {getItemTypeLabel(item.itemTypeSnapshot)} ·{" "}
                      {item.productNameSnapshot}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {item.specSnapshot || item.skuNameSnapshot}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-top font-medium text-foreground">
                    {item.qty}
                    {item.unitSnapshot}
                  </td>
                  <td className="max-w-[20rem] px-4 py-3 align-top text-muted-foreground">
                    {item.tradeOrderItem?.remark || "无"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="收件信息">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="crm-detail-label">收件人</dt>
              <dd className="mt-1.5 font-medium text-foreground">
                {order.receiverNameSnapshot}
              </dd>
            </div>
            <div>
              <dt className="crm-detail-label">电话</dt>
              <dd className="mt-1.5 font-medium text-foreground">
                {order.receiverPhoneSnapshot}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="crm-detail-label">地址</dt>
              <dd className="mt-1.5 leading-6 text-foreground/80">
                {order.receiverAddressSnapshot}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="发货信息">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="crm-detail-label">导出批次</dt>
              <dd className="mt-1.5 font-medium text-foreground">
                {shippingTask?.exportBatch?.exportNo || "尚未导出"}
              </dd>
            </div>
            <div>
              <dt className="crm-detail-label">包裹</dt>
              <dd className="mt-1.5 font-medium text-foreground">
                {summarizeShippingPackageSnapshots(
                  shippingTask?.shippingPackages,
                )}
              </dd>
            </div>
            <div>
              <dt className="crm-detail-label">承运商</dt>
              <dd className="mt-1.5 text-foreground/80">
                {shippingTask?.shippingProvider || "未填写"}
              </dd>
            </div>
            <div>
              <dt className="crm-detail-label">物流单号</dt>
              <dd className="mt-1.5 text-foreground/80">
                {shippingTask?.trackingNumber || "未填写"}
              </dd>
            </div>
            <div>
              <dt className="crm-detail-label">保价</dt>
              <dd className="mt-1.5 text-foreground/80">
                {order.insuranceRequired
                  ? formatCurrency(order.insuranceAmount)
                  : "不保价"}
              </dd>
            </div>
            <div>
              <dt className="crm-detail-label">发货时间</dt>
              <dd className="mt-1.5 text-foreground/80">
                {shippingTask?.shippedAt
                  ? formatDateTime(shippingTask.shippedAt)
                  : "尚未发货"}
              </dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
