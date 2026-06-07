import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import ShippingReturnListPanel, {
  type ShippingReturnRow,
} from "@/components/shipping/shipping-return-list-panel";
import {
  canConfirmShippingReturnReceived,
  canFillShippingReturnTracking,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { listShippingReturnsForShipper } from "@/lib/shipping/returns-shipper-list";
import {
  confirmShippingReturnReceivedAction,
  fillShippingReturnTrackingAction,
} from "./actions";

export default async function ShippingReturnsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  const canFillTracking = canFillShippingReturnTracking(role);
  const canConfirmReceived = canConfirmShippingReturnReceived(role);

  // 发货人工作台: 只对 SHIPPER / OPS / ADMIN 这类有发货执行职责的角色开放.
  // 其他角色 (SALES / FINANCE) 不应进入这里, 直接 redirect 到默认路由.
  if (!canFillTracking && !canConfirmReceived) {
    redirect(getDefaultRouteForRole(role));
  }

  const rows = await listShippingReturnsForShipper({
    id: session.user.id,
    role,
  });

  const formatted: ShippingReturnRow[] = rows.map((r) => ({
    id: r.id,
    tradeOrderId: r.tradeOrderId,
    tradeNo: r.tradeOrder.tradeNo,
    shippingTaskId: r.shippingTaskId,
    customerId: r.customer.id,
    customerName: r.customer.name,
    customerPhone: r.customer.phone,
    productSummary: r.productSummary ?? "",
    status: r.status,
    reason: r.reason,
    reasonDetail: r.reasonDetail,
    requesterName: r.requester?.name ?? r.requester?.username ?? "—",
    requestedAt: r.requestedAt,
    returnTrackingNumber: r.returnTrackingNumber,
    returnCarrier: r.returnCarrier,
    trackingFilledAt: r.trackingFilledAt,
    receivedAt: r.receivedAt,
    receivedRemark: r.receivedRemark,
    refundRequestId: r.refundRequestId,
    expectedRefundAmount: r.expectedRefundAmount.toFixed(2),
  }));

  const pendingTrackingCount = formatted.filter(
    (r) => r.status === "PENDING_RETURN_TRACKING",
  ).length;
  const inTransitCount = formatted.filter(
    (r) => r.status === "IN_RETURN_TRANSIT",
  ).length;
  const returnedCount = formatted.filter(
    (r) => r.status === "RETURNED_TO_WAREHOUSE",
  ).length;

  return (
    <div className="crm-page">
      <PageHeader
        eyebrow="发货执行 / 退货物流"
        title="退货物流跟踪台 / 物流回仓"
        description="主管批准退货申请后, 发货人在此对接退货物流、跟踪回程进度, 并在供应商签收后确认入库, 自动触发退款流程."
        actions={
          <StatusBadge
            label={`待填运单 ${pendingTrackingCount} · 回程在途 ${inTransitCount} · 已入库 ${returnedCount}`}
            variant="info"
          />
        }
      />

      <section className="mt-6">
        <ShippingReturnListPanel
          rows={formatted}
          canFillTracking={canFillTracking}
          canConfirmReceived={canConfirmReceived}
          fillTrackingAction={fillShippingReturnTrackingAction}
          confirmReceivedAction={confirmShippingReturnReceivedAction}
        />
      </section>
    </div>
  );
}
