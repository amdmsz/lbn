import { redirect } from "next/navigation";

import RefundReviewPanel from "@/components/refunds/refund-review-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canApproveRefund,
  canRecordRefundPayout,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { listPendingRefundsForFinance } from "@/lib/payments/refunds";
import {
  approveRefundAction,
  payoutRefundActionAlias,
  rejectRefundAction,
  withdrawRefundAction,
} from "./actions";

export default async function FinanceRefundsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canApproveRefund(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const rows = await listPendingRefundsForFinance({
    id: session.user.id,
    role: session.user.role,
  });

  const formatted = rows.map((r) => ({
    id: r.id,
    tradeOrderId: r.tradeOrderId,
    tradeNo: r.tradeOrder.tradeNo,
    customerName: r.customer.name,
    customerPhone: r.customer.phone,
    customerId: r.customer.id,
    requestedAmount: r.requestedAmount.toFixed(2),
    approvedAmount: r.approvedAmount ? r.approvedAmount.toFixed(2) : null,
    status: r.status,
    reason: r.reason,
    reasonDetail: r.reasonDetail,
    requesterName: r.requester?.name ?? r.requester?.username ?? "—",
    requestedAt: r.requestedAt,
  }));

  return (
    <div className="crm-page">
      <PageHeader
        eyebrow="财务中心"
        title="退款审批工作台"
        description="主管/销售发起的退款申请, 财务侧 4 眼复审 + 记录实际出账."
        actions={
          <StatusBadge
            label={`待处理 ${formatted.filter((r) => r.status === "PENDING_FINANCE").length} · 待出账 ${formatted.filter((r) => r.status === "APPROVED_FINANCE").length}`}
            variant="info"
          />
        }
      />

      <section className="mt-6">
        <RefundReviewPanel
          rows={formatted}
          canApprove={canApproveRefund(session.user.role)}
          canPayout={canRecordRefundPayout(session.user.role)}
          approveAction={approveRefundAction}
          rejectAction={rejectRefundAction}
          payoutAction={payoutRefundActionAlias}
          withdrawAction={withdrawRefundAction}
        />
      </section>
    </div>
  );
}
