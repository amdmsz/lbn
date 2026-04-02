"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function SuppliersError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="供货商中心异常"
      title="供货商中心加载失败"
      description="页面在读取供货商主数据时发生错误。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
