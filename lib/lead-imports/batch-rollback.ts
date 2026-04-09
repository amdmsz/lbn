import {
  LeadDedupType,
  LeadImportBatchStatus,
  LeadImportRowStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import {
  canExecuteLeadImportBatchHardDelete,
  canExecuteLeadImportBatchRollback,
} from "@/lib/auth/access";
import {
  executeImportedCustomerDeletionTx,
  findImportedCustomerForDeletionByIdTx,
  findVisibleImportedCustomerForDeletionTx,
  getImportedCustomerDeletionActorTx,
  resolveImportedCustomerDeletionGuardTx,
  type ImportedCustomerDeletionActor,
  type ImportedCustomerDeletionCustomerRecord,
  type ImportedCustomerDeletionGuard,
} from "@/lib/customers/imported-customer-deletion";
import { prisma } from "@/lib/db/prisma";
import {
  getLeadImportBatchKind,
  type CustomerContinuationRowMappedData,
  type LeadImportBatchRollbackMode,
  type LeadImportKind,
} from "@/lib/lead-imports/metadata";

type RollbackViewer = {
  id: string;
  role: RoleCode;
};

type RollbackStatusVariant = "neutral" | "success" | "danger" | "warning" | "info";

export type LeadImportBatchRollbackRowState =
  | "IGNORED"
  | "ROLLBACKABLE"
  | "BLOCKED";

export type LeadImportBatchRollbackRowPreview = {
  rowNumber: number;
  state: LeadImportBatchRollbackRowState;
  stateLabel: string;
  stateVariant: RollbackStatusVariant;
  reason: string;
  dedupType: LeadDedupType | null;
  mergeAction: string | null;
  importedLeadId: string | null;
  matchedLeadId: string | null;
  customerId: string | null;
  customerAction: "NONE" | "DELETE" | "ALREADY_REMOVED";
  leadAction: "NONE" | "AUDIT_PRESERVE" | "HARD_DELETE";
};

export type LeadImportBatchRollbackPrecheckSummary = {
  totalRows: number;
  effectiveRows: number;
  rollbackableRows: number;
  blockedRows: number;
  ignoredRows: number;
  existingLeadBlockRows: number;
  existingCustomerBlockRows: number;
  customerDeleteRows: number;
  alreadyRemovedCustomerRows: number;
  auditPreservedLeadRows: number;
  hardDeleteLeadRows: number;
  leadHardDeleteBlockRows: number;
};

export type LeadImportBatchRollbackPrecheckSnapshot = {
  version: "v1";
  importKind: LeadImportKind;
  mode: LeadImportBatchRollbackMode;
  generatedAt: string;
  overallEligible: boolean;
  blockedReason: string | null;
  summary: LeadImportBatchRollbackPrecheckSummary;
  rows: LeadImportBatchRollbackRowPreview[];
};

export type LeadImportBatchRollbackExecutionRow = {
  rowNumber: number;
  outcome:
    | "IGNORED"
    | "CUSTOMER_DELETED"
    | "CUSTOMER_ALREADY_REMOVED"
    | "LEAD_AUDIT_PRESERVED"
    | "LEAD_HARD_DELETED";
  note: string;
};

export type LeadImportBatchRollbackExecutionSummary = {
  totalRows: number;
  processedRows: number;
  ignoredRows: number;
  deletedCustomerRows: number;
  alreadyRemovedCustomerRows: number;
  auditPreservedLeadRows: number;
  hardDeletedLeadRows: number;
};

export type LeadImportBatchRollbackExecutionSnapshot = {
  version: "v1";
  importKind: LeadImportKind;
  mode: LeadImportBatchRollbackMode;
  reason: string;
  executedAt: string;
  summary: LeadImportBatchRollbackExecutionSummary;
  rows: LeadImportBatchRollbackExecutionRow[];
};

export type LeadImportBatchRollbackPreviewResult = {
  batchId: string;
  fileName: string;
  importKind: LeadImportKind;
  mode: LeadImportBatchRollbackMode;
  canExecute: boolean;
  blockedReason: string | null;
  precheck: LeadImportBatchRollbackPrecheckSnapshot;
};

export type ExecuteLeadImportBatchRollbackResult = {
  rollbackId: string;
  batchId: string;
  fileName: string;
  importKind: LeadImportKind;
  mode: LeadImportBatchRollbackMode;
  affectedCustomerIds: string[];
  affectedLeadIds: string[];
  message: string;
};

type LeadHardDeleteRecord = Prisma.LeadGetPayload<{
  select: typeof leadHardDeleteSelect;
}>;

type PreparedCustomerRollback =
  | {
      state: "DELETE";
      reason: string;
      customerId: string;
      customer: ImportedCustomerDeletionCustomerRecord;
      guard: ImportedCustomerDeletionGuard;
    }
  | {
      state: "ALREADY_REMOVED";
      reason: string;
      customerId: string | null;
      customer: null;
      guard: null;
    }
  | {
      state: "BLOCKED";
      reason: string;
      customerId: string | null;
      customer: ImportedCustomerDeletionCustomerRecord | null;
      guard: ImportedCustomerDeletionGuard | null;
    };

type PreparedRollbackRow = LeadImportBatchRollbackRowPreview & {
  currentRowStatus: LeadImportRowStatus;
  leadRecord: LeadHardDeleteRecord | null;
  customerRollback: PreparedCustomerRollback;
};

type PreparedBatchRollback = {
  batchId: string;
  fileName: string;
  importKind: LeadImportKind;
  mode: LeadImportBatchRollbackMode;
  precheck: LeadImportBatchRollbackPrecheckSnapshot;
  rows: PreparedRollbackRow[];
};

type RollbackBatchRecord = Prisma.LeadImportBatchGetPayload<{
  select: typeof rollbackBatchSelect;
}>;

const rollbackRowStateMeta: Record<
  LeadImportBatchRollbackRowState,
  {
    label: string;
    variant: RollbackStatusVariant;
  }
> = {
  IGNORED: {
    label: "无需撤销",
    variant: "neutral",
  },
  ROLLBACKABLE: {
    label: "可整批撤销",
    variant: "success",
  },
  BLOCKED: {
    label: "阻断撤销",
    variant: "danger",
  },
};

const leadHardDeleteSelect = {
  id: true,
  name: true,
  phone: true,
  ownerId: true,
  status: true,
  customerId: true,
  rolledBackAt: true,
  lastFollowUpAt: true,
  nextFollowUpAt: true,
  _count: {
    select: {
      assignments: true,
      followUpTasks: true,
      callRecords: true,
      wechatRecords: true,
      liveInvitations: true,
      orders: true,
      giftRecords: true,
      leadTags: true,
    },
  },
} satisfies Prisma.LeadSelect;

const rollbackBatchSelect = {
  id: true,
  fileName: true,
  status: true,
  report: true,
  rollback: {
    select: {
      id: true,
    },
  },
  rows: {
    orderBy: { rowNumber: "asc" },
    select: {
      id: true,
      rowNumber: true,
      status: true,
      dedupType: true,
      matchedLeadId: true,
      importedLeadId: true,
      mappedData: true,
      mergeLogs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          action: true,
          customerId: true,
        },
      },
    },
  },
} satisfies Prisma.LeadImportBatchSelect;

