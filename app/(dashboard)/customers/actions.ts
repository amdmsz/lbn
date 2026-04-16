"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canBatchManageCustomerTags } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { assignCustomerTag } from "@/lib/master-data/mutations";

const batchAddCustomerTagSchema = z.object({
  customerIds: z.array(z.string().trim().min(1)).default([]),
  tagId: z.string().trim().min(1, "请选择要添加的标签。"),
});

export type BatchAddCustomerTagBlockedReason = {
  reason: string;
  count: number;
};

export type BatchAddCustomerTagActionResult = {
  status: "success" | "error";
  message: string;
  summary: {
    totalCount: number;
    successCount: number;
    alreadyTaggedCount: number;
    blockedCount: number;
  };
  blockedReasons: BatchAddCustomerTagBlockedReason[];
};

function buildEmptyResult(message: string): BatchAddCustomerTagActionResult {
  return {
    status: "error",
    message,
    summary: {
      totalCount: 0,
      successCount: 0,
      alreadyTaggedCount: 0,
      blockedCount: 0,
    },
    blockedReasons: [],
  };
}

function buildBlockedReasons(
  blockedReasonMap: Map<string, number>,
): BatchAddCustomerTagBlockedReason[] {
  return [...blockedReasonMap.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
    }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

async function getBatchCustomerTagActor() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("登录已失效，请重新登录后再试。");
  }

  return {
    id: session.user.id,
    role: session.user.role,
  };
}

export async function batchAddCustomerTagAction(
  formData: FormData,
): Promise<BatchAddCustomerTagActionResult> {
  try {
    const actor = await getBatchCustomerTagActor();

    if (!canBatchManageCustomerTags(actor.role)) {
      return buildEmptyResult("当前角色没有批量添加客户标签的权限。");
    }

    const parsed = batchAddCustomerTagSchema.safeParse({
      customerIds: formData.getAll("customerIds").map((value) => String(value).trim()),
      tagId: String(formData.get("tagId") ?? "").trim(),
    });

    if (!parsed.success) {
      return buildEmptyResult(
        parsed.error.issues[0]?.message ?? "提交数据不完整，无法执行批量添加标签。",
      );
    }

    const customerIds = [...new Set(parsed.data.customerIds)];

    if (customerIds.length === 0) {
      return buildEmptyResult("请先选择客户。");
    }

    let successCount = 0;
    let alreadyTaggedCount = 0;
    let blockedCount = 0;
    const blockedReasonMap = new Map<string, number>();

    for (const customerId of customerIds) {
      try {
        const result = await assignCustomerTag(actor, {
          customerId,
          tagId: parsed.data.tagId,
        });

        if (result.status === "created") {
          successCount += 1;
        } else {
          alreadyTaggedCount += 1;
        }
      } catch (error) {
        blockedCount += 1;
        const reason =
          error instanceof Error ? error.message : "批量添加标签失败，请稍后重试。";
        blockedReasonMap.set(reason, (blockedReasonMap.get(reason) ?? 0) + 1);
      }
    }

    if (successCount > 0) {
      revalidatePath("/customers");
    }

    return {
      status: successCount > 0 || alreadyTaggedCount > 0 ? "success" : "error",
      message:
        successCount > 0
          ? "已完成批量添加标签。"
          : alreadyTaggedCount > 0
            ? "所选客户已有部分标签，无需重复添加。"
            : "所选客户均未添加标签。",
      summary: {
        totalCount: customerIds.length,
        successCount,
        alreadyTaggedCount,
        blockedCount,
      },
      blockedReasons: buildBlockedReasons(blockedReasonMap),
    };
  } catch (error) {
    return buildEmptyResult(
      error instanceof Error ? error.message : "批量添加标签失败，请稍后重试。",
    );
  }
}
