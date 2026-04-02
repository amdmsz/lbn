"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ProductDetailError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="商品详情异常"
      title="商品详情加载失败"
      description="页面在读取商品与 SKU 详情时发生错误。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
