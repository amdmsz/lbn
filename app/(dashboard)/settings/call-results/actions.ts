"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { auth } from "@/lib/auth/session";
import {
  deleteCallResultSetting,
  upsertCallResultSetting,
} from "@/lib/calls/settings";

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getCheckboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function buildRedirectTarget(
  status: "success" | "error",
  message: string,
) {
  const params = new URLSearchParams();
  params.set("noticeStatus", status);
  params.set("noticeMessage", message);
  return `/settings/call-results?${params.toString()}`;
}

async function getActor() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return {
    id: session.user.id,
    role: session.user.role,
  };
}

export async function saveCallResultSettingAction(formData: FormData) {
  const actor = await getActor();

  try {
    await upsertCallResultSetting(actor.id, {
      id: getValue(formData, "id"),
      code: getValue(formData, "code"),
      label: getValue(formData, "label"),
      description: getValue(formData, "description"),
      isSystem: getValue(formData, "isSystem") === "true",
      isEnabled: getCheckboxValue(formData, "isEnabled"),
      sortOrder: getValue(formData, "sortOrder"),
      effectLevel: getValue(formData, "effectLevel"),
      resetsPublicPoolClock: getCheckboxValue(formData, "resetsPublicPoolClock"),
      claimProtectionDays: getValue(formData, "claimProtectionDays"),
      requiresSupervisorReview: getCheckboxValue(
        formData,
        "requiresSupervisorReview",
      ),
      wechatSyncAction: getValue(formData, "wechatSyncAction"),
    });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "通话结果保存失败。"
        : error instanceof Error
          ? error.message
          : "通话结果保存失败。";

    redirect(buildRedirectTarget("error", message));
  }

  revalidatePath("/settings");
  revalidatePath("/settings/call-results");
  redirect(buildRedirectTarget("success", "通话结果配置已保存。"));
}

export async function deleteCallResultSettingAction(formData: FormData) {
  const actor = await getActor();

  try {
    await deleteCallResultSetting(actor.id, getValue(formData, "id"));
  } catch (error) {
    redirect(
      buildRedirectTarget(
        "error",
        error instanceof Error ? error.message : "通话结果删除失败。",
      ),
    );
  }

  revalidatePath("/settings");
  revalidatePath("/settings/call-results");
  redirect(buildRedirectTarget("success", "通话结果已删除。"));
}
