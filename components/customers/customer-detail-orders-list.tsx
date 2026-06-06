import {
  CustomerEmptyState,
  formatOwnerLabel,
} from "@/components/customers/customer-record-list";
import {
  type CustomerDossierStatusItem,
  type CustomerDossierStatusTone,
  OrderArchiveCard,
} from "@/components/customers/customer-dossier-primitives";
import {
  formatCurrency,
  getCodCollectionStatusLabel,
  getLogisticsFollowUpTaskStatusLabel,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderReviewStatusLabel,
  getShippingFulfillmentStatusLabel,
  getShippingReportStatusLabel,
} from "@/lib/fulfillment/metadata";
import { formatDateTime } from "@/lib/customers/metadata";
import type { getCustomerDetailOrdersData } from "@/lib/customers/queries";

export type CustomerOrdersData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailOrdersData>>
>;

function getOrderReviewTone(
  status: CustomerOrdersData[number]["reviewStatus"],
): CustomerDossierStatusTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    default:
      return "warning";
  }
}

function getShippingReportTone(
  status:
    | NonNullable<CustomerOrdersData[number]["shippingTask"]>["reportStatus"]
    | undefined,
): CustomerDossierStatusTone {
  if (!status) {
    return "neutral";
  }

  return status === "REPORTED" ? "success" : "warning";
}

function getShippingFulfillmentTone(
  status:
    | NonNullable<CustomerOrdersData[number]["shippingTask"]>["shippingStatus"]
    | undefined,
): CustomerDossierStatusTone {
  switch (status) {
    case "COMPLETED":
    case "DELIVERED":
      return "success";
    case "SHIPPED":
    case "READY_TO_SHIP":
      return "info";
    case "CANCELED":
      return "danger";
    case "PENDING":
      return "warning";
    default:
      return "neutral";
  }
}

function getCodTone(
  status: NonNullable<
    CustomerOrdersData[number]["shippingTask"]
  >["codCollectionRecords"][number]["status"] | undefined,
): CustomerDossierStatusTone {
  switch (status) {
    case "COLLECTED":
      return "success";
    case "EXCEPTION":
    case "REJECTED":
    case "UNCOLLECTED":
      return "danger";
    case "PENDING_COLLECTION":
      return "warning";
    default:
      return "neutral";
  }
}

export function CustomerOrdersList({
  data,
}: Readonly<{
  data: CustomerOrdersData;
}>) {
  return data.length > 0 ? (
    <div className="space-y-2.5">
      {data.map((record) => {
        const latestCodRecord = record.shippingTask?.codCollectionRecords?.[0] ?? null;
        const latestLogisticsTask =
          record.shippingTask?.logisticsFollowUpTasks?.[0] ?? null;
        const title = record.tradeOrder?.tradeNo
          ? `${record.tradeOrder.tradeNo} / ${record.subOrderNo || record.orderNo}`
          : record.orderNo;
        const reportLabel = record.shippingTask
          ? getShippingReportStatusLabel(record.shippingTask.reportStatus)
          : "未进发货池";
        const shippingLabel = record.shippingTask
          ? getShippingFulfillmentStatusLabel(record.shippingTask.shippingStatus)
          : "待审核";
        const codLabel = latestCodRecord
          ? `${getCodCollectionStatusLabel(latestCodRecord.status)} / ${formatCurrency(latestCodRecord.collectedAmount)}`
          : "不适用";
        const statusItems: CustomerDossierStatusItem[] = [
          {
            label: "审核",
            value: getSalesOrderReviewStatusLabel(record.reviewStatus),
            tone: getOrderReviewTone(record.reviewStatus),
          },
          {
            label: "收款",
            value: getSalesOrderPaymentSchemeLabel(record.paymentScheme),
            tone: "info",
          },
          {
            label: "报单",
            value: reportLabel,
            tone: getShippingReportTone(record.shippingTask?.reportStatus),
          },
          {
            label: "履约",
            value: shippingLabel,
            tone: getShippingFulfillmentTone(record.shippingTask?.shippingStatus),
          },
          {
            label: "物流",
            value: record.shippingTask?.trackingNumber || "未回填",
            tone: record.shippingTask?.trackingNumber ? "info" : "neutral",
          },
          {
            label: "COD",
            value: codLabel,
            tone: getCodTone(latestCodRecord?.status),
          },
        ];
        const detail = (
          <div className="grid gap-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)] md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="crm-detail-label">收件信息</p>
              <p className="mt-1 text-[var(--foreground)]">
                {record.receiverNameSnapshot} / {record.receiverPhoneSnapshot}
              </p>
              <p className="mt-1">{record.receiverAddressSnapshot}</p>
            </div>
            <div>
              <p className="crm-detail-label">物流</p>
              <p className="mt-1 text-[var(--foreground)]">
                {record.shippingTask?.shippingProvider || "未选择物流"}
              </p>
              <p className="mt-1">单号 {record.shippingTask?.trackingNumber || "未回填"}</p>
            </div>
            <div>
              <p className="crm-detail-label">物流跟进</p>
              <p className="mt-1 text-[var(--foreground)]">
                {latestLogisticsTask
                  ? `${latestLogisticsTask.owner.name} / ${getLogisticsFollowUpTaskStatusLabel(latestLogisticsTask.status)}`
                  : "暂无任务"}
              </p>
              <p className="mt-1">
                {latestLogisticsTask?.nextTriggerAt
                  ? `下次 ${formatDateTime(latestLogisticsTask.nextTriggerAt)}`
                  : "暂无下次触发"}
              </p>
            </div>
            <div>
              <p className="crm-detail-label">COD</p>
              <p className="mt-1 text-[var(--foreground)]">{codLabel}</p>
              <p className="mt-1">
                {latestCodRecord?.occurredAt
                  ? formatDateTime(latestCodRecord.occurredAt)
                  : "暂无回款时间"}
              </p>
            </div>
          </div>
        );

        return (
          <OrderArchiveCard
            key={record.id}
            title={title}
            amount={formatCurrency(record.finalAmount)}
            summary={`${record.supplier.name} / ${record.tradeOrder?.tradeNo ? "成交主单拆分子单" : "单订单结构"} / 创建 ${formatDateTime(record.createdAt)}`}
            meta={[
              `负责人 ${formatOwnerLabel(record.owner)}`,
              record.tradeOrder?.tradeNo
                ? `成交主单 ${record.tradeOrder.tradeNo}`
                : `订单编号 ${record.orderNo}`,
              record.subOrderNo
                ? `子单 ${record.subOrderNo}`
                : "单订单结构",
              latestLogisticsTask
                ? `物流跟进 ${latestLogisticsTask.owner.name} / ${getLogisticsFollowUpTaskStatusLabel(latestLogisticsTask.status)}`
                : "物流跟进 暂无任务",
              latestCodRecord
                ? `COD ${getCodCollectionStatusLabel(latestCodRecord.status)} / ${formatCurrency(latestCodRecord.collectedAmount)}`
                : "COD 不适用或未开始",
            ]}
            statusItems={statusItems}
            detail={detail}
            href={`/orders/${record.tradeOrder?.id ?? record.id}`}
            hrefLabel={record.tradeOrder ? "查看成交主单" : "查看订单"}
          />
        );
      })}
    </div>
  ) : (
    <CustomerEmptyState
      title="暂无订单记录"
      description="暂无成交记录。"
    />
  );
}
