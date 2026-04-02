"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ReportsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="报表异常"
      title="报表加载失败"
      description="页面在聚合基础报表时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接和报表聚合逻辑。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
