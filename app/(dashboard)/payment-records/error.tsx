"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function PaymentRecordsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="收款记录异常"
      title="收款记录中心加载失败"
      description="系统在读取收款记录工作台时发生错误。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
