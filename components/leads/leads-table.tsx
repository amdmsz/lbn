"use client";

import type { LeadSource, LeadStatus } from "@prisma/client";
import { Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  batchAssignLeadsAction,
  batchMoveLeadsToRecycleBinAction,
  moveLeadToRecycleBinAction,
} from "@/app/(dashboard)/leads/actions";
import { LeadRecycleDialog } from "@/components/leads/lead-recycle-dialog";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { BatchActionNoticeBanner as LeadBatchActionNoticeBanner } from "@/components/shared/batch-action-notice-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { SectionCard } from "@/components/shared/section-card";
import { TagPill } from "@/components/shared/tag-pill";
import {
  LEADS_PAGE_SIZE,
  LEADS_PAGE_SIZE_OPTIONS,
  MAX_BATCH_ASSIGNMENT_SIZE,
  formatDateTime,
  getLeadSourceLabel,
} from "@/lib/leads/metadata";
import {
  createInitialLeadBatchActionNoticeState,
  type LeadBatchActionNoticeState,
} from "@/lib/leads/batch-action-contract";
import { buildLeadUnassignedExportHref } from "@/lib/leads/export";
import {
  LEAD_RECYCLE_REASON_OPTIONS,
  type LeadRecycleGuard,
  type LeadRecycleReasonCode,
} from "@/lib/leads/recycle-guards";
import type {
  LeadAssignedOwnerSummary,
  LeadListFilters,
  LeadSalesOption,
} from "@/lib/leads/queries";
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
  recycleGuard: LeadRecycleGuard;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type UnassignedWorkspaceData = {
  items: LeadListItem[];
  totalCount: number;
  pagination?: PaginationData;
};

type AssignedWorkspaceData = {
  items: LeadListItem[];
  totalCount: number;
  byOwner: LeadAssignedOwnerSummary[];
};

type SelectionMode = "manual" | "filtered";

type SingleRecycleNoticeState = {
  status: "idle" | "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
};

type RecycleDialogState = {
  id: string;
  name: string | null;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  updatedAt: Date | string;
  recycleGuard: LeadRecycleGuard;
} | null;

const initialSingleRecycleNoticeState: SingleRecycleNoticeState = {
  status: "idle",
  message: "",
};

const initialAssignBatchNoticeState =
  createInitialLeadBatchActionNoticeState("无需重复分配");
const initialRecycleBatchNoticeState =
  createInitialLeadBatchActionNoticeState("已在回收站");

const leadPrimaryButtonClassName =
  "inline-flex min-h-0 items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const leadSecondaryButtonClassName =
  "inline-flex min-h-0 items-center justify-center rounded-lg border border-border/60 bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

const leadActionLinkClassName =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-primary";

const leadTableShellClassName =
  "overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-sm";

const leadTableClassName =
  "min-w-full border-separate border-spacing-0 text-sm [&_thead]:bg-transparent [&_th]:border-b [&_th]:border-border/40 [&_th]:bg-transparent [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border/40 [&_td]:px-4 [&_td]:py-5 [&_td]:align-top [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/30";

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function buildLeadHref(
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
  return query ? `/leads?${query}` : "/leads";
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
      {nextFilters.name ? (
        <input type="hidden" name="name" value={nextFilters.name} />
      ) : null}
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
      <input
        type="hidden"
        name="pageSize"
        value={String(nextFilters.pageSize)}
      />
      {includePage ? (
        <input type="hidden" name="page" value={String(nextFilters.page)} />
      ) : null}
    </>
  );
}

