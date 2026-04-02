"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function SettingsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="主数据异常"
      title="主数据中心加载失败"
      description="页面在读取标签、分类或字典配置时发生错误。请先重试；如果问题持续存在，再检查数据库连接、Prisma 模型和当前角色权限。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
