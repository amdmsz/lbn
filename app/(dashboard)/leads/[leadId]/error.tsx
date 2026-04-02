"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function LeadDetailError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="线索详情异常"
      title="线索详情加载失败"
      description="页面在读取线索详情、最近分配记录或操作日志时发生错误。请先重试；如果问题持续存在，再检查数据库连接、日志数据和当前角色权限。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
