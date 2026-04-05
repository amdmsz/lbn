"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canClaimPublicPoolCustomer,
  canManageCustomerPublicPool,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  applyAutoAssign,
  previewAutoAssign,
  type CustomerPublicPoolAutoAssignApplyResult,
  type CustomerPublicPoolAutoAssignPreviewResult,
} from "@/lib/customers/public-pool-auto-assign";
import {
  assignCustomersToSales,
  claimPublicPoolCustomers,
  releaseCustomersToPublicPool,
} from "@/lib/customers/ownership";
import {
  applyInactiveRecycle,
  applyOwnerExitRecycle,
  previewInactiveRecycle,
  previewOwnerExitRecycle,
  type CustomerPublicPoolRecycleApplyResult,
  type CustomerPublicPoolRecyclePreviewResult,
} from "@/lib/customers/public-pool-recycle";
import { PUBLIC_POOL_REASON_VALUES } from "@/lib/customers/public-pool-metadata";

const selectionSchema = z.object({
  customerIds: z.array(z.string().trim().min(1)).min(1, "请选择客户。"),
  note: z.string().trim().max(500).default(""),
});

const assignSchema = selectionSchema.extend({
  targetSalesId: z.string().trim().min(1, "请选择指派销售。"),
});

const releaseSchema = selectionSchema.extend({
  reason: z.enum(PUBLIC_POOL_REASON_VALUES),
});

const recycleAutomationSchema = z.object({
  teamId: z.string().trim().default(""),
  note: z.string().trim().max(500).default(""),
});

const autoAssignSchema = z.object({
  teamId: z.string().trim().default(""),
  note: z.string().trim().max(500).default(""),
});

export type CustomerPublicPoolActionResult = {
  status: "success" | "error";
  message: string;
  successCount: number;
  skippedCount: number;
};

export type CustomerPublicPoolRecyclePreviewActionResult = {
  status: "success" | "error";
  message: string;
  preview: CustomerPublicPoolRecyclePreviewResult | null;
};

export type CustomerPublicPoolRecycleApplyActionResult = {
  status: "success" | "error";
  message: string;
  result: CustomerPublicPoolRecycleApplyResult | null;
};

export type CustomerPublicPoolAutoAssignPreviewActionResult = {
  status: "success" | "error";
  message: string;
  preview: CustomerPublicPoolAutoAssignPreviewResult | null;
};

export type CustomerPublicPoolAutoAssignApplyActionResult = {
  status: "success" | "error";
  message: string;
  result: CustomerPublicPoolAutoAssignApplyResult | null;
};

function buildResultMessage(
  successCount: number,
  skippedCount: number,
  successLabel: string,
  errorLabel: string,
) {
  if (successCount === 0) {
    return `${errorLabel}，没有客户完成处理。`;
  }

  if (skippedCount === 0) {
    return `${successLabel} ${successCount} 位客户。`;
  }

  return `${successLabel} ${successCount} 位客户，跳过 ${skippedCount} 位。`;
}

function revalidateCustomerPublicPool(customerIds: string[]) {
  revalidatePath("/customers");
  revalidatePath("/customers/public-pool");
  revalidatePath("/customers/public-pool/settings");
  revalidatePath("/customers/public-pool/reports");
  revalidatePath("/dashboard");

  for (const customerId of customerIds) {
    revalidatePath(`/customers/${customerId}`);
  }
}

function buildRecyclePreviewMessage(
  label: string,
  preview: CustomerPublicPoolRecyclePreviewResult,
) {
  const scopeLabel = preview.scope.teamName ?? "全平台";

  if (preview.counts.eligible === 0) {
    return `${label}预览完成，${scopeLabel}当前没有命中客户。`;
  }

  if (preview.counts.blockedByClaimLock > 0) {
    return `${label}预览完成，命中 ${preview.counts.eligible} 位客户，另有 ${preview.counts.blockedByClaimLock} 位被保护期拦截。`;
  }

  return `${label}预览完成，命中 ${preview.counts.eligible} 位客户。`;
}

function buildRecycleApplyMessage(
  label: string,
  result: CustomerPublicPoolRecycleApplyResult,
) {
  if (result.counts.success === 0) {
    return `${label}执行完成，没有客户被回收到公海。`;
  }

  if (result.counts.skipped === 0 && result.counts.failed === 0) {
    return `${label}执行完成，已回收 ${result.counts.success} 位客户。`;
  }

  return `${label}执行完成，已回收 ${result.counts.success} 位客户，跳过 ${result.counts.skipped} 位，失败 ${result.counts.failed} 位。`;
}

