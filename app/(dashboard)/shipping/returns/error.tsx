"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ShippingReturnsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="退货物流异常"
      title="退货物流跟踪台加载失败"
      description="页面在读取退货工单时发生错误。你可以先重试；如果问题持续存在，再检查 ShippingReturn 状态与订单关联是否完整。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
