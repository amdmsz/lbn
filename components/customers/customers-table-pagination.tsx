"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { SmartLink } from "@/components/shared/smart-link";
import { cn } from "@/lib/utils";

/**
 * F08 phase 1.5: 客户列表 cursor 分页按钮.
 *
 * 与 legacy `PaginationControls` (基于 page 号 + totalPages) 并存; 这里只
 * 处理 cursor 路径下「上一页 href / 下一页 href」两个轻量入口, 不知道总
 * 页数 — cursor 分页本就不该实时计算 totalCount. 调用方决定 prevHref:
 *   - 第一页:   传 null, 上一页禁用
 *   - 后续页:   外部维护 cursor stack, 把上一个栈顶 cursor 编码进 href.
 *
 * `nextHref` 由 server-side `listCustomersCursor` 返回的 `nextCursor`
 * (经 `buildCursorHref`) 生成; null 时下一页禁用.
 *
 * UX: 点击后立即把当前按钮换 spinner + disable, 避免用户等 1-3s 不知道
 * 系统已经收到点击 (服务器闲, 主要是 round-trip + render). URL 变化后
 * 自动归零.
 */
export type CustomersTablePaginationButtonsProps = {
  prevHref: string | null;
  nextHref: string | null;
  /** 可选的左侧说明, 比如 "本页 50 条". */
  summary?: ReactNode;
  scrollTargetId?: string;
};

type PendingDirection = "prev" | "next" | null;

export function CustomersTablePaginationButtons({
  prevHref,
  nextHref,
  summary,
  scrollTargetId,
}: Readonly<CustomersTablePaginationButtonsProps>) {
  const prevDisabled = !prevHref;
  const nextDisabled = !nextHref;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navKey = `${pathname ?? ""}?${searchParams?.toString() ?? ""}`;
  const [pending, setPending] = useState<PendingDirection>(null);
  const [pendingNavKey, setPendingNavKey] = useState<string | null>(null);

  // URL 变化即视为 navigation 完成 — 用 render-phase 比对 + setState 避免
  // cascading effect (与 customer-filter-toolbar 同款写法).
  if (pending !== null && pendingNavKey !== null && pendingNavKey !== navKey) {
    setPending(null);
    setPendingNavKey(null);
  }

  return (
    <div className="crm-subtle-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {summary ? (
        <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
          {summary}
        </p>
      ) : (
        <span />
      )}

      <div className="crm-toolbar-cluster justify-start lg:justify-end">
        <SmartLink
          href={prevHref ?? "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={prevDisabled || pending !== null}
          aria-label="上一页"
          onClick={(event) => {
            if (prevDisabled || pending !== null) {
              event.preventDefault();
              return;
            }
            setPending("prev");
            setPendingNavKey(navKey);
          }}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm transition-opacity duration-200 ease-out",
            (prevDisabled || pending !== null) &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
            pending === "prev" && "opacity-90",
          )}
        >
          {pending === "prev" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronLeft className="size-4" aria-hidden />
          )}
          上一页
        </SmartLink>

        <SmartLink
          href={nextHref ?? "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={nextDisabled || pending !== null}
          aria-label="下一页"
          onClick={(event) => {
            if (nextDisabled || pending !== null) {
              event.preventDefault();
              return;
            }
            setPending("next");
            setPendingNavKey(navKey);
          }}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm transition-opacity duration-200 ease-out",
            (nextDisabled || pending !== null) &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
            pending === "next" && "opacity-90",
          )}
        >
          下一页
          {pending === "next" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </SmartLink>
      </div>
    </div>
  );
}
