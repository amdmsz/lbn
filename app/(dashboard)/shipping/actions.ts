"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  appendRedirectSearchParams,
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
  sanitizeRedirectTarget,
} from "@/lib/action-notice";
import { auth } from "@/lib/auth/session";
import {
  createShippingExportBatch,
  regenerateShippingExportBatchFile,
  updateLogisticsFollowUpTask,
  updateSalesOrderShipping,
} from "@/lib/shipping/mutations";

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "表单校验失败。";
  }

  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function getShippingStageLabel(
  stage: "PENDING_REPORT" | "PENDING_TRACKING" | "SHIPPED" | "EXCEPTION",
) {
  switch (stage) {
    case "PENDING_TRACKING":
      return "待填物流";
    case "SHIPPED":
      return "已发货 / 回款关注";
    case "EXCEPTION":
      return "履约异常";
    case "PENDING_REPORT":
    default:
      return "当前报单";
  }
}

function getFormValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

export async function createShippingExportBatchAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), "/shipping");
  const sourceStage =
    getFormValue(formData, "sourceStage") === "PENDING_TRACKING"
      ? "PENDING_TRACKING"
      : "PENDING_REPORT";
  const selectedShippingTaskIds = getFormValues(formData, "selectedShippingTaskId");

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
        sourceStage,
        shippingTaskIds:
          selectedShippingTaskIds.length > 0
            ? selectedShippingTaskIds
            : getFormValues(formData, "shippingTaskId"),
      },
    );

    revalidatePath("/shipping");
    revalidatePath("/shipping/export-batches");
    revalidatePath("/fulfillment");

    const exportScopeLabel = result.movedTaskCount === 1 ? "子单" : "子单";
    const successMessage =
      sourceStage === "PENDING_TRACKING"
        ? result.fileGenerated
          ? `已再次导出批次 ${result.exportNo}，${result.movedTaskCount} 个${exportScopeLabel}仍留在待填物流，已生成本次导出文件。`
          : `已再次导出批次 ${result.exportNo}，${result.movedTaskCount} 个${exportScopeLabel}仍留在待填物流；文件暂未生成，请到批次记录重生成。`
        : result.fileGenerated
          ? `已生成批次 ${result.exportNo}，${result.movedTaskCount} 个${exportScopeLabel}已进入待填物流，文件已按冻结快照生成。`
          : `已生成批次 ${result.exportNo}，${result.movedTaskCount} 个${exportScopeLabel}已进入待填物流；文件暂未生成，请到批次记录重生成。`;
    const successRedirectTo = appendRedirectSearchParams(redirectTo, {
      stageView: "PENDING_TRACKING",
      batchViewId: result.id,
    });

    redirect(buildRedirectTarget(successRedirectTo, "success", successMessage));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function regenerateShippingExportBatchFileAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(
    getFormValue(formData, "redirectTo"),
    "/shipping/export-batches",
  );

  try {
    const result = await regenerateShippingExportBatchFile(
      {
        id: session.user.id,
        role: session.user.role,
      },
      getFormValue(formData, "exportBatchId"),
    );

    revalidatePath("/shipping");
    revalidatePath("/shipping/export-batches");
    revalidatePath("/fulfillment");

    redirect(
      buildRedirectTarget(
        redirectTo,
        "success",
        `批次 ${result.exportNo} 已按冻结快照重生成导出文件。`,
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

  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), "/shipping");

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
    revalidatePath("/fulfillment");
    revalidatePath(`/orders/${result.salesOrderId}`);
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/collection-tasks");
    revalidatePath("/payment-records");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    const successMessage =
      result.previousStage !== result.nextStage
        ? `子单 ${result.subOrderNo} 已更新，任务已移入${getShippingStageLabel(result.nextStage)}。`
        : `子单 ${result.subOrderNo} 已更新，当前仍在${getShippingStageLabel(result.nextStage)}。`;

    redirect(buildRedirectTarget(redirectTo, "success", successMessage));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

export async function bulkUpdateSalesOrderShippingAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), "/shipping");

  try {
    const shippingTaskIds = getFormValues(formData, "shippingTaskId");
    const shippingProviders = getFormValues(formData, "shippingProvider");
    const trackingNumbers = getFormValues(formData, "trackingNumber");
    const selectedShippingTaskIds = new Set(getFormValues(formData, "selectedShippingTaskId"));

    if (selectedShippingTaskIds.size === 0) {
      throw new Error("请至少选择一个发货任务。");
    }

    let updatedCount = 0;
    const affectedSalesOrderIds = new Set<string>();
    const affectedCustomerIds = new Set<string>();

    for (const [index, shippingTaskId] of shippingTaskIds.entries()) {
      if (!selectedShippingTaskIds.has(shippingTaskId)) {
        continue;
      }

      const trackingNumber = trackingNumbers[index]?.trim() ?? "";

      if (!trackingNumber) {
        throw new Error("批量回填物流时，所选子单必须填写物流单号。");
      }

      const result = await updateSalesOrderShipping(
        {
          id: session.user.id,
          role: session.user.role,
        },
        {
          shippingTaskId,
          shippingProvider: shippingProviders[index] ?? "",
          trackingNumber,
          shippingStatus: "SHIPPED",
          codCollectionStatus: "",
          codCollectedAmount: "",
          codRemark: "",
        },
      );

      updatedCount += 1;
      affectedSalesOrderIds.add(result.salesOrderId);
      affectedCustomerIds.add(result.customerId);
    }

    if (updatedCount === 0) {
      throw new Error("没有发货任务被更新。");
    }

    revalidatePath("/shipping");
    revalidatePath("/shipping/export-batches");
    revalidatePath("/fulfillment");
    revalidatePath("/collection-tasks");
    revalidatePath("/payment-records");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    for (const salesOrderId of affectedSalesOrderIds) {
      revalidatePath(`/orders/${salesOrderId}`);
    }

    for (const customerId of affectedCustomerIds) {
      revalidatePath(`/customers/${customerId}`);
    }

    redirect(
      buildRedirectTarget(
        redirectTo,
        "success",
        `已更新 ${updatedCount} 个子单，任务已移入已发货 / 回款关注。`,
      ),
    );
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
    revalidatePath("/fulfillment");
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
