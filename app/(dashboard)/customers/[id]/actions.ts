"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
} from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import {
  saveTradeOrderDraft,
  submitTradeOrderForReview,
} from "@/lib/trade-orders/mutations";

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
    revalidatePath(`/orders/${result.id}`);

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
