"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * 全站顶部 navigation 进度条.
 *
 * 用户反馈点击 Link / 翻页 / 改 filter 后 1~3s 内没有视觉反馈, 这条 2px 高的
 * 渐变条挂在 dashboard layout 顶端, 仅在 navigation pending 时显示.
 *
 * 实现原理:
 * - `usePathname` + `useSearchParams` 任一变化, 即视为 navigation 完成.
 * - 监听文档级的 `<a>` / `<Link>` click 与 history.pushState/replaceState 调用,
 *   作为 navigation start 信号 (覆盖 router.push / router.replace / Link click).
 * - 进度条采用 0% → 80% 渐进缓动 (用 setInterval 模拟 trickle), 完成时跑到 100%
 *   后淡出. 200-300ms ease-out 过渡, 与现有视觉风格一致.
 *
 * 写法约束 (React 19 + Next 16 新 lint):
 * - render 中不能访问 / 修改 refs.
 * - effect 中不能直接 setState (除了 setInterval/Timeout 等异步 callback 内部).
 * - 因此用 stage state + render-phase 比对来推进状态机, 不直接调度 setState.
 */

const TRICKLE_INTERVAL_MS = 220;
const COMPLETE_HOLD_MS = 220;

type ProgressStage = "idle" | "running" | "completing";

export function GlobalNavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams?.toString() ?? "";
  const navKey = `${pathname ?? ""}?${searchKey}`;

  const [stage, setStage] = useState<ProgressStage>("idle");
  const [progress, setProgress] = useState(0);
  const [lastKey, setLastKey] = useState<string>(navKey);

  const pending = stage !== "idle";

  // URL 变化 → navigation 完成 (render-phase setState, lint 允许).
  if (navKey !== lastKey) {
    setLastKey(navKey);
    if (stage === "running") {
      setStage("completing");
      setProgress(100);
    }
  }

  const startProgress = useCallback(() => {
    // 已在 pending: 不重置 — 避免连续 click 进度抖回原点.
    setStage((current) => {
      if (current === "idle") {
        return "running";
      }
      return current;
    });
    setProgress((current) => (current === 0 ? 8 : current));
  }, []);

  // trickle: stage === "running" 时挂 interval, 不在 effect body 同步 setState.
  useEffect(() => {
    if (stage !== "running") return undefined;
    const timer = setInterval(() => {
      setProgress((current) => {
        if (current >= 80) return current;
        const remaining = 80 - current;
        const increment = Math.max(1.5, remaining * 0.18);
        return Math.min(80, current + increment);
      });
    }, TRICKLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [stage]);

  // completing: 等 hold 后 reset. 不在 effect body 同步 setState (timeout 内是 ok 的).
  useEffect(() => {
    if (stage !== "completing") return undefined;
    const timer = setTimeout(() => {
      setStage("idle");
      setProgress(0);
    }, COMPLETE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  // 拦截 anchor click + patch history methods 作为 navigation start 信号.
  useEffect(() => {
    function fire() {
      startProgress();
    }

    function isModifiedClick(event: MouseEvent) {
      return (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        event.defaultPrevented
      );
    }

    function handleAnchorClick(event: MouseEvent) {
      if (isModifiedClick(event)) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }
      fire();
    }

    document.addEventListener("click", handleAnchorClick, true);

    // Patch history 以捕获 router.push / replace (Next App Router 走 history API).
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const boundPush = originalPushState.bind(window.history);
    const boundReplace = originalReplaceState.bind(window.history);
    const wrappedPush: typeof window.history.pushState = (...args) => {
      fire();
      return boundPush(...args);
    };
    const wrappedReplace: typeof window.history.replaceState = (...args) => {
      fire();
      return boundReplace(...args);
    };
    window.history.pushState = wrappedPush;
    window.history.replaceState = wrappedReplace;

    function handlePopState() {
      fire();
    }
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleAnchorClick, true);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [startProgress]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-[2px] overflow-hidden"
      style={{
        opacity: pending ? 1 : 0,
        transition: "opacity 240ms ease-out",
      }}
    >
      <div
        className="h-full bg-[var(--color-primary)]"
        style={{
          width: `${progress}%`,
          transition: pending
            ? "width 220ms ease-out"
            : "width 0ms",
          boxShadow: "0 0 6px hsl(var(--primary) / 0.55)",
        }}
      />
    </div>
  );
}
