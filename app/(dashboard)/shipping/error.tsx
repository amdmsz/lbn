"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ShippingError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="发货任务异常"
      title="发货任务加载失败"
      description="页面在读取发货任务时发生错误。你可以先重试；如果问题持续存在，再检查发货任务、订单和礼品关联数据。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
