"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function CustomerPublicPoolError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="crm-page">
      <ErrorState
        eyebrow="公海池异常"
        title="公海池工作台加载失败"
        description="页面在读取公海池客户、回收候选或流转记录时发生错误。请先重试；如果问题持续存在，再检查权限、数据连接和当前团队范围。"
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
