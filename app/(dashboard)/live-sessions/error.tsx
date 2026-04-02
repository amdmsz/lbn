"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function LiveSessionsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="直播场次异常"
      title="直播场次加载失败"
      description="页面在读取直播场次或邀约概览时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接、权限配置和相关业务数据是否可用。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
