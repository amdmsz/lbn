"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { upsertLiveInvitation } from "@/lib/live-sessions/mutations";
import { auth } from "@/lib/auth/session";
import { createWechatRecord } from "@/lib/wechat/mutations";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function createCustomerWechatRecordAction(
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
    const result = await createWechatRecord(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        customerId: String(formData.get("customerId") ?? ""),
        addedStatus: String(formData.get("addedStatus") ?? ""),
        addedAt: String(formData.get("addedAt") ?? ""),
        wechatAccount: String(formData.get("wechatAccount") ?? ""),
        wechatNickname: String(formData.get("wechatNickname") ?? ""),
        wechatRemarkName: String(formData.get("wechatRemarkName") ?? ""),
        tags: String(formData.get("tags") ?? ""),
        summary: String(formData.get("summary") ?? ""),
        nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? ""),
      },
    );

    revalidatePath(`/customers/${result.customerId}`);

    return {
      status: "success",
      message: "微信记录已保存。",
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
        error instanceof Error ? error.message : "保存微信记录时发生未知错误。",
    };
  }
}

export async function upsertCustomerLiveInvitationAction(
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
    const result = await upsertLiveInvitation(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        customerId: String(formData.get("customerId") ?? ""),
        liveSessionId: String(formData.get("liveSessionId") ?? ""),
        invited: String(formData.get("invited") ?? ""),
        invitedAt: String(formData.get("invitedAt") ?? ""),
        invitationMethod: String(formData.get("invitationMethod") ?? "") as never,
        attended: String(formData.get("attended") ?? ""),
        watchDurationMinutes: Number(formData.get("watchDurationMinutes") ?? 0),
        giftQualified: String(formData.get("giftQualified") ?? ""),
        remark: String(formData.get("remark") ?? ""),
      },
    );

    revalidatePath(`/customers/${result.customerId}`);

    return {
      status: "success",
      message: "直播邀约记录已保存。",
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
        error instanceof Error ? error.message : "保存直播邀约记录时发生未知错误。",
    };
  }
}
