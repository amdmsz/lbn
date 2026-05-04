"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import {
  canBatchManageCustomerTags,
  canBatchMoveCustomersToRecycleBin,
  canCreateCustomer,
  canTransferCustomerOwner,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildCustomerBatchActionError,
  buildCustomerBatchActionLimit,
  buildCustomerBatchActionSummary,
  buildCustomerBatchSelection,
  type CustomerBatchActionErrorCode,
  type CustomerBatchActionResult,
  type CustomerBatchBlockedReasonSummary,
  type CustomerBatchLimit,
  type CustomerBatchLimitExceeded,
  type CustomerBatchSelection,
  type CustomerBatchSelectionMode,
} from "@/lib/customers/batch-action-contract";
import { MAX_BATCH_CUSTOMER_ACTION_SIZE } from "@/lib/customers/metadata";
import {
  CUSTOMER_RECYCLE_REASON_OPTIONS,
  type CustomerRecycleReasonCode,
} from "@/lib/customers/recycle";
import {
  explainCustomerRecycleBlocker,
  explainCustomerRecycleErrorReason,
  type CustomerRecycleBlockedReasonSummary,
} from "@/lib/customers/recycle-blocker-explanation";
import {
  listFilteredCustomerCenterCustomerIds,
  listVisibleCustomerCenterCustomerIds,
} from "@/lib/customers/queries";
import {
  createOwnedCustomer,
  transferCustomerOwner,
  updateCustomerRemark,
} from "@/lib/customers/mutations";
import { assignCustomerTag } from "@/lib/master-data/mutations";
import { moveToRecycleBin } from "@/lib/recycle-bin/lifecycle";
import type { MoveToRecycleBinResult } from "@/lib/recycle-bin/types";

const batchAddCustomerTagSchema = z.object({
  selectionMode: z.enum(["manual", "filtered"]).default("manual"),
  customerIds: z.array(z.string().trim().min(1)).default([]),
  tagId: z.string().trim().min(1, "请选择要添加的标签。"),
});

const batchMoveCustomersToRecycleBinSchema = z.object({
  selectionMode: z.enum(["manual", "filtered"]).default("manual"),
  customerIds: z.array(z.string().trim().min(1)).default([]),
  reasonCode: z.string().trim().default("mistaken_creation"),
});

const batchTransferCustomerOwnerSchema = z.object({
  selectionMode: z.enum(["manual", "filtered"]).default("manual"),
  customerIds: z.array(z.string().trim().min(1)).default([]),
  targetOwnerId: z.string().trim().min(1, "请选择新的负责人。"),
  note: z.string().trim().max(500, "移交备注不能超过 500 个字符。").default(""),
});

const createOwnedCustomerActionSchema = z.object({
  name: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  province: z.string().trim().default(""),
  city: z.string().trim().default(""),
  district: z.string().trim().default(""),
  address: z.string().trim().default(""),
  remark: z.string().trim().default(""),
});

type ResolvedBatchCustomerSelection =
  | {
      status: "resolved";
      customerIds: string[];
      selection: CustomerBatchSelection;
    }
  | {
      status: "limit_exceeded";
      selection: CustomerBatchSelection;
      limitExceeded: CustomerBatchLimitExceeded;
    };

type BatchCustomerActionActor = Awaited<ReturnType<typeof getBatchCustomerActor>>;

const CUSTOMER_BATCH_ALREADY_LABELS = {
  tag: "已有标签",
  recycle: "已在回收站",
  transfer: "无需移交",
} as const;

export type BatchAddCustomerTagBlockedReason = CustomerBatchBlockedReasonSummary;
export type BatchMoveCustomersToRecycleBinBlockedReason =
  CustomerBatchBlockedReasonSummary;
export type BatchAddCustomerTagActionResult = CustomerBatchActionResult;
export type BatchMoveCustomersToRecycleBinActionResult = CustomerBatchActionResult;
export type BatchTransferCustomerOwnerActionResult = CustomerBatchActionResult;
export type CreateOwnedCustomerField = keyof z.output<typeof createOwnedCustomerActionSchema>;
export type CreateOwnedCustomerActionResult = {
  status: "success" | "error";
  message: string;
  customerId: string | null;
  fieldErrors: Partial<Record<CreateOwnedCustomerField, string>>;
};

