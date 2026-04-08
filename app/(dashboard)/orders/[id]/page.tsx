import { notFound, redirect } from "next/navigation";
import { SalesOrderDetailSection } from "@/components/sales-orders/sales-order-detail-section";
import { TradeOrderDetailSection } from "@/components/trade-orders/trade-order-detail-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageContextLink } from "@/components/shared/page-context-link";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { parseActionNotice } from "@/lib/action-notice";
import {
  canAccessPaymentRecordModule,
  canAccessSalesOrderModule,
  canAccessShippingModule,
  canConfirmPaymentRecord,
  canCreateSalesOrder,
  canManageCollectionTasks,
  canManageLogisticsFollowUp,
  canReviewSalesOrder,
  canSubmitPaymentRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { buildFulfillmentTradeOrdersHref } from "@/lib/fulfillment/navigation";
import { getSalesOrderDetail } from "@/lib/sales-orders/queries";
import { getTradeOrderDetail } from "@/lib/trade-orders/queries";
import {
  reviewPaymentRecordAction,
  reviewSalesOrderAction,
  reviewTradeOrderAction,
  saveSalesOrderAction,
  submitPaymentRecordAction,
  updateCollectionTaskAction,
  updateLogisticsFollowUpTaskAction,
  upsertCollectionTaskAction,
} from "../actions";

function buildCustomerTradeOrderHref(customerId: string, tradeOrderId: string) {
  const params = new URLSearchParams();
  params.set("tab", "orders");
  params.set("createTradeOrder", "1");
  params.set("tradeOrderId", tradeOrderId);
  return `/customers/${customerId}?${params.toString()}`;
}

export default async function SalesOrderDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessSalesOrderModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = parseActionNotice(resolvedSearchParams);

  const tradeOrderData = await getTradeOrderDetail(
    {
      id: session.user.id,
      role: session.user.role,
    },
    id,
  );

  if (tradeOrderData) {
    const canContinueEdit =
      canCreateSalesOrder(session.user.role) &&
      (tradeOrderData.order.tradeStatus === "DRAFT" ||
        tradeOrderData.order.tradeStatus === "REJECTED");

    return (
      <div className="crm-page">
        <PageHeader
          context={
            <PageContextLink
              href={buildFulfillmentTradeOrdersHref()}
              label="返回交易单列表"
              trail={["履约中心", "交易单", tradeOrderData.order.tradeNo]}
            />
          }
          eyebrow="履约中心"
          title={`父单详情 · ${tradeOrderData.order.tradeNo}`}
          description="查看父单、拆单与履约。"
          actions={
            <StatusBadge
              label={canReviewSalesOrder(session.user.role) ? "支持父单审核" : "父单总览模式"}
              variant={canReviewSalesOrder(session.user.role) ? "success" : "info"}
            />
          }
        />

        {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

        <DataTableWrapper
          title="TradeOrder 父单总览"
          description="回看父单与拆单。"
        >
          <TradeOrderDetailSection
            order={tradeOrderData.order}
            operationLogs={tradeOrderData.operationLogs}
            canReview={canReviewSalesOrder(session.user.role)}
            canContinueEdit={canContinueEdit}
            continueEditHref={
              canContinueEdit
                ? buildCustomerTradeOrderHref(
                    tradeOrderData.order.customer.id,
                    tradeOrderData.order.id,
                  )
                : undefined
            }
            reviewAction={reviewTradeOrderAction}
          />
        </DataTableWrapper>
      </div>
    );
  }

  const data = await getSalesOrderDetail(
    {
      id: session.user.id,
      role: session.user.role,
    },
    id,
  );

  if (!data) {
    notFound();
  }

  const canResubmit =
    session.user.role === "SALES" &&
    canCreateSalesOrder(session.user.role) &&
    data.order.reviewStatus === "REJECTED" &&
    !data.order.tradeOrderId;

  const canPaymentModule = canAccessPaymentRecordModule(session.user.role);
  const orderTitleNo = data.order.tradeOrder?.tradeNo
    ? `${data.order.tradeOrder.tradeNo} / ${data.order.subOrderNo || data.order.orderNo}`
    : data.order.orderNo;

  return (
    <div className="crm-page">
      <PageHeader
        context={
          <PageContextLink
            href={
              data.order.tradeOrderId && data.order.tradeOrder
                ? `/orders/${data.order.tradeOrder.id}`
                : buildFulfillmentTradeOrdersHref()
            }
            label={
              data.order.tradeOrderId && data.order.tradeOrder
                ? `返回父单 ${data.order.tradeOrder.tradeNo}`
                : "返回交易单列表"
            }
            trail={[
              "履约中心",
              data.order.tradeOrderId ? "供应商子单" : "订单详情",
              orderTitleNo,
            ]}
          />
        }
        eyebrow="履约中心"
        title={`${data.order.tradeOrderId ? "供应商子单详情" : "订单详情"} · ${orderTitleNo}`}
        description={
          data.order.tradeOrderId
            ? "查看子单执行结果。"
            : "查看订单详情。"
        }
        actions={
          <>
            <StatusBadge
              label={canReviewSalesOrder(session.user.role) ? "支持审核" : "只读"}
              variant={canReviewSalesOrder(session.user.role) ? "success" : "info"}
            />
            <StatusBadge
              label={canResubmit ? "可重新提交" : "快照模式"}
              variant={canResubmit ? "warning" : "neutral"}
            />
            {canPaymentModule ? (
              <StatusBadge
                label={
                  canConfirmPaymentRecord(session.user.role)
                    ? "支持收款审核"
                    : "支持收款提交"
                }
                variant={canConfirmPaymentRecord(session.user.role) ? "success" : "info"}
              />
            ) : null}
          </>
        }
      />

      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title={data.order.tradeOrderId ? "SalesOrder 供应商子单" : "SalesOrder 主单"}
        description={
          data.order.tradeOrderId
            ? "执行层详情。"
            : "订单详情。"
        }
      >
        <SalesOrderDetailSection
          order={data.order}
          skuOptions={data.skuOptions}
          paymentOwnerOptions={data.paymentOwnerOptions}
          operationLogs={data.operationLogs}
          canResubmit={canResubmit}
          canReview={canReviewSalesOrder(session.user.role)}
          canAccessShippingCenter={canAccessShippingModule(session.user.role)}
          canSubmitPaymentRecord={canSubmitPaymentRecord(session.user.role)}
          canConfirmPaymentRecord={canConfirmPaymentRecord(session.user.role)}
          canManageCollectionTasks={canManageCollectionTasks(session.user.role)}
          canManageLogisticsFollowUp={canManageLogisticsFollowUp(session.user.role)}
          saveAction={saveSalesOrderAction}
          reviewAction={reviewSalesOrderAction}
          submitPaymentRecordAction={submitPaymentRecordAction}
          reviewPaymentRecordAction={reviewPaymentRecordAction}
          upsertCollectionTaskAction={upsertCollectionTaskAction}
          updateCollectionTaskAction={updateCollectionTaskAction}
          updateLogisticsFollowUpTaskAction={updateLogisticsFollowUpTaskAction}
        />
      </DataTableWrapper>
    </div>
  );
}
