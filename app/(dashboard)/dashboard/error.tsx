"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function DashboardError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="仪表盘异常"
      title="仪表盘加载失败"
      description="页面在聚合仪表盘指标时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接和统计查询。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
