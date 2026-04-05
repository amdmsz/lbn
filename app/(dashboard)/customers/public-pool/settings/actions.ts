"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canAccessCustomerPublicPoolSettings } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES } from "@/lib/customers/public-pool-metadata";
import { upsertTeamPublicPoolSetting } from "@/lib/customers/public-pool-settings";

const settingsSchema = z.object({
  teamId: z.string().trim().min(1, "请选择团队。"),
  autoRecycleEnabled: z.boolean(),
  ownerExitRecycleEnabled: z.boolean(),
  autoAssignEnabled: z.boolean(),
  autoAssignStrategy: z.enum(PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES),
  autoAssignBatchSize: z.coerce.number().int().min(1).max(200),
  maxActiveCustomersPerSales: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    return value;
  }, z.coerce.number().int().min(1).max(500).nullable()),
  defaultInactiveDays: z.coerce.number().int().min(1).max(180),
  respectClaimLock: z.boolean(),
  strongEffectProtectionDays: z.coerce.number().int().min(0).max(60),
  mediumEffectProtectionDays: z.coerce.number().int().min(0).max(60),
  weakEffectResetsClock: z.boolean(),
  negativeRequiresSupervisorReview: z.boolean(),
  salesCanClaim: z.boolean(),
  salesCanRelease: z.boolean(),
  batchRecycleEnabled: z.boolean(),
  batchAssignEnabled: z.boolean(),
});

function getCheckboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function buildRedirectTarget(teamId: string, status: "success" | "error", message: string) {
  const params = new URLSearchParams();
  params.set("teamId", teamId);
  params.set("noticeStatus", status);
  params.set("noticeMessage", message);
  return `/customers/public-pool/settings?${params.toString()}`;
}

export async function saveCustomerPublicPoolSettingsAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerPublicPoolSettings(session.user.role)) {
    redirect("/customers/public-pool");
  }

  const rawInput = {
    teamId: String(formData.get("teamId") ?? ""),
    autoRecycleEnabled: getCheckboxValue(formData, "autoRecycleEnabled"),
    ownerExitRecycleEnabled: getCheckboxValue(formData, "ownerExitRecycleEnabled"),
    autoAssignEnabled: getCheckboxValue(formData, "autoAssignEnabled"),
    autoAssignStrategy: String(formData.get("autoAssignStrategy") ?? "NONE"),
    autoAssignBatchSize: formData.get("autoAssignBatchSize"),
    maxActiveCustomersPerSales: formData.get("maxActiveCustomersPerSales"),
    defaultInactiveDays: formData.get("defaultInactiveDays"),
    respectClaimLock: getCheckboxValue(formData, "respectClaimLock"),
    strongEffectProtectionDays: formData.get("strongEffectProtectionDays"),
    mediumEffectProtectionDays: formData.get("mediumEffectProtectionDays"),
    weakEffectResetsClock: getCheckboxValue(formData, "weakEffectResetsClock"),
    negativeRequiresSupervisorReview: getCheckboxValue(
      formData,
      "negativeRequiresSupervisorReview",
    ),
    salesCanClaim: getCheckboxValue(formData, "salesCanClaim"),
    salesCanRelease: getCheckboxValue(formData, "salesCanRelease"),
    batchRecycleEnabled: getCheckboxValue(formData, "batchRecycleEnabled"),
    batchAssignEnabled: getCheckboxValue(formData, "batchAssignEnabled"),
  };
  const parsed = settingsSchema.safeParse(rawInput);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "规则设置保存失败。";
    redirect(buildRedirectTarget(rawInput.teamId || "", "error", message));
  }

  try {
    await upsertTeamPublicPoolSetting(session.user.id, parsed.data);
  } catch (error) {
    redirect(
      buildRedirectTarget(
        parsed.data.teamId,
        "error",
        error instanceof Error ? error.message : "规则设置保存失败。",
      ),
    );
  }

  revalidatePath("/customers/public-pool");
  revalidatePath("/customers/public-pool/settings");
  revalidatePath("/customers/public-pool/reports");
  redirect(buildRedirectTarget(parsed.data.teamId, "success", "团队公海规则已保存。"));
}
