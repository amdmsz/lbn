"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/session";
import { getRedirectPathname, getFormValue } from "@/lib/action-notice";
import {
  finalizeRecycleBinEntry,
  purgeFromRecycleBin,
  restoreFromRecycleBin,
} from "@/lib/recycle-bin/lifecycle";
import type {
  FinalizeRecycleBinResult,
  PurgeFromRecycleBinResult,
  RestoreFromRecycleBinResult,
} from "@/lib/recycle-bin/types";

export type RecycleBinActionResult = {
  status: "success" | "error";
  message: string;
  restoreStatus?: RestoreFromRecycleBinResult["status"];
  purgeStatus?: PurgeFromRecycleBinResult["status"];
  finalizeStatus?: FinalizeRecycleBinResult["status"];
};

async function getActor() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("登录已失效，请重新登录后再试。");
  }

  return {
    id: session.user.id,
    role: session.user.role,
    permissionCodes: session.user.permissionCodes,
  };
}

function buildRestoreActionResult(
  result: RestoreFromRecycleBinResult,
): RecycleBinActionResult {
  if (result.status === "restored") {
    const pairedCount = result.pairedRestoredEntries.length;

    return {
      status: "success",
      message:
        pairedCount > 0
          ? `对象已从回收站恢复，并同步恢复 ${pairedCount} 个关联对象。`
          : "对象已从回收站恢复。",
      restoreStatus: result.status,
    };
  }

  return {
    status: "error",
    message: result.message,
    restoreStatus: result.status,
  };
}

function buildPurgeActionResult(
  result: PurgeFromRecycleBinResult,
): RecycleBinActionResult {
  if (result.status === "purged") {
    return {
      status: "success",
      message: "对象已从回收站永久删除。",
      purgeStatus: result.status,
    };
  }

  return {
    status: "error",
    message: result.message,
    purgeStatus: result.status,
  };
}

function buildFinalizeActionResult(
  result: FinalizeRecycleBinResult,
): RecycleBinActionResult {
  if (result.status === "purged" || result.status === "archived") {
    return {
      status: "success",
      message:
        result.status === "purged"
          ? "对象已完成最终处理：PURGE。"
          : "对象已完成最终处理：ARCHIVE。",
      finalizeStatus: result.status,
    };
  }

  return {
    status: "error",
    message: result.message,
    finalizeStatus: result.status,
  };
}

function revalidateTargetRoutes(input: {
  targetType:
    | "PRODUCT"
    | "PRODUCT_SKU"
    | "SUPPLIER"
    | "LIVE_SESSION"
    | "LEAD"
    | "TRADE_ORDER"
    | "CUSTOMER";
  restoreRouteSnapshot?: string;
  pairedRestoredEntries?: Extract<
    RestoreFromRecycleBinResult,
    { status: "restored" }
  >["pairedRestoredEntries"];
}) {
  revalidatePath("/recycle-bin");

  revalidateTargetRoute(input.targetType, input.restoreRouteSnapshot);

  for (const pairedEntry of input.pairedRestoredEntries ?? []) {
    revalidateTargetRoute(pairedEntry.targetType, pairedEntry.restoreRouteSnapshot);
  }
}

function revalidateTargetRoute(
  targetType:
    | "PRODUCT"
    | "PRODUCT_SKU"
    | "SUPPLIER"
    | "LIVE_SESSION"
    | "LEAD"
    | "TRADE_ORDER"
    | "CUSTOMER",
  restoreRouteSnapshot?: string,
) {
  if (targetType === "LIVE_SESSION") {
    revalidatePath("/live-sessions");
  } else if (targetType === "LEAD") {
    revalidatePath("/leads");
  } else if (targetType === "TRADE_ORDER") {
    revalidatePath("/orders");
    revalidatePath("/fulfillment");
  } else if (targetType === "CUSTOMER") {
    revalidatePath("/customers");
  } else {
    revalidatePath("/products");
  }

  if (restoreRouteSnapshot) {
    revalidatePath(getRedirectPathname(restoreRouteSnapshot));
  }
}

export async function restoreRecycleBinEntryAction(
  formData: FormData,
): Promise<RecycleBinActionResult> {
  try {
    const actor = await getActor();
    const result = await restoreFromRecycleBin(actor, {
      entryId: getFormValue(formData, "entryId"),
    });

    revalidateTargetRoutes({
      targetType: result.targetType,
      restoreRouteSnapshot: result.restoreRouteSnapshot,
      pairedRestoredEntries:
        result.status === "restored" ? result.pairedRestoredEntries : [],
    });

    return buildRestoreActionResult(result);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "恢复失败，请稍后重试。",
    };
  }
}

export async function purgeRecycleBinEntryAction(
  formData: FormData,
): Promise<RecycleBinActionResult> {
  try {
    const actor = await getActor();
    const result = await purgeFromRecycleBin(actor, {
      entryId: getFormValue(formData, "entryId"),
    });

    revalidateTargetRoutes({
      targetType: result.targetType,
    });

    return buildPurgeActionResult(result);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "永久删除失败，请稍后重试。",
    };
  }
}

export async function finalizeRecycleBinEntryAction(
  formData: FormData,
): Promise<RecycleBinActionResult> {
  try {
    const actor = await getActor();
    const result = await finalizeRecycleBinEntry(actor, {
      entryId: getFormValue(formData, "entryId"),
    });

    revalidateTargetRoutes({
      targetType: result.targetType,
    });

    return buildFinalizeActionResult(result);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "最终处理失败，请稍后重试。",
    };
  }
}