function parseCustomerContinuationRowMappedData(
  value: Prisma.JsonValue | null,
): CustomerContinuationRowMappedData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (value.importKind !== "CUSTOMER_CONTINUATION") {
    return null;
  }

  return value as CustomerContinuationRowMappedData;
}

function buildRollbackRowStateMeta(state: LeadImportBatchRollbackRowState) {
  return rollbackRowStateMeta[state];
}

function createRowPreview(input: {
  rowNumber: number;
  state: LeadImportBatchRollbackRowState;
  reason: string;
  dedupType: LeadDedupType | null;
  mergeAction: string | null;
  importedLeadId: string | null;
  matchedLeadId: string | null;
  customerId: string | null;
  customerAction: "NONE" | "DELETE" | "ALREADY_REMOVED";
  leadAction: "NONE" | "AUDIT_PRESERVE" | "HARD_DELETE";
}): LeadImportBatchRollbackRowPreview {
  const stateMeta = buildRollbackRowStateMeta(input.state);

  return {
    rowNumber: input.rowNumber,
    state: input.state,
    stateLabel: stateMeta.label,
    stateVariant: stateMeta.variant,
    reason: input.reason,
    dedupType: input.dedupType,
    mergeAction: input.mergeAction,
    importedLeadId: input.importedLeadId,
    matchedLeadId: input.matchedLeadId,
    customerId: input.customerId,
    customerAction: input.customerAction,
    leadAction: input.leadAction,
  };
}

function buildEmptyCustomerRollback(): PreparedCustomerRollback {
  return {
    state: "ALREADY_REMOVED",
    reason: "本行没有需要删除的新建客户。",
    customerId: null,
    customer: null,
    guard: null,
  };
}

