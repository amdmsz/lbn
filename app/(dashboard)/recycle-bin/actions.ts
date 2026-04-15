"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/session";
import { getRedirectPathname, getFormValue } from "@/lib/action-notice";
import {
  purgeFromRecycleBin,
  restoreFromRecycleBin,
} from "@/lib/recycle-bin/lifecycle";
import type {
  PurgeFromRecycleBinResult,
  RestoreFromRecycleBinResult,
} from "@/lib/recycle-bin/types";

export type RecycleBinActionResult = {
  status: "success" | "error";
  message: string;
  restoreStatus?: RestoreFromRecycleBinResult["status"];
  purgeStatus?: PurgeFromRecycleBinResult["status"];
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
    return {
      status: "success",
      message: "对象已从回收站恢复。",
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

function revalidateTargetRoutes(input: {
  targetType:
    | "PRODUCT"
    | "PRODUCT_SKU"
    | "SUPPLIER"
    | "LIVE_SESSION"
    | "LEAD"
    | "TRADE_ORDER";
  restoreRouteSnapshot?: string;
}) {
  revalidatePath("/recycle-bin");

  if (input.targetType === "LIVE_SESSION") {
    revalidatePath("/live-sessions");
  } else if (input.targetType === "LEAD") {
    revalidatePath("/leads");
  } else if (input.targetType === "TRADE_ORDER") {
    revalidatePath("/orders");
    revalidatePath("/fulfillment");
  } else {
    revalidatePath("/products");
  }

  if (input.restoreRouteSnapshot) {
    revalidatePath(getRedirectPathname(input.restoreRouteSnapshot));
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
