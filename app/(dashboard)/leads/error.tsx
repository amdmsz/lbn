"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

const CHUNK_RELOAD_FLAG = "leads-chunk-reload-once";

function isChunkLoadError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("failed to load chunk") || normalized.includes("loading chunk");
}

export default function LeadsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const chunkLoadFailed = isChunkLoadError(error.message);

  useEffect(() => {
    if (!chunkLoadFailed) {
      sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
      return;
    }

    const hasReloaded = sessionStorage.getItem(CHUNK_RELOAD_FLAG) === "1";

    if (hasReloaded) {
      return;
    }

    sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
    window.location.reload();
  }, [chunkLoadFailed]);

  return (
    <ErrorState
      eyebrow="线索中心异常"
      title="线索中心加载失败"
      description={
        chunkLoadFailed
          ? "页面资源刚刚发生更新，浏览器拿到的是旧的资源分片。系统会先尝试自动刷新一次；如果仍然失败，请手动强制刷新页面。"
          : "页面在读取线索数据时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接、权限配置和 Prisma 数据是否可用。"
      }
      detail={error.message}
      action={
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="crm-button crm-button-primary">
            重新加载
          </button>
          {chunkLoadFailed ? (
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
                window.location.reload();
              }}
              className="crm-button crm-button-secondary"
            >
              强制刷新页面
            </button>
          ) : null}
        </div>
      }
    />
  );
}