function buildAutoAssignPreviewMessage(preview: CustomerPublicPoolAutoAssignPreviewResult) {
  if (preview.blockingIssue) {
    return preview.blockingIssue.detail;
  }

  if (preview.counts.assignableCustomers === 0) {
    return "自动分配预览完成，当前没有可分配客户。";
  }

  if (preview.counts.unassignedCustomers > 0) {
    return `自动分配预览完成，可分配 ${preview.counts.assignableCustomers} 位客户，另有 ${preview.counts.unassignedCustomers} 位因规则限制暂不分配。`;
  }

  return `自动分配预览完成，可分配 ${preview.counts.assignableCustomers} 位客户。`;
}

function buildAutoAssignApplyMessage(result: CustomerPublicPoolAutoAssignApplyResult) {
  if (result.blockingIssue) {
    return result.blockingIssue.detail;
  }

  if (result.counts.success === 0) {
    return "自动分配执行完成，没有客户成功分配。";
  }

  if (result.counts.skipped === 0 && result.counts.failed === 0) {
    return `自动分配执行完成，已分配 ${result.counts.success} 位客户。`;
  }

  return `自动分配执行完成，已分配 ${result.counts.success} 位客户，跳过 ${result.counts.skipped} 位，失败 ${result.counts.failed} 位。`;
}

async function getManagedSessionUser() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return session.user;
}

export async function claimCustomerPublicPoolAction(
  input: z.input<typeof selectionSchema>,
): Promise<CustomerPublicPoolActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  if (!canClaimPublicPoolCustomer(user.role)) {
    return {
      status: "error",
      message: "当前角色不能认领公海客户。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  const parsed = selectionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  const result = await claimPublicPoolCustomers(user.id, parsed.data);
  revalidateCustomerPublicPool(parsed.data.customerIds);

  return {
    status: result.successCount > 0 ? "success" : "error",
    message: buildResultMessage(result.successCount, result.skipped.length, "已认领", "认领失败"),
    successCount: result.successCount,
    skippedCount: result.skipped.length,
  };
}

export async function assignCustomerPublicPoolAction(
  input: z.input<typeof assignSchema>,
): Promise<CustomerPublicPoolActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  if (!(canManageCustomerPublicPool(user.role) || user.role === "SALES")) {
    return {
      status: "error",
      message: "当前角色不能指派公海客户。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  const parsed = assignSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  const result = await assignCustomersToSales(user.id, parsed.data);
  revalidateCustomerPublicPool(parsed.data.customerIds);

  return {
    status: result.successCount > 0 ? "success" : "error",
    message: buildResultMessage(result.successCount, result.skipped.length, "已指派", "指派失败"),
    successCount: result.successCount,
    skippedCount: result.skipped.length,
  };
}

export async function releaseCustomerToPublicPoolAction(
  input: z.input<typeof releaseSchema>,
): Promise<CustomerPublicPoolActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  if (!canManageCustomerPublicPool(user.role)) {
    return {
      status: "error",
      message: "当前角色不能回收客户到公海。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  const parsed = releaseSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      successCount: 0,
      skippedCount: 0,
    };
  }

  const result = await releaseCustomersToPublicPool(user.id, parsed.data);
  revalidateCustomerPublicPool(parsed.data.customerIds);

  return {
    status: result.successCount > 0 ? "success" : "error",
    message: buildResultMessage(
      result.successCount,
      result.skipped.length,
      parsed.data.reason === "MANUAL_RELEASE" ? "已释放到公海" : "已批量回收",
      "回收失败",
    ),
    successCount: result.successCount,
    skippedCount: result.skipped.length,
  };
}

export async function previewInactiveRecycleAction(
  input: z.input<typeof recycleAutomationSchema>,
): Promise<CustomerPublicPoolRecyclePreviewActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      preview: null,
    };
  }

  if (!canManageCustomerPublicPool(user.role)) {
    return {
      status: "error",
      message: "当前角色不能预览自动回收。",
      preview: null,
    };
  }

  const parsed = recycleAutomationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      preview: null,
    };
  }

  try {
    const preview = await previewInactiveRecycle({
      actorId: user.id,
      teamId: parsed.data.teamId,
    });

    return {
      status: "success",
      message: buildRecyclePreviewMessage("自动回收", preview),
      preview,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "自动回收预览失败。",
      preview: null,
    };
  }
}

