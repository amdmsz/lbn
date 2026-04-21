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
import { prisma } from "@/lib/db/prisma";
import {
  commitProductMainImagePlan,
  rollbackProductMainImagePlan,
  saveUploadedProductMainImage,
  type ProductMainImagePlan,
} from "@/lib/products/image-server";
import {
  createProductWithInitialSku,
  toggleProduct,
  toggleProductSku,
  upsertProduct,
  upsertProductSku,
} from "@/lib/products/mutations";
import {
  deleteProductSavedView,
  saveProductSavedView,
} from "@/lib/products/views";
import { moveToRecycleBin } from "@/lib/recycle-bin/lifecycle";
import type { MoveToRecycleBinResult, RecycleReasonInputCode } from "@/lib/recycle-bin/types";
import { upsertSupplier } from "@/lib/suppliers/mutations";

export type ProductActionResult = {
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

async function buildProductMainImagePlan(
  formData: FormData,
  productId: string,
): Promise<ProductMainImagePlan> {
  const removeMainImage = getFormValue(formData, "removeMainImage") === "true";
  const existingProduct = productId
    ? await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          mainImagePath: true,
        },
      })
    : null;

  if (productId && !existingProduct) {
    throw new Error("Product not found.");
  }

  const uploadedFile = formData.get("mainImage");
  const uploadedMainImagePath =
    uploadedFile instanceof File && uploadedFile.size > 0
      ? await saveUploadedProductMainImage(uploadedFile)
      : null;

  return {
    previousMainImagePath: existingProduct?.mainImagePath ?? null,
    nextMainImagePath:
      uploadedMainImagePath ??
      (removeMainImage ? null : existingProduct?.mainImagePath ?? null),
    uploadedMainImagePath,
  };
}

function buildRecycleActionResult(
  targetLabel: string,
  result: MoveToRecycleBinResult,
): ProductActionResult {
  if (result.status === "created") {
    return {
      status: "success",
      message: `${targetLabel}已移入回收站。`,
      recycleStatus: result.status,
    };
  }

  if (result.status === "already_in_recycle_bin") {
    return {
      status: "success",
      message: `${targetLabel}已在回收站中。`,
      recycleStatus: result.status,
    };
  }

  return {
    status: "error",
    message: result.message,
    recycleStatus: result.status,
  };
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

async function runMoveToRecycleBinInlineAction(
  formData: FormData,
  fallbackPath: string,
  targetType: "PRODUCT" | "PRODUCT_SKU",
  targetLabel: string,
): Promise<ProductActionResult> {
  const redirectTo = sanitizeRedirectTarget(getFormValue(formData, "redirectTo"), fallbackPath);
  const actor = await getActor();

  try {
    const result = await moveToRecycleBin(actor, {
      targetType,
      targetId: getFormValue(formData, "id"),
      reasonCode: getRecycleReasonCode(formData),
      reasonText: getFormValue(formData, "reasonText"),
    });

    if (result.status !== "blocked") {
      revalidatePath("/products");
      revalidatePath("/suppliers");
      revalidatePath(getRedirectPathname(redirectTo));
    }

    return buildRecycleActionResult(targetLabel, result);
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
    const productId = getFormValue(formData, "id");
    const mainImagePlan = await buildProductMainImagePlan(formData, productId);

    try {
      await upsertProduct(actor, {
        id: productId,
        supplierId: getFormValue(formData, "supplierId"),
        code: getFormValue(formData, "code"),
        name: getFormValue(formData, "name"),
        mainImagePath: mainImagePlan.nextMainImagePath ?? "",
        brandName: getFormValue(formData, "brandName"),
        seriesName: getFormValue(formData, "seriesName"),
        categoryCode: getFormValue(formData, "categoryCode"),
        primarySalesSceneCode: getFormValue(formData, "primarySalesSceneCode"),
        supplyGroupCode: getFormValue(formData, "supplyGroupCode"),
        financeCategoryCode: getFormValue(formData, "financeCategoryCode"),
        description: getFormValue(formData, "description"),
        internalSupplyRemark: getFormValue(formData, "internalSupplyRemark"),
      });
      await commitProductMainImagePlan(mainImagePlan);
    } catch (error) {
      await rollbackProductMainImagePlan(mainImagePlan);
      throw error;
    }
  });
}

