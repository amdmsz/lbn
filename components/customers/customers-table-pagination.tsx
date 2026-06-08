"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SmartLink } from "@/components/shared/smart-link";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import {
  customerPageSizeOptions,
  type CustomerPageSize,
} from "@/lib/customers/metadata";
import type { CustomerCenterFilters } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

/**
 * F18 customers/perf phase 3: 客户列表分页 UI.
 *
 * 默认 page 模式 (页码 + 每页选择, 销售业务习惯).  cursor 模式作为
 * fallback (只有 URL 显式带 `?cursor=` 触发).
 *
 * 公共行为:
 *   - 点击 nav 按钮后立刻进入 pending (按钮 spinner + disable), 避免连
 *     点 / 用户怀疑没反应.
 *   - pending 双重归零兜底: URL 变化即清, 同时 setTimeout 800ms 强制清.
 *     兜底是为了规避 "URL 已变但 React tree 还没收到 searchParams 新值"
 *     这种边角情况 (例如 router prefetch / cache 命中过快).
 *   - pageSize 选择: localStorage 持久化首选 (key=`customer-center-page-size`).
 *     URL 上没有 ?pageSize= 时, useEffect 拉本地存储, push 到 URL.
 *
 * 设计上保留对 cursor 模式 UI 的支持 — 老链接 / debug / 大数据场景
 * 仍可能需要走 keyset 翻页.
 */

const PAGE_SIZE_STORAGE_KEY = "customer-center-page-size";
const PENDING_FALLBACK_MS = 800;

type PageModeProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  filters: CustomerCenterFilters;
  scrollTargetId?: string;
};

type CursorModeProps = {
  prevHref: string | null;
  nextHref: string | null;
  summary?: ReactNode;
  scrollTargetId?: string;
};

type CustomersTablePaginationProps =
  | ({ mode: "page" } & PageModeProps)
  | ({ mode: "cursor" } & CursorModeProps);

export function CustomersTablePagination(
  props: Readonly<CustomersTablePaginationProps>,
) {
  if (props.mode === "cursor") {
    return <CursorPagination {...props} />;
  }
  return <PagePagination {...props} />;
}

/* -------------------------- page mode (默认) ----------------------------- */

function PagePagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  filters,
  scrollTargetId,
}: Readonly<PageModeProps>) {
  const router = useRouter();
  const pathname = usePathname() || "/customers";
  const searchParams = useSearchParams();
  const currentNavKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const { pending, setPending } = useNavPending(currentNavKey);

  // pageSize localStorage 持久化: 首次挂载时, 如果 URL 没显式带 ?pageSize=
  // 但本地存的偏好和当前 pageSize 不一致 — 切到偏好 + reset page=1.
  // 不写 effect 跟 URL state 抢, 只在挂载时做一次, 避免 URL pageSize=20 被
  // localStorage=50 顶掉的反预期.
  const hasHydratedPageSize = useRef(false);
  useEffect(() => {
    if (hasHydratedPageSize.current) return;
    hasHydratedPageSize.current = true;
    const explicit = searchParams?.get("pageSize");
    if (explicit) return;
    try {
      const stored = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
      if (!stored) return;
      const parsed = Number(stored);
      if (!Number.isFinite(parsed)) return;
      if (!customerPageSizeOptions.includes(parsed as CustomerPageSize)) return;
      if (parsed === pageSize) return;
      const href = buildCustomersHref(
        filters,
        { pageSize: parsed as CustomerPageSize, page: 1 },
        pathname,
      );
      router.replace(href, { scroll: false });
    } catch {
      /* localStorage 不可用时 (隐私模式 / SSR), 静默忽略. */
    }
  }, [filters, pageSize, pathname, router, searchParams]);

  function persistPageSizeChoice(next: CustomerPageSize) {
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  const buildHref = (nextPage: number) =>
    buildCustomersHref(filters, { page: nextPage }, pathname);

  const onNavStart = () => setPending(true);

  function handlePageSizeChange(event: ChangeEvent<HTMLSelectElement>) {
    const raw = Number(event.target.value);
    if (!customerPageSizeOptions.includes(raw as CustomerPageSize)) return;
    if (raw === pageSize) return;
    const next = raw as CustomerPageSize;
    persistPageSizeChoice(next);
    setPending(true);
    router.push(
      buildCustomersHref(filters, { pageSize: next, page: 1 }, pathname),
      { scroll: false },
    );
  }

  const pageNumbers = buildPageNumberSlots(page, totalPages);
  const prevDisabled = page <= 1 || pending;
  const nextDisabled = page >= totalPages || pending;
  const summaryText =
    totalCount === 0
      ? "暂无匹配客户"
      : `共 ${totalCount} 位 · 第 ${page} 页 / 共 ${totalPages} 页`;

  return (
    <div className="crm-subtle-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
          {summaryText}
        </p>
        <label className="flex items-center gap-2 text-xs text-[var(--color-sidebar-muted)]">
          <span>每页</span>
          <select
            aria-label="每页显示客户数量"
            value={String(pageSize)}
            onChange={handlePageSizeChange}
            disabled={pending}
            className={cn(
              "crm-button crm-button-secondary min-h-0 appearance-none px-2 py-1 pr-6 text-xs font-medium",
              pending && "opacity-70",
            )}
          >
            {customerPageSizeOptions.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
          <span>条</span>
        </label>
      </div>

      <div className="crm-toolbar-cluster justify-start lg:justify-end">
        <SmartLink
          href={page > 1 ? buildHref(1) : "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={prevDisabled}
          aria-label="第一页"
          onClick={(event) => {
            if (prevDisabled) {
              event.preventDefault();
              return;
            }
            onNavStart();
          }}
          className={cn(
            "crm-button crm-button-secondary hidden min-h-0 px-2 py-2 text-sm sm:inline-flex",
            prevDisabled &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          <ChevronsLeft className="size-4" aria-hidden />
        </SmartLink>

        <SmartLink
          href={page > 1 ? buildHref(page - 1) : "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={prevDisabled}
          aria-label="上一页"
          onClick={(event) => {
            if (prevDisabled) {
              event.preventDefault();
              return;
            }
            onNavStart();
          }}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            prevDisabled &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronLeft className="size-4" aria-hidden />
          )}
          上一页
        </SmartLink>

        {pageNumbers.map((slot, index) => {
          if (slot === "ellipsis") {
            return (
              <span
                key={`ellipsis-${index}`}
                className="px-1 text-sm text-[var(--color-sidebar-muted)]"
                aria-hidden
              >
                …
              </span>
            );
          }
          const isCurrent = slot === page;
          return (
            <SmartLink
              key={slot}
              href={buildHref(slot)}
              scrollTargetId={scrollTargetId}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={`第 ${slot} 页`}
              onClick={(event) => {
                if (isCurrent || pending) {
                  event.preventDefault();
                  return;
                }
                onNavStart();
              }}
              className={cn(
                "crm-button min-h-0 px-3 py-2 text-sm tabular-nums",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground shadow-sm hover:border-primary hover:bg-primary/90 hover:text-primary-foreground"
                  : "crm-button-secondary",
                pending && !isCurrent && "opacity-70",
              )}
            >
              {slot}
            </SmartLink>
          );
        })}

        <SmartLink
          href={page < totalPages ? buildHref(page + 1) : "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={nextDisabled}
          aria-label="下一页"
          onClick={(event) => {
            if (nextDisabled) {
              event.preventDefault();
              return;
            }
            onNavStart();
          }}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            nextDisabled &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          下一页
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </SmartLink>

        <SmartLink
          href={page < totalPages ? buildHref(totalPages) : "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={nextDisabled}
          aria-label="末页"
          onClick={(event) => {
            if (nextDisabled) {
              event.preventDefault();
              return;
            }
            onNavStart();
          }}
          className={cn(
            "crm-button crm-button-secondary hidden min-h-0 px-2 py-2 text-sm sm:inline-flex",
            nextDisabled &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          <ChevronsRight className="size-4" aria-hidden />
        </SmartLink>
      </div>
    </div>
  );
}

/**
 * 页码 slot 计算: 当前页附近 ±2, 首尾固定, 间断处插 ellipsis.
 *
 * 例:
 *   totalPages=20, page=10  -> [1, ellipsis, 8, 9, 10, 11, 12, ellipsis, 20]
 *   totalPages=5,  page=3   -> [1, 2, 3, 4, 5]
 *   totalPages=20, page=1   -> [1, 2, 3, 4, 5, ellipsis, 20]
 *   totalPages=20, page=20  -> [1, ellipsis, 16, 17, 18, 19, 20]
 */
function buildPageNumberSlots(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(safeTotal, Math.max(1, current));
  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, index) => index + 1);
  }
  const slots: Array<number | "ellipsis"> = [];
  const windowStart = Math.max(2, safeCurrent - 2);
  const windowEnd = Math.min(safeTotal - 1, safeCurrent + 2);

  slots.push(1);
  if (windowStart > 2) {
    slots.push("ellipsis");
  }
  for (let i = windowStart; i <= windowEnd; i += 1) {
    slots.push(i);
  }
  if (windowEnd < safeTotal - 1) {
    slots.push("ellipsis");
  }
  slots.push(safeTotal);
  return slots;
}

/* ------------------------ cursor mode (fallback) ------------------------- */

function CursorPagination({
  prevHref,
  nextHref,
  summary,
  scrollTargetId,
}: Readonly<CursorModeProps>) {
  const prevDisabled = !prevHref;
  const nextDisabled = !nextHref;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navKey = `${pathname ?? ""}?${searchParams?.toString() ?? ""}`;
  const { pending, setPending } = useNavPending(navKey);

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
          aria-disabled={prevDisabled || pending}
          aria-label="上一页"
          onClick={(event) => {
            if (prevDisabled || pending) {
              event.preventDefault();
              return;
            }
            setPending(true);
          }}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            (prevDisabled || pending) &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronLeft className="size-4" aria-hidden />
          )}
          上一页
        </SmartLink>

        <SmartLink
          href={nextHref ?? "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={nextDisabled || pending}
          aria-label="下一页"
          onClick={(event) => {
            if (nextDisabled || pending) {
              event.preventDefault();
              return;
            }
            setPending(true);
          }}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            (nextDisabled || pending) &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          下一页
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </SmartLink>
      </div>
    </div>
  );
}

/* ----------------------------- shared hooks ------------------------------ */

/**
 * nav pending 双重归零: URL 变即清, 同时 setTimeout 兜底 (PENDING_FALLBACK_MS).
 *
 * 原方案只靠 navKey 比对, 但在某些 router 时序里 (例如同 URL 但带 hash, 或
 * router prefetch hit cache) URL 变化的回调可能被 React 跳过 -> spinner 永
 * 久转圈. 加 800ms 兜底是经验值, 真实 SSR 大约 300-500ms 就回来了, 800ms
 * 之后即便 UI 没更新也不再阻塞用户.
 */
function useNavPending(navKey: string) {
  const [pending, setPending] = useState(false);
  const [pendingNavKey, setPendingNavKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (pending && pendingNavKey !== null && pendingNavKey !== navKey) {
    setPending(false);
    setPendingNavKey(null);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function setPendingWithFallback(next: boolean) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (next) {
      setPending(true);
      setPendingNavKey(navKey);
      timerRef.current = setTimeout(() => {
        setPending(false);
        setPendingNavKey(null);
        timerRef.current = null;
      }, PENDING_FALLBACK_MS);
    } else {
      setPending(false);
      setPendingNavKey(null);
    }
  }

  return { pending, setPending: setPendingWithFallback };
}

