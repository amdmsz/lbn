import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
 */
export type CustomersTablePaginationButtonsProps = {
  prevHref: string | null;
  nextHref: string | null;
  /** 可选的左侧说明, 比如 "本页 50 条". */
  summary?: ReactNode;
  scrollTargetId?: string;
};

export function CustomersTablePaginationButtons({
  prevHref,
  nextHref,
  summary,
  scrollTargetId,
}: Readonly<CustomersTablePaginationButtonsProps>) {
  const prevDisabled = !prevHref;
  const nextDisabled = !nextHref;

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
          aria-disabled={prevDisabled}
          aria-label="上一页"
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            prevDisabled &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          上一页
        </SmartLink>

        <SmartLink
          href={nextHref ?? "#"}
          scrollTargetId={scrollTargetId}
          aria-disabled={nextDisabled}
          aria-label="下一页"
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            nextDisabled &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          下一页
          <ChevronRight className="size-4" aria-hidden />
        </SmartLink>
      </div>
    </div>
  );
}
