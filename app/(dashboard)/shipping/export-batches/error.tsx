"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ShippingExportBatchesError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="报单批次异常"
      title="报单批次列表加载失败"
      description="页面在读取发货导出批次时发生错误。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
