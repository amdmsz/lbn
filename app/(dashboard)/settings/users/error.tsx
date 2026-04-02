"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function SettingsUsersError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="账号管理异常"
      title="账号管理页加载失败"
      description="页面在读取账号、团队或权限范围时发生错误。请先重试；如果问题持续存在，再检查数据库连接、Prisma 模型和当前账号权限。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
