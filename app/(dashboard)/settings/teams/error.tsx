"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function SettingsTeamsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="团队管理异常"
      title="团队管理页加载失败"
      description="页面在读取团队结构、团队主管或成员归属时发生错误。请先重试；如果问题持续存在，再检查数据库连接、团队关联和当前角色权限。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
