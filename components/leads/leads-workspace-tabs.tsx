import Link from "next/link";
import { cn } from "@/lib/utils";

export type LeadsWorkspaceTabValue =
  | "allocation"
  | "imports"
  | "templates";

type Tab = {
  value: LeadsWorkspaceTabValue;
  label: string;
  basePath: string;
  description: string;
};

const tabs: ReadonlyArray<Tab> = [
  {
    value: "allocation",
    label: "分配中心",
    basePath: "/leads",
    description: "未分配/已分配回看",
  },
  {
    value: "imports",
    label: "导入批次",
    basePath: "/lead-imports",
    description: "批次质量与回看",
  },
  {
    value: "templates",
    label: "模板管理",
    basePath: "/lead-import-templates",
    description: "字段映射与版本",
  },
];

// 这些 query keys 在三个 tab 之间是共享语义 (例如 customer_continuation
// 模式), 切 tab 时保留以维持上下文; 其他 query (如 page, search, 分配相关
// filters) 通常是 tab-specific, 切走时应该清掉.
const SHARED_QUERY_KEYS: ReadonlyArray<string> = ["mode"];

function buildTabHref(tab: Tab, sharedQuery: ReadonlyArray<[string, string]>) {
  if (sharedQuery.length === 0) {
    return tab.basePath;
  }
  const params = new URLSearchParams();
  for (const [key, value] of sharedQuery) {
    params.set(key, value);
  }
  const queryString = params.toString();
  return queryString ? `${tab.basePath}?${queryString}` : tab.basePath;
}

export function LeadsWorkspaceTabs({
  activeValue,
  sharedQuery = [],
}: Readonly<{
  activeValue: LeadsWorkspaceTabValue;
  /**
   * 切 tab 时要保留的 query 对. 调用方从 searchParams 取出 SHARED_QUERY_KEYS
   * 里的项后传进来.
   */
  sharedQuery?: ReadonlyArray<[string, string]>;
}>) {
  return (
    <nav
      aria-label="线索工作族"
      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-shell-surface-soft)] p-1"
    >
      {tabs.map((tab) => {
        const active = tab.value === activeValue;
        const href = buildTabHref(tab, sharedQuery);
        return (
          <Link
            key={tab.value}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium transition-colors duration-150",
              active
                ? "border border-[var(--tone-info-soft-border)] bg-[var(--tone-info-soft-bg)] text-[var(--color-accent-strong)]"
                : "border border-transparent text-[var(--color-sidebar-muted)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
            )}
            title={tab.description}
          >
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 从 server-component searchParams 中提取共享 query 对, 用于传给
 * LeadsWorkspaceTabs.sharedQuery. 调用方:
 *   const sharedQuery = pickSharedLeadsTabQuery(resolvedSearchParams);
 *   <LeadsWorkspaceTabs activeValue="imports" sharedQuery={sharedQuery} />
 */
export function pickSharedLeadsTabQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): Array<[string, string]> {
  if (!searchParams) return [];
  const pairs: Array<[string, string]> = [];
  for (const key of SHARED_QUERY_KEYS) {
    const value = searchParams[key];
    const resolved = Array.isArray(value) ? value[0] : value;
    if (typeof resolved === "string" && resolved.length > 0) {
      pairs.push([key, resolved]);
    }
  }
  return pairs;
}
