"use client";

import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ErrorState } from "@/components/shared/error-state";
import { PageContextLink } from "@/components/shared/page-context-link";
import { PageHeader } from "@/components/shared/page-header";

export default function ProductDetailError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <WorkbenchLayout
      header={
        <div className="mb-4">
          <PageHeader
            context={
              <PageContextLink href="/products" label="返回商品中心" trail={["商品中心"]} />
            }
            eyebrow="商品主数据异常"
            title="商品详情加载失败"
            description="系统在准备商品摘要与 SKU 工作区时发生错误，请重新加载后再继续处理。"
          />
        </div>
      }
    >
      <ErrorState
        title="无法完成当前商品档案加载"
        description="商品详情页没有成功读取主数据或 SKU 摘要，请稍后重试。"
        detail={error.message}
        action={
          <button type="button" onClick={reset} className="crm-button crm-button-primary">
            重新加载
          </button>
        }
      />
    </WorkbenchLayout>
  );
}