export async function upsertProductInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runProductInlineAction(formData, "/products", async (actor) => {
    const productId = getFormValue(formData, "id");
    const mainImagePlan = await buildProductMainImagePlan(formData, productId);

    try {
      await upsertProduct(actor, {
        id: productId,
        supplierId: getFormValue(formData, "supplierId"),
        code: getFormValue(formData, "code"),
        name: getFormValue(formData, "name"),
        mainImagePath: mainImagePlan.nextMainImagePath ?? "",
        brandName: getFormValue(formData, "brandName"),
        seriesName: getFormValue(formData, "seriesName"),
        categoryCode: getFormValue(formData, "categoryCode"),
        primarySalesSceneCode: getFormValue(formData, "primarySalesSceneCode"),
        supplyGroupCode: getFormValue(formData, "supplyGroupCode"),
        financeCategoryCode: getFormValue(formData, "financeCategoryCode"),
        description: getFormValue(formData, "description"),
        internalSupplyRemark: getFormValue(formData, "internalSupplyRemark"),
      });
      await commitProductMainImagePlan(mainImagePlan);
    } catch (error) {
      await rollbackProductMainImagePlan(mainImagePlan);
      throw error;
    }
  });
}

export async function createProductWithInitialSkuInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runProductInlineAction(formData, "/products", async (actor) => {
    const mainImagePlan = await buildProductMainImagePlan(formData, "");

    try {
      await createProductWithInitialSku(actor, {
        supplierId: getFormValue(formData, "supplierId"),
        code: getFormValue(formData, "code"),
        name: getFormValue(formData, "name"),
        mainImagePath: mainImagePlan.nextMainImagePath ?? "",
        brandName: getFormValue(formData, "brandName"),
        seriesName: getFormValue(formData, "seriesName"),
        categoryCode: getFormValue(formData, "categoryCode"),
        primarySalesSceneCode: getFormValue(formData, "primarySalesSceneCode"),
        supplyGroupCode: getFormValue(formData, "supplyGroupCode"),
        financeCategoryCode: getFormValue(formData, "financeCategoryCode"),
        description: getFormValue(formData, "description"),
        internalSupplyRemark: getFormValue(formData, "internalSupplyRemark"),
        initialSku: {
          skuName: getFormValue(formData, "skuName"),
          defaultUnitPrice: getFormValue(formData, "defaultUnitPrice"),
          codSupported: (getFormValue(formData, "codSupported") || "false") as
            | "true"
            | "false",
          insuranceSupported: (getFormValue(formData, "insuranceSupported") || "false") as
            | "true"
            | "false",
          defaultInsuranceAmount: getFormValue(formData, "defaultInsuranceAmount") || "0",
        },
      });
      await commitProductMainImagePlan(mainImagePlan);
    } catch (error) {
      await rollbackProductMainImagePlan(mainImagePlan);
      throw error;
    }
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
      skuName: getFormValue(formData, "skuName"),
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
      skuName: getFormValue(formData, "skuName"),
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

export async function moveProductToRecycleBinInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runMoveToRecycleBinInlineAction(formData, "/products", "PRODUCT", "商品");
}

export async function moveProductSkuToRecycleBinInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  return runMoveToRecycleBinInlineAction(formData, "/products", "PRODUCT_SKU", "SKU");
}

export async function saveProductSavedViewInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  const actor = await getActor();

  try {
    await saveProductSavedView(actor, {
      name: getFormValue(formData, "name"),
      tab: (getFormValue(formData, "tab") || "products") as "products" | "skus",
      filters: {
        q: getFormValue(formData, "q"),
        status: getFormValue(formData, "status"),
        supplierId: getFormValue(formData, "supplierId"),
        brandName: getFormValue(formData, "brandName"),
        seriesName: getFormValue(formData, "seriesName"),
        categoryCode: getFormValue(formData, "categoryCode"),
        primarySalesSceneCode: getFormValue(formData, "primarySalesSceneCode"),
        supplyGroupCode: getFormValue(formData, "supplyGroupCode"),
        financeCategoryCode: getFormValue(formData, "financeCategoryCode"),
        preset: getFormValue(formData, "preset"),
      },
    });

    revalidatePath("/products");

    return {
      status: "success",
      message: "当前视图已保存。",
    };
  } catch (error) {
    rethrowRedirectError(error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function deleteProductSavedViewInlineAction(
  formData: FormData,
): Promise<ProductActionResult> {
  const actor = await getActor();

  try {
    await deleteProductSavedView(actor, getFormValue(formData, "viewId"));
    revalidatePath("/products");

    return {
      status: "success",
      message: "已删除当前视图。",
    };
  } catch (error) {
    rethrowRedirectError(error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
