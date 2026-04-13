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
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { TagPill } from "@/components/shared/tag-pill";
import {
  LEADS_PAGE_SIZE,
  LEADS_PAGE_SIZE_OPTIONS,
  MAX_BATCH_ASSIGNMENT_SIZE,
  formatDateTime,
  getLeadSourceLabel,
} from "@/lib/leads/metadata";
import type { LeadListFilters, LeadSalesOption } from "@/lib/leads/queries";
import { scheduleSmartScroll } from "@/lib/smart-scroll";
import { cn } from "@/lib/utils";

type LeadListItem = {
  id: string;
  name: string | null;
  phone: string;
  source: LeadSource;
  interestedProduct: string | null;
  status: LeadStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
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
  assignments?: Array<{
    id: string;
    createdAt: Date | string;
    assignedBy: {
      name: string | null;
      username: string;
    } | null;
  }>;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type WorkspaceData = {
  items: LeadListItem[];
  totalCount: number;
  pagination?: PaginationData;
};

type SelectionMode = "manual" | "filtered";

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function buildLeadHref(filters: LeadListFilters, overrides: Partial<LeadListFilters> = {}) {
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
  overrides,
}: Readonly<{
  filters: LeadListFilters;
  includePage?: boolean;
  overrides?: Partial<LeadListFilters>;
}>) {
  const nextFilters = {
    ...filters,
    ...overrides,
  };

  return (
    <>
      {nextFilters.name ? <input type="hidden" name="name" value={nextFilters.name} /> : null}
      {nextFilters.phone ? (
        <input type="hidden" name="phone" value={nextFilters.phone} />
      ) : null}
      {nextFilters.status ? (
        <input type="hidden" name="status" value={nextFilters.status} />
      ) : null}
      {nextFilters.tagId ? (
        <input type="hidden" name="tagId" value={nextFilters.tagId} />
      ) : null}
      <input type="hidden" name="view" value={nextFilters.view} />
      {nextFilters.quick ? (
        <input type="hidden" name="quick" value={nextFilters.quick} />
      ) : null}
      {nextFilters.importBatchId ? (
        <input
          type="hidden"
          name="importBatchId"
          value={nextFilters.importBatchId}
        />
      ) : null}
      {nextFilters.assignedOwnerId ? (
        <input
          type="hidden"
          name="assignedOwnerId"
          value={nextFilters.assignedOwnerId}
        />
      ) : null}
      {nextFilters.createdFrom ? (
        <input
          type="hidden"
          name="createdFrom"
          value={nextFilters.createdFrom}
        />
      ) : null}
      {nextFilters.createdTo ? (
        <input type="hidden" name="createdTo" value={nextFilters.createdTo} />
      ) : null}
      <input type="hidden" name="pageSize" value={String(nextFilters.pageSize)} />
      {includePage ? (
        <input type="hidden" name="page" value={String(nextFilters.page)} />
      ) : null}
    </>
  );
}

