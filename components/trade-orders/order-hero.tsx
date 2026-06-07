import { Calendar, User } from "lucide-react";
import {
  formatCurrency,
  getSalesOrderReviewStatusLabel,
  getSalesOrderReviewStatusVariant,
} from "@/lib/fulfillment/metadata";
import { formatDateTime } from "@/lib/customers/metadata";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

// 订单详情顶部 hero 区域
//
// 设计原则:
// - 左侧客户身份卡片 (头像占位 + 客户名 + 销售名 + 创建时间小灰字)
// - 中间订单号 (mono 大字) + 1 个主状态 chip
// - 右侧大字金额 + 已收/待收小字
// - 单卡 rounded-xl, 不堆叠 5-7 个徽章
// - 二级状态全部交给 OrderProgressTrack / SupplierFulfillmentAccordion 处理
//
// 主状态优先级 (高 → 低): 撤单审批中 / 退货审批中 / 草稿 / 待审核 / 已拒绝 / 已取消 / 已审核

type TradeStatusValue =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED"
  | "REVISION_PENDING";

export type OrderHeroPrimaryStatusKind =
  | "REVISION_PENDING"
  | "SHIPPING_RETURN_PENDING"
  | "TRADE_STATUS";

type ShippingReturnStatusValue =
  | "PENDING_REVIEW"
  | "PENDING_RETURN_TRACKING"
  | "IN_RETURN_TRANSIT"
  | "RETURNED_TO_WAREHOUSE"
  | "REJECTED"
  | "CANCELED";

export type OrderHeroProps = Readonly<{
  tradeNo: string;
  tradeStatus: TradeStatusValue;
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  createdAt: Date;
  finalAmount: string;
  collectedAmount: string;
  remainingAmount: string;
  customer: {
    name: string;
    owner: { name: string | null; username: string } | null;
  };
  // 主状态影响因素: 优先级 撤单审批中 > 退货进行中 > tradeStatus
  hasActiveRevision?: boolean;
  activeShippingReturnStatus?: ShippingReturnStatusValue | null;
}>;

function getTradeStatusBadge(value: TradeStatusValue) {
  switch (value) {
    case "DRAFT":
      return { label: "草稿", variant: "neutral" as StatusBadgeVariant };
    case "PENDING_REVIEW":
      return { label: "待审核", variant: "warning" as StatusBadgeVariant };
    case "APPROVED":
      return { label: "已审核", variant: "success" as StatusBadgeVariant };
    case "REJECTED":
      return { label: "已拒绝", variant: "danger" as StatusBadgeVariant };
    case "CANCELED":
      return { label: "已取消", variant: "neutral" as StatusBadgeVariant };
    case "REVISION_PENDING":
      return { label: "撤单审批中", variant: "warning" as StatusBadgeVariant };
    default:
      return { label: value, variant: "neutral" as StatusBadgeVariant };
  }
}

function getShippingReturnBadge(value: ShippingReturnStatusValue) {
  switch (value) {
    case "PENDING_REVIEW":
      return { label: "退货审批中", variant: "warning" as StatusBadgeVariant };
    case "PENDING_RETURN_TRACKING":
      return { label: "退货待回填", variant: "warning" as StatusBadgeVariant };
    case "IN_RETURN_TRANSIT":
      return { label: "退货在途", variant: "info" as StatusBadgeVariant };
    case "RETURNED_TO_WAREHOUSE":
      return { label: "已到仓", variant: "success" as StatusBadgeVariant };
    default:
      return null;
  }
}

// 客户名首字符头像 (placeholder, 不引入图片资源)
function CustomerAvatar({ name }: { name: string }) {
  const ch = name.trim().slice(0, 1) || "·";
  return (
    <div
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-base font-semibold text-foreground"
    >
      {ch}
    </div>
  );
}

export function OrderHero({
  tradeNo,
  tradeStatus,
  reviewStatus,
  createdAt,
  finalAmount,
  collectedAmount,
  remainingAmount,
  customer,
  hasActiveRevision = false,
  activeShippingReturnStatus = null,
}: OrderHeroProps) {
  // 主状态: 进行中的撤单/退货优先, 否则用 tradeStatus
  let primaryBadge: { label: string; variant: StatusBadgeVariant };
  if (tradeStatus === "REVISION_PENDING" || hasActiveRevision) {
    primaryBadge = { label: "撤单审批中", variant: "warning" };
  } else {
    const returnBadge = activeShippingReturnStatus
      ? getShippingReturnBadge(activeShippingReturnStatus)
      : null;
    primaryBadge = returnBadge ?? getTradeStatusBadge(tradeStatus);
  }

  // 草稿/驳回 走 review chip 作为辅助
  const showReviewAux =
    tradeStatus === "REJECTED" ||
    (tradeStatus === "DRAFT" && reviewStatus !== "PENDING_REVIEW");

  const ownerLabel =
    customer.owner?.name || customer.owner?.username || "暂无归属销售";

  return (
    <section
      className={cn(
        "rounded-xl border border-border/60 bg-card px-5 py-5 shadow-sm",
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center">
        {/* 左: 客户身份 */}
        <div className="flex min-w-0 items-center gap-3">
          <CustomerAvatar name={customer.name} />
          <div className="min-w-0 space-y-1">
            <div className="truncate text-base font-semibold text-foreground">
              {customer.name}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" aria-hidden="true" />
                {ownerLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                {formatDateTime(createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* 中: 订单号 + 主状态 */}
        <div className="min-w-0 space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            交易单号
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl font-semibold tracking-tight text-foreground">
              {tradeNo}
            </span>
            <StatusBadge label={primaryBadge.label} variant={primaryBadge.variant} />
            {showReviewAux ? (
              <StatusBadge
                label={getSalesOrderReviewStatusLabel(reviewStatus)}
                variant={getSalesOrderReviewStatusVariant(reviewStatus)}
              />
            ) : null}
          </div>
        </div>

        {/* 右: 金额 */}
        <div className="lg:text-right">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            订单金额
          </div>
          <div className="mt-1 font-mono text-3xl font-semibold tracking-tight text-foreground">
            {formatCurrency(finalAmount)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground lg:justify-end">
            <span>已收 {formatCurrency(collectedAmount)}</span>
            <span>待收 {formatCurrency(remainingAmount)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default OrderHero;
