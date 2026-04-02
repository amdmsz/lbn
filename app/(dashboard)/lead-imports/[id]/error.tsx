"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function LeadImportDetailError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="导入批次异常"
      title="导入批次详情加载失败"
      description="页面在读取导入报告、失败行或去重日志时发生错误。请先重试；如果仍然失败，再检查 Prisma Client、数据库连接和导入批次数据。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
