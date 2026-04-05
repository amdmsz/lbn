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
  regenerateShippingExportBatchFile,
  updateLogisticsFollowUpTask,
  updateSalesOrderShipping,
} from "@/lib/shipping/mutations";

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Form validation failed.";
  }

  return error instanceof Error ? error.message : "Action failed. Please retry later.";
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
    revalidatePath("/fulfillment");

    const successMessage = result.fileGenerated
      ? `Export batch ${result.exportNo} created and file generated from frozen snapshots.`
      : `Export batch ${result.exportNo} created and snapshots frozen; file generation failed, regenerate it from export batches.`;

    redirect(buildRedirectTarget(redirectTo, "success", successMessage));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}

function getFormValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

export async function regenerateShippingExportBatchFileAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const redirectTo = getFormValue(formData, "redirectTo") || "/shipping/export-batches";

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
        `Export batch ${result.exportNo} file regenerated from frozen snapshots.`,
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
    revalidatePath("/fulfillment");
    revalidatePath(`/orders/${result.salesOrderId}`);
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/collection-tasks");
    revalidatePath("/payment-records");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    redirect(buildRedirectTarget(redirectTo, "success", "Shipping updated."));
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

  const redirectTo = getFormValue(formData, "redirectTo") || "/shipping";

  try {
    const shippingTaskIds = getFormValues(formData, "shippingTaskId");
    const shippingProviders = getFormValues(formData, "shippingProvider");
    const trackingNumbers = getFormValues(formData, "trackingNumber");
    const selectedShippingTaskIds = new Set(getFormValues(formData, "selectedShippingTaskId"));

    if (selectedShippingTaskIds.size === 0) {
      throw new Error("Please select at least one shipping task.");
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
        throw new Error("Selected rows must include tracking numbers.");
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
      throw new Error("No shipping task was updated.");
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
        `${updatedCount} shipping tasks moved to shipped from the current supplier pool.`,
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
    revalidatePath("/fulfillment");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath(`/orders/${result.salesOrderId}`);
    revalidatePath(`/customers/${result.customerId}`);

    redirect(buildRedirectTarget(redirectTo, "success", "Logistics follow-up updated."));
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }
}
