"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/lib/auth/session";
import { createCallRecord } from "@/lib/calls/mutations";

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

    revalidatePath("/customers");
    revalidatePath("/dashboard");
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