function AssignedLeadRow({
  item,
  canAssign,
  onReassign,
}: Readonly<{
  item: LeadListItem;
  canAssign: boolean;
  onReassign: (leadId: string) => void;
}>) {
  const latestAssignment = item.assignments?.[0];
  const assignedAt = latestAssignment?.createdAt ?? item.updatedAt;

  return (
    <div className="rounded-[0.95rem] border border-black/7 bg-white/80 px-3.5 py-3 shadow-[0_6px_16px_rgba(18,24,31,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-black/86">
              {item.name?.trim() || "未填写姓名"}
            </p>
            <LeadStatusBadge status={item.status} />
          </div>
          <p className="text-sm font-medium tabular-nums text-black/74">{item.phone}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/leads/${item.id}`}
            scroll={false}
            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
          >
            查看详情
          </Link>
          {canAssign ? (
            <button
              type="button"
              onClick={() => onReassign(item.id)}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              改分配
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-[12.5px] text-black/56">
        <div className="flex items-center justify-between gap-3">
          <span>负责人</span>
          <span className="font-medium text-black/72">
            {item.owner ? `${item.owner.name} (@${item.owner.username})` : "未分配"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>最近意向</span>
          <span className="truncate text-right font-medium text-black/72">
            {item.interestedProduct?.trim() || "暂无"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>最近分配</span>
          <span className="font-medium text-black/72">
            {formatDateTime(normalizeDate(assignedAt))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>来源</span>
          <span className="font-medium text-black/72">{getLeadSourceLabel(item.source)}</span>
        </div>
      </div>

      {item.leadTags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.leadTags.map((record) => (
            <TagPill
              key={record.id}
              label={record.tag.name}
              color={record.tag.color}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LeadsTable({
  unassigned,
  assigned,
  filters,
  canAssign,
  salesOptions,
  scrollTargetId,
}: Readonly<{
  unassigned: WorkspaceData;
  assigned: WorkspaceData;
  filters: LeadListFilters;
  canAssign: boolean;
  salesOptions: LeadSalesOption[];
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
    selectionMode === "manual" &&
    unassigned.items.length > 0 &&
    selectedIds.length === unassigned.items.length;
  const selectedCount =
    selectionMode === "filtered" ? unassigned.totalCount : selectedIds.length;
  const canSelectFiltered =
    canAssign &&
    unassigned.totalCount > unassigned.items.length &&
    unassigned.totalCount <= MAX_BATCH_ASSIGNMENT_SIZE;
  const filteredSelectionExceedsLimit =
    canAssign && unassigned.totalCount > MAX_BATCH_ASSIGNMENT_SIZE;
  const activeMobileView = filters.view;

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
      if (currentSelectedIds.length === unassigned.items.length) {
        return [];
      }

      return unassigned.items.map((item) => item.id);
    });
  }

  function openReassignDialog(leadId: string) {
    setSelectionMode("manual");
    setSelectedIds([leadId]);
    setDialogOpen(true);
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
        router.refresh();
      }
    });
  }

  const pageSizeControl = (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex items-center gap-2 text-sm text-black/60"
    >
      <span>每页显示</span>
      <select
        name="pageSize"
        defaultValue={String(filters.pageSize)}
        className="crm-select min-h-0 w-[88px] px-3 py-2 text-sm"
        onChange={(event) => {
          const nextPageSize = Number(event.currentTarget.value);
          const nextHref = buildLeadHref(filters, {
            pageSize: Number.isFinite(nextPageSize) ? nextPageSize : filters.pageSize,
            page: 1,
          });

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

  const mobileTabs = (
    <RecordTabs
      activeValue={activeMobileView}
      scrollTargetId={scrollTargetId}
      items={[
        {
          value: "unassigned",
          label: "未分配",
          count: unassigned.totalCount,
          href: buildLeadHref(filters, {
            view: "unassigned",
            page: 1,
          }),
        },
        {
          value: "assigned",
          label: "已分配",
          count: assigned.totalCount,
          href: buildLeadHref(filters, {
            view: "assigned",
            page: 1,
          }),
        },
      ]}
      className="xl:hidden"
    />
  );

  const unassignedWorkspace = (
    <SectionCard
      title="未分配"
      eyebrow="主工作区"
      density="compact"
      anchorId={scrollTargetId}
      className={cn(
        "border-[var(--color-accent)]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,249,255,0.9))]",
        filters.view === "unassigned"
          ? "shadow-[0_14px_30px_rgba(77,143,230,0.08)]"
          : "shadow-[0_10px_22px_rgba(18,24,31,0.04)]",
      )}
      description="这里处理本次导入、今日导入或全部未分配线索的批量分配。"
      actions={
        <div className="flex flex-wrap items-center gap-2 text-sm text-black/55">
          <span>共 {unassigned.totalCount} 条</span>
          {canAssign ? (
            <button
              type="button"
              disabled={selectedCount === 0 || salesOptions.length === 0}
              onClick={() => setDialogOpen(true)}
              className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
            >
              批量分配
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {selectionMode === "filtered" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.95rem] border border-[var(--color-accent)]/16 bg-[var(--color-accent)]/5 px-3.5 py-3 text-sm text-black/72">
            <span>
              已选择当前筛选结果全部 {unassigned.totalCount} 条未分配线索，可直接执行跨页批量分配。
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
        unassigned.totalCount > unassigned.items.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.95rem] border border-black/8 bg-black/[0.025] px-3.5 py-3 text-sm text-black/68">
            <span>已选择当前页全部 {unassigned.items.length} 条未分配线索。</span>
            {canSelectFiltered ? (
              <button
                type="button"
                onClick={() => {
                  setSelectionMode("filtered");
                  setSelectedIds([]);
                }}
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                选择当前筛选结果全部 {unassigned.totalCount} 条
              </button>
            ) : filteredSelectionExceedsLimit ? (
              <span>
                当前筛选结果共 {unassigned.totalCount} 条，超过 {MAX_BATCH_ASSIGNMENT_SIZE} 条上限，请先缩小范围。
              </span>
            ) : null}
          </div>
        ) : null}

        {unassigned.items.length === 0 ? (
          <EmptyState
            density="compact"
            title="当前没有待分配线索"
            description="当前筛选上下文下已经没有未分配线索，可切到已分配回看区查看结果，或清空条件重新查看。"
            action={
              <Link
                href={buildLeadHref(filters, {
                  view: "assigned",
                  page: 1,
                })}
                scroll={false}
                className="crm-button crm-button-secondary"
              >
                查看已分配回看
              </Link>
            }
          />
        ) : (
          <>
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
                          aria-label="选择当前页全部未分配线索"
                          className="crm-checkbox h-4 w-4"
                        />
                      </th>
                    ) : null}
                    <th>线索</th>
                    <th>来源</th>
                    <th>最近意向</th>
                    <th>状态</th>
                    <th>标签</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.items.map((item) => (
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
                          <div className="font-medium text-black/82">
                            {item.name?.trim() || "未填写姓名"}
                          </div>
                          <div className="text-xs tabular-nums text-black/48">{item.phone}</div>
                        </div>
                      </td>
                      <td>{getLeadSourceLabel(item.source)}</td>
                      <td>{item.interestedProduct?.trim() || "暂无最近意向"}</td>
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
                      <td className="whitespace-nowrap text-sm text-black/58">
                        {formatDateTime(normalizeDate(item.createdAt))}
                      </td>
                      <td>
                        <Link
                          href={`/leads/${item.id}`}
                          scroll={false}
                          className="crm-text-link"
                        >
                          查看详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {unassigned.pagination ? (
              <PaginationControls
                page={unassigned.pagination.page}
                totalPages={unassigned.pagination.totalPages}
                summary={`${buildRangeLabel(unassigned.pagination)}，共 ${unassigned.pagination.totalCount} 条未分配线索`}
                buildHref={(pageNumber) => buildLeadHref(filters, { page: pageNumber })}
                leftSlot={pageSizeControl}
                scrollTargetId={scrollTargetId}
              />
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );

  const assignedWorkspace = (
    <SectionCard
      title="已分配"
      eyebrow="结果回看区"
      density="compact"
      description="用于回看刚完成的分配结果，按负责人快速检查和做轻量修正。"
      className={cn(
        "bg-[rgba(255,255,255,0.78)]",
        filters.view === "assigned"
          ? "border-[var(--color-accent)]/10 shadow-[0_12px_26px_rgba(77,143,230,0.07)]"
          : "shadow-[0_10px_22px_rgba(18,24,31,0.04)]",
      )}
      actions={<span className="text-sm text-black/55">共 {assigned.totalCount} 条</span>}
    >
      {assigned.items.length === 0 ? (
        <EmptyState
          density="compact"
          title="还没有已分配结果"
          description="完成一次分配后，这里会立即回看本次结果。若当前带了批次或负责人上下文，也会沿用它们。"
        />
      ) : (
        <div className="space-y-3">
          {assigned.items.map((item) => (
            <AssignedLeadRow
              key={item.id}
              item={item}
              canAssign={canAssign}
              onReassign={openReassignDialog}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );

  return (
    <div className="space-y-4">
      {state.message ? (
        <ActionBanner tone={state.status === "success" ? "success" : "danger"}>
          {state.message}
        </ActionBanner>
      ) : null}

      {mobileTabs}

      <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)] xl:items-start xl:gap-4 xl:space-y-0">
        <div className={cn(activeMobileView === "assigned" ? "hidden xl:block" : "block")}>
          {unassignedWorkspace}
        </div>
        <div className={cn(activeMobileView === "unassigned" ? "hidden xl:block" : "block")}>
          {assignedWorkspace}
        </div>
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="crm-card w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-black/85">批量分配线索</h3>
                <p className="mt-2 text-sm leading-6 text-black/60">
                  {selectionMode === "filtered"
                    ? `本次将按当前未分配筛选结果批量分配 ${unassigned.totalCount} 条线索，并同步客户承接关系。`
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
                  <FilterHiddenInputs
                    filters={filters}
                    includePage
                    overrides={{
                      view: "unassigned",
                      assignedOwnerId: "",
                    }}
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
