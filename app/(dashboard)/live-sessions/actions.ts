"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/lib/auth/session";
import { createLiveSession } from "@/lib/live-sessions/mutations";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function createLiveSessionAction(
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
    await createLiveSession(
      {
        id: session.user.id,
        role: session.user.role,
      },
      {
        title: String(formData.get("title") ?? ""),
        hostName: String(formData.get("hostName") ?? ""),
        startAt: String(formData.get("startAt") ?? ""),
        roomId: String(formData.get("roomId") ?? ""),
        roomLink: String(formData.get("roomLink") ?? ""),
        targetProduct: String(formData.get("targetProduct") ?? ""),
        remark: String(formData.get("remark") ?? ""),
      },
    );

    revalidatePath("/live-sessions");

    return {
      status: "success",
      message: "直播场次已创建。",
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
        error instanceof Error ? error.message : "创建直播场次时发生未知错误。",
    };
  }
}
