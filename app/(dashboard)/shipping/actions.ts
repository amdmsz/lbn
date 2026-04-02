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
  createShippingExportBatch,
  updateLogisticsFollowUpTask,
  updateSalesOrderShipping,
} from "@/lib/shipping/mutations";

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "表单校验失败。";
  }

  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export async function createShippingExportBatchAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = getFormValue(formData, "redirectTo") || "/shipping";

  try {
    const result = await createShippingExportBatch(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        supplierId: getFormValue(formData, "supplierId"),
        fileName: getFormValue(formData, "fileName"),
        remark: getFormValue(formData, "remark"),
      },
    );

    revalidatePath("/shipping");
    revalidatePath("/shipping/export-batches");

    redirect(
      buildRedirectTarget(
        redirectTo,
        "success",
        `报单批次 ${result.exportNo} 已创建，相关任务已标记为已报单。`,
      ),
    );
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function updateSalesOrderShippingAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = getFormValue(formData, "redirectTo") || "/shipping";

  try {
    const result = await updateSalesOrderShipping(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        shippingTaskId: getFormValue(formData, "shippingTaskId"),
        shippingProvider: getFormValue(formData, "shippingProvider"),
        trackingNumber: getFormValue(formData, "trackingNumber"),
        shippingStatus: getFormValue(formData, "shippingStatus") as
          | "PENDING"
          | "READY_TO_SHIP"
          | "SHIPPED"
          | "DELIVERED"
          | "COMPLETED"
          | "CANCELED",
        codCollectionStatus: getFormValue(formData, "codCollectionStatus") as
          | ""
          | "PENDING_COLLECTION"
          | "COLLECTED"
          | "EXCEPTION"
          | "REJECTED"
          | "UNCOLLECTED",
        codCollectedAmount: getFormValue(formData, "codCollectedAmount"),
        codRemark: getFormValue(formData, "codRemark"),
      },
    );

    revalidatePath("/shipping");
    revalidatePath("/shipping/export-batches");
    revalidatePath(`/orders/${result.salesOrderId}`);
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/collection-tasks");
    revalidatePath("/payment-records");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    redirect(buildRedirectTarget(redirectTo, "success", "发货信息已更新。"));
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

  const redirectTo = getFormValue(formData, "redirectTo") || "/orders";

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
