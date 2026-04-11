"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function CustomerPublicPoolReportsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="crm-page">
      <ErrorState
        eyebrow="公海池报表异常"
        title="公海池运营报表加载失败"
        description="页面在读取趋势、原因分布或团队表现数据时发生错误。请先重试；如果问题持续存在，再检查当前窗口参数、数据连接和角色权限。"
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
