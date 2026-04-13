"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

function QuickFilterLink({
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
      <span className="inline-flex min-h-9 items-center rounded-full border border-dashed border-black/10 px-3 text-sm text-black/32">
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
        "inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-[var(--color-accent)]/18 bg-[var(--color-accent)]/8 text-[var(--color-accent)]"
          : "border-transparent bg-black/[0.035] text-black/62 hover:border-black/8 hover:bg-white hover:text-black/84",
      )}
    >
      {label}
    </Link>
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
  const pathname = usePathname();
  const router = useRouter();
  const activeQuick =
    filters.view === "assigned"
      ? "assigned"
      : filters.quick === "import_batch" && filters.importBatchId
        ? "import_batch"
        : filters.quick === "today"
          ? "today"
          : "all_unassigned";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextFilters: LeadListFilters = {
      ...filters,
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      status: String(formData.get("status") ?? "").trim() as LeadListFilters["status"],
      tagId: String(formData.get("tagId") ?? "").trim(),
      view: String(formData.get("view") ?? "unassigned").trim() as LeadListFilters["view"],
      quick: String(formData.get("quick") ?? "").trim() as LeadListFilters["quick"],
      importBatchId: String(formData.get("importBatchId") ?? "").trim(),
      assignedOwnerId: String(formData.get("assignedOwnerId") ?? "").trim(),
      createdFrom: String(formData.get("createdFrom") ?? "").trim(),
      createdTo: String(formData.get("createdTo") ?? "").trim(),
      pageSize: Number(formData.get("pageSize") ?? LEADS_PAGE_SIZE) || LEADS_PAGE_SIZE,
      page: 1,
    };

    if (scrollTargetId) {
      scheduleSmartScroll(scrollTargetId);
    }

    router.replace(buildLeadListHref(pathname, nextFilters), { scroll: false });
  }

  return (
    <div className="space-y-3 rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.82)] px-4 py-3.5 shadow-[0_10px_20px_rgba(18,24,31,0.035)] md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">
            Leads Workspace
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <QuickFilterLink
              label="本次导入"
              href={buildQuickFilterHref(pathname, filters, "import_batch")}
              active={activeQuick === "import_batch"}
              disabled={!filters.importBatchId}
              scrollTargetId={scrollTargetId}
            />
            <QuickFilterLink
              label="今日导入"
              href={buildQuickFilterHref(pathname, filters, "today")}
              active={activeQuick === "today"}
              scrollTargetId={scrollTargetId}
            />
            <QuickFilterLink
              label="全部未分配"
              href={buildQuickFilterHref(pathname, filters, "all_unassigned")}
              active={activeQuick === "all_unassigned"}
              scrollTargetId={scrollTargetId}
            />
            <QuickFilterLink
              label="已分配回看"
              href={buildLeadListHref(pathname, filters, {
                view: "assigned",
                page: 1,
              })}
              active={activeQuick === "assigned"}
              scrollTargetId={scrollTargetId}
            />
          </div>
        </div>

        <Link
          href={buildLeadListHref(pathname, {
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
          })}
          scroll={false}
          onClick={() => {
            if (scrollTargetId) {
              scheduleSmartScroll(scrollTargetId);
            }
          }}
          className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
        >
          清空条件
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="hidden" name="view" value={filters.view} />
        <input type="hidden" name="quick" value={filters.quick} />
        <input type="hidden" name="importBatchId" value={filters.importBatchId} />
        <input type="hidden" name="pageSize" value={String(filters.pageSize)} />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_repeat(2,minmax(0,0.9fr))]">
          <label className="space-y-1">
            <span className="crm-label">姓名</span>
            <input
              name="name"
              defaultValue={filters.name}
              placeholder="搜索姓名"
              className="crm-input"
            />
          </label>

          <label className="space-y-1">
            <span className="crm-label">手机号</span>
            <input
              name="phone"
              defaultValue={filters.phone}
              placeholder="搜索手机号"
              className="crm-input"
            />
          </label>

          <label className="space-y-1">
            <span className="crm-label">状态</span>
            <select name="status" defaultValue={filters.status} className="crm-select">
              <option value="">全部状态</option>
              {leadStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="crm-label">标签</span>
            <select name="tagId" defaultValue={filters.tagId} className="crm-select">
              <option value="">全部标签</option>
              {tagOptions.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 xl:grid-cols-[repeat(3,minmax(0,0.9fr))_auto]">
          {showOwnerFilter ? (
            <label className="space-y-1">
              <span className="crm-label">已分配负责人</span>
              <select
                name="assignedOwnerId"
                defaultValue={filters.assignedOwnerId}
                className="crm-select"
              >
                <option value="">全部负责人</option>
                {ownerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="assignedOwnerId" value={filters.assignedOwnerId} />
          )}

          <label className="space-y-1">
            <span className="crm-label">创建开始</span>
            <input
              type="date"
              name="createdFrom"
              defaultValue={filters.createdFrom}
              className="crm-input"
            />
          </label>

          <label className="space-y-1">
            <span className="crm-label">创建结束</span>
            <input
              type="date"
              name="createdTo"
              defaultValue={filters.createdTo}
              className="crm-input"
            />
          </label>

          <div className="flex items-end justify-end">
            <button type="submit" className="crm-button crm-button-primary w-full xl:w-auto">
              应用筛选
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
