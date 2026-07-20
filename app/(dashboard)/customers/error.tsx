"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { shouldHardReloadCustomerPageError } from "@/lib/customers/error-recovery";

const HARD_RELOAD_KEY = "jiuzhuang-crm:customers:hard-reload-at";
const HARD_RELOAD_COOLDOWN_MS = 30_000;

export default function CustomersError({
  error,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const hardReloadCandidate = shouldHardReloadCustomerPageError(error);

  useEffect(() => {
    if (!hardReloadCandidate) {
      return;
    }

    const now = Date.now();
    const lastReloadAt = Number(
      window.sessionStorage.getItem(HARD_RELOAD_KEY) ?? "0",
    );

    if (now - lastReloadAt < HARD_RELOAD_COOLDOWN_MS) {
      return;
    }

    window.sessionStorage.setItem(HARD_RELOAD_KEY, String(now));
    window.location.reload();
  }, [hardReloadCandidate]);

  return (
    <div className="crm-page">
      <ErrorState
        eyebrow="客户中心异常"
        title="客户中心加载失败"
        description={
          hardReloadCandidate
            ? "页面资源可能刚更新，系统正在自动完整刷新。若仍停留在这里，请手动重新加载。"
            : "页面在读取客户数据时发生错误。你可以先重试；如果问题持续存在，再检查数据库连接、权限配置和客户关联数据是否可用。"
        }
        detail={error.message}
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="crm-button crm-button-primary"
          >
            重新加载
          </button>
        }
      />
    </div>
  );
}
