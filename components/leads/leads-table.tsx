"use client";

import type { LeadSource, LeadStatus } from "@prisma/client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { batchAssignLeadsAction } from "@/app/(dashboard)/leads/actions";
import {
  initialAssignLeadsActionState,
  type AssignLeadsActionState,
} from "@/components/leads/lead-actions-state";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { TagPill } from "@/components/shared/tag-pill";
import {
  LEADS_PAGE_SIZE,
  LEADS_PAGE_SIZE_OPTIONS,
  MAX_BATCH_ASSIGNMENT_SIZE,
  formatDateTime,
  getLeadSourceLabel,
} from "@/lib/leads/metadata";
import { scheduleSmartScroll } from "@/lib/smart-scroll";

type LeadListItem = {
  id: string;
  name: string | null;
  phone: string;
  source: LeadSource;
  interestedProduct: string | null;
  status: LeadStatus;
  createdAt: Date | string;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  leadTags: Array<{
    id: string;
    tagId: string;
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
};

type SalesOption = {
  id: string;
  label: string;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type LeadListFilters = {
  name: string;
  phone: string;
  status: string;
  tagId: string;
  ownerId: string;
  createdFrom: string;
  createdTo: string;
  page: number;
  pageSize: number;
};

type SelectionMode = "manual" | "filtered";

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function buildPageHref(filters: LeadListFilters, page: number) {
  const params = new URLSearchParams();

  if (filters.name) {
    params.set("name", filters.name);
  }

  if (filters.phone) {
    params.set("phone", filters.phone);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.tagId) {
    params.set("tagId", filters.tagId);
  }

  if (filters.ownerId) {
    params.set("ownerId", filters.ownerId);
  }

  if (filters.createdFrom) {
    params.set("createdFrom", filters.createdFrom);
  }

  if (filters.createdTo) {
    params.set("createdTo", filters.createdTo);
  }

  if (filters.pageSize !== LEADS_PAGE_SIZE) {
    params.set("pageSize", String(filters.pageSize));
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/leads?${query}` : "/leads";
}

function buildRangeLabel(pagination: PaginationData) {
  const start =
    pagination.totalCount === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);
  return `本页显示 ${start}-${end}`;
}

function FilterHiddenInputs({
  filters,
  includePage = false,
}: Readonly<{
  filters: LeadListFilters;
  includePage?: boolean;
}>) {
  return (
    <>
      {filters.name ? <input type="hidden" name="name" value={filters.name} /> : null}
      {filters.phone ? <input type="hidden" name="phone" value={filters.phone} /> : null}
      {filters.status ? (
        <input type="hidden" name="status" value={filters.status} />
      ) : null}
      {filters.tagId ? (
        <input type="hidden" name="tagId" value={filters.tagId} />
      ) : null}
      {filters.ownerId ? (
        <input type="hidden" name="ownerId" value={filters.ownerId} />
      ) : null}
      {filters.createdFrom ? (
        <input type="hidden" name="createdFrom" value={filters.createdFrom} />
      ) : null}
      {filters.createdTo ? (
        <input type="hidden" name="createdTo" value={filters.createdTo} />
      ) : null}
      {includePage ? (
        <input type="hidden" name="page" value={String(filters.page)} />
      ) : null}
    </>
  );
}

export function LeadsTable({
  items,
  filters,
  pagination,
  canAssign,
  salesOptions,
  scrollTargetId,
}: Readonly<{
  items: LeadListItem[];
  filters: LeadListFilters;
  pagination: PaginationData;
  canAssign: boolean;
  salesOptions: SalesOption[];
  scrollTargetId?: string;
}>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("manual");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, setState] = useState<AssignLeadsActionState>(
    initialAssignLeadsActionState,
  );
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allChecked =
    selectionMode === "manual" && items.length > 0 && selectedIds.length === items.length;
  const selectedCount =
    selectionMode === "filtered" ? pagination.totalCount : selectedIds.length;
  const canSelectFiltered =
    canAssign &&
    pagination.totalCount > items.length &&
    pagination.totalCount <= MAX_BATCH_ASSIGNMENT_SIZE;
  const filteredSelectionExceedsLimit =
    canAssign && pagination.totalCount > MAX_BATCH_ASSIGNMENT_SIZE;

  function resetSelection() {
    setSelectedIds([]);
    setSelectionMode("manual");
  }

  function toggleLead(leadId: string) {
    if (selectionMode !== "manual") {
      setSelectionMode("manual");
      setSelectedIds([leadId]);
      return;
    }

    setSelectedIds((currentSelectedIds) => {
      if (currentSelectedIds.includes(leadId)) {
        return currentSelectedIds.filter((id) => id !== leadId);
      }

      return [...currentSelectedIds, leadId];
    });
  }

  function toggleAll() {
    if (selectionMode !== "manual") {
      resetSelection();
      return;
    }

    setSelectedIds((currentSelectedIds) => {
      if (currentSelectedIds.length === items.length) {
        return [];
      }

      return items.map((item) => item.id);
    });
  }

  function handleAssignSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await batchAssignLeadsAction(
        initialAssignLeadsActionState,
        formData,
      );

      setState(nextState);

      if (nextState.status === "success") {
        resetSelection();
        setDialogOpen(false);
        formRef.current?.reset();
      }
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="暂无线索"
        description="当前筛选条件下没有匹配结果。你可以调整搜索、标签或时间条件，或先导入新的线索数据。"
        action={
          <Link href="/leads" scroll={false} className="crm-button crm-button-secondary">
            清空筛选
          </Link>
        }
      />
    );
  }

  const pageSizeControl = (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex items-center gap-2 text-sm text-black/60"
    >
      <FilterHiddenInputs filters={filters} />
      <span>本页显示</span>
      <select
        name="pageSize"
        defaultValue={String(filters.pageSize)}
        className="crm-select min-h-0 w-[88px] px-3 py-2 text-sm"
        onChange={(event) => {
          const nextPageSize = Number(event.currentTarget.value);
          const nextHref = buildPageHref(
            {
              ...filters,
              pageSize: Number.isFinite(nextPageSize) ? nextPageSize : filters.pageSize,
            },
            1,
          );

          router.replace(
            nextHref.startsWith("/leads")
              ? `${pathname}${nextHref.slice("/leads".length)}`
              : nextHref,
            { scroll: false },
          );
          if (scrollTargetId) {
            scheduleSmartScroll(scrollTargetId);
          }
        }}
      >
        {LEADS_PAGE_SIZE_OPTIONS.map((pageSize) => (
          <option key={pageSize} value={pageSize}>
            {pageSize} 条
          </option>
        ))}
      </select>
    </form>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-black/60">
        <span>
          共 {pagination.totalCount} 条线索，当前第 {pagination.page} / {pagination.totalPages} 页
        </span>
        {canAssign ? (
          <button
            type="button"
            disabled={selectedCount === 0 || salesOptions.length === 0}
            onClick={() => setDialogOpen(true)}
            className="crm-button crm-button-primary px-3"
          >
            批量分配
          </button>
        ) : null}
      </div>

      {selectionMode === "filtered" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.95rem] border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 px-3.5 py-3 text-sm text-black/70">
          <span>
            已选择当前筛选结果全部 {pagination.totalCount} 条线索，可直接执行跨页批量分配。
          </span>
          <button
            type="button"
            onClick={resetSelection}
            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
          >
            取消跨页选择
          </button>
        </div>
      ) : null}

      {selectionMode === "manual" &&
      allChecked &&
      canAssign &&
      pagination.totalCount > items.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.95rem] border border-black/10 bg-black/[0.025] px-3.5 py-3 text-sm text-black/65">
          <span>已选择当前页全部 {items.length} 条线索。</span>
          {canSelectFiltered ? (
            <button
              type="button"
              onClick={() => {
                setSelectionMode("filtered");
                setSelectedIds([]);
              }}
              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
            >
              选择当前筛选结果全部 {pagination.totalCount} 条
            </button>
          ) : filteredSelectionExceedsLimit ? (
            <span>
              当前筛选结果共 {pagination.totalCount} 条，超过 {MAX_BATCH_ASSIGNMENT_SIZE} 条上限，请先缩小范围。
            </span>
          ) : null}
        </div>
      ) : null}

      {state.message ? (
        <ActionBanner tone={state.status === "success" ? "success" : "danger"}>
          {state.message}
        </ActionBanner>
      ) : null}

      <div className="crm-table-shell">
        <table className="crm-table">
          <thead>
            <tr>
              {canAssign ? (
                <th className="w-14">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="选择当前页全部线索"
                    className="crm-checkbox h-4 w-4"
                  />
                </th>
              ) : null}
              <th>线索</th>
              <th>来源</th>
                <th>已购产品</th>
              <th>负责人</th>
              <th>状态</th>
              <th>标签</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {canAssign ? (
                  <td>
                    <input
                      type="checkbox"
                      checked={
                        selectionMode === "filtered" || selectedIdSet.has(item.id)
                      }
                      onChange={() => toggleLead(item.id)}
                      aria-label={`选择线索 ${item.name ?? item.phone}`}
                      className="crm-checkbox mt-1 h-4 w-4"
                    />
                  </td>
                ) : null}
                <td>
                    <div className="space-y-0.5">
                    <div className="font-medium text-black/80">
                      {item.name?.trim() || "未填写姓名"}
                    </div>
                    <div className="text-xs text-black/45">{item.phone}</div>
                  </div>
                </td>
                <td>{getLeadSourceLabel(item.source)}</td>
                <td>{item.interestedProduct?.trim() || "-"}</td>
                <td>
                  {item.owner ? (
                    <div>
                      <div>{item.owner.name}</div>
                      <div className="text-xs text-black/45">@{item.owner.username}</div>
                    </div>
                  ) : (
                    "未分配"
                  )}
                </td>
                <td>
                  <LeadStatusBadge status={item.status} />
                </td>
                <td>
                  {item.leadTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.leadTags.map((record) => (
                        <TagPill
                          key={record.id}
                          label={record.tag.name}
                          color={record.tag.color}
                        />
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="whitespace-nowrap text-sm text-black/60">
                  {formatDateTime(normalizeDate(item.createdAt))}
                </td>
                <td>
                  <Link href={`/leads/${item.id}`} scroll={false} className="crm-text-link">
                    查看详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        summary={`${buildRangeLabel(pagination)}，共 ${pagination.totalCount} 条线索`}
        buildHref={(pageNumber) => buildPageHref(filters, pageNumber)}
        leftSlot={pageSizeControl}
        scrollTargetId={scrollTargetId}
      />

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="crm-card w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-black/85">批量分配线索</h3>
                <p className="mt-2 text-sm leading-6 text-black/60">
                  {selectionMode === "filtered"
                    ? `本次将按当前筛选结果批量分配 ${pagination.totalCount} 条线索，并同步客户承接关系。`
                    : `本次将分配已选中的 ${selectedIds.length} 条线索，并同步客户承接关系。`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="crm-button crm-button-ghost min-h-0 px-2 py-2 text-sm"
              >
                关闭
              </button>
            </div>

            <form ref={formRef} onSubmit={handleAssignSubmit} className="mt-5 space-y-3.5">
              <input type="hidden" name="selectionMode" value={selectionMode} />

              {selectionMode === "filtered" ? (
                <>
                  <FilterHiddenInputs filters={filters} includePage />
                  <input
                    type="hidden"
                    name="pageSize"
                    value={String(filters.pageSize)}
                  />
                </>
              ) : (
                selectedIds.map((leadId) => (
                  <input key={leadId} type="hidden" name="leadIds" value={leadId} />
                ))
              )}

              <label className="block space-y-2">
                <span className="crm-label">目标销售</span>
                <select name="toUserId" defaultValue="" className="crm-select" required>
                  <option value="" disabled>
                    请选择销售
                  </option>
                  {salesOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="crm-label">分配备注</span>
                <textarea
                  name="note"
                  rows={4}
                  maxLength={500}
                  className="crm-textarea"
                  placeholder="可选，用于记录分配原因或补充说明"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="crm-button crm-button-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending || selectedCount === 0}
                  className="crm-button crm-button-primary"
                >
                  {pending ? "分配中..." : "确认分配"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
