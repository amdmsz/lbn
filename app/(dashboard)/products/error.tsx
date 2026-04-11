"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ProductsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="crm-page">
      <ErrorState
        eyebrow="商品主数据异常"
        title="商品主入口加载失败"
        description="系统在准备商品主数据工作台时发生错误，请重新加载后再继续处理。"
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