function SnapshotCard({
  label,
  value,
  note,
  children,
  footer,
  tone = "default",
}: Readonly<{
  label: string;
  value?: ReactNode;
  note?: string;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "info" | "success" | "danger";
}>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-5 shadow-sm",
        tone === "info" && "border-primary/20",
        tone === "success" && "border-emerald-500/20",
        tone === "danger" && "border-destructive/20",
      )}
    >
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      {typeof value !== "undefined" ? (
        <div className="mt-2 text-2xl font-semibold text-foreground">
          {value}
        </div>
      ) : null}
      {note ? (
        <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
          {note}
        </p>
      ) : null}
      {children ? <div className="mt-2.5 space-y-1.5">{children}</div> : null}
      {footer ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">{footer}</div>
      ) : null}
    </div>
  );
}

function SelectionStateBanner({
  title,
  description,
  action,
  tone = "default",
}: Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "info" | "danger";
}>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm",
        tone === "info" && "border-primary/20 bg-primary/5",
        tone === "danger" && "border-destructive/20 bg-destructive/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-foreground">
            {title}
          </p>
          <p className="text-[12px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function LeadWorkbenchDialog({
  title,
  description,
  onClose,
  children,
  footer,
}: Readonly<{
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm dark:bg-black/50">
      <div className="w-full max-w-[36rem] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/50 bg-background/60 px-5 py-4">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              批量操作
            </p>
            <div>
              <h3 className="text-[1.08rem] font-semibold text-foreground">
                {title}
              </h3>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-0 items-center rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">{children}</div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/50 bg-background/60 px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

function AssignmentSummaryStrip({
  unassignedCount,
  assignedCount,
  assignedByOwner,
  feedbackState,
  assignedViewHref,
  importBatchId,
}: Readonly<{
  unassignedCount: number;
  assignedCount: number;
  assignedByOwner: LeadAssignedOwnerSummary[];
  feedbackState: LeadBatchActionNoticeState;
  assignedViewHref: string;
  importBatchId: string;
}>) {
  const countLabelPrefix = importBatchId ? "本批" : "当前";
  const ownerPreview = assignedByOwner.slice(0, 3);
  const ownerOverflowCount = Math.max(
    assignedByOwner.length - ownerPreview.length,
    0,
  );
  const hasFeedback = feedbackState.status !== "idle" && feedbackState.message;
  const feedbackSummary =
    feedbackState.summary.totalCount > 0
      ? `成功 ${feedbackState.summary.successCount} · 跳过 ${feedbackState.summary.skippedCount} · 阻断 ${feedbackState.summary.blockedCount}`
      : "完成一次分配后会在这里保留最近结果。";

  return (
    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
      <SnapshotCard
        label={`${countLabelPrefix}未分配`}
        value={unassignedCount}
        note="当前待处理主工作区"
      />
      <SnapshotCard
        label={`${countLabelPrefix}已分配`}
        value={assignedCount}
        note="结果回看与轻量修正入口"
        tone="info"
      />
      <SnapshotCard
        label="分配到各员工"
        note={
          ownerOverflowCount > 0
            ? `其余 ${ownerOverflowCount} 位员工已折叠`
            : assignedByOwner.length === 0
              ? "当前还没有已分配结果"
              : undefined
        }
      >
        {ownerPreview.length > 0 ? (
          ownerPreview.map((item) => (
            <div
              key={item.ownerId}
              className="flex items-center justify-between gap-3 text-[12.5px] text-[var(--color-sidebar-muted)]"
            >
              <span className="truncate">
                {item.ownerName}
                <span className="ml-1 text-[11px]">@{item.ownerUsername}</span>
              </span>
              <span className="shrink-0 font-semibold text-[var(--foreground)]">
                +{item.count}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            分配后会在这里显示员工分布。
          </p>
        )}
      </SnapshotCard>
      <SnapshotCard
        label="最近结果"
        note={
          hasFeedback ? feedbackState.message : "这里保留最近一次批量分配反馈。"
        }
        tone={
          hasFeedback
            ? feedbackState.status === "success"
              ? "success"
              : "danger"
            : "default"
        }
        footer={
          <Link
            href={assignedViewHref}
            scroll={false}
              className={leadSecondaryButtonClassName}
          >
            查看已分配结果
          </Link>
        }
      >
        <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
          {feedbackSummary}
        </p>
      </SnapshotCard>
    </div>
  );
}

function renderLeadTagPreview(item: LeadListItem) {
  if (item.leadTags.length === 0) {
    return (
      <span className="text-[12px] text-[var(--color-sidebar-muted)]">-</span>
    );
  }

  const visibleTags = item.leadTags.slice(0, 2);
  const hiddenCount = item.leadTags.length - visibleTags.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibleTags.map((record) => (
        <TagPill
          key={record.id}
          label={record.tag.name}
          color={record.tag.color}
          className="shadow-none"
        />
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-flex items-center rounded-full border border-[var(--crm-badge-neutral-border)] bg-[var(--crm-badge-neutral-bg)] px-2 py-[0.28rem] text-[10px] font-medium text-[var(--crm-badge-neutral-text)]">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
}

function AssignedReviewTable({
  items,
  canAssign,
  onReassign,
  onRecycle,
}: Readonly<{
  items: LeadListItem[];
  canAssign: boolean;
  onReassign: (leadId: string) => void;
  onRecycle: (item: LeadListItem) => void;
}>) {
  return (
    <div className={leadTableShellClassName}>
      <table className={leadTableClassName}>
        <thead>
          <tr>
            <th>线索</th>
            <th>负责人</th>
            <th>最近意向</th>
            <th>状态</th>
            <th>最近分配</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const latestAssignment = item.assignments?.[0];
            const assignedAt = latestAssignment?.createdAt ?? item.updatedAt;

            return (
              <tr key={item.id}>
                <td>
                  <div className="space-y-0.5">
                    <div className="font-medium text-foreground">
                      {item.name?.trim() || "未填写姓名"}
                    </div>
                    <div className="font-mono text-xs tabular-nums text-muted-foreground">
                      {item.phone}
                    </div>
                  </div>
                </td>
                <td>
                  {item.owner ? (
                    <div>
                      <div className="text-foreground">
                        {item.owner.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{item.owner.username}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      未分配
                    </span>
                  )}
                </td>
                <td className="text-[13px] text-muted-foreground">
                  {item.interestedProduct?.trim() || "暂无最近意向"}
                </td>
                <td>
                  <LeadStatusBadge status={item.status} />
                </td>
                <td className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateTime(normalizeDate(assignedAt))}
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/leads/${item.id}`}
                      scroll={false}
                      className={leadActionLinkClassName}
                    >
                      查看详情
                    </Link>
                    {canAssign ? (
                      <button
                        type="button"
                        onClick={() => onReassign(item.id)}
                        className={leadActionLinkClassName}
                      >
                        改分配
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onRecycle(item)}
                      className={leadActionLinkClassName}
                    >
                      {item.recycleGuard.canMoveToRecycleBin
                        ? "移入回收站"
                        : "查看阻断关系"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  unassigned: UnassignedWorkspaceData;
  assigned: AssignedWorkspaceData;
  filters: LeadListFilters;
  canAssign: boolean;
  salesOptions: LeadSalesOption[];
  scrollTargetId?: string;
}>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("manual");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignNotice, setAssignNotice] = useState<LeadBatchActionNoticeState>(
    initialAssignBatchNoticeState,
  );
  const [singleRecycleNotice, setSingleRecycleNotice] =
    useState<SingleRecycleNoticeState>(initialSingleRecycleNoticeState);
  const [batchRecycleNotice, setBatchRecycleNotice] =
    useState<LeadBatchActionNoticeState>(initialRecycleBatchNoticeState);
  const [recycleDialogState, setRecycleDialogState] =
    useState<RecycleDialogState>(null);
  const [recycleReason, setRecycleReason] =
    useState<LeadRecycleReasonCode>("mistaken_creation");
  const [batchRecycleDialogOpen, setBatchRecycleDialogOpen] = useState(false);
  const [batchRecycleReason, setBatchRecycleReason] =
    useState<LeadRecycleReasonCode>("mistaken_creation");
  const [pending, startTransition] = useTransition();
  const [recyclePending, startRecycleTransition] = useTransition();
  const [batchRecyclePending, startBatchRecycleTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
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
  const isAssignedView = filters.view === "assigned";

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

  function openAssignDialog() {
    setDialogOpen(true);
  }

  function openBatchRecycleDialog() {
    setBatchRecycleNotice(initialRecycleBatchNoticeState);
    setBatchRecycleReason("mistaken_creation");
    setBatchRecycleDialogOpen(true);
  }

  function openReassignDialog(leadId: string) {
    setSelectionMode("manual");
    setSelectedIds([leadId]);
    setDialogOpen(true);
  }

  function openRecycleDialog(item: LeadListItem) {
    setSingleRecycleNotice(initialSingleRecycleNoticeState);
    setRecycleReason("mistaken_creation");
    setRecycleDialogState({
      id: item.id,
      name: item.name,
      phone: item.phone,
      source: item.source,
      status: item.status,
      updatedAt: item.updatedAt,
      recycleGuard: item.recycleGuard,
    });
  }

  function closeRecycleDialog() {
    setRecycleDialogState(null);
    setRecycleReason("mistaken_creation");
  }

  function closeBatchRecycleDialog() {
    setBatchRecycleDialogOpen(false);
    setBatchRecycleReason("mistaken_creation");
  }

  function handleRecycleConfirm() {
    if (
      !recycleDialogState ||
      !recycleDialogState.recycleGuard.canMoveToRecycleBin
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("id", recycleDialogState.id);
    formData.set("reasonCode", recycleReason);

    startRecycleTransition(async () => {
      const nextState = await moveLeadToRecycleBinAction(formData);
      setSingleRecycleNotice(nextState);
      closeRecycleDialog();

      if (
        nextState.recycleStatus === "created" ||
        nextState.recycleStatus === "already_in_recycle_bin" ||
        nextState.recycleStatus === "blocked"
      ) {
        router.refresh();
      }
    });
  }

  function handleAssignSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await batchAssignLeadsAction(
        initialAssignBatchNoticeState,
        formData,
      );

      setAssignNotice(nextState);

      if (nextState.status === "success") {
        resetSelection();
        setDialogOpen(false);
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  function handleBatchRecycleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startBatchRecycleTransition(async () => {
      const nextState = await batchMoveLeadsToRecycleBinAction(formData);
      setBatchRecycleNotice(nextState);
      closeBatchRecycleDialog();

      if (
        nextState.summary.successCount > 0 ||
        nextState.summary.skippedCount > 0
      ) {
        resetSelection();
        router.refresh();
      }
    });
  }

  const pageSizeControl = (
    <form
      onSubmit={(event) => event.preventDefault()}
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm"
    >
      <span>每页</span>
      <select
        name="pageSize"
        defaultValue={String(filters.pageSize)}
        className="h-7 w-[78px] min-h-0 border-0 bg-transparent px-0 py-0 pr-5 text-[12px] text-foreground shadow-none outline-none focus:ring-0"
        onChange={(event) => {
          const nextPageSize = Number(event.currentTarget.value);
          const nextHref = buildLeadHref(filters, {
            pageSize: Number.isFinite(nextPageSize)
              ? nextPageSize
              : filters.pageSize,
            page: 1,
          });

          router.replace(nextHref, { scroll: false });

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

  const assignedViewHref = buildLeadHref(filters, {
    view: "assigned",
    page: 1,
  });
  const unassignedViewHref = buildLeadHref(filters, {
    view: "unassigned",
    page: 1,
  });
  const unassignedExportHref = buildLeadUnassignedExportHref(filters);

  return (
    <div className="space-y-4">
      <AssignmentSummaryStrip
        unassignedCount={unassigned.totalCount}
        assignedCount={assigned.totalCount}
        assignedByOwner={assigned.byOwner}
        feedbackState={assignNotice}
        assignedViewHref={assignedViewHref}
        importBatchId={filters.importBatchId}
      />

      {singleRecycleNotice.message ? (
        <ActionBanner
          tone={singleRecycleNotice.status === "success" ? "success" : "danger"}
          className="rounded-[0.95rem] shadow-none"
        >
          <p>{singleRecycleNotice.message}</p>
        </ActionBanner>
      ) : null}

      <LeadBatchActionNoticeBanner
        state={batchRecycleNotice}
        successLabel="成功移入回收站"
        entityCountLabel="条线索"
        countUnitLabel="条"
        className="rounded-[0.95rem] shadow-none"
      />

      {isAssignedView ? (
        <SectionCard
          title="已分配结果"
          density="compact"
          anchorId={scrollTargetId}
          description="只在需要时进入回看，不再占据默认主工作台。"
          className="rounded-2xl border-border/60 bg-card shadow-sm"
          actions={
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>共 {assigned.totalCount} 条</span>
              <Link
                href={unassignedViewHref}
                scroll={false}
                className={leadSecondaryButtonClassName}
              >
                返回未分配
              </Link>
            </div>
          }
        >
          {assigned.items.length === 0 ? (
            <EmptyState
              density="compact"
              title="当前没有已分配结果"
              description="当前上下文下还没有已分配线索，可返回未分配工作区继续处理。"
              action={
                <Link
                  href={unassignedViewHref}
                  scroll={false}
                  className={leadSecondaryButtonClassName}
                >
                  返回未分配
                </Link>
              }
            />
          ) : (
            <AssignedReviewTable
              items={assigned.items}
              canAssign={canAssign}
              onReassign={openReassignDialog}
              onRecycle={openRecycleDialog}
            />
          )}
        </SectionCard>
      ) : (
        <SectionCard
          title="未分配"
          density="compact"
          anchorId={scrollTargetId}
          className="rounded-2xl border-border/60 bg-card shadow-sm"
          description="优先承接本次导入、今日导入与全部未分配线索。"
          actions={
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>共 {unassigned.totalCount} 条</span>
              <Link
                href={unassignedExportHref}
                prefetch={false}
                download
                className={cn(leadSecondaryButtonClassName, "gap-1.5")}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                导出未分配
              </Link>
              {canAssign ? (
                <>
                  <button
                    type="button"
                    disabled={selectedCount === 0 || salesOptions.length === 0}
                    onClick={openAssignDialog}
                    className={leadPrimaryButtonClassName}
                  >
                    批量分配
                  </button>
                  <button
                    type="button"
                    disabled={selectedCount === 0}
                    onClick={openBatchRecycleDialog}
                    className={leadSecondaryButtonClassName}
                  >
                    批量移入回收站
                  </button>
                </>
              ) : null}
            </div>
          }
        >
          <div className="space-y-4">
            {selectionMode === "filtered" ? (
              <SelectionStateBanner
                title={`当前筛选结果 ${unassigned.totalCount} 条已选`}
                description="批量动作会直接应用到整个筛选结果。"
                tone="info"
                action={
                  <button
                    type="button"
                    onClick={resetSelection}
                    className={leadSecondaryButtonClassName}
                  >
                    取消跨页选择
                  </button>
                }
              />
            ) : null}

            {selectionMode === "manual" &&
            allChecked &&
            canAssign &&
            unassigned.totalCount > unassigned.items.length ? (
              <SelectionStateBanner
                title={`已选择当前页全部 ${unassigned.items.length} 条`}
                description={
                  canSelectFiltered
                    ? `可继续扩展到全部 ${unassigned.totalCount} 条筛选结果。`
                    : `当前筛选结果共 ${unassigned.totalCount} 条，超过单次 ${MAX_BATCH_ASSIGNMENT_SIZE} 条上限，请先缩小范围。`
                }
                tone={filteredSelectionExceedsLimit ? "danger" : "default"}
                action={
                  canSelectFiltered ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectionMode("filtered");
                        setSelectedIds([]);
                      }}
                      className={leadSecondaryButtonClassName}
                    >
                      选择全部 {unassigned.totalCount} 条
                    </button>
                  ) : null
                }
              />
            ) : null}

            {unassigned.items.length === 0 ? (
              <EmptyState
                density="compact"
                title="当前没有待分配线索"
                description="当前筛选上下文下已经没有未分配线索，可进入已分配结果回看，或清空条件重新查看。"
                action={
                  <Link
                    href={assignedViewHref}
                    scroll={false}
                    className={leadSecondaryButtonClassName}
                  >
                    查看已分配结果
                  </Link>
                }
              />
            ) : (
              <>
                <div className={leadTableShellClassName}>
                  <table className={leadTableClassName}>
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
                                  selectionMode === "filtered" ||
                                  selectedIdSet.has(item.id)
                                }
                                onChange={() => toggleLead(item.id)}
                                aria-label={`选择线索 ${item.name ?? item.phone}`}
                                className="crm-checkbox mt-1 h-4 w-4"
                              />
                            </td>
                          ) : null}
                          <td>
                            <div className="space-y-0.5">
                              <div className="font-medium text-foreground">
                                {item.name?.trim() || "未填写姓名"}
                              </div>
                              <div className="font-mono text-xs tabular-nums text-muted-foreground">
                                {item.phone}
                              </div>
                            </div>
                          </td>
                          <td className="text-[13px] text-muted-foreground">
                            {getLeadSourceLabel(item.source)}
                          </td>
                          <td className="text-[13px] text-muted-foreground">
                            {item.interestedProduct?.trim() || "暂无最近意向"}
                          </td>
                          <td>
                            <LeadStatusBadge status={item.status} />
                          </td>
                          <td>{renderLeadTagPreview(item)}</td>
                          <td className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(normalizeDate(item.createdAt))}
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-3">
                              <Link
                                href={`/leads/${item.id}`}
                                scroll={false}
                                className={leadActionLinkClassName}
                              >
                                查看详情
                              </Link>
                              <button
                                type="button"
                                onClick={() => openRecycleDialog(item)}
                                className={leadActionLinkClassName}
                              >
                                {item.recycleGuard.canMoveToRecycleBin
                                  ? "移入回收站"
                                  : "查看阻断关系"}
                              </button>
                            </div>
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
                    summary={`当前第 ${unassigned.pagination.page} / ${unassigned.pagination.totalPages} 页，共 ${unassigned.pagination.totalCount} 条未分配线索`}
                    buildHref={(pageNumber) =>
                      buildLeadHref(filters, { page: pageNumber })
                    }
                    rightSlot={pageSizeControl}
                    scrollTargetId={scrollTargetId}
                  />
                ) : null}
              </>
            )}
          </div>
        </SectionCard>
      )}

      {dialogOpen ? (
        <LeadWorkbenchDialog
          title="批量分配线索"
          description={
            selectionMode === "filtered"
              ? `按当前未分配筛选结果分配 ${unassigned.totalCount} 条线索，并同步客户承接关系。`
              : `本次将分配已选中的 ${selectedIds.length} 条线索，并同步客户承接关系。`
          }
          onClose={() => setDialogOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className={leadSecondaryButtonClassName}
              >
                取消
              </button>
              <button
                type="submit"
                form="lead-batch-assign-form"
                disabled={pending || selectedCount === 0}
                className={leadPrimaryButtonClassName}
              >
                {pending ? "分配中..." : "确认分配"}
              </button>
            </>
          }
        >
          <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              当前范围
            </p>
            <p className="mt-1 text-[13px] font-medium text-foreground">
              {selectionMode === "filtered"
                ? `全部筛选结果 ${unassigned.totalCount} 条`
                : `已选线索 ${selectedIds.length} 条`}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              分配后会沿用当前承接链路进入客户侧继续跟进。
            </p>
          </div>

          <form
            id="lead-batch-assign-form"
            ref={formRef}
            onSubmit={handleAssignSubmit}
            className="space-y-3.5"
          >
            <input type="hidden" name="selectionMode" value={selectionMode} />

            {selectionMode === "filtered" ? (
              <FilterHiddenInputs
                filters={filters}
                includePage
                overrides={{
                  view: "unassigned",
                  assignedOwnerId: "",
                }}
              />
            ) : (
              selectedIds.map((leadId) => (
                <input
                  key={leadId}
                  type="hidden"
                  name="leadIds"
                  value={leadId}
                />
              ))
            )}

            <label className="block space-y-2">
              <span className="crm-label">目标销售</span>
              <select
                name="toUserId"
                defaultValue=""
                className="crm-select"
                required
              >
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
          </form>
        </LeadWorkbenchDialog>
      ) : null}

      {batchRecycleDialogOpen ? (
        <LeadWorkbenchDialog
          title="批量移入回收站"
          description={
            selectionMode === "filtered"
              ? `会检查当前筛选结果 ${unassigned.totalCount} 条线索，并逐条复用现有回收站 guard。`
              : `会检查已选中的 ${selectedCount} 条未分配线索，并逐条复用现有回收站 guard。`
          }
          onClose={closeBatchRecycleDialog}
          footer={
            <>
              <button
                type="button"
                onClick={closeBatchRecycleDialog}
                className={leadSecondaryButtonClassName}
              >
                取消
              </button>
              <button
                type="submit"
                form="lead-batch-recycle-form"
                disabled={batchRecyclePending || selectedCount === 0}
                className={leadPrimaryButtonClassName}
              >
                {batchRecyclePending ? "移入中..." : "确认移入回收站"}
              </button>
            </>
          }
        >
          <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              当前范围
            </p>
            <p className="mt-1 text-[13px] font-medium text-foreground">
              {selectionMode === "filtered"
                ? `全部筛选结果 ${unassigned.totalCount} 条`
                : `已选线索 ${selectedCount} 条`}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              成功、已在回收站与被阻断会分别统计；被阻断对象会继续留在当前工作台。
            </p>
          </div>

          <form
            id="lead-batch-recycle-form"
            onSubmit={handleBatchRecycleSubmit}
            className="space-y-3.5"
          >
            <input type="hidden" name="selectionMode" value={selectionMode} />

            {selectionMode === "filtered" ? (
              <FilterHiddenInputs
                filters={filters}
                includePage
                overrides={{
                  view: "unassigned",
                  assignedOwnerId: "",
                }}
              />
            ) : (
              selectedIds.map((leadId) => (
                <input
                  key={leadId}
                  type="hidden"
                  name="leadIds"
                  value={leadId}
                />
              ))
            )}

            <label className="block space-y-2">
              <span className="crm-label">移入原因</span>
              <select
                name="reasonCode"
                value={batchRecycleReason}
                onChange={(event) =>
                  setBatchRecycleReason(
                    event.currentTarget.value as LeadRecycleReasonCode,
                  )
                }
                className="crm-select"
              >
                {LEAD_RECYCLE_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </LeadWorkbenchDialog>
      ) : null}

      <LeadRecycleDialog
        open={recycleDialogState !== null}
        item={
          recycleDialogState
            ? {
                name: recycleDialogState.name,
                phone: recycleDialogState.phone,
                source: recycleDialogState.source,
                status: recycleDialogState.status,
                updatedAt: recycleDialogState.updatedAt,
              }
            : null
        }
        guard={recycleDialogState?.recycleGuard ?? null}
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        onConfirm={handleRecycleConfirm}
        pending={recyclePending}
      />
    </div>
  );
}
