"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FiltersPanel } from "@/components/shared/filters-panel";
import type { LeadListFilters, LeadSalesOption } from "@/lib/leads/queries";
import { LEADS_PAGE_SIZE, leadStatusOptions } from "@/lib/leads/metadata";
import { scheduleSmartScroll } from "@/lib/smart-scroll";
import { cn } from "@/lib/utils";

function buildLeadListHref(
  pathname: string,
  filters: LeadListFilters,
  overrides: Partial<LeadListFilters> = {},
) {
  const nextFilters = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (nextFilters.name) {
    params.set("name", nextFilters.name);
  }

  if (nextFilters.phone) {
    params.set("phone", nextFilters.phone);
  }

  if (nextFilters.status) {
    params.set("status", nextFilters.status);
  }

  if (nextFilters.tagId) {
    params.set("tagId", nextFilters.tagId);
  }

  if (nextFilters.view !== "unassigned") {
    params.set("view", nextFilters.view);
  }

  if (nextFilters.quick) {
    params.set("quick", nextFilters.quick);
  }

  if (nextFilters.importBatchId) {
    params.set("importBatchId", nextFilters.importBatchId);
  }

  if (nextFilters.assignedOwnerId) {
    params.set("assignedOwnerId", nextFilters.assignedOwnerId);
  }

  if (nextFilters.createdFrom) {
    params.set("createdFrom", nextFilters.createdFrom);
  }

  if (nextFilters.createdTo) {
    params.set("createdTo", nextFilters.createdTo);
  }

  if (nextFilters.pageSize !== LEADS_PAGE_SIZE) {
    params.set("pageSize", String(nextFilters.pageSize));
  }

  if (nextFilters.page > 1) {
    params.set("page", String(nextFilters.page));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildQuickFilterHref(
  pathname: string,
  filters: LeadListFilters,
  quick: "import_batch" | "today" | "all_unassigned",
) {
  return buildLeadListHref(pathname, filters, {
    name: "",
    phone: "",
    status: "",
    tagId: "",
    assignedOwnerId: "",
    createdFrom: "",
    createdTo: "",
    page: 1,
    view: "unassigned",
    quick,
    importBatchId: quick === "import_batch" ? filters.importBatchId : "",
  });
}

function getScopeLabel(filters: LeadListFilters) {
  if (filters.view === "assigned") {
    return "已分配回看";
  }

  if (filters.quick === "import_batch" && filters.importBatchId) {
    return "本次导入";
  }

  if (filters.quick === "today") {
    return "今日导入";
  }

  return "全部未分配";
}

const inlineFieldClassName =
  "group flex h-10 min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-background px-3 shadow-sm transition-all duration-150 hover:border-primary/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20";

function ScopeLink({
  label,
  href,
  active,
  disabled = false,
  scrollTargetId,
}: Readonly<{
  label: string;
  href: string;
  active: boolean;
  disabled?: boolean;
  scrollTargetId?: string;
}>) {
  if (disabled) {
    return (
      <span className="inline-flex h-8 items-center rounded-full border border-dashed border-[var(--color-border-soft)] px-3 text-[12px] text-[var(--color-sidebar-muted)] opacity-60">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      onClick={() => {
        if (scrollTargetId) {
          scheduleSmartScroll(scrollTargetId);
        }
      }}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-[border-color,background-color,color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px]",
        active
          ? "border-primary/30 bg-primary/10 text-primary shadow-sm"
          : "border-transparent bg-transparent text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

function InlineSelectControl({
  label,
  name,
  defaultValue,
  children,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}>) {
  return (
    <label className={inlineFieldClassName}>
      <span className="shrink-0 text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 pr-5 text-[13px] text-foreground outline-none focus:ring-0"
      >
        {children}
      </select>
    </label>
  );
}

function InlineDateControl({
  label,
  name,
  defaultValue,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: string;
}>) {
  return (
    <label className={inlineFieldClassName}>
      <span className="shrink-0 text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[13px] text-foreground outline-none focus:ring-0"
      />
    </label>
  );
}

export function LeadsFilters({
  filters,
  ownerOptions,
  showOwnerFilter,
  tagOptions,
  scrollTargetId,
}: Readonly<{
  filters: LeadListFilters;
  ownerOptions: LeadSalesOption[];
  showOwnerFilter: boolean;
  tagOptions: Array<{
    id: string;
    label: string;
  }>;
  scrollTargetId?: string;
}>) {
  const pathname = usePathname() || "/leads";
  const router = useRouter();
  const activeQuick =
    filters.view === "assigned"
      ? "assigned"
      : filters.quick === "import_batch" && filters.importBatchId
        ? "import_batch"
        : filters.quick === "today"
          ? "today"
          : "all_unassigned";

  const activeFilterCount = [
    Boolean(filters.name),
    Boolean(filters.phone),
    Boolean(filters.status),
    Boolean(filters.tagId),
    Boolean(filters.assignedOwnerId),
    Boolean(filters.createdFrom),
    Boolean(filters.createdTo),
  ].filter(Boolean).length;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextFilters: LeadListFilters = {
      ...filters,
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      status: String(
        formData.get("status") ?? "",
      ).trim() as LeadListFilters["status"],
      tagId: String(formData.get("tagId") ?? "").trim(),
      view: String(
        formData.get("view") ?? "unassigned",
      ).trim() as LeadListFilters["view"],
      quick: String(
        formData.get("quick") ?? "",
      ).trim() as LeadListFilters["quick"],
      importBatchId: String(formData.get("importBatchId") ?? "").trim(),
      assignedOwnerId: String(formData.get("assignedOwnerId") ?? "").trim(),
      createdFrom: String(formData.get("createdFrom") ?? "").trim(),
      createdTo: String(formData.get("createdTo") ?? "").trim(),
      pageSize:
        Number(formData.get("pageSize") ?? LEADS_PAGE_SIZE) || LEADS_PAGE_SIZE,
      page: 1,
    };

    if (scrollTargetId) {
      scheduleSmartScroll(scrollTargetId);
    }

    router.replace(buildLeadListHref(pathname, nextFilters), { scroll: false });
  }

  const resetHref = buildLeadListHref(pathname, {
    ...filters,
    name: "",
    phone: "",
    status: "",
    tagId: "",
    view: "unassigned",
    quick: "all_unassigned",
    importBatchId: "",
    assignedOwnerId: "",
    createdFrom: "",
    createdTo: "",
    page: 1,
  });

  const gridClassName = showOwnerFilter
    ? "xl:grid-cols-[minmax(300px,1.45fr)_minmax(250px,1.15fr)_repeat(5,minmax(0,0.88fr))]"
    : "xl:grid-cols-[minmax(300px,1.55fr)_minmax(250px,1.2fr)_repeat(4,minmax(0,0.94fr))]";

  return (
    <FiltersPanel
      title="线索筛选"
      headerMode="hidden"
      className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="view" value={filters.view} />
        <input type="hidden" name="quick" value={filters.quick} />
        <input
          type="hidden"
          name="importBatchId"
          value={filters.importBatchId}
        />
        <input type="hidden" name="pageSize" value={String(filters.pageSize)} />

        <div className={cn("grid gap-2 md:grid-cols-2", gridClassName)}>
          <label
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-xl border border-border/60 bg-background px-2.5 shadow-sm transition-all duration-150 hover:border-primary/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
              "xl:col-span-1",
            )}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="name"
                defaultValue={filters.name}
                placeholder="搜索姓名"
                className="h-9 w-full border-0 bg-transparent pl-8 pr-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-0"
              />
            </div>
            <div className="h-4 w-px bg-border/60" />
            <input
              name="phone"
              defaultValue={filters.phone}
              placeholder="手机号"
              className="h-9 min-w-[7rem] border-0 bg-transparent px-0 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-0"
            />
          </label>

          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border/60 bg-background px-2.5 py-1.5 shadow-sm">
            <span className="shrink-0 text-[12px] font-medium text-muted-foreground">
              范围
            </span>
            <ScopeLink
              label="本次导入"
              href={buildQuickFilterHref(pathname, filters, "import_batch")}
              active={activeQuick === "import_batch"}
              disabled={!filters.importBatchId}
              scrollTargetId={scrollTargetId}
            />
            <ScopeLink
              label="今日导入"
              href={buildQuickFilterHref(pathname, filters, "today")}
              active={activeQuick === "today"}
              scrollTargetId={scrollTargetId}
            />
            <ScopeLink
              label="全部未分配"
              href={buildQuickFilterHref(pathname, filters, "all_unassigned")}
              active={activeQuick === "all_unassigned"}
              scrollTargetId={scrollTargetId}
            />
            <ScopeLink
              label="已分配回看"
              href={buildLeadListHref(pathname, filters, {
                view: "assigned",
                page: 1,
              })}
              active={activeQuick === "assigned"}
              scrollTargetId={scrollTargetId}
            />
          </div>

          <InlineSelectControl
            label="状态"
            name="status"
            defaultValue={filters.status}
          >
            <option value="">全部状态</option>
            {leadStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </InlineSelectControl>

          <InlineSelectControl
            label="标签"
            name="tagId"
            defaultValue={filters.tagId}
          >
            <option value="">全部标签</option>
            {tagOptions.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
              </option>
            ))}
          </InlineSelectControl>

          {showOwnerFilter ? (
            <InlineSelectControl
              label="负责人"
              name="assignedOwnerId"
              defaultValue={filters.assignedOwnerId}
            >
              <option value="">全部负责人</option>
              {ownerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </InlineSelectControl>
          ) : (
            <input
              type="hidden"
              name="assignedOwnerId"
              value={filters.assignedOwnerId}
            />
          )}

          <InlineDateControl
            label="开始"
            name="createdFrom"
            defaultValue={filters.createdFrom}
          />
          <InlineDateControl
            label="结束"
            name="createdTo"
            defaultValue={filters.createdTo}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted-foreground">
            当前范围 {getScopeLabel(filters)}
            {activeFilterCount > 0
              ? ` · 已启用 ${activeFilterCount} 项条件`
              : ""}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={resetHref}
              scroll={false}
              onClick={() => {
                if (scrollTargetId) {
                  scheduleSmartScroll(scrollTargetId);
                }
              }}
              className="inline-flex h-9 items-center rounded-full border border-border/60 bg-background px-4 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-primary"
            >
              重置
            </Link>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90"
            >
              应用
            </button>
          </div>
        </div>
      </form>
    </FiltersPanel>
  );
}
