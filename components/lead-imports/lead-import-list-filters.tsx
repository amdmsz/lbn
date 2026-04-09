"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { scheduleSmartScroll } from "@/lib/smart-scroll";

type StatusOption = {
  value: string;
  label: string;
};

type LeadImportListFilters = {
  mode: string;
  keyword: string;
  status: string;
  page: number;
};

export function LeadImportListFiltersForm({
  filters,
  statusOptions,
  scrollTargetId,
}: Readonly<{
  filters: LeadImportListFilters;
  statusOptions: readonly StatusOption[];
  scrollTargetId?: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const resetHref =
    filters.mode === "customer_continuation"
      ? "/lead-imports?mode=customer_continuation"
      : "/lead-imports";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      const normalizedValue = String(value).trim();

      if (!normalizedValue) {
        continue;
      }

      params.set(key, normalizedValue);
    }

    if (!params.has("mode") && filters.mode) {
      params.set("mode", filters.mode);
    }

    const query = params.toString();
    if (scrollTargetId) {
      scheduleSmartScroll(scrollTargetId);
    }
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <form onSubmit={handleSubmit} className="crm-filter-panel">
      <input type="hidden" name="mode" value={filters.mode} />
      <div className="crm-filter-grid md:grid-cols-[minmax(0,1fr)_210px_auto]">
        <label className="space-y-1">
          <span className="crm-label">关键词</span>
          <input
            type="text"
            name="keyword"
            defaultValue={filters.keyword}
            className="crm-input"
            placeholder="搜索文件名或创建人"
          />
        </label>

        <label className="space-y-1">
          <span className="crm-label">状态</span>
          <select name="status" defaultValue={filters.status} className="crm-select">
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="crm-filter-actions">
          <button type="submit" className="crm-button crm-button-primary">
            筛选
          </button>
          <Link href={resetHref} scroll={false} className="crm-button crm-button-secondary">
            清空
          </Link>
        </div>
      </div>
    </form>
  );
}
