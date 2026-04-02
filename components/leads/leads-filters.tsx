"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { scheduleSmartScroll } from "@/lib/smart-scroll";
import {
  UNASSIGNED_OWNER_VALUE,
  leadStatusOptions,
} from "@/lib/leads/metadata";
import type { LeadListFilters, LeadOwnerOption } from "@/lib/leads/queries";

export function LeadsFilters({
  filters,
  ownerOptions,
  showOwnerFilter,
  tagOptions,
  scrollTargetId,
}: Readonly<{
  filters: LeadListFilters;
  ownerOptions: LeadOwnerOption[];
  showOwnerFilter: boolean;
  tagOptions: Array<{
    id: string;
    label: string;
  }>;
  scrollTargetId?: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();

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

    const query = params.toString();

    if (scrollTargetId) {
      scheduleSmartScroll(scrollTargetId);
    }

    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="crm-filter-grid md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
    >
      <input type="hidden" name="pageSize" value={String(filters.pageSize)} />

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

      {showOwnerFilter ? (
        <label className="space-y-1">
          <span className="crm-label">负责人</span>
          <select name="ownerId" defaultValue={filters.ownerId} className="crm-select">
            <option value="">全部负责人</option>
            <option value={UNASSIGNED_OWNER_VALUE}>未分配</option>
            {ownerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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

      <div className="crm-filter-actions md:col-span-2 xl:col-span-4 2xl:col-span-5">
        <button type="submit" className="crm-button crm-button-primary">
          应用筛选
        </button>
        <Link href="/leads" scroll={false} className="crm-button crm-button-secondary">
          重置
        </Link>
      </div>
    </form>
  );
}