function getLeadHardDeleteBlockerLabels(lead: LeadHardDeleteRecord) {
  const labels: string[] = [];

  if (lead.ownerId) {
    labels.push("导入 Lead 已有负责人");
  }
  if (lead.status !== "NEW") {
    labels.push(`导入 Lead 状态已变更为 ${lead.status}`);
  }
  if (lead.lastFollowUpAt) {
    labels.push("导入 Lead 已产生最近跟进记录");
  }
  if (lead.nextFollowUpAt) {
    labels.push("导入 Lead 已挂有下次跟进时间");
  }
  if (lead._count.assignments > 0) {
    labels.push("导入 Lead 已产生分配记录");
  }
  if (lead._count.followUpTasks > 0) {
    labels.push("导入 Lead 已产生跟进任务");
  }
  if (lead._count.callRecords > 0) {
    labels.push("导入 Lead 已产生通话记录");
  }
  if (lead._count.wechatRecords > 0) {
    labels.push("导入 Lead 已产生微信记录");
  }
  if (lead._count.liveInvitations > 0) {
    labels.push("导入 Lead 已产生直播邀请记录");
  }
  if (lead._count.orders > 0) {
    labels.push("导入 Lead 已关联订单");
  }
  if (lead._count.giftRecords > 0) {
    labels.push("导入 Lead 已关联礼品记录");
  }
  if (lead._count.leadTags > 0) {
    labels.push("导入 Lead 已挂接标签");
  }

  return labels;
}

function assertRollbackPermission(
  actor: ImportedCustomerDeletionActor,
  input: {
    mode: LeadImportBatchRollbackMode;
    importKind: LeadImportKind;
  },
) {
  if (!canExecuteLeadImportBatchRollback(actor.role)) {
    throw new Error("当前角色无权执行导入批次撤销。");
  }

  if (input.mode === "HARD_DELETE") {
    if (input.importKind !== "LEAD") {
      throw new Error("客户续接导入不支持硬删除撤销。");
    }

    if (!canExecuteLeadImportBatchHardDelete(actor.role)) {
      throw new Error("只有 ADMIN 可以执行硬删除撤销。");
    }
  }
}

async function loadRollbackBatchTx(
  tx: Prisma.TransactionClient | typeof prisma,
  batchId: string,
) {
  return tx.leadImportBatch.findUnique({
    where: { id: batchId },
    select: rollbackBatchSelect,
  });
}

async function prepareCustomerRollbackTx(
  tx: Prisma.TransactionClient,
  actor: ImportedCustomerDeletionActor,
  customerId: string | null,
): Promise<PreparedCustomerRollback> {
  if (!customerId) {
    return {
      state: "ALREADY_REMOVED",
      reason: "本行新建客户已不存在，将按已清理处理。",
      customerId: null,
      customer: null,
      guard: null,
    };
  }

  const liveCustomer = await findVisibleImportedCustomerForDeletionTx(tx, actor, customerId);

  if (!liveCustomer) {
    const existingCustomer = await findImportedCustomerForDeletionByIdTx(tx, customerId);

    if (!existingCustomer) {
      return {
        state: "ALREADY_REMOVED",
        reason: "本行新建客户已不存在，将按已清理处理。",
        customerId,
        customer: null,
        guard: null,
      };
    }

    return {
      state: "BLOCKED",
      reason: "本行新建客户仍存在，但不在当前回滚可管理范围内。",
      customerId,
      customer: null,
      guard: null,
    };
  }

  const guard = await resolveImportedCustomerDeletionGuardTx(tx, actor, customerId);

  if (!guard || !guard.canDirectDelete) {
    return {
      state: "BLOCKED",
      reason:
        guard?.blockedReason ??
        "本行新建客户当前不满足删除条件，整批撤销被阻断。",
      customerId,
      customer: liveCustomer,
      guard,
    };
  }

  return {
    state: "DELETE",
    reason: "本行新建客户满足回滚删除条件。",
    customerId,
    customer: liveCustomer,
    guard,
  };
}

function parsePrecheckSnapshot(
  value: Prisma.JsonValue | null,
): LeadImportBatchRollbackPrecheckSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (value.version !== "v1" || !Array.isArray(value.rows)) {
    return null;
  }

  return value as LeadImportBatchRollbackPrecheckSnapshot;
}

export function parseLeadImportBatchRollbackPrecheckSnapshot(
  value: Prisma.JsonValue | null,
) {
  return parsePrecheckSnapshot(value);
}

export function parseLeadImportBatchRollbackExecutionSnapshot(
  value: Prisma.JsonValue | null,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (value.version !== "v1" || !Array.isArray(value.rows)) {
    return null;
  }

  return value as LeadImportBatchRollbackExecutionSnapshot;
}

