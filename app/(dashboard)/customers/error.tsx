"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function CustomersError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="crm-page">
      <ErrorState
      eyebrow="客户中心异常"
      title="客户中心加载失败"
      description="页面在读取客户数据时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接、权限配置和客户关联数据是否可用。"
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
