"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function FinanceError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="财务预览异常"
      title="财务页面加载失败"
      description="页面在聚合 finance 预览数据时发生错误。你可以先重试；如果问题持续存在，再检查 payment、collection、shipping 和 gift 相关数据。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
