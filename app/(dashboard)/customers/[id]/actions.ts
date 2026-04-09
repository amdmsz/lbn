"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import {
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
} from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import {
  deleteImportedCustomersDirect,
  requestImportedCustomerDeletion,
  reviewImportedCustomerDeletion,
} from "@/lib/customers/imported-customer-deletion";
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

export type ImportedCustomerDeletionActionResult = {
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
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
