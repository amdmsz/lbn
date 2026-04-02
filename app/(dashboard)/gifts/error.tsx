"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function GiftsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="礼品中心异常"
      title="礼品中心加载失败"
      description="页面在读取礼品记录时发生错误。你可以先重试；如果问题持续存在，再检查礼品、直播场次和客户关联数据。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