export type UpdateCustomerRemarkActionResult = {
  status: "success" | "error";
  message: string;
};

const CUSTOMER_BATCH_ACTION_LIMIT = buildCustomerBatchActionLimit(
  MAX_BATCH_CUSTOMER_ACTION_SIZE,
);

function buildCreateOwnedCustomerFieldErrors(error: ZodError) {
  const fieldErrors: Partial<Record<CreateOwnedCustomerField, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (
      typeof field === "string" &&
      field in createOwnedCustomerActionSchema.shape &&
      !fieldErrors[field as CreateOwnedCustomerField]
    ) {
      fieldErrors[field as CreateOwnedCustomerField] = issue.message;
    }
  }

  return fieldErrors;
}

function buildBatchCustomerActionResult(input: {
  status: "success" | "error";
  message: string;
  skippedLabel: string;
  error?: {
    code: CustomerBatchActionErrorCode;
    message: string;
  } | null;
  limit?: CustomerBatchLimit | null;
  selection?: CustomerBatchSelection | null;
  limitExceeded?: CustomerBatchLimitExceeded | null;
  summary?: Partial<CustomerBatchActionResult["summary"]>;
  blockedReasonSummary?: CustomerBatchBlockedReasonSummary[];
}): CustomerBatchActionResult {
  return {
    status: input.status,
    message: input.message,
    error: input.error
      ? buildCustomerBatchActionError(input.error.code, input.error.message)
      : null,
    selection: input.selection ?? null,
    limit: input.limit ?? CUSTOMER_BATCH_ACTION_LIMIT,
    limitExceeded: input.limitExceeded ?? null,
    summary: buildCustomerBatchActionSummary(input.summary),
    skippedLabel: input.skippedLabel,
    blockedReasonSummary: input.blockedReasonSummary ?? [],
  };
}

