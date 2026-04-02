"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function LeadImportTemplatesError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="导入模板异常"
      title="导入模板加载失败"
      description="页面在读取或展示导入模板时发生错误。请先重试；如果仍然失败，再检查数据库连接、Prisma Client 和模板数据。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
