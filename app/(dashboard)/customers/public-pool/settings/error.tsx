"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function CustomerPublicPoolSettingsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="crm-page">
      <ErrorState
        eyebrow="公海池规则异常"
        title="公海池团队规则加载失败"
        description="页面在读取团队回收规则、保护期或自动分配配置时发生错误。请先重试；如果问题持续存在，再检查当前团队范围和权限配置。"
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
