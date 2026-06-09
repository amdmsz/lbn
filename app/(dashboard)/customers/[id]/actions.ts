"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import {
  appendRedirectSearchParams,
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
  sanitizeRedirectTarget,
} from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  CUSTOMER_RECYCLE_REASON_OPTIONS,
  type CustomerRecycleReasonCode,
} from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import {
  transferCustomerOwner,
  updateCustomerProfile,
} from "@/lib/customers/mutations";
import {
  buildCustomerFinalizePreview,
} from "@/lib/recycle-bin/customer-adapter";
import {
  deleteImportedCustomersDirect,
  requestImportedCustomerDeletion,
  reviewImportedCustomerDeletion,
} from "@/lib/customers/imported-customer-deletion";
import { forceHardDeleteCustomer } from "@/lib/customers/force-delete";
import { moveToRecycleBin } from "@/lib/recycle-bin/lifecycle";
import type {
  MoveToRecycleBinResult,
  RecycleFinalizePreview,
} from "@/lib/recycle-bin/types";
import {
  saveTradeOrderDraft,
  submitTradeOrderForReview,
} from "@/lib/trade-orders/mutations";

const importedCustomerDeletionSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户 ID"),
  reason: z.string().trim().min(1, "请填写原因").max(500, "原因不能超过 500 字"),
});

const importedCustomerDeletionReviewSchema = z.object({
  requestId: z.string().trim().min(1, "缺少删除申请 ID"),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500, "原因不能超过 500 字").optional(),
});

const forceHardDeleteCustomerSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户 ID"),
  confirmation: z.string().trim().min(1, "请输入客户姓名或手机号确认"),
  reason: z.string().trim().min(1, "请填写强制硬删除原因").max(500, "原因不能超过 500 字"),
  // 同时物理清理关联 Lead 行 — 用于 "重新导入此 phone" 场景, 避免旧 Lead
  // 残骸命中导入 dedup. 默认 false 保持原 detach 行为.
  purgeAttachedLeads: z.boolean().optional(),
});

export type ImportedCustomerDeletionActionResult = {
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
};

export type ForceHardDeleteCustomerActionResult = {
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
};

export type CustomerRecycleActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: MoveToRecycleBinResult["status"];
  guard?: MoveToRecycleBinResult["guard"];
  finalizePreview?: RecycleFinalizePreview | null;
};

export type TransferCustomerOwnerActionResult = {
  status: "success" | "error";
  message: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "表单校验失败。";
  }

  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function buildCustomerOrdersRedirect(
  customerId: string,
  input?: {
    openComposer?: boolean;
    tradeOrderId?: string;
  },
) {
  const params = new URLSearchParams();
  params.set("tab", "orders");

  if (input?.openComposer) {
    params.set("createTradeOrder", "1");
  }

  if (input?.tradeOrderId) {
    params.set("tradeOrderId", input.tradeOrderId);
  }

  return `/customers/${customerId}?${params.toString()}`;
}

function buildCustomerProfileRedirect(customerId: string) {
  return `/customers/${customerId}`;
}

