"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function LeadImportsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="导入中心异常"
      title="线索导入中心加载失败"
      description="页面在读取导入批次、模板或权限配置时发生错误。请先重试；如果问题持续存在，再检查 Prisma Client、数据库连接和当前角色权限。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
