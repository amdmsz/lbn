"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

const CHUNK_RELOAD_KEY = "jiuzhuang-crm:customers:chunk-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

function isStaleDeploymentError(error: Error) {
  const message = error.message ?? "";

  return (
    message.includes("Loading chunk") ||
    message.includes("ChunkLoadError") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("Failed to find Server Action") ||
    message.includes("older or newer deployment")
  );
}

export default function CustomersError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const staleDeploymentError = isStaleDeploymentError(error);

  useEffect(() => {
    if (!staleDeploymentError) {
      return;
    }

    const now = Date.now();
    const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");

    if (now - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) {
      return;
    }

    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    window.location.reload();
  }, [staleDeploymentError]);

  return (
    <div className="crm-page">
      <ErrorState
        eyebrow="客户中心异常"
        title="客户中心加载失败"
        description={
          staleDeploymentError
            ? "页面资源刚更新，系统正在自动刷新。若仍停留在这里，请手动重新加载。"
            : "页面在读取客户数据时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接、权限配置和客户关联数据是否可用。"
        }
        detail={error.message}
        action={
          <button
            type="button"
            onClick={() => {
              if (staleDeploymentError) {
                window.location.reload();
                return;
              }

              reset();
            }}
            className="crm-button crm-button-primary"
          >
            重新加载
          </button>
        }
      />
    </div>
  );
}