function buildSimpleBlockedReasons(
  blockedReasonMap: Map<string, number>,
): CustomerBatchBlockedReasonSummary[] {
  return [...blockedReasonMap.entries()]
    .map(([reason, count]) => ({
      code: reason,
      label: reason,
      count,
      group: "other" as const,
      groupLabel: "其他阻断",
      groupDescription: "保留服务端返回的原始错误，不在批量标签结果里重写业务规则。",
      description: reason,
      suggestedAction: "结合当前错误提示继续处理。",
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildCustomerRecycleBlockedReasonSummaryList(
  blockedReasons: CustomerRecycleBlockedReasonSummary[],
): CustomerBatchBlockedReasonSummary[] {
  const summaryMap = new Map<string, CustomerBatchBlockedReasonSummary>();

  for (const item of blockedReasons) {
    const existing = summaryMap.get(item.code);

    if (existing) {
      existing.count += item.count;
      continue;
    }

    summaryMap.set(item.code, { ...item });
  }

  return [...summaryMap.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
}

function buildEmptyBatchTagResult(
  message: string,
  code: CustomerBatchActionErrorCode = "unknown",
): BatchAddCustomerTagActionResult {
  return buildBatchCustomerActionResult({
    status: "error",
    message,
    error: { code, message },
    skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.tag,
  });
}

function buildBatchTagLimitExceededResult(input: {
  selection: CustomerBatchSelection;
  limitExceeded: CustomerBatchLimitExceeded;
}): BatchAddCustomerTagActionResult {
  const message = `当前筛选结果共 ${input.limitExceeded.actualCount} 位客户，超过单次 ${input.limitExceeded.maxCount} 位上限，请先缩小筛选范围后再批量添加标签。`;

  return buildBatchCustomerActionResult({
    status: "error",
    message,
    error: {
      code: "limit_exceeded",
      message,
    },
    selection: input.selection,
    limitExceeded: input.limitExceeded,
    skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.tag,
  });
}

function buildBatchRecycleEmptyResult(
  message: string,
  code: CustomerBatchActionErrorCode = "unknown",
): BatchMoveCustomersToRecycleBinActionResult {
  return buildBatchCustomerActionResult({
    status: "error",
    message,
    error: { code, message },
    skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.recycle,
  });
}

function buildBatchRecycleLimitExceededResult(input: {
  selection: CustomerBatchSelection;
  limitExceeded: CustomerBatchLimitExceeded;
}): BatchMoveCustomersToRecycleBinActionResult {
  const message = `当前筛选结果共 ${input.limitExceeded.actualCount} 位客户，超过单次 ${input.limitExceeded.maxCount} 位上限，请先缩小筛选范围后再批量移入回收站。`;

  return buildBatchCustomerActionResult({
    status: "error",
    message,
    error: {
      code: "limit_exceeded",
      message,
    },
    selection: input.selection,
    limitExceeded: input.limitExceeded,
    skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.recycle,
  });
}

function buildBatchTransferEmptyResult(
  message: string,
  code: CustomerBatchActionErrorCode = "unknown",
): BatchTransferCustomerOwnerActionResult {
  return buildBatchCustomerActionResult({
    status: "error",
    message,
    error: { code, message },
    skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.transfer,
  });
}

function buildBatchTransferLimitExceededResult(input: {
  selection: CustomerBatchSelection;
  limitExceeded: CustomerBatchLimitExceeded;
}): BatchTransferCustomerOwnerActionResult {
  const message = `当前筛选结果共 ${input.limitExceeded.actualCount} 位客户，超过单次 ${input.limitExceeded.maxCount} 位上限，请先缩小筛选范围后再批量移交负责人。`;

  return buildBatchCustomerActionResult({
    status: "error",
    message,
    error: {
      code: "limit_exceeded",
      message,
    },
    selection: input.selection,
    limitExceeded: input.limitExceeded,
    skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.transfer,
  });
}

function getCustomerRecycleReasonCode(rawValue: string): CustomerRecycleReasonCode {
  return CUSTOMER_RECYCLE_REASON_OPTIONS.some((option) => option.value === rawValue)
    ? (rawValue as CustomerRecycleReasonCode)
    : "mistaken_creation";
}

function buildBatchRecycleBlockedReason(
  result: Extract<MoveToRecycleBinResult, { status: "blocked" }>,
) {
  const blocker = result.guard.blockers[0];

  if (!blocker) {
    return result.message;
  }

  if (blocker.group === "ownership_lifecycle") {
    return `应改走 public-pool（${blocker.name}）`;
  }

  if (blocker.group === "customer_lifecycle") {
    return `应改走 DORMANT / LOST / BLACKLISTED（${blocker.name}）`;
  }

  if (blocker.group === "import_audit") {
    return `应改走 merge / import 审计治理（${blocker.name}）`;
  }

  if (blocker.group === "transaction_chain") {
    return `应保留客户并在订单 / 支付链治理（${blocker.name}）`;
  }

  if (blocker.group === "fulfillment_chain") {
    return `应保留客户并在订单 / 支付 / 履约链治理（${blocker.name}）`;
  }

  if (blocker.group === "sales_engagement") {
    return `应保留客户并改走状态 / 公海治理（${blocker.name}）`;
  }

  if (blocker.group === "object_state") {
    return `客户不存在或已不在当前客户范围（${blocker.name}）`;
  }

  return blocker.suggestedAction?.trim() || result.message;
}

function getBatchRecycleErrorReason(error: unknown) {
  if (!(error instanceof Error)) {
    return "批量移入回收站失败，请稍后重试。";
  }

  if (error.message.includes("不在你的客户范围")) {
    return "客户不存在或已不在当前客户范围";
  }

  return error.message;
}

function buildRichBatchRecycleBlockedReason(
  result: Extract<MoveToRecycleBinResult, { status: "blocked" }>,
): CustomerBatchBlockedReasonSummary {
  const legacyReason = buildBatchRecycleBlockedReason(result);
  const blocker = result.guard.blockers[0];

  if (!blocker) {
    return explainCustomerRecycleErrorReason({
      code: "recycle_blocked_without_blocker",
      message: typeof legacyReason === "string" ? legacyReason : result.message,
    });
  }

  return explainCustomerRecycleBlocker(blocker);
}

function buildRichBatchRecycleErrorReason(
  error: unknown,
): CustomerBatchBlockedReasonSummary {
  const legacyReason = getBatchRecycleErrorReason(error);

  if (error instanceof Error && error.message.includes("涓嶅湪浣犵殑瀹㈡埛鑼冨洿")) {
    return explainCustomerRecycleErrorReason({
      code: "customer_scope_missing",
      message: "客户不存在或已不在当前客户范围。",
    });
  }

  return explainCustomerRecycleErrorReason({
    code: "recycle_unknown",
    message: typeof legacyReason === "string" ? legacyReason : "批量移入回收站失败，请稍后重试。",
  });
}

function buildBatchTagMessage(summary: {
  successCount: number;
  skippedCount: number;
  blockedCount: number;
}) {
  if (summary.successCount > 0 && (summary.skippedCount > 0 || summary.blockedCount > 0)) {
    return "已部分完成批量添加标签。";
  }

  if (summary.successCount > 0) {
    return "已完成批量添加标签。";
  }

  if (summary.skippedCount > 0 && summary.blockedCount > 0) {
    return "本次没有新增标签，部分客户已存在该标签，其余被阻断。";
  }

  if (summary.skippedCount > 0) {
    return "所选客户已存在该标签，无需重复添加。";
  }

  return "所选客户均未添加标签。";
}

function buildBatchRecycleMessage(summary: {
  successCount: number;
  skippedCount: number;
  blockedCount: number;
}) {
  if (summary.successCount > 0 && (summary.skippedCount > 0 || summary.blockedCount > 0)) {
    return "已部分完成批量移入回收站。";
  }

  if (summary.successCount > 0) {
    return "已完成批量移入回收站。";
  }

  if (summary.skippedCount > 0 && summary.blockedCount > 0) {
    return "本次没有新增回收站条目，部分客户已在回收站，其余被阻断。";
  }

  if (summary.skippedCount > 0) {
    return "所选客户已在回收站中，无需重复处理。";
  }

  return "所选客户均未移入回收站。";
}

function buildBatchTransferMessage(summary: {
  successCount: number;
  skippedCount: number;
  blockedCount: number;
}) {
  if (summary.successCount > 0 && (summary.skippedCount > 0 || summary.blockedCount > 0)) {
    return "已部分完成批量移交负责人。";
  }

  if (summary.successCount > 0) {
    return "已完成批量移交负责人。";
  }

  if (summary.skippedCount > 0 && summary.blockedCount > 0) {
    return "本次没有新增移交，部分客户已由该负责人承接，其余被阻断。";
  }

  if (summary.skippedCount > 0) {
    return "所选客户已由该负责人承接，无需重复移交。";
  }

  return "所选客户均未移交负责人。";
}

function isAlreadyAssignedToTargetOwnerError(error: unknown) {
  return error instanceof Error && error.message.includes("已由该负责人承接");
}

function getCustomerFilterParamsFromFormData(formData: FormData) {
  return {
    queue: String(formData.get("queue") ?? ""),
    executionClasses: formData
      .getAll("executionClasses")
      .map((value) => String(value).trim()),
    teamId: String(formData.get("teamId") ?? "").trim(),
    salesId: String(formData.get("salesId") ?? "").trim(),
    search: String(formData.get("search") ?? "").trim(),
    productKeys: formData.getAll("productKeys").map((value) => String(value).trim()),
    productKeyword: String(formData.get("productKeyword") ?? "").trim(),
    tagIds: formData.getAll("tagIds").map((value) => String(value).trim()),
    assignedFrom: String(formData.get("assignedFrom") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
    page: String(formData.get("page") ?? "1").trim(),
    pageSize: String(formData.get("pageSize") ?? "").trim(),
  };
}

async function resolveBatchCustomerSelection(input: {
  actor: BatchCustomerActionActor;
  selectionMode: CustomerBatchSelectionMode;
  formData: FormData;
  customerIds: string[];
  filteredEmptyMessage: string;
  staleSelectionMessage: string;
}): Promise<ResolvedBatchCustomerSelection> {
  if (input.selectionMode === "filtered") {
    const matchedCustomerIds = await listFilteredCustomerCenterCustomerIds(
      {
        id: input.actor.id,
        role: input.actor.role,
      },
      getCustomerFilterParamsFromFormData(input.formData),
    );
    const selection = buildCustomerBatchSelection("filtered", matchedCustomerIds.length);

    if (matchedCustomerIds.length === 0) {
      throw buildCustomerBatchActionError("filtered_empty", input.filteredEmptyMessage);
    }

    if (matchedCustomerIds.length > MAX_BATCH_CUSTOMER_ACTION_SIZE) {
      return {
        status: "limit_exceeded",
        selection,
        limitExceeded: {
          maxCount: MAX_BATCH_CUSTOMER_ACTION_SIZE,
          actualCount: matchedCustomerIds.length,
        },
      };
    }

    return {
      status: "resolved",
      customerIds: matchedCustomerIds,
      selection,
    };
  }

  const uniqueCustomerIds = [...new Set(input.customerIds)];

  if (uniqueCustomerIds.length === 0) {
    throw buildCustomerBatchActionError("empty_selection", "请先选择客户。");
  }

  const visibleCustomerIds = await listVisibleCustomerCenterCustomerIds(
    {
      id: input.actor.id,
      role: input.actor.role,
    },
    uniqueCustomerIds,
  );

  if (visibleCustomerIds.length !== uniqueCustomerIds.length) {
    throw buildCustomerBatchActionError("stale_selection", input.staleSelectionMessage);
  }

  return {
    status: "resolved",
    customerIds: uniqueCustomerIds,
    selection: buildCustomerBatchSelection("manual", uniqueCustomerIds.length),
  };
}

async function getBatchCustomerActor() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("登录已失效，请重新登录后再试。");
  }

  return {
    id: session.user.id,
    role: session.user.role,
    teamId: session.user.teamId,
    permissionCodes: session.user.permissionCodes,
  };
}

export async function createOwnedCustomerAction(
  formData: FormData,
): Promise<CreateOwnedCustomerActionResult> {
  try {
    const session = await auth();

    if (!session?.user) {
      return {
        status: "error",
        message: "登录已失效，请重新登录后再试。",
        customerId: null,
        fieldErrors: {},
      };
    }

    if (!canCreateCustomer(session.user.role)) {
      return {
        status: "error",
        message: "当前角色没有手动新增客户的权限。",
        customerId: null,
        fieldErrors: {},
      };
    }

    const parsed = createOwnedCustomerActionSchema.parse({
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      province: String(formData.get("province") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      district: String(formData.get("district") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      remark: String(formData.get("remark") ?? "").trim(),
    });

    const result = await createOwnedCustomer(
      {
        id: session.user.id,
        role: session.user.role,
      },
      parsed,
    );

    revalidatePath("/customers");
    revalidatePath(`/customers/${result.customerId}`);

    return {
      status: "success",
      message: result.description,
      customerId: result.customerId,
      fieldErrors: {},
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "error",
        message: error.issues[0]?.message ?? "提交数据不完整，请检查后重试。",
        customerId: null,
        fieldErrors: buildCreateOwnedCustomerFieldErrors(error),
      };
    }

    return {
      status: "error",
      message: error instanceof Error ? error.message : "新增客户失败，请稍后重试。",
      customerId: null,
      fieldErrors: {},
    };
  }
}

export async function updateCustomerRemarkAction(
  formData: FormData,
): Promise<UpdateCustomerRemarkActionResult> {
  try {
    const session = await auth();

    if (!session?.user) {
      return {
        status: "error",
        message: "登录已失效，请重新登录后再试。",
      };
    }

    const customerId = String(formData.get("customerId") ?? "").trim();
    const remark = String(formData.get("remark") ?? "");

    const result = await updateCustomerRemark(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        customerId,
        remark,
      },
    );

    revalidatePath("/customers");
    revalidatePath(`/customers/${result.customerId}`);

    return {
      status: "success",
      message: result.description,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "更新备注失败，请稍后重试。",
    };
  }
}

export async function batchAddCustomerTagAction(
  formData: FormData,
): Promise<BatchAddCustomerTagActionResult> {
  try {
    const actor = await getBatchCustomerActor();

    if (!canBatchManageCustomerTags(actor.role)) {
      return buildEmptyBatchTagResult("当前角色没有批量添加客户标签的权限。", "forbidden");
    }

    const parsed = batchAddCustomerTagSchema.safeParse({
      selectionMode: String(formData.get("selectionMode") ?? "manual"),
      customerIds: formData.getAll("customerIds").map((value) => String(value).trim()),
      tagId: String(formData.get("tagId") ?? "").trim(),
    });

    if (!parsed.success) {
      return buildEmptyBatchTagResult(
        parsed.error.issues[0]?.message ?? "提交数据不完整，无法执行批量添加标签。",
        "validation_error",
      );
    }

    const resolvedSelection = await resolveBatchCustomerSelection({
      actor,
      selectionMode: parsed.data.selectionMode,
      formData,
      customerIds: parsed.data.customerIds,
      filteredEmptyMessage: "当前筛选结果下没有可批量添加标签的客户。",
      staleSelectionMessage: "部分客户已不在当前客户工作台范围，请刷新后重试。",
    });

    if (resolvedSelection.status === "limit_exceeded") {
      return buildBatchTagLimitExceededResult(resolvedSelection);
    }

    const { customerIds, selection } = resolvedSelection;
    let successCount = 0;
    let skippedCount = 0;
    let blockedCount = 0;
    const blockedReasonMap = new Map<string, number>();

    for (const customerId of customerIds) {
      try {
        const result = await assignCustomerTag(actor, {
          customerId,
          tagId: parsed.data.tagId,
        });

        if (result.status === "created") {
          successCount += 1;
        } else {
          skippedCount += 1;
        }
      } catch (error) {
        blockedCount += 1;
        const reason =
          error instanceof Error ? error.message : "批量添加标签失败，请稍后重试。";
        blockedReasonMap.set(reason, (blockedReasonMap.get(reason) ?? 0) + 1);
      }
    }

    if (successCount > 0) {
      revalidatePath("/customers");
    }

    return buildBatchCustomerActionResult({
      status: successCount > 0 || skippedCount > 0 ? "success" : "error",
      message: buildBatchTagMessage({
        successCount,
        skippedCount,
        blockedCount,
      }),
      selection,
      skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.tag,
      summary: {
        totalCount: customerIds.length,
        successCount,
        skippedCount,
        blockedCount,
      },
      blockedReasonSummary: buildSimpleBlockedReasons(blockedReasonMap),
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string"
    ) {
      return buildEmptyBatchTagResult(error.message, error.code as CustomerBatchActionErrorCode);
    }

    return buildEmptyBatchTagResult(
      error instanceof Error ? error.message : "批量添加标签失败，请稍后重试。",
    );
  }
}

export async function batchTransferCustomerOwnerAction(
  formData: FormData,
): Promise<BatchTransferCustomerOwnerActionResult> {
  try {
    const actor = await getBatchCustomerActor();

    if (!canTransferCustomerOwner(actor.role)) {
      return buildBatchTransferEmptyResult(
        "当前角色没有批量移交客户负责人的权限。",
        "forbidden",
      );
    }

    const parsed = batchTransferCustomerOwnerSchema.safeParse({
      selectionMode: String(formData.get("selectionMode") ?? "manual"),
      customerIds: formData.getAll("customerIds").map((value) => String(value).trim()),
      targetOwnerId: String(formData.get("targetOwnerId") ?? "").trim(),
      note: String(formData.get("note") ?? "").trim(),
    });

    if (!parsed.success) {
      return buildBatchTransferEmptyResult(
        parsed.error.issues[0]?.message ?? "提交数据不完整，无法执行批量移交负责人。",
        "validation_error",
      );
    }

    const resolvedSelection = await resolveBatchCustomerSelection({
      actor,
      selectionMode: parsed.data.selectionMode,
      formData,
      customerIds: parsed.data.customerIds,
      filteredEmptyMessage: "当前筛选结果下没有可移交负责人的客户。",
      staleSelectionMessage: "部分客户已不在当前客户工作台范围，请刷新后重试。",
    });

    if (resolvedSelection.status === "limit_exceeded") {
      return buildBatchTransferLimitExceededResult(resolvedSelection);
    }

    const { customerIds, selection } = resolvedSelection;
    let successCount = 0;
    let skippedCount = 0;
    let blockedCount = 0;
    const blockedReasonMap = new Map<string, number>();

    for (const customerId of customerIds) {
      try {
        await transferCustomerOwner(
          {
            id: actor.id,
            role: actor.role,
            teamId: actor.teamId,
          },
          {
            customerId,
            targetOwnerId: parsed.data.targetOwnerId,
            note: parsed.data.note,
          },
          {
            source: "batch",
            selectionMode: parsed.data.selectionMode,
            selectedCount: customerIds.length,
          },
        );
        successCount += 1;
      } catch (error) {
        if (isAlreadyAssignedToTargetOwnerError(error)) {
          skippedCount += 1;
          continue;
        }

        blockedCount += 1;
        const reason =
          error instanceof Error ? error.message : "批量移交负责人失败，请稍后重试。";
        blockedReasonMap.set(reason, (blockedReasonMap.get(reason) ?? 0) + 1);
      }
    }

    if (successCount > 0 || skippedCount > 0) {
      revalidatePath("/customers");
      revalidatePath("/dashboard");
    }

    return buildBatchCustomerActionResult({
      status: successCount > 0 || skippedCount > 0 ? "success" : "error",
      message: buildBatchTransferMessage({
        successCount,
        skippedCount,
        blockedCount,
      }),
      selection,
      skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.transfer,
      summary: {
        totalCount: customerIds.length,
        successCount,
        skippedCount,
        blockedCount,
      },
      blockedReasonSummary: buildSimpleBlockedReasons(blockedReasonMap),
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string"
    ) {
      return buildBatchTransferEmptyResult(
        error.message,
        error.code as CustomerBatchActionErrorCode,
      );
    }

    return buildBatchTransferEmptyResult(
      error instanceof Error ? error.message : "批量移交负责人失败，请稍后重试。",
    );
  }
}

export async function batchMoveCustomersToRecycleBinAction(
  formData: FormData,
): Promise<BatchMoveCustomersToRecycleBinActionResult> {
  try {
    const actor = await getBatchCustomerActor();

    if (!canBatchMoveCustomersToRecycleBin(actor.role)) {
      return buildBatchRecycleEmptyResult(
        "当前角色没有批量移入客户回收站的权限。",
        "forbidden",
      );
    }

    const parsed = batchMoveCustomersToRecycleBinSchema.safeParse({
      selectionMode: String(formData.get("selectionMode") ?? "manual"),
      customerIds: formData.getAll("customerIds").map((value) => String(value).trim()),
      reasonCode: String(formData.get("reasonCode") ?? "mistaken_creation").trim(),
    });

    if (!parsed.success) {
      return buildBatchRecycleEmptyResult(
        parsed.error.issues[0]?.message ?? "提交数据不完整，无法执行批量移入回收站。",
        "validation_error",
      );
    }

    const resolvedSelection = await resolveBatchCustomerSelection({
      actor,
      selectionMode: parsed.data.selectionMode,
      formData,
      customerIds: parsed.data.customerIds,
      filteredEmptyMessage: "当前筛选结果下没有可移入回收站的客户。",
      staleSelectionMessage: "部分客户已不在当前客户工作台范围，请刷新后重试。",
    });

    if (resolvedSelection.status === "limit_exceeded") {
      return buildBatchRecycleLimitExceededResult(resolvedSelection);
    }

    const { customerIds, selection } = resolvedSelection;
    const reasonCode = getCustomerRecycleReasonCode(parsed.data.reasonCode);
    let successCount = 0;
    let skippedCount = 0;
    let blockedCount = 0;
    const blockedReasons: CustomerRecycleBlockedReasonSummary[] = [];

    for (const customerId of customerIds) {
      try {
        const result = await moveToRecycleBin(actor, {
          targetType: "CUSTOMER",
          targetId: customerId,
          reasonCode,
        });

        if (result.status === "created") {
          successCount += 1;
          continue;
        }

        if (result.status === "already_in_recycle_bin") {
          skippedCount += 1;
          continue;
        }

        blockedCount += 1;
        blockedReasons.push(buildRichBatchRecycleBlockedReason(result));
      } catch (error) {
        blockedCount += 1;
        blockedReasons.push(buildRichBatchRecycleErrorReason(error));
      }
    }

    if (successCount > 0 || skippedCount > 0) {
      revalidatePath("/customers");
      revalidatePath("/recycle-bin");
    }

    return buildBatchCustomerActionResult({
      status: successCount > 0 || skippedCount > 0 ? "success" : "error",
      message: buildBatchRecycleMessage({
        successCount,
        skippedCount,
        blockedCount,
      }),
      selection,
      skippedLabel: CUSTOMER_BATCH_ALREADY_LABELS.recycle,
      summary: {
        totalCount: customerIds.length,
        successCount,
        skippedCount,
        blockedCount,
      },
      blockedReasonSummary: buildCustomerRecycleBlockedReasonSummaryList(blockedReasons),
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string"
    ) {
      return buildBatchRecycleEmptyResult(
        error.message,
        error.code as CustomerBatchActionErrorCode,
      );
    }

    return buildBatchRecycleEmptyResult(getBatchRecycleErrorReason(error));
  }
}