function revalidateImportedCustomerDeletionPaths(input: {
  customerId: string;
  batchId?: string | null;
}) {
  revalidatePath("/customers");
  revalidatePath("/customers/public-pool");
  revalidatePath("/lead-imports");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${input.customerId}`);

  if (input.batchId) {
    revalidatePath(`/lead-imports/${input.batchId}`);
  }
}

function revalidateForceHardDeleteCustomerPaths(customerId: string) {
  revalidatePath("/customers");
  revalidatePath("/customers/public-pool");
  revalidatePath("/dashboard");
  revalidatePath("/recycle-bin");
  revalidatePath("/orders");
  revalidatePath("/fulfillment");
  revalidatePath("/finance");
  revalidatePath("/reports");
  revalidatePath(`/customers/${customerId}`);
}

function getCustomerRecycleReasonCode(formData: FormData): CustomerRecycleReasonCode {
  const value = getFormValue(formData, "reasonCode");

  return CUSTOMER_RECYCLE_REASON_OPTIONS.some((option) => option.value === value)
    ? (value as CustomerRecycleReasonCode)
    : "mistaken_creation";
}

function buildCustomerRecycleActionResult(
  result: MoveToRecycleBinResult,
): CustomerRecycleActionResult {
  if (result.status === "created") {
    return {
      status: "success",
      message: "客户已移入回收站。",
      recycleStatus: result.status,
      guard: result.guard,
    };
  }

  if (result.status === "already_in_recycle_bin") {
    return {
      status: "success",
      message: "客户已在回收站中。",
      recycleStatus: result.status,
      guard: result.guard,
    };
  }

  return {
    status: "error",
    message: result.message,
    recycleStatus: result.status,
    guard: result.guard,
  };
}

function parseTradeOrderLinesJson(rawValue: string) {
  if (!rawValue.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("订单明细格式无效。");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("订单明细格式无效。");
  }

  return parsed.map((rawLine, index) => {
    if (!rawLine || typeof rawLine !== "object") {
      throw new Error(`第 ${index + 1} 行订单明细格式无效。`);
    }

    const line = rawLine as Record<string, unknown>;
    const itemType = typeof line.itemType === "string" ? line.itemType.trim() : "";

    if (itemType && itemType !== "SKU") {
      throw new Error("当前版本仅支持 SKU 直售行，不支持套餐或赠品行。");
    }

    return {
      lineId:
        typeof line.lineId === "string" && line.lineId.trim()
          ? line.lineId.trim()
          : `line-${index + 1}`,
      skuId: typeof line.skuId === "string" ? line.skuId.trim() : "",
      qty:
        typeof line.qty === "number"
          ? line.qty
          : Number(typeof line.qty === "string" ? line.qty : 0),
      dealPrice:
        typeof line.dealPrice === "number"
          ? line.dealPrice
          : Number(typeof line.dealPrice === "string" ? line.dealPrice : 0),
      discountReason:
        typeof line.discountReason === "string" ? line.discountReason.trim() : "",
    };
  });
}

function parseTradeOrderGiftLinesJson(rawValue: string) {
  if (!rawValue.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("Gift lines payload is invalid.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Gift lines payload is invalid.");
  }

  return parsed.map((rawLine, index) => {
    if (!rawLine || typeof rawLine !== "object") {
      throw new Error(`Gift line ${index + 1} payload is invalid.`);
    }

    const line = rawLine as Record<string, unknown>;

    return {
      lineId:
        typeof line.lineId === "string" && line.lineId.trim()
          ? line.lineId.trim()
          : `gift-${index + 1}`,
      skuId: typeof line.skuId === "string" ? line.skuId.trim() : "",
      qty:
        typeof line.qty === "number"
          ? line.qty
          : Number(typeof line.qty === "string" ? line.qty : 0),
      remark: typeof line.remark === "string" ? line.remark.trim() : "",
    };
  });
}

function parseTradeOrderBundleLinesJson(rawValue: string) {
  if (!rawValue.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("Bundle lines payload is invalid.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Bundle lines payload is invalid.");
  }

  return parsed.map((rawLine, index) => {
    if (!rawLine || typeof rawLine !== "object") {
      throw new Error(`Bundle line ${index + 1} payload is invalid.`);
    }

    const line = rawLine as Record<string, unknown>;

    return {
      lineId:
        typeof line.lineId === "string" && line.lineId.trim()
          ? line.lineId.trim()
          : `bundle-${index + 1}`,
      bundleId: typeof line.bundleId === "string" ? line.bundleId.trim() : "",
      qty:
        typeof line.qty === "number"
          ? line.qty
          : Number(typeof line.qty === "string" ? line.qty : 0),
      dealPrice:
        typeof line.dealPrice === "number"
          ? line.dealPrice
          : Number(typeof line.dealPrice === "string" ? line.dealPrice : 0),
      remark: typeof line.remark === "string" ? line.remark.trim() : "",
    };
  });
}

function buildDraftPayload(formData: FormData) {
  return {
    id: getFormValue(formData, "id"),
    customerId: getFormValue(formData, "customerId"),
    lines: parseTradeOrderLinesJson(getFormValue(formData, "linesJson")),
    giftLines: parseTradeOrderGiftLinesJson(getFormValue(formData, "giftLinesJson")),
    bundleLines: parseTradeOrderBundleLinesJson(getFormValue(formData, "bundleLinesJson")),
    paymentScheme: getFormValue(formData, "paymentScheme") as
      | "FULL_PREPAID"
      | "DEPOSIT_PLUS_BALANCE"
      | "FULL_COD"
      | "DEPOSIT_PLUS_COD",
    depositAmount: getFormValue(formData, "depositAmount"),
    receiverName: getFormValue(formData, "receiverName"),
    receiverPhone: getFormValue(formData, "receiverPhone"),
    receiverAddress: getFormValue(formData, "receiverAddress"),
    insuranceRequired: formData.has("insuranceRequired"),
    insuranceAmount: getFormValue(formData, "insuranceAmount"),
    remark: getFormValue(formData, "remark"),
  };
}

export async function updateCustomerProfileAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const customerId = getFormValue(formData, "customerId");
  const redirectTo = sanitizeRedirectTarget(
    getFormValue(formData, "redirectTo"),
    customerId ? buildCustomerProfileRedirect(customerId) : "/customers",
  );
  const errorRedirect = appendRedirectSearchParams(redirectTo, {
    editProfile: "1",
  });

  try {
    const result = await updateCustomerProfile(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        customerId,
        name: getFormValue(formData, "name"),
        wechatId: getFormValue(formData, "wechatId"),
        province: getFormValue(formData, "province"),
        city: getFormValue(formData, "city"),
        district: getFormValue(formData, "district"),
        address: getFormValue(formData, "address"),
        status: getFormValue(formData, "status"),
        remark: getFormValue(formData, "remark"),
      },
    );

    revalidatePath("/customers");
    revalidatePath("/customers/public-pool");
    revalidatePath(`/customers/${result.customerId}`);

    redirect(buildRedirectTarget(redirectTo, "success", result.description));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(errorRedirect, "error", getErrorMessage(error)));
  }
}

export async function transferCustomerOwnerAction(
  formData: FormData,
): Promise<TransferCustomerOwnerActionResult> {
  try {
    const session = await auth();

    if (!session?.user) {
      redirect("/login");
    }

    const result = await transferCustomerOwner(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        customerId: getFormValue(formData, "customerId"),
        targetOwnerId: getFormValue(formData, "targetOwnerId"),
        note: getFormValue(formData, "note"),
      },
    );

    revalidatePath("/customers");
    revalidatePath("/customers/public-pool");
    revalidatePath("/dashboard");
    revalidatePath(`/customers/${result.customerId}`);

    return {
      status: "success",
      message: result.description,
    };
  } catch (error) {
    rethrowRedirectError(error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function saveTradeOrderDraftAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const customerId = getFormValue(formData, "customerId");
  const currentTradeOrderId = getFormValue(formData, "id");
  const errorRedirect = buildCustomerOrdersRedirect(customerId, {
    openComposer: true,
    tradeOrderId: currentTradeOrderId,
  });

  try {
    const result = await saveTradeOrderDraft(
      {
        id: session.user.id,
        role: session.user.role,
      },
      buildDraftPayload(formData),
    );

    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/orders");
    revalidatePath(`/orders/${result.id}`);
    revalidatePath("/fulfillment");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    redirect(
      buildRedirectTarget(
        buildCustomerOrdersRedirect(result.customerId, {
          openComposer: true,
          tradeOrderId: result.id,
        }),
        "success",
        `成交草稿 ${result.tradeNo} 已保存。`,
      ),
    );
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(errorRedirect, "error", getErrorMessage(error)));
  }
}

export async function submitTradeOrderForReviewAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const customerId = getFormValue(formData, "customerId");
  const currentTradeOrderId = getFormValue(formData, "id");
  const successRedirect = buildCustomerOrdersRedirect(customerId);
  const errorRedirect = buildCustomerOrdersRedirect(customerId, {
    openComposer: true,
    tradeOrderId: currentTradeOrderId,
  });

  try {
    const result = await submitTradeOrderForReview(
      {
        id: session.user.id,
        role: session.user.role,
      },
      buildDraftPayload(formData),
    );

    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/orders");
    revalidatePath(`/orders/${result.tradeOrderId}`);
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    for (const salesOrderId of result.salesOrderIds) {
      revalidatePath(`/orders/${salesOrderId}`);
    }

    redirect(
      buildRedirectTarget(
        successRedirect,
        "success",
        `成交主单 ${result.tradeNo} 已提交审核，并已按供货商拆出 ${result.salesOrderIds.length} 张子单。`,
      ),
    );
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(errorRedirect, "error", getErrorMessage(error)));
  }
}

export async function moveCustomerToRecycleBinAction(
  formData: FormData,
): Promise<CustomerRecycleActionResult> {
  try {
    const session = await auth();

    if (!session?.user) {
      redirect("/login");
    }

    const customerId = getFormValue(formData, "id");

    if (!customerId) {
      return {
        status: "error",
        message: "客户参数不完整，请刷新后重试。",
      };
    }

    const result = await moveToRecycleBin(
      {
        id: session.user.id,
        role: session.user.role,
        permissionCodes: session.user.permissionCodes,
      },
      {
        targetType: "CUSTOMER",
        targetId: customerId,
        reasonCode: getCustomerRecycleReasonCode(formData),
      },
    );

    if (result.status !== "blocked") {
      // 该 action 直接挂在 /customers 列表行内 "移入回收站" 按钮 (见
      // customers-table.tsx -> customer-list-card.tsx -> CustomerRecycleInlineEntry).
      // revalidatePath("/customers") 会强制当前 route 整页 RSC re-render, 列表
      // 按 updatedAt desc 排序后当前页客户被推到第 1 页 / 被移除的客户位置塌方.
      // 改成 updateTag — 数据 cache 失效, 当前页 UI 不强制 re-render, 用户翻页/
      // 筛选时自然拿新数据, 但当前页保持稳定 (call-actions.ts / commit 477e669 同根因).
      updateTag(CACHE_TAGS.customerList);
      updateTag(CACHE_TAGS.customer(customerId));
      // /recycle-bin 是聚合页, 用户主动 navigate 时刷新.
      revalidatePath("/recycle-bin");
    }

    const actionResult = buildCustomerRecycleActionResult(result);

    if (result.status === "blocked") {
      return {
        ...actionResult,
        finalizePreview: await buildCustomerFinalizePreview(prisma, {
          targetType: "CUSTOMER",
          targetId: customerId,
          domain: "CUSTOMER",
        }),
      };
    }

    return actionResult;
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function requestImportedCustomerDeletionAction(
  input: z.input<typeof importedCustomerDeletionSchema>,
): Promise<ImportedCustomerDeletionActionResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      redirectTo: null,
    };
  }

  const parsed = importedCustomerDeletionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      redirectTo: null,
    };
  }

  try {
    const result = await requestImportedCustomerDeletion(
      {
        id: session.user.id,
        role: session.user.role,
      },
      parsed.data,
    );

    revalidateImportedCustomerDeletionPaths({
      customerId: parsed.data.customerId,
    });

    return {
      status: "success",
      message: result.message,
      redirectTo: null,
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
      redirectTo: null,
    };
  }
}

export async function reviewImportedCustomerDeletionAction(
  input: z.input<typeof importedCustomerDeletionReviewSchema>,
): Promise<ImportedCustomerDeletionActionResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      redirectTo: null,
    };
  }

  const parsed = importedCustomerDeletionReviewSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      redirectTo: null,
    };
  }

  try {
    const result = await reviewImportedCustomerDeletion(
      {
        id: session.user.id,
        role: session.user.role,
      },
      parsed.data,
    );

    revalidateImportedCustomerDeletionPaths({
      customerId: result.customerId,
      batchId: result.batchId,
    });

    return {
      status: "success",
      message: result.message,
      redirectTo:
        result.redirectTo && result.status === "executed"
          ? buildRedirectTarget(result.redirectTo, "success", result.message)
          : null,
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
      redirectTo: null,
    };
  }
}

export async function deleteImportedCustomerDirectAction(
  input: z.input<typeof importedCustomerDeletionSchema>,
): Promise<ImportedCustomerDeletionActionResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      redirectTo: null,
    };
  }

  const parsed = importedCustomerDeletionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      redirectTo: null,
    };
  }

  try {
    const result = await deleteImportedCustomersDirect(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        customerIds: [parsed.data.customerId],
        reason: parsed.data.reason,
      },
    );
    const item = result.items[0];

    revalidateImportedCustomerDeletionPaths({
      customerId: parsed.data.customerId,
      batchId: item?.sourceBatchId ?? null,
    });

    if (!item || item.status !== "deleted") {
      return {
        status: "error",
        message:
          item?.message ??
          "当前客户不满足直接删除条件，请确认是否仍为导入新建客户。",
        redirectTo: null,
      };
    }

    return {
      status: "success",
      message: item.message,
      redirectTo: item.redirectTo
        ? buildRedirectTarget(item.redirectTo, "success", item.message)
        : null,
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
      redirectTo: null,
    };
  }
}

export async function forceHardDeleteCustomerAction(
  input: z.input<typeof forceHardDeleteCustomerSchema>,
): Promise<ForceHardDeleteCustomerActionResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
      redirectTo: null,
    };
  }

  const parsed = forceHardDeleteCustomerSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      redirectTo: null,
    };
  }

  try {
    const result = await forceHardDeleteCustomer(
      {
        id: session.user.id,
        role: session.user.role,
      },
      parsed.data,
    );

    revalidateForceHardDeleteCustomerPaths(result.customerId);

    const deletedBusinessCount =
      (result.deletedCounts.tradeOrders ?? 0) +
      (result.deletedCounts.salesOrders ?? 0) +
      (result.deletedCounts.paymentPlans ?? 0) +
      (result.deletedCounts.paymentRecords ?? 0) +
      (result.deletedCounts.shippingTasks ?? 0);
    const purgedLeadSuffix =
      parsed.data.purgeAttachedLeads && result.purgedLeadCount > 0
        ? ` 已物理清理关联 Lead ${result.purgedLeadCount} 条。`
        : "";
    const message =
      deletedBusinessCount > 0
        ? `已强制硬删除 ${result.customerName}，并清理关联业务记录 ${deletedBusinessCount} 项。${purgedLeadSuffix}`
        : `已强制硬删除 ${result.customerName}。${purgedLeadSuffix}`;

    return {
      status: "success",
      message,
      redirectTo: buildRedirectTarget(result.redirectTo, "success", message),
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
      redirectTo: null,
    };
  }
}
