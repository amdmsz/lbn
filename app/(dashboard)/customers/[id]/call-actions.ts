"use server";

import { revalidatePath, updateTag } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/lib/auth/session";
import { createCallRecord } from "@/lib/calls/mutations";
import { CACHE_TAGS } from "@/lib/cache-tags";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function createCustomerCallRecordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录已失效，请重新登录后再试。",
    };
  }

  try {
    const result = await createCallRecord(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        customerId: String(formData.get("customerId") ?? ""),
        callTime: String(formData.get("callTime") ?? ""),
        durationSeconds: Number(formData.get("durationSeconds") ?? 0),
        result: String(formData.get("result") ?? ""),
        remark: String(formData.get("remark") ?? ""),
        nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? ""),
      },
    );

    // 用户反馈 "打完电话备注完, 列表就变了, 找不到那个客户". 因为
    // revalidatePath("/customers") 会强制当前 /customers route 整页重新
    // SSR + RSC re-render, list 按 updatedAt desc 排序, 客户被推到第 1 页.
    // 改成 revalidateTag(customerList) — 只让数据 cache 失效, 当前页 UI
    // 不强制 re-render, 用户翻页/筛选/搜索时自然拿新数据, 但当前页保持稳定.
    updateTag(CACHE_TAGS.customerList);
    updateTag(CACHE_TAGS.customer(result.customerId));
    // dashboard 不在 customer center 视图, 用户切到 dashboard 时确实要看新数据
    revalidatePath("/dashboard");
    // detail 页用户主动进去时刷新, 不会撞到列表 reorder 问题
    revalidatePath(`/customers/${result.customerId}`);

    return {
      status: "success",
      message: "通话记录已保存。",
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "error",
        message: error.issues[0]?.message ?? "表单校验失败。",
      };
    }

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "保存通话记录时发生未知错误。",
    };
  }
}
