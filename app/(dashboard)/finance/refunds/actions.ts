"use server";

// 财务工作台 server actions — wrapper 转发到 orders/actions 实现.
// 直接 re-export 在 Next.js server actions 上某些版本不被识别, 显式包一层最稳.

import {
  approveRefundAction as _approveRefundAction,
  rejectRefundAction as _rejectRefundAction,
  recordRefundPayoutAction as _recordRefundPayoutAction,
  withdrawRefundAction as _withdrawRefundAction,
  type RefundActionResult,
} from "../../orders/actions";

export async function approveRefundAction(formData: FormData): Promise<RefundActionResult> {
  return _approveRefundAction(formData);
}

export async function rejectRefundAction(formData: FormData): Promise<RefundActionResult> {
  return _rejectRefundAction(formData);
}

export async function payoutRefundActionAlias(formData: FormData): Promise<RefundActionResult> {
  return _recordRefundPayoutAction(formData);
}

export async function withdrawRefundAction(formData: FormData): Promise<RefundActionResult> {
  return _withdrawRefundAction(formData);
}
