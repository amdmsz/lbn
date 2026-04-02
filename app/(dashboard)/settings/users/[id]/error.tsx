"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function SettingsUserDetailError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="账号详情异常"
      title="账号详情加载失败"
      description="页面在读取账号详情或审计记录时发生错误。请先重试；如果问题持续存在，再检查权限范围、目标账号是否存在以及 Prisma 关系是否已同步。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
