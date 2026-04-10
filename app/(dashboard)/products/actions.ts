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
import {
  toggleProduct,
  toggleProductSku,
  upsertProduct,
  upsertProductSku,
} from "@/lib/products/mutations";
import { upsertSupplier } from "@/lib/suppliers/mutations";

export type ProductActionResult = {
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

async function runProductAction(
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

async function runProductInlineAction(
  formData: FormData,
  fallbackPath: string,
  action: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<void>,
): Promise<ProductActionResult> {
  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), fallbackPath);
  const actor = await getActor();

  try {
    await action(actor);
    revalidatePath("/products");
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

export async function upsertProductInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runProductInlineAction(formData, "/products", async (actor) => {
    await upsertProduct(actor, {
      id: getFormValue(formData, "id"),
      supplierId: getFormValue(formData, "supplierId"),
      code: getFormValue(formData, "code"),
      name: getFormValue(formData, "name"),
      description: getFormValue(formData, "description"),
    });
  });
}

export async function createInlineSupplierAction(formData: FormData) {
  const actor = await getActor();

  try {
    const supplier = await upsertSupplier(actor, {
      code: getFormValue(formData, "code"),
      name: getFormValue(formData, "name"),
      contactName: getFormValue(formData, "contactName"),
      contactPhone: getFormValue(formData, "contactPhone"),
      remark: getFormValue(formData, "remark"),
    });

    revalidatePath("/products");
    revalidatePath("/suppliers");

    return {
      success: true as const,
      supplier,
      message: `已新增供货商：${supplier.name}。`,
    };
  } catch (error) {
    rethrowRedirectError(error);

    return {
      success: false as const,
      errorMessage: getErrorMessage(error),
    };
  }
}

export async function toggleProductAction(formData: FormData) {
  return runProductAction(formData, "/products", async (actor) => {
    await toggleProduct(actor, getFormValue(formData, "id"));
  });
}

export async function toggleProductInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runProductInlineAction(formData, "/products", async (actor) => {
    await toggleProduct(actor, getFormValue(formData, "id"));
  });
}

export async function upsertProductSkuAction(formData: FormData) {
  return runProductAction(formData, "/products", async (actor) => {
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

export async function upsertProductSkuInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runProductInlineAction(formData, "/products", async (actor) => {
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
  return runProductAction(formData, "/products", async (actor) => {
    await toggleProductSku(actor, getFormValue(formData, "id"));
  });
}

export async function toggleProductSkuInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runProductInlineAction(formData, "/products", async (actor) => {
    await toggleProductSku(actor, getFormValue(formData, "id"));
  });
}
