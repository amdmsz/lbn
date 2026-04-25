"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/lib/auth/session";
import { moveToRecycleBin } from "@/lib/recycle-bin/lifecycle";
import type { MoveToRecycleBinResult, RecycleReasonInputCode } from "@/lib/recycle-bin/types";
import {
  createLiveSession,
  updateLiveSessionLifecycle,
} from "@/lib/live-sessions/mutations";
import {
  confirmLiveAudienceRecord,
  ignoreLiveAudienceRecord,
  syncCurrentWecomLiveSessionByUser,
  syncExistingWecomLiveSession,
  syncWecomLiveSessionByLivingId,
} from "@/lib/live-sessions/wecom-sync";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  recycleStatus?: MoveToRecycleBinResult["status"];
};

function getRecycleReasonCode(formData: FormData): RecycleReasonInputCode {
  const reasonCode = String(formData.get("reasonCode") ?? "");

  if (
    reasonCode === "mistaken_creation" ||
    reasonCode === "test_data" ||
    reasonCode === "duplicate" ||
    reasonCode === "no_longer_needed" ||
    reasonCode === "other"
  ) {
    return reasonCode;
  }

  return "mistaken_creation";
}

function buildRecycleActionState(result: MoveToRecycleBinResult): ActionState {
  if (result.status === "created") {
    return {
      status: "success",
      message: "场次已移入回收站。",
      recycleStatus: result.status,
    };
  }

  if (result.status === "already_in_recycle_bin") {
    return {
      status: "success",
      message: "场次已在回收站中。",
      recycleStatus: result.status,
    };
  }

  return {
    status: "error",
    message: result.message,
    recycleStatus: result.status,
  };
}

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
        hostName: String(formData.get("hostName") ?? "直播场次") || "直播场次",
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

export async function moveLiveSessionToRecycleBinAction(
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录已失效，请重新登录后再试。",
    };
  }

  const liveSessionId = String(formData.get("id") ?? "");

  if (!liveSessionId) {
    return {
      status: "error",
      message: "场次参数不完整，请刷新后重试。",
    };
  }

  try {
    const result = await moveToRecycleBin(
      {
        id: session.user.id,
        role: session.user.role,
        permissionCodes: session.user.permissionCodes,
      },
      {
        targetType: "LIVE_SESSION",
        targetId: liveSessionId,
        reasonCode: getRecycleReasonCode(formData),
        reasonText: String(formData.get("reasonText") ?? ""),
      },
    );

    if (result.status !== "blocked") {
      revalidatePath("/live-sessions");
    }

    return buildRecycleActionState(result);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "移入回收站时发生未知错误。",
    };
  }
}

export async function syncWecomLiveSessionAction(formData: FormData): Promise<ActionState> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录已失效，请重新登录后再试。",
    };
  }

  try {
    const liveSessionId = String(formData.get("id") ?? "").trim();
    const livingid = String(formData.get("livingid") ?? "").trim();
    const actor = {
      id: session.user.id,
      role: session.user.role,
      permissionCodes: session.user.permissionCodes,
      teamId: session.user.teamId ?? null,
    };
    const result = liveSessionId
      ? await syncExistingWecomLiveSession(actor, { liveSessionId })
      : await syncWecomLiveSessionByLivingId(actor, { livingid });

    revalidatePath("/live-sessions");

    return {
      status: "success",
      message: `企业微信直播已同步：${result.viewerCount} 位观众，${result.autoMatched} 位自动匹配，${result.pending} 位待确认。`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "同步企业微信直播时发生未知错误。",
    };
  }
}

export async function syncCurrentWecomLiveSessionAction(
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
    const result = await syncCurrentWecomLiveSessionByUser(
      {
        id: session.user.id,
        role: session.user.role,
        permissionCodes: session.user.permissionCodes,
        teamId: session.user.teamId ?? null,
      },
      { userid: String(formData.get("userid") ?? "") },
    );

    revalidatePath("/live-sessions");

    return {
      status: "success",
      message: `已同步当前直播：${result.liveSession.title}，${result.viewerCount} 位观众，${result.pending} 位待确认。`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "同步当前直播时发生未知错误。",
    };
  }
}

export async function confirmLiveAudienceRecordAction(
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
    await confirmLiveAudienceRecord(
      {
        id: session.user.id,
        role: session.user.role,
        permissionCodes: session.user.permissionCodes,
        teamId: session.user.teamId ?? null,
      },
      { audienceRecordId: String(formData.get("audienceRecordId") ?? "") },
    );

    revalidatePath("/live-sessions");

    return {
      status: "success",
      message: "观众匹配已确认，并已写入客户直播记录。",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "确认观众匹配时发生未知错误。",
    };
  }
}

export async function ignoreLiveAudienceRecordAction(
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
    await ignoreLiveAudienceRecord(
      {
        id: session.user.id,
        role: session.user.role,
        permissionCodes: session.user.permissionCodes,
        teamId: session.user.teamId ?? null,
      },
      {
        audienceRecordId: String(formData.get("audienceRecordId") ?? ""),
        reason: String(formData.get("reason") ?? ""),
      },
    );

    revalidatePath("/live-sessions");

    return {
      status: "success",
      message: "候选观众匹配已忽略。",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "忽略观众匹配时发生未知错误。",
    };
  }
}
