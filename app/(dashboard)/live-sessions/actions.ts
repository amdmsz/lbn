"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/lib/auth/session";
import {
  createLiveSession,
  updateLiveSessionLifecycle,
} from "@/lib/live-sessions/mutations";

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
      message: "\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u518d\u8bd5\u3002",
    };
  }

  try {
    await createLiveSession(
      {
        id: session.user.id,
        role: session.user.role,
        permissionCodes: session.user.permissionCodes,
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
      message: "\u76f4\u64ad\u573a\u6b21\u5df2\u521b\u5efa\u3002",
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "error",
        message: error.issues[0]?.message ?? "\u8868\u5355\u6821\u9a8c\u5931\u8d25\u3002",
      };
    }

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "\u521b\u5efa\u76f4\u64ad\u573a\u6b21\u65f6\u53d1\u751f\u672a\u77e5\u9519\u8bef\u3002",
    };
  }
}

export async function updateLiveSessionLifecycleAction(
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u518d\u8bd5\u3002",
    };
  }

  const intent = String(formData.get("intent") ?? "");
  const liveSessionId = String(formData.get("id") ?? "");

  if (!liveSessionId || (intent !== "cancel" && intent !== "archive")) {
    return {
      status: "error",
      message: "\u573a\u6b21\u52a8\u4f5c\u53c2\u6570\u4e0d\u5b8c\u6574\uff0c\u8bf7\u5237\u65b0\u540e\u91cd\u8bd5\u3002",
    };
  }

  try {
    await updateLiveSessionLifecycle(
      {
        id: session.user.id,
        role: session.user.role,
        permissionCodes: session.user.permissionCodes,
      },
      {
        liveSessionId,
        nextStatus: intent === "cancel" ? "CANCELED" : "ENDED",
      },
    );

    revalidatePath("/live-sessions");

    return {
      status: "success",
      message:
        intent === "cancel"
          ? "\u573a\u6b21\u5df2\u53d6\u6d88\u3002"
          : "\u573a\u6b21\u5df2\u5f52\u6863\u4e3a\u5386\u53f2\u8bb0\u5f55\u3002",
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "error",
        message: error.issues[0]?.message ?? "\u52a8\u4f5c\u6821\u9a8c\u5931\u8d25\u3002",
      };
    }

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "\u66f4\u65b0\u76f4\u64ad\u573a\u6b21\u65f6\u53d1\u751f\u672a\u77e5\u9519\u8bef\u3002",
    };
  }
}