export async function applyInactiveRecycleAction(
  input: z.input<typeof recycleAutomationSchema>,
): Promise<CustomerPublicPoolRecycleApplyActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      result: null,
    };
  }

  if (!canManageCustomerPublicPool(user.role)) {
    return {
      status: "error",
      message: "当前角色不能执行自动回收。",
      result: null,
    };
  }

  const parsed = recycleAutomationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      result: null,
    };
  }

  try {
    const result = await applyInactiveRecycle({
      actorId: user.id,
      teamId: parsed.data.teamId,
      note: parsed.data.note,
    });
    revalidateCustomerPublicPool(result.appliedCustomerIds);

    return {
      status: result.counts.success > 0 ? "success" : "error",
      message: buildRecycleApplyMessage("自动回收", result),
      result,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "自动回收执行失败。",
      result: null,
    };
  }
}

export async function previewOwnerExitRecycleAction(
  input: z.input<typeof recycleAutomationSchema>,
): Promise<CustomerPublicPoolRecyclePreviewActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      preview: null,
    };
  }

  if (!canManageCustomerPublicPool(user.role)) {
    return {
      status: "error",
      message: "当前角色不能预览离职回收。",
      preview: null,
    };
  }

  const parsed = recycleAutomationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      preview: null,
    };
  }

  try {
    const preview = await previewOwnerExitRecycle({
      actorId: user.id,
      teamId: parsed.data.teamId,
    });

    return {
      status: "success",
      message: buildRecyclePreviewMessage("离职回收", preview),
      preview,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "离职回收预览失败。",
      preview: null,
    };
  }
}

export async function applyOwnerExitRecycleAction(
  input: z.input<typeof recycleAutomationSchema>,
): Promise<CustomerPublicPoolRecycleApplyActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      result: null,
    };
  }

  if (!canManageCustomerPublicPool(user.role)) {
    return {
      status: "error",
      message: "当前角色不能执行离职回收。",
      result: null,
    };
  }

  const parsed = recycleAutomationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      result: null,
    };
  }

  try {
    const result = await applyOwnerExitRecycle({
      actorId: user.id,
      teamId: parsed.data.teamId,
      note: parsed.data.note,
    });
    revalidateCustomerPublicPool(result.appliedCustomerIds);

    return {
      status: result.counts.success > 0 ? "success" : "error",
      message: buildRecycleApplyMessage("离职回收", result),
      result,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "离职回收执行失败。",
      result: null,
    };
  }
}

export async function previewAutoAssignAction(
  input: z.input<typeof autoAssignSchema>,
): Promise<CustomerPublicPoolAutoAssignPreviewActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      preview: null,
    };
  }

  if (!canManageCustomerPublicPool(user.role)) {
    return {
      status: "error",
      message: "当前角色不能预览自动分配。",
      preview: null,
    };
  }

  const parsed = autoAssignSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      preview: null,
    };
  }

  try {
    const preview = await previewAutoAssign({
      actorId: user.id,
      teamId: parsed.data.teamId,
    });

    return {
      status: preview.blockingIssue ? "error" : "success",
      message: buildAutoAssignPreviewMessage(preview),
      preview,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "自动分配预览失败。",
      preview: null,
    };
  }
}

export async function applyAutoAssignAction(
  input: z.input<typeof autoAssignSchema>,
): Promise<CustomerPublicPoolAutoAssignApplyActionResult> {
  const user = await getManagedSessionUser();

  if (!user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      result: null,
    };
  }

  if (!canManageCustomerPublicPool(user.role)) {
    return {
      status: "error",
      message: "当前角色不能执行自动分配。",
      result: null,
    };
  }

  const parsed = autoAssignSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      result: null,
    };
  }

  try {
    const result = await applyAutoAssign({
      actorId: user.id,
      teamId: parsed.data.teamId,
      note: parsed.data.note,
    });
    revalidateCustomerPublicPool(result.appliedCustomerIds);

    return {
      status:
        !result.blockingIssue && result.counts.success > 0 ? "success" : "error",
      message: buildAutoAssignApplyMessage(result),
      result,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "自动分配执行失败。",
      result: null,
    };
  }
}
