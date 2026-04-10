"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
  sanitizeRedirectTarget,
} from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  reviewPaymentRecord,
  submitPaymentRecord,
  updateCollectionTask,
  upsertCollectionTask,
} from "@/lib/payments/mutations";
import { reviewSalesOrder, saveSalesOrder } from "@/lib/sales-orders/mutations";
import { updateLogisticsFollowUpTask } from "@/lib/shipping/mutations";
import { reviewTradeOrder } from "@/lib/trade-orders/mutations";

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "表单校验失败。";
  }

  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export async function saveSalesOrderAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), "/orders");

  try {
    const result = await saveSalesOrder(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        id: getFormValue(formData, "id"),
        customerId: getFormValue(formData, "customerId"),
        skuId: getFormValue(formData, "skuId"),
        qty: getFormValue(formData, "qty"),
        dealPrice: getFormValue(formData, "dealPrice"),
        discountReason: getFormValue(formData, "discountReason"),
        giftName: getFormValue(formData, "giftName"),
        giftQty: getFormValue(formData, "giftQty"),
        giftRemark: getFormValue(formData, "giftRemark"),
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
      },
    );

    revalidatePath("/orders");
    revalidatePath("/fulfillment");
    revalidatePath(`/orders/${result.id}`);
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/shipping");
    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    if ("salesOrderIds" in result && Array.isArray(result.salesOrderIds)) {
      for (const childSalesOrderId of result.salesOrderIds) {
        revalidatePath(`/orders/${childSalesOrderId}`);
      }
    }

    redirect(
      buildRedirectTarget(
        redirectTo,
        "success",
        `销售订单 ${result.orderNo} 已提交审核。`,
      ),
    );
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function reviewSalesOrderAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), "/orders");
  const reviewStatus = getFormValue(formData, "reviewStatus");
  const salesOrderId = getFormValue(formData, "salesOrderId");

  try {
    const tradeLinkedOrder = salesOrderId
      ? await prisma.salesOrder.findUnique({
          where: { id: salesOrderId },
          select: {
            tradeOrderId: true,
          },
        })
      : null;

    const result = tradeLinkedOrder?.tradeOrderId
      ? await reviewTradeOrder(
          {
            id: session.user.id,
            role: session.user.role,
          },
          {
            salesOrderId,
            reviewStatus: reviewStatus as "APPROVED" | "REJECTED",
            rejectReason: getFormValue(formData, "rejectReason"),
          },
        )
      : await reviewSalesOrder(
          {
            id: session.user.id,
            role: session.user.role,
          },
          {
            salesOrderId,
            reviewStatus: reviewStatus as "APPROVED" | "REJECTED",
            rejectReason: getFormValue(formData, "rejectReason"),
          },
    );

    revalidatePath("/orders");
    revalidatePath("/fulfillment");
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/shipping");
    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    if (tradeLinkedOrder?.tradeOrderId) {
      revalidatePath(`/orders/${result.id}`);
      revalidatePath(`/orders/${salesOrderId}`);

      if ("salesOrderIds" in result && Array.isArray(result.salesOrderIds)) {
        for (const childSalesOrderId of result.salesOrderIds) {
          revalidatePath(`/orders/${childSalesOrderId}`);
        }
      }
    } else {
      revalidatePath(`/orders/${result.id}`);
    }

    redirect(
      buildRedirectTarget(
        redirectTo,
        "success",
        reviewStatus === "APPROVED"
          ? "销售订单已审核通过，并进入履约链路。"
          : "销售订单已驳回，销售可修改后重新提交。",
      ),
    );
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function reviewTradeOrderAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), "/orders");

  try {
    const result = await reviewTradeOrder(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        tradeOrderId: getFormValue(formData, "tradeOrderId"),
        reviewStatus: getFormValue(formData, "reviewStatus") as "APPROVED" | "REJECTED",
        rejectReason: getFormValue(formData, "rejectReason"),
      },
    );

    revalidatePath("/orders");
    revalidatePath("/fulfillment");
    revalidatePath(`/orders/${result.id}`);
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/shipping");
    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    if ("salesOrderIds" in result && Array.isArray(result.salesOrderIds)) {
      for (const childSalesOrderId of result.salesOrderIds) {
        revalidatePath(`/orders/${childSalesOrderId}`);
      }
    }

    const reviewStatus = getFormValue(formData, "reviewStatus");

    redirect(
      buildRedirectTarget(
        redirectTo,
        "success",
        reviewStatus === "APPROVED"
          ? "成交主单已审核通过，并已同步初始化子单履约与收款链路。"
          : "成交主单已驳回，当前不会初始化履约与收款链路。",
      ),
    );
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function submitPaymentRecordAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(
    getFormValue(formData, "redirectTo"),
    "/payment-records",
  );

  try {
    const result = await submitPaymentRecord(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        paymentPlanId: getFormValue(formData, "paymentPlanId"),
        amount: getFormValue(formData, "amount"),
        channel: getFormValue(formData, "channel") as never,
        occurredAt: getFormValue(formData, "occurredAt"),
        referenceNo: getFormValue(formData, "referenceNo"),
        remark: getFormValue(formData, "remark"),
      },
    );

    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    if (result.salesOrderId) {
      revalidatePath(`/orders/${result.salesOrderId}`);
    }

    if (result.customerId) {
      revalidatePath(`/customers/${result.customerId}`);
    }

    if (result.giftRecordId) {
      revalidatePath("/gifts");
    }

    redirect(buildRedirectTarget(redirectTo, "success", "收款记录已提交。"));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function reviewPaymentRecordAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(
    getFormValue(formData, "redirectTo"),
    "/payment-records",
  );

  try {
    const result = await reviewPaymentRecord(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        paymentRecordId: getFormValue(formData, "paymentRecordId"),
        status: getFormValue(formData, "status") as "CONFIRMED" | "REJECTED",
        remark: getFormValue(formData, "remark"),
      },
    );

    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    if (result.salesOrderId) {
      revalidatePath(`/orders/${result.salesOrderId}`);
    }

    if (result.customerId) {
      revalidatePath(`/customers/${result.customerId}`);
    }

    if (result.giftRecordId) {
      revalidatePath("/gifts");
    }

    redirect(buildRedirectTarget(redirectTo, "success", "收款记录已完成审核。"));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function upsertCollectionTaskAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(
    getFormValue(formData, "redirectTo"),
    "/collection-tasks",
  );

  try {
    const result = await upsertCollectionTask(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        paymentPlanId: getFormValue(formData, "paymentPlanId"),
        ownerId: getFormValue(formData, "ownerId"),
        dueAt: getFormValue(formData, "dueAt"),
        nextFollowUpAt: getFormValue(formData, "nextFollowUpAt"),
        remark: getFormValue(formData, "remark"),
      },
    );

    revalidatePath("/collection-tasks");
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    if (result.salesOrderId) {
      revalidatePath(`/orders/${result.salesOrderId}`);
    }

    if (result.customerId) {
      revalidatePath(`/customers/${result.customerId}`);
    }

    if (result.giftRecordId) {
      revalidatePath("/gifts");
    }

    redirect(buildRedirectTarget(redirectTo, "success", "催收任务已保存。"));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function updateCollectionTaskAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(
    getFormValue(formData, "redirectTo"),
    "/collection-tasks",
  );

  try {
    const result = await updateCollectionTask(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        collectionTaskId: getFormValue(formData, "collectionTaskId"),
        ownerId: getFormValue(formData, "ownerId"),
        status: getFormValue(formData, "status") as never,
        nextFollowUpAt: getFormValue(formData, "nextFollowUpAt"),
        lastContactAt: getFormValue(formData, "lastContactAt"),
        remark: getFormValue(formData, "remark"),
      },
    );

    revalidatePath("/collection-tasks");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    if (result.salesOrderId) {
      revalidatePath(`/orders/${result.salesOrderId}`);
    }

    if (result.customerId) {
      revalidatePath(`/customers/${result.customerId}`);
    }

    if (result.giftRecordId) {
      revalidatePath("/gifts");
    }

    redirect(buildRedirectTarget(redirectTo, "success", "催收任务已更新。"));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function updateLogisticsFollowUpTaskAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), "/orders");

  try {
    const result = await updateLogisticsFollowUpTask(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        logisticsFollowUpTaskId: getFormValue(formData, "logisticsFollowUpTaskId"),
        status: getFormValue(formData, "status") as
          | "PENDING"
          | "IN_PROGRESS"
          | "DONE"
          | "CANCELED",
        nextTriggerAt: getFormValue(formData, "nextTriggerAt"),
        lastFollowedUpAt: getFormValue(formData, "lastFollowedUpAt"),
        remark: getFormValue(formData, "remark"),
      },
    );

    revalidatePath("/shipping");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath(`/orders/${result.salesOrderId}`);
    revalidatePath(`/customers/${result.customerId}`);

    redirect(buildRedirectTarget(redirectTo, "success", "物流跟进任务已更新。"));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}
