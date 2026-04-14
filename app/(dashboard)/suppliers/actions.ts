"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import {
  buildRedirectTarget,
  getRedirectPathname,
  getFormValue,
  rethrowRedirectError,
  sanitizeRedirectTarget,
} from "@/lib/action-notice";
import { moveToRecycleBin } from "@/lib/recycle-bin/lifecycle";
import type { MoveToRecycleBinResult, RecycleReasonInputCode } from "@/lib/recycle-bin/types";
import { toggleSupplier, upsertSupplier } from "@/lib/suppliers/mutations";

export type SupplierActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: MoveToRecycleBinResult["status"];
};

async function getActor() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return {
    id: session.user.id,
    role: session.user.role,
    permissionCodes: session.user.permissionCodes,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function getRecycleReasonCode(formData: FormData): RecycleReasonInputCode {
  const reasonCode = getFormValue(formData, "reasonCode");

  if (
    reasonCode === "mistaken_creation" ||
    reasonCode === "test_data" ||
    reasonCode === "duplicate" ||
    reasonCode === "no_longer_needed" ||
    reasonCode === "other"
  ) {
    return reasonCode;
  }

  return "mistaken_creation";
}

function buildRecycleActionResult(result: MoveToRecycleBinResult): SupplierActionResult {
  if (result.status === "created") {
    return {
      status: "success",
      message: "供应商已移入回收站。",
      recycleStatus: result.status,
    };
  }

  if (result.status === "already_in_recycle_bin") {
    return {
      status: "success",
      message: "供应商已在回收站中。",
      recycleStatus: result.status,
    };
  }

  return {
    status: "error",
    message: result.message,
    recycleStatus: result.status,
  };
}

async function runSupplierAction(
  formData: FormData,
  fallbackPath: string,
  action: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<void>,
) {
  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), fallbackPath);
  const actor = await getActor();

  try {
    await action(actor);
  } catch (error) {
    rethrowRedirectError(error);
    redirect(buildRedirectTarget(redirectTo, "error", getErrorMessage(error)));
  }

  redirect(buildRedirectTarget(redirectTo, "success", "保存成功。"));
}

async function runSupplierInlineAction(
  formData: FormData,
  fallbackPath: string,
  action: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<void>,
): Promise<SupplierActionResult> {
  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), fallbackPath);
  const actor = await getActor();

  try {
    await action(actor);
    revalidatePath("/products");
    revalidatePath("/suppliers");
    revalidatePath(getRedirectPathname(redirectTo));

    return {
      status: "success",
      message: "保存成功。",
    };
  } catch (error) {
    rethrowRedirectError(error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

async function runMoveToRecycleBinInlineAction(
  formData: FormData,
  fallbackPath: string,
): Promise<SupplierActionResult> {
  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), fallbackPath);
  const actor = await getActor();

  try {
    const result = await moveToRecycleBin(actor, {
      targetType: "SUPPLIER",
      targetId: getFormValue(formData, "id"),
      reasonCode: getRecycleReasonCode(formData),
      reasonText: getFormValue(formData, "reasonText"),
    });

    if (result.status !== "blocked") {
      revalidatePath("/products");
      revalidatePath("/suppliers");
      revalidatePath(getRedirectPathname(redirectTo));
    }

    return buildRecycleActionResult(result);
  } catch (error) {
    rethrowRedirectError(error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function upsertSupplierAction(formData: FormData) {
  return runSupplierAction(formData, "/products?tab=suppliers", async (actor) => {
    await upsertSupplier(actor, {
      id: getFormValue(formData, "id"),
      code: getFormValue(formData, "code"),
      name: getFormValue(formData, "name"),
      contactName: getFormValue(formData, "contactName"),
      contactPhone: getFormValue(formData, "contactPhone"),
      remark: getFormValue(formData, "remark"),
    });
  });
}

export async function upsertSupplierInlineAction(
  formData: FormData,
): Promise<SupplierActionResult> {
  return runSupplierInlineAction(formData, "/products?tab=suppliers", async (actor) => {
    await upsertSupplier(actor, {
      id: getFormValue(formData, "id"),
      code: getFormValue(formData, "code"),
      name: getFormValue(formData, "name"),
      contactName: getFormValue(formData, "contactName"),
      contactPhone: getFormValue(formData, "contactPhone"),
      remark: getFormValue(formData, "remark"),
    });
  });
}

export async function toggleSupplierAction(formData: FormData) {
  return runSupplierAction(formData, "/products?tab=suppliers", async (actor) => {
    await toggleSupplier(actor, getFormValue(formData, "id"));
  });
}

export async function toggleSupplierInlineAction(
  formData: FormData,
): Promise<SupplierActionResult> {
  return runSupplierInlineAction(formData, "/products?tab=suppliers", async (actor) => {
    await toggleSupplier(actor, getFormValue(formData, "id"));
  });
}

export async function moveSupplierToRecycleBinInlineAction(
  formData: FormData,
): Promise<SupplierActionResult> {
  return runMoveToRecycleBinInlineAction(formData, "/products?tab=suppliers");
}
