"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/lib/auth/session";
import { saveGiftFulfillmentCompatTask } from "@/lib/gifts/fulfillment-compat";
import { createGiftRecord, updateGiftReview } from "@/lib/gifts/mutations";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "表单校验失败。";
  }

  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export async function createGiftRecordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
    };
  }

  try {
    const result = await createGiftRecord(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        customerId: String(formData.get("customerId") ?? ""),
        liveSessionId: String(formData.get("liveSessionId") ?? ""),
        giftName: String(formData.get("giftName") ?? ""),
        qualificationSource: String(formData.get("qualificationSource") ?? "") as never,
        freightAmount: Number(formData.get("freightAmount") ?? 0),
        receiverName: String(formData.get("receiverName") ?? ""),
        receiverPhone: String(formData.get("receiverPhone") ?? ""),
        receiverAddress: String(formData.get("receiverAddress") ?? ""),
        remark: String(formData.get("remark") ?? ""),
      },
    );

    revalidatePath("/gifts");
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");

    return {
      status: "success",
      message: "礼品记录已创建。",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateGiftReviewAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
    };
  }

  try {
    const result = await updateGiftReview(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        giftRecordId: String(formData.get("giftRecordId") ?? ""),
        reviewStatus: String(formData.get("reviewStatus") ?? "") as never,
      },
    );

    revalidatePath("/gifts");
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");

    return {
      status: "success",
      message: "礼品审核状态已更新。",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function saveGiftFulfillmentCompatAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录状态已失效，请重新登录后再试。",
    };
  }

  try {
    const result = await saveGiftFulfillmentCompatTask(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        giftRecordId: String(formData.get("giftRecordId") ?? ""),
        assigneeId: String(formData.get("assigneeId") ?? ""),
        trackingNumber: String(formData.get("trackingNumber") ?? ""),
        status: String(formData.get("status") ?? "") as never,
        remark: String(formData.get("remark") ?? ""),
      },
    );

    revalidatePath("/gifts");
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/payment-records");
    revalidatePath("/collection-tasks");

    return {
      status: "success",
      message: "礼品履约兼容任务已更新。",
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
