"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function CustomerDetailError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="客户详情异常"
      title="客户详情加载失败"
      description="页面在读取客户详情、跟进记录或关联履约数据时发生错误。请先重试；如果问题持续存在，再检查数据库连接、关联数据和当前角色权限。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