function buildBlockedReason(summary: LeadImportBatchRollbackPrecheckSummary) {
  if (summary.effectiveRows === 0) {
    return "当前批次没有需要回滚的有效行。";
  }

  if (summary.existingLeadBlockRows > 0) {
    return "批次内存在命中系统已有 Lead 的行，整批撤销被阻断。";
  }

  if (summary.existingCustomerBlockRows > 0) {
    return "批次内存在命中系统已有 Customer 的行，整批撤销被阻断。";
  }

  if (summary.leadHardDeleteBlockRows > 0) {
    return "存在已进入后续线索执行链路的导入 Lead，当前硬删除撤销被阻断。";
  }

  if (summary.blockedRows > 0) {
    return "批次内存在不可逆行，整批撤销被阻断。";
  }

  return null;
}

function buildPrecheckSnapshot(input: {
  importKind: LeadImportKind;
  mode: LeadImportBatchRollbackMode;
  rows: LeadImportBatchRollbackRowPreview[];
}): LeadImportBatchRollbackPrecheckSnapshot {
  const summary = input.rows.reduce<LeadImportBatchRollbackPrecheckSummary>(
    (acc, row) => {
      acc.totalRows += 1;

      if (row.state === "IGNORED") {
        acc.ignoredRows += 1;
        return acc;
      }

      acc.effectiveRows += 1;

      if (row.state === "ROLLBACKABLE") {
        acc.rollbackableRows += 1;
      }

      if (row.state === "BLOCKED") {
        acc.blockedRows += 1;
      }

      if (row.dedupType === LeadDedupType.EXISTING_LEAD) {
        acc.existingLeadBlockRows += 1;
      }

      if (row.mergeAction === "MATCHED_EXISTING_CUSTOMER") {
        acc.existingCustomerBlockRows += 1;
      }

      if (
        row.state === "BLOCKED" &&
        row.leadAction === "HARD_DELETE" &&
        row.importedLeadId
      ) {
        acc.leadHardDeleteBlockRows += 1;
      }

      if (row.customerAction === "DELETE") {
        acc.customerDeleteRows += 1;
      }
      if (row.customerAction === "ALREADY_REMOVED") {
        acc.alreadyRemovedCustomerRows += 1;
      }
      if (row.leadAction === "AUDIT_PRESERVE") {
        acc.auditPreservedLeadRows += 1;
      }
      if (row.leadAction === "HARD_DELETE") {
        acc.hardDeleteLeadRows += 1;
      }

      return acc;
    },
    {
      totalRows: 0,
      effectiveRows: 0,
      rollbackableRows: 0,
      blockedRows: 0,
      ignoredRows: 0,
      existingLeadBlockRows: 0,
      existingCustomerBlockRows: 0,
      customerDeleteRows: 0,
      alreadyRemovedCustomerRows: 0,
      auditPreservedLeadRows: 0,
      hardDeleteLeadRows: 0,
      leadHardDeleteBlockRows: 0,
    },
  );

  const blockedReason = buildBlockedReason(summary);

  return {
    version: "v1",
    importKind: input.importKind,
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    overallEligible: summary.blockedRows === 0 && summary.effectiveRows > 0,
    blockedReason,
    summary,
    rows: input.rows,
  };
}

