"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import {
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
} from "@/lib/action-notice";
import {
  toggleProduct,
  toggleProductSku,
  upsertProduct,
  upsertProductSku,
} from "@/lib/products/mutations";

async function getActor() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return {
    id: session.user.id,
    role: session.user.role,
  };
}

async function runProductAction(
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
    const message = error instanceof Error ? error.message : "操作失败，请稍后重试。";
    redirect(buildRedirectTarget(redirectTo, "error", message));
  }

  redirect(buildRedirectTarget(redirectTo, "success", "保存成功"));
}

export async function upsertProductAction(formData: FormData) {
  return runProductAction(formData, "/products", async (actor) => {
    await upsertProduct(actor, {
      id: getFormValue(formData, "id"),
      supplierId: getFormValue(formData, "supplierId"),
      code: getFormValue(formData, "code"),
      name: getFormValue(formData, "name"),
      description: getFormValue(formData, "description"),
    });
  });
}

export async function toggleProductAction(formData: FormData) {
  return runProductAction(formData, "/products", async (actor) => {
    await toggleProduct(actor, getFormValue(formData, "id"));
  });
}

export async function upsertProductSkuAction(formData: FormData) {
  return runProductAction(formData, getFormValue(formData, "redirectTo") || "/products", async (actor) => {
    await upsertProductSku(actor, {
      id: getFormValue(formData, "id"),
      productId: getFormValue(formData, "productId"),
      skuCode: getFormValue(formData, "skuCode"),
      skuName: getFormValue(formData, "skuName"),
      specText: getFormValue(formData, "specText"),
      unit: getFormValue(formData, "unit"),
      defaultUnitPrice: getFormValue(formData, "defaultUnitPrice"),
      codSupported: (getFormValue(formData, "codSupported") || "false") as "true" | "false",
      insuranceSupported: (getFormValue(formData, "insuranceSupported") || "false") as
        | "true"
        | "false",
      defaultInsuranceAmount: getFormValue(formData, "defaultInsuranceAmount") || "0",
    });
  });
}

export async function toggleProductSkuAction(formData: FormData) {
  return runProductAction(formData, getFormValue(formData, "redirectTo") || "/products", async (actor) => {
    await toggleProductSku(actor, getFormValue(formData, "id"));
  });
}
