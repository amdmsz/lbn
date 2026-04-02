import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SalesOrderDetailSection } from "@/components/sales-orders/sales-order-detail-section";
import { TradeOrderDetailSection } from "@/components/trade-orders/trade-order-detail-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
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
          title={`成交父单详情 · ${tradeOrderData.order.tradeNo}`}
          description="订单详情页现在优先回到 TradeOrder 父单视角。页面内先看父单摘要和 supplier 子单关系，旧子单详情仍保留为执行层次级入口。"
          actions={
            <>
              <StatusBadge
                label={canReviewSalesOrder(session.user.role) ? "支持父单审核" : "只读"}
                variant={canReviewSalesOrder(session.user.role) ? "success" : "info"}
              />
              <StatusBadge
                label={canContinueEdit ? "可回到客户详情继续编辑" : "快照模式"}
                variant={canContinueEdit ? "warning" : "neutral"}
              />
            </>
          }
        />

        {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

        <DataTableWrapper
          title="TradeOrder 父单"
          description="父单负责成交审核、客户与金额摘要、supplier 拆单关系和父子编号统一。具体 shipping / payment / collection 执行仍由子单承接。"
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
        title={`${data.order.tradeOrderId ? "供应商子单详情" : "订单详情"} · ${orderTitleNo}`}
        description={
          data.order.tradeOrderId
            ? "当前命中的是 supplier 子单详情。父单已经切到 TradeOrder 视角，这里保留为兼容入口，继续承接支付、发货和物流结果回看。"
            : "在同一页面查看订单快照、应收计划、收款记录、催收任务、发货状态和操作日志。"
        }
        actions={
          <>
            {data.order.tradeOrderId && data.order.tradeOrder ? (
              <Link
                href={`/orders/${data.order.tradeOrder.id}`}
                className="crm-button crm-button-secondary"
              >
                返回父单 {data.order.tradeOrder.tradeNo}
              </Link>
            ) : null}
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
            ? "该子单从成交父单拆出，继续作为 shipping / payment / collection 的执行对象。"
            : "本页仅处理 SalesOrder V2 及其关联的收款与履约数据。"
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