async function prepareLeadImportRollbackRowTx(
  tx: Prisma.TransactionClient,
  actor: ImportedCustomerDeletionActor,
  row: RollbackBatchRecord["rows"][number],
  leadMap: Map<string, LeadHardDeleteRecord>,
  mode: LeadImportBatchRollbackMode,
): Promise<PreparedRollbackRow> {
  if (row.status === LeadImportRowStatus.FAILED) {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "IGNORED",
        reason: "失败行未写入业务对象，无需回滚。",
        dedupType: row.dedupType ?? null,
        mergeAction: null,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: null,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  if (row.status === LeadImportRowStatus.DUPLICATE) {
    if (row.dedupType === LeadDedupType.BATCH_DUPLICATE) {
      return {
        ...createRowPreview({
          rowNumber: row.rowNumber,
          state: "IGNORED",
          reason: "批内重复行未写入业务对象，无需回滚。",
          dedupType: row.dedupType,
          mergeAction: null,
          importedLeadId: row.importedLeadId,
          matchedLeadId: row.matchedLeadId,
          customerId: null,
          customerAction: "NONE",
          leadAction: "NONE",
        }),
        currentRowStatus: row.status,
        leadRecord: null,
        customerRollback: buildEmptyCustomerRollback(),
      };
    }

    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "该行命中系统已有 Lead，整批撤销被阻断。",
        dedupType: row.dedupType ?? null,
        mergeAction: null,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: null,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  const customerMerge = row.mergeLogs[0] ?? null;

  if (!customerMerge) {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "导入行缺少客户归并记录，无法确认撤销边界。",
        dedupType: row.dedupType ?? null,
        mergeAction: null,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: null,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  if (customerMerge.action === "MATCHED_EXISTING_CUSTOMER") {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "该行命中系统已有 Customer，整批撤销被阻断。",
        dedupType: row.dedupType ?? null,
        mergeAction: customerMerge.action,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: customerMerge.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  if (!row.importedLeadId) {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "导入行缺少 importedLeadId，无法执行整批撤销。",
        dedupType: row.dedupType ?? null,
        mergeAction: customerMerge.action,
        importedLeadId: null,
        matchedLeadId: row.matchedLeadId,
        customerId: customerMerge.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  const leadRecord = leadMap.get(row.importedLeadId) ?? null;

  if (!leadRecord) {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "导入 Lead 已不存在，无法执行整批撤销。",
        dedupType: row.dedupType ?? null,
        mergeAction: customerMerge.action,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: customerMerge.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  if (leadRecord.rolledBackAt) {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "导入 Lead 已处于回滚状态，当前批次状态不一致。",
        dedupType: row.dedupType ?? null,
        mergeAction: customerMerge.action,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: customerMerge.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  const customerRollback = await prepareCustomerRollbackTx(
    tx,
    actor,
    customerMerge.customerId,
  );

  if (customerRollback.state === "BLOCKED") {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: `本行新建客户不可逆：${customerRollback.reason}`,
        dedupType: row.dedupType ?? null,
        mergeAction: customerMerge.action,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: customerRollback.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord,
      customerRollback,
    };
  }

  if (mode === "HARD_DELETE") {
    const leadBlockers = getLeadHardDeleteBlockerLabels(leadRecord);

    if (leadBlockers.length > 0) {
      return {
        ...createRowPreview({
          rowNumber: row.rowNumber,
          state: "BLOCKED",
          reason: leadBlockers.join("；"),
          dedupType: row.dedupType ?? null,
          mergeAction: customerMerge.action,
          importedLeadId: row.importedLeadId,
          matchedLeadId: row.matchedLeadId,
          customerId: customerRollback.customerId,
          customerAction:
            customerRollback.state === "DELETE"
              ? "DELETE"
              : customerRollback.state === "ALREADY_REMOVED"
                ? "ALREADY_REMOVED"
                : "NONE",
          leadAction: "HARD_DELETE",
        }),
        currentRowStatus: row.status,
        leadRecord,
        customerRollback,
      };
    }
  }

  return {
    ...createRowPreview({
      rowNumber: row.rowNumber,
      state: "ROLLBACKABLE",
      reason:
        mode === "HARD_DELETE"
          ? "本行可删除新建客户并硬删导入 Lead。"
          : "本行可删除新建客户并保留回滚后的 Lead 审计记录。",
      dedupType: row.dedupType ?? null,
      mergeAction: customerMerge.action,
      importedLeadId: row.importedLeadId,
      matchedLeadId: row.matchedLeadId,
      customerId: customerRollback.customerId,
      customerAction:
        customerRollback.state === "DELETE"
          ? "DELETE"
          : customerRollback.state === "ALREADY_REMOVED"
            ? "ALREADY_REMOVED"
            : "NONE",
      leadAction: mode === "HARD_DELETE" ? "HARD_DELETE" : "AUDIT_PRESERVE",
    }),
    currentRowStatus: row.status,
    leadRecord,
    customerRollback,
  };
}

async function prepareCustomerContinuationRollbackRowTx(
  tx: Prisma.TransactionClient,
  actor: ImportedCustomerDeletionActor,
  row: RollbackBatchRecord["rows"][number],
): Promise<PreparedRollbackRow> {
  if (row.status !== LeadImportRowStatus.IMPORTED) {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "IGNORED",
        reason: "非成功导入行未写入新客户，无需回滚。",
        dedupType: row.dedupType ?? null,
        mergeAction: null,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: null,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  const continuation = parseCustomerContinuationRowMappedData(row.mappedData);

  if (!continuation) {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "续接导入行缺少结果快照，无法确认回滚边界。",
        dedupType: row.dedupType ?? null,
        mergeAction: null,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: null,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  if (continuation.result.action === "MATCHED_EXISTING_CUSTOMER") {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "该行命中系统已有 Customer，整批撤销被阻断。",
        dedupType: row.dedupType ?? null,
        mergeAction: continuation.result.action,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: continuation.result.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  if (continuation.result.action !== "CREATED_CUSTOMER") {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: "续接导入行缺少可回滚的新建客户结果。",
        dedupType: row.dedupType ?? null,
        mergeAction: continuation.result.action,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: continuation.result.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback: buildEmptyCustomerRollback(),
    };
  }

  const customerRollback = await prepareCustomerRollbackTx(
    tx,
    actor,
    continuation.result.customerId,
  );

  if (customerRollback.state === "BLOCKED") {
    return {
      ...createRowPreview({
        rowNumber: row.rowNumber,
        state: "BLOCKED",
        reason: `本行新建客户不可逆：${customerRollback.reason}`,
        dedupType: row.dedupType ?? null,
        mergeAction: continuation.result.action,
        importedLeadId: row.importedLeadId,
        matchedLeadId: row.matchedLeadId,
        customerId: customerRollback.customerId,
        customerAction: "NONE",
        leadAction: "NONE",
      }),
      currentRowStatus: row.status,
      leadRecord: null,
      customerRollback,
    };
  }

  return {
    ...createRowPreview({
      rowNumber: row.rowNumber,
      state: "ROLLBACKABLE",
      reason:
        customerRollback.state === "DELETE"
          ? "本行可删除本批次续接时新建的客户。"
          : "本行新建客户已不存在，将按已清理处理。",
      dedupType: row.dedupType ?? null,
      mergeAction: continuation.result.action,
      importedLeadId: row.importedLeadId,
      matchedLeadId: row.matchedLeadId,
      customerId: customerRollback.customerId,
      customerAction:
        customerRollback.state === "DELETE"
          ? "DELETE"
          : customerRollback.state === "ALREADY_REMOVED"
            ? "ALREADY_REMOVED"
            : "NONE",
      leadAction: "NONE",
    }),
    currentRowStatus: row.status,
    leadRecord: null,
    customerRollback,
  };
}

async function prepareBatchRollbackTx(
  tx: Prisma.TransactionClient,
  actor: ImportedCustomerDeletionActor,
  batchId: string,
  mode: LeadImportBatchRollbackMode,
): Promise<PreparedBatchRollback> {
  const batch = await loadRollbackBatchTx(tx, batchId);

  if (!batch) {
    throw new Error("导入批次不存在。");
  }

  if (batch.rollback) {
    throw new Error("该批次已执行过整批撤销。");
  }

  if (batch.status !== LeadImportBatchStatus.COMPLETED) {
    throw new Error("只有已完成的导入批次才允许整批撤销。");
  }

  const importKind = getLeadImportBatchKind(batch.report);
  assertRollbackPermission(actor, { mode, importKind });

  const leadIds = [
    ...new Set(
      batch.rows
        .map((batchRow) => batchRow.importedLeadId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const leads = leadIds.length
    ? await tx.lead.findMany({
        where: {
          id: {
            in: leadIds,
          },
        },
        select: leadHardDeleteSelect,
      })
    : [];
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const rows: PreparedRollbackRow[] = [];

  for (const row of batch.rows) {
    if (importKind === "CUSTOMER_CONTINUATION") {
      rows.push(await prepareCustomerContinuationRollbackRowTx(tx, actor, row));
    } else {
      rows.push(await prepareLeadImportRollbackRowTx(tx, actor, row, leadMap, mode));
    }
  }

  const precheck = buildPrecheckSnapshot({
    importKind,
    mode,
    rows: rows.map((row) => ({
      rowNumber: row.rowNumber,
      state: row.state,
      stateLabel: row.stateLabel,
      stateVariant: row.stateVariant,
      reason: row.reason,
      dedupType: row.dedupType,
      mergeAction: row.mergeAction,
      importedLeadId: row.importedLeadId,
      matchedLeadId: row.matchedLeadId,
      customerId: row.customerId,
      customerAction: row.customerAction,
      leadAction: row.leadAction,
    })),
  });

  return {
    batchId: batch.id,
    fileName: batch.fileName,
    importKind,
    mode,
    precheck,
    rows,
  };
}

class LeadImportBatchRollbackBlockedError extends Error {
  preview: LeadImportBatchRollbackPrecheckSnapshot;

  constructor(preview: LeadImportBatchRollbackPrecheckSnapshot) {
    super(preview.blockedReason ?? "当前批次不满足整批撤销条件。");
    this.preview = preview;
  }
}

async function createLeadImportBatchRollbackOperationLog(input: {
  actorId: string;
  batchId: string;
  action:
    | "lead_import.batch_rollback.blocked"
    | "lead_import.batch_rollback.executed";
  description: string;
  afterData?: Prisma.InputJsonValue | null;
}) {
  await prisma.operationLog.create({
    data: {
      actorId: input.actorId,
      module: "LEAD_IMPORT",
      action: input.action,
      targetType: "LEAD_IMPORT_BATCH",
      targetId: input.batchId,
      description: input.description,
      afterData: input.afterData ?? undefined,
    },
  });
}

export async function getLeadImportBatchRollbackPreview(
  viewer: RollbackViewer,
  batchId: string,
  mode: LeadImportBatchRollbackMode,
): Promise<LeadImportBatchRollbackPreviewResult> {
  const actor = await getImportedCustomerDeletionActorTx(prisma, viewer.id);

  if (actor.role !== viewer.role) {
    throw new Error("当前账号角色已变更，请刷新后重试。");
  }

  const prepared = await prisma.$transaction((tx) =>
    prepareBatchRollbackTx(tx, actor, batchId, mode),
  );

  return {
    batchId: prepared.batchId,
    fileName: prepared.fileName,
    importKind: prepared.importKind,
    mode: prepared.mode,
    canExecute: prepared.precheck.overallEligible,
    blockedReason: prepared.precheck.blockedReason,
    precheck: prepared.precheck,
  };
}

export async function executeLeadImportBatchRollback(
  viewer: RollbackViewer,
  input: {
    batchId: string;
    mode: LeadImportBatchRollbackMode;
    reason: string;
  },
): Promise<ExecuteLeadImportBatchRollbackResult> {
  const actor = await getImportedCustomerDeletionActorTx(prisma, viewer.id);

  if (actor.role !== viewer.role) {
    throw new Error("当前账号角色已变更，请刷新后重试。");
  }

  const executionReason = input.reason.trim();

  if (!executionReason) {
    throw new Error("请填写整批撤销原因。");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const prepared = await prepareBatchRollbackTx(tx, actor, input.batchId, input.mode);

      if (!prepared.precheck.overallEligible) {
        throw new LeadImportBatchRollbackBlockedError(prepared.precheck);
      }

      const now = new Date();
      const executionRows: LeadImportBatchRollbackExecutionRow[] = [];
      const affectedCustomerIds = new Set<string>();
      const affectedLeadIds = new Set<string>();
      let deletedCustomerRows = 0;
      let alreadyRemovedCustomerRows = 0;
      let auditPreservedLeadRows = 0;
      let hardDeletedLeadRows = 0;
      let ignoredRows = 0;

      for (const row of prepared.rows) {
        if (row.state === "IGNORED") {
          ignoredRows += 1;
          executionRows.push({
            rowNumber: row.rowNumber,
            outcome: "IGNORED",
            note: row.reason,
          });
          continue;
        }

        if (row.customerRollback.state === "DELETE") {
          await executeImportedCustomerDeletionTx(tx, {
            actor,
            customer: row.customerRollback.customer,
            guard: row.customerRollback.guard,
            request: null,
            reason: executionReason,
            operationContext: {
              source: "lead_import_batch_rollback",
              rollbackBatchId: prepared.batchId,
              rollbackMode: prepared.mode,
            },
          });
          deletedCustomerRows += 1;
          affectedCustomerIds.add(row.customerRollback.customer.id);
          executionRows.push({
            rowNumber: row.rowNumber,
            outcome: "CUSTOMER_DELETED",
            note: "已删除本行新建客户。",
          });
        } else if (row.customerRollback.state === "ALREADY_REMOVED") {
          alreadyRemovedCustomerRows += 1;
          executionRows.push({
            rowNumber: row.rowNumber,
            outcome: "CUSTOMER_ALREADY_REMOVED",
            note: row.customerRollback.reason,
          });
        }

        if (row.leadAction === "AUDIT_PRESERVE" && row.leadRecord) {
          await tx.lead.update({
            where: { id: row.leadRecord.id },
            data: {
              customerId: null,
              rolledBackAt: now,
              rolledBackBatchId: prepared.batchId,
            },
          });

          await tx.operationLog.create({
            data: {
              actorId: actor.id,
              module: "LEAD_IMPORT",
              action: "lead_import.batch_rollback.lead_audit_preserved",
              targetType: "LEAD",
              targetId: row.leadRecord.id,
              description: `整批撤销保留导入 Lead 审计记录：${row.leadRecord.name ?? row.leadRecord.phone}`,
              beforeData: {
                customerId: row.leadRecord.customerId,
                rolledBackAt: row.leadRecord.rolledBackAt,
              },
              afterData: {
                rolledBackAt: now.toISOString(),
                rolledBackBatchId: prepared.batchId,
                rollbackMode: prepared.mode,
                rollbackReason: executionReason,
              },
            },
          });

          auditPreservedLeadRows += 1;
          affectedLeadIds.add(row.leadRecord.id);
          executionRows.push({
            rowNumber: row.rowNumber,
            outcome: "LEAD_AUDIT_PRESERVED",
            note: "已保留导入 Lead 审计记录并从可见链路中移除。",
          });
        }

        if (row.leadAction === "HARD_DELETE" && row.leadRecord) {
          await tx.leadCustomerMergeLog.updateMany({
            where: {
              leadId: row.leadRecord.id,
            },
            data: {
              leadId: null,
              leadIdSnapshot: row.leadRecord.id,
              leadNameSnapshot: row.leadRecord.name,
              leadPhoneSnapshot: row.leadRecord.phone,
            },
          });

          await tx.operationLog.create({
            data: {
              actorId: actor.id,
              module: "LEAD_IMPORT",
              action: "lead_import.batch_rollback.lead_hard_deleted",
              targetType: "LEAD",
              targetId: row.leadRecord.id,
              description: `整批撤销硬删除导入 Lead：${row.leadRecord.name ?? row.leadRecord.phone}`,
              beforeData: {
                customerId: row.leadRecord.customerId,
                status: row.leadRecord.status,
                ownerId: row.leadRecord.ownerId,
              },
              afterData: {
                leadDeleted: true,
                rollbackBatchId: prepared.batchId,
                rollbackMode: prepared.mode,
                rollbackReason: executionReason,
              },
            },
          });

          await tx.lead.delete({
            where: {
              id: row.leadRecord.id,
            },
          });

          hardDeletedLeadRows += 1;
          affectedLeadIds.add(row.leadRecord.id);
          executionRows.push({
            rowNumber: row.rowNumber,
            outcome: "LEAD_HARD_DELETED",
            note: "已硬删除导入 Lead，并保留归并快照。",
          });
        }
      }

      const executionSnapshot: LeadImportBatchRollbackExecutionSnapshot = {
        version: "v1",
        importKind: prepared.importKind,
        mode: prepared.mode,
        reason: executionReason,
        executedAt: now.toISOString(),
        summary: {
          totalRows: prepared.rows.length,
          processedRows: prepared.precheck.summary.rollbackableRows,
          ignoredRows,
          deletedCustomerRows,
          alreadyRemovedCustomerRows,
          auditPreservedLeadRows,
          hardDeletedLeadRows,
        },
        rows: executionRows,
      };

      const rollbackRecord = await tx.leadImportBatchRollback.create({
        data: {
          batchId: prepared.batchId,
          mode: prepared.mode,
          actorId: actor.id,
          precheckSnapshot: prepared.precheck,
          executionSnapshot,
        },
        select: {
          id: true,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: "LEAD_IMPORT",
          action: "lead_import.batch_rollback.executed",
          targetType: "LEAD_IMPORT_BATCH",
          targetId: prepared.batchId,
          description: `执行导入批次整批撤销：${prepared.fileName}`,
          afterData: {
            rollbackId: rollbackRecord.id,
            rollbackMode: prepared.mode,
            rollbackReason: executionReason,
            precheckSnapshot: prepared.precheck,
            executionSnapshot,
          },
        },
      });

      return {
        rollbackId: rollbackRecord.id,
        batchId: prepared.batchId,
        fileName: prepared.fileName,
        importKind: prepared.importKind,
        mode: prepared.mode,
        affectedCustomerIds: [...affectedCustomerIds],
        affectedLeadIds: [...affectedLeadIds],
        message:
          prepared.mode === "HARD_DELETE"
            ? `已对批次 ${prepared.fileName} 执行硬删除撤销。`
            : `已对批次 ${prepared.fileName} 执行审计保留撤销。`,
      };
    });
  } catch (error) {
    if (error instanceof LeadImportBatchRollbackBlockedError) {
      await createLeadImportBatchRollbackOperationLog({
        actorId: actor.id,
        batchId: input.batchId,
        action: "lead_import.batch_rollback.blocked",
        description: "导入批次整批撤销被阻断。",
        afterData: {
          rollbackMode: input.mode,
          rollbackReason: executionReason,
          precheckSnapshot: error.preview,
        },
      });
      throw new Error(error.message);
    }

    throw error;
  }
}
