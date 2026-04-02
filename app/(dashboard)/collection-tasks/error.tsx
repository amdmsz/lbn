"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function CollectionTasksError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      eyebrow="催收任务异常"
      title="催收任务中心加载失败"
      description="系统在读取催收任务工作台时发生错误。"
      detail={error.message}
      action={
        <button type="button" onClick={reset} className="crm-button crm-button-primary">
          重新加载
        </button>
      }
    />
  );
}
