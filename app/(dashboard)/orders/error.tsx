"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function OrdersError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="订单中心异常"
      title="订单中心加载失败"
      description="页面在读取订单数据时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接和订单关联数据。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
