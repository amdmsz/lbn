"use server";

/**
 * Phase C 退货链路 server actions.
 *
 * 跟 Phase A (revisions) / Phase B (refunds) 平行的 server actions, 复用
 * getTradeOrderActionActor 兜底 — 不重写 session 解析逻辑.
 *
 * 失效策略:
 *   - tradeOrder list / 当前 trade-order / customer / refund list / refund(id) 通过 tag 失效
 *   - 聚合页 /shipping/returns + /orders/[id] + /customers/[id] + /finance/refunds 走 path 失效
 *   - 入库 (confirmReceived) 触发 RefundRequest 时会失效 refund 相关 tag
 */

import { revalidatePath, updateTag } from "next/cache";
import { ZodError } from "zod";

import { getFormValue } from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  cancelShippingReturn,
  confirmShippingReturnReceived,
  fillShippingReturnTracking,
  requestShippingReturn,
  reviewShippingReturn,
} from "@/lib/shipping/returns";
import {
  ShippingReturnReason,
} from "@prisma/client";

export type ShippingReturnActionResult = {
  status: "success" | "error";
  message: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "表单校验失败。";
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

async function getShippingReturnActionActor() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("登录已失效，请重新登录后再试。");
  }
  return {
    id: session.user.id,
    role: session.user.role,
  };
}

/**
 * 统一失效: tradeOrder list/tag + customer tag + 聚合页 path.
 * tradeOrderId / customerId 可能为空 (例如 cancel 时只传 shippingReturnId), 由调用方
 * 在拿到 service 返回后再调用 invalidateAfterShippingReturnMutation.
 */
function invalidateAfterShippingReturnMutation(
  tradeOrderId: string | null | undefined,
  customerId: string | null | undefined,
  options: { touchRefund?: boolean } = {},
) {
  updateTag(CACHE_TAGS.tradeOrderList);
  if (tradeOrderId) {
    updateTag(CACHE_TAGS.tradeOrder(tradeOrderId));
  }
  if (customerId) {
    updateTag(CACHE_TAGS.customer(customerId));
  }
  if (options.touchRefund) {
    updateTag(CACHE_TAGS.refundList);
  }
  revalidatePath("/shipping/returns");
  if (tradeOrderId) {
    revalidatePath(`/orders/${tradeOrderId}`);
  }
  if (customerId) {
    revalidatePath(`/customers/${customerId}`);
  }
  if (options.touchRefund) {
    revalidatePath("/finance/refunds");
  }
}

export async function requestShippingReturnAction(
  formData: FormData,
): Promise<ShippingReturnActionResult> {
  try {
    const actor = await getShippingReturnActionActor();
    const reasonRaw = getFormValue(formData, "reason");
    // 防御性: 用 Zod 自带 enum 校验之外, 显式再 narrow 一道避免 actor 拼错
    const reason =
      reasonRaw && reasonRaw in ShippingReturnReason
        ? (reasonRaw as ShippingReturnReason)
        : ShippingReturnReason.OTHER;

    const result = await requestShippingReturn(actor, {
      tradeOrderId: getFormValue(formData, "tradeOrderId"),
      shippingTaskId: getFormValue(formData, "shippingTaskId"),
      reason,
      reasonDetail: getFormValue(formData, "reasonDetail"),
      expectedRefundAmount:
        getFormValue(formData, "expectedRefundAmount") || undefined,
    });

    invalidateAfterShippingReturnMutation(
      result.tradeOrderId,
      result.customerId,
    );

    return {
      status: "success",
      message: `退货申请已提交, 正在等待主管复审 (申请号 ${result.id.slice(-6)})`,
    };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function reviewShippingReturnAction(
  formData: FormData,
): Promise<ShippingReturnActionResult> {
  try {
    const actor = await getShippingReturnActionActor();
    const decisionRaw = getFormValue(formData, "decision");
    const decision = decisionRaw === "APPROVED" ? "APPROVED" : "REJECTED";

    const result = await reviewShippingReturn(actor, {
      shippingReturnId: getFormValue(formData, "shippingReturnId"),
      decision,
      reviewNote: getFormValue(formData, "reviewNote") || undefined,
      rejectReason: getFormValue(formData, "rejectReason") || undefined,
    });

    invalidateAfterShippingReturnMutation(
      result.tradeOrderId,
      result.customerId,
    );

    return {
      status: "success",
      message:
        decision === "APPROVED"
          ? "退货申请已批准, 请发货人对接物流回填运单"
          : "退货申请已驳回",
    };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function fillShippingReturnTrackingAction(
  formData: FormData,
): Promise<ShippingReturnActionResult> {
  try {
    const actor = await getShippingReturnActionActor();

    const result = await fillShippingReturnTracking(actor, {
      shippingReturnId: getFormValue(formData, "shippingReturnId"),
      returnTrackingNumber: getFormValue(formData, "returnTrackingNumber"),
      returnCarrier: getFormValue(formData, "returnCarrier"),
    });

    invalidateAfterShippingReturnMutation(
      result.tradeOrderId,
      result.customerId,
    );

    return {
      status: "success",
      message: "退货运单已登记, 进入物流追踪 (等供货商接货 + 入库)",
    };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function confirmShippingReturnReceivedAction(
  formData: FormData,
): Promise<ShippingReturnActionResult> {
  try {
    const actor = await getShippingReturnActionActor();

    // 现场签收 (无运单) 必须同时勾选 receivedWithoutTracking 并填写理由,
    // 否则服务端会在 PENDING_RETURN_TRACKING 状态拒绝入库. 防止退货运单丢链路.
    const receivedWithoutTrackingRaw = getFormValue(
      formData,
      "receivedWithoutTracking",
    );
    const receivedWithoutTracking =
      receivedWithoutTrackingRaw === "1" ||
      receivedWithoutTrackingRaw === "true" ||
      receivedWithoutTrackingRaw === "on";

    const result = await confirmShippingReturnReceived(actor, {
      shippingReturnId: getFormValue(formData, "shippingReturnId"),
      receivedPhotoUrl: getFormValue(formData, "receivedPhotoUrl") || undefined,
      receivedRemark: getFormValue(formData, "receivedRemark") || undefined,
      finalRefundAmount:
        getFormValue(formData, "finalRefundAmount") || undefined,
      receivedWithoutTracking,
      receivedWithoutTrackingReason:
        getFormValue(formData, "receivedWithoutTrackingReason") || undefined,
    });

    invalidateAfterShippingReturnMutation(
      result.shippingReturn.tradeOrderId,
      result.shippingReturn.customerId,
      { touchRefund: true },
    );
    if (result.refundRequestId) {
      updateTag(CACHE_TAGS.refund(result.refundRequestId));
    }

    return {
      status: "success",
      message: result.refundRequestId
        ? `退货已入库, 已自动创建退款申请 (单号 ${result.refundRequestId.slice(-6)}), 等待财务审批`
        : "退货已入库, 但自动创建退款申请失败, 请联系财务手动补建",
    };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function cancelShippingReturnAction(
  formData: FormData,
): Promise<ShippingReturnActionResult> {
  try {
    const actor = await getShippingReturnActionActor();

    const result = await cancelShippingReturn(actor, {
      shippingReturnId: getFormValue(formData, "shippingReturnId"),
    });

    invalidateAfterShippingReturnMutation(
      result.tradeOrderId,
      result.customerId,
    );

    return {
      status: "success",
      message: "退货申请已撤回",
    };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
}
