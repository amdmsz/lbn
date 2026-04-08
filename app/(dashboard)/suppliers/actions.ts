"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import {
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
} from "@/lib/action-notice";
import { toggleSupplier, upsertSupplier } from "@/lib/suppliers/mutations";

export type SupplierActionResult = {
  status: "success" | "error";
  message: string;
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

function normalizeRedirectPath(input: string) {
  return input.split("?")[0] || "/products";
}

async function runSupplierAction(
  formData: FormData,
  fallbackPath: string,
  action: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<void>,
) {
  const redirectTo = getFormValue(formData, "redirectTo") || fallbackPath;
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
  const redirectTo = getFormValue(formData, "redirectTo") || fallbackPath;
  const actor = await getActor();

  try {
    await action(actor);
    revalidatePath("/products");
    revalidatePath("/suppliers");
    revalidatePath(normalizeRedirectPath(redirectTo));

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
