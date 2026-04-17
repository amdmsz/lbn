"use client";

import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";

export default function RecycleBinError({
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
            eyebrow="回收站治理异常"
            title="回收站加载失败"
            description="系统在准备回收站条目、恢复状态与最终处理校验时发生错误，请重新加载后再试。"
          />
        </div>
      }
    >
      <ErrorState
        title="当前无法完成回收站治理页加载"
        description="回收站条目或 guard 汇总没有成功读出，请稍后重试。"
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
