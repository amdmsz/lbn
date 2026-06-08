"use server";

import {
  OperationModule,
  OperationTargetType,
  RecycleEntryStatus,
  type RecycleTargetType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/session";
import { getRedirectPathname, getFormValue } from "@/lib/action-notice";
import {
  canFinalizeRecycleBinTargets,
  canPermanentlyDeleteCustomers,
} from "@/lib/auth/access";
import { listVisibleCustomerRecycleTargetIds } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import {
  finalizeRecycleBinEntry,
  purgeFromRecycleBin,
  restoreFromRecycleBin,
} from "@/lib/recycle-bin/lifecycle";
import { listRecycleEntries } from "@/lib/recycle-bin/repository";
import type {
  FinalizeRecycleBinResult,
  PurgeFromRecycleBinResult,
  RestoreFromRecycleBinResult,
} from "@/lib/recycle-bin/types";
import { RECYCLE_BIN_PURGE_ALL_CONFIRMATION } from "@/lib/recycle-bin/bulk-purge-constants";

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

export type PurgeAllRecycleBinEntriesActionResult = {
  status: "success" | "error";
  message: string;
  successCount?: number;
  failedCount?: number;
  skippedCount?: number;
  failureExamples?: string[];
};

const PURGE_ALL_TARGET_TYPE_VALUES: readonly RecycleTargetType[] = [
  "PRODUCT",
  "PRODUCT_SKU",
  "SUPPLIER",
  "LIVE_SESSION",
  "LEAD",
  "TRADE_ORDER",
  "CUSTOMER",
];

function getTargetTypeForDomainSummary(targetType: RecycleTargetType) {
  switch (targetType) {
    case "PRODUCT":
      return { module: OperationModule.PRODUCT, targetType: OperationTargetType.PRODUCT, label: "商品" };
    case "PRODUCT_SKU":
      return {
        module: OperationModule.PRODUCT,
        targetType: OperationTargetType.PRODUCT_SKU,
        label: "商品 SKU",
      };
    case "SUPPLIER":
      return { module: OperationModule.SUPPLIER, targetType: OperationTargetType.SUPPLIER, label: "供应商" };
    case "LIVE_SESSION":
      return {
        module: OperationModule.LIVE_SESSION,
        targetType: OperationTargetType.LIVE_SESSION,
        label: "直播场次",
      };
    case "LEAD":
      return { module: OperationModule.LEAD, targetType: OperationTargetType.LEAD, label: "线索" };
    case "TRADE_ORDER":
      return {
        module: OperationModule.SALES_ORDER,
        targetType: OperationTargetType.TRADE_ORDER,
        label: "成交主单",
      };
    case "CUSTOMER":
      return { module: OperationModule.CUSTOMER, targetType: OperationTargetType.CUSTOMER, label: "客户" };
    default:
      return { module: OperationModule.SYSTEM, targetType: OperationTargetType.SYSTEM_SETTING, label: "对象" };
  }
}

function normalizeTargetTypeInput(value: string): RecycleTargetType | null {
  return (PURGE_ALL_TARGET_TYPE_VALUES as readonly string[]).includes(value)
    ? (value as RecycleTargetType)
    : null;
}

export async function purgeAllRecycleBinEntriesAction(
  formData: FormData,
): Promise<PurgeAllRecycleBinEntriesActionResult> {
  let actor: Awaited<ReturnType<typeof getActor>>;

  try {
    actor = await getActor();
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "登录已失效，请重新登录后再试。",
    };
  }

  const targetTypeInput = getFormValue(formData, "targetType");
  const targetType = normalizeTargetTypeInput(targetTypeInput);

  if (!targetType) {
    return {
      status: "error",
      message: "未识别的回收站对象类型，无法执行一键清空。",
    };
  }

  const reason = getFormValue(formData, "reason").trim();

  if (reason.length < 10) {
    return {
      status: "error",
      message: "请填写至少 10 个字符的删除原因。",
    };
  }

  const confirmation = getFormValue(formData, "confirmation").trim();

  if (confirmation && confirmation !== RECYCLE_BIN_PURGE_ALL_CONFIRMATION) {
    return {
      status: "error",
      message: `请输入确认短语「${RECYCLE_BIN_PURGE_ALL_CONFIRMATION}」后再提交。`,
    };
  }

  const canPurge =
    targetType === "CUSTOMER"
      ? canPermanentlyDeleteCustomers(actor.role)
      : canFinalizeRecycleBinTargets(actor.role);

  if (!canPurge) {
    return {
      status: "error",
      message: "仅主管以上可执行回收站一键清空。",
    };
  }

  const meta = getTargetTypeForDomainSummary(targetType);

  let entries: Awaited<ReturnType<typeof listRecycleEntries>>;

  try {
    entries = await listRecycleEntries(prisma, {
      statuses: [RecycleEntryStatus.ACTIVE],
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "读取回收站条目失败，请稍后重试。",
    };
  }

  let scopedEntries = entries.filter((entry) => entry.targetType === targetType);

  if (targetType === "CUSTOMER") {
    try {
      const visibleIds = await listVisibleCustomerRecycleTargetIds(
        prisma,
        actor,
        scopedEntries,
      );
      scopedEntries = scopedEntries.filter((entry) => visibleIds.has(entry.targetId));
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "校验客户回收站可见范围失败，请稍后重试。",
      };
    }
  }

  if (scopedEntries.length === 0) {
    await prisma.operationLog.create({
      data: {
        actorId: actor.id,
        module: meta.module,
        action: "recycle_bin.bulk_purge_all",
        targetType: meta.targetType,
        targetId: targetType,
        description: `一键清空 ${meta.label} 回收站：当前可见范围无 ACTIVE 条目；原因：${reason}`,
        afterData: {
          targetType,
          reason,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          totalCandidates: 0,
        },
      },
    });

    return {
      status: "success",
      message: `${meta.label}回收站当前可见范围内无 ACTIVE 条目，无需清理。`,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      failureExamples: [],
    };
  }

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failureExamples: string[] = [];

  for (const entry of scopedEntries) {
    try {
      const result = await purgeFromRecycleBin(actor, { entryId: entry.id });

      if (result.status === "purged") {
        successCount += 1;
        continue;
      }

      // blocked or any other non-success status: count as skipped
      skippedCount += 1;
      if (failureExamples.length < 3) {
        failureExamples.push(`${entry.titleSnapshot}：${result.message}`);
      }
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : "未知错误";
      if (failureExamples.length < 3) {
        failureExamples.push(`${entry.titleSnapshot}：${message}`);
      }
    }
  }

  try {
    await prisma.operationLog.create({
      data: {
        actorId: actor.id,
        module: meta.module,
        action: "recycle_bin.bulk_purge_all",
        targetType: meta.targetType,
        targetId: targetType,
        description: `一键清空 ${meta.label} 回收站：候选 ${scopedEntries.length}，成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}。原因：${reason}`,
        afterData: {
          targetType,
          reason,
          successCount,
          failedCount,
          skippedCount,
          totalCandidates: scopedEntries.length,
          failureExamples,
        },
      },
    });
  } catch {
    // operation log 写失败不阻断结果回传；purge 自身仍会逐条记录 audit。
  }

  revalidatePath("/recycle-bin");
  revalidateTargetRoutes({ targetType });

  const overallStatus = successCount > 0 || failedCount === 0 ? "success" : "error";
  const summary = `一键清空${meta.label}完成：成功 ${successCount} 条，跳过 ${skippedCount} 条，失败 ${failedCount} 条。`;
  const detail =
    failureExamples.length > 0 ? ` 示例：${failureExamples.join("；")}` : "";

  return {
    status: overallStatus,
    message: `${summary}${detail}`,
    successCount,
    failedCount,
    skippedCount,
    failureExamples,
  };
}
