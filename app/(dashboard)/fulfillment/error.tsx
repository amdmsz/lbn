"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function FulfillmentError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="crm-page">
      <ErrorState
        eyebrow="订单中心异常"
        title="订单中心加载失败"
        description="页面在读取交易单、发货执行或批次记录时发生错误。请先重试；如果问题持续存在，再检查权限、数据连接和当前角色可见范围。"
        detail={error.message}
        action={
          <button type="button" onClick={reset} className="crm-button crm-button-primary">
            重新加载
          </button>
        }
      />
    </div>
  );
}
