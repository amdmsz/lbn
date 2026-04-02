"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import {
  buildRedirectTarget,
  getFormValue,
  rethrowRedirectError,
} from "@/lib/action-notice";
import { toggleSupplier, upsertSupplier } from "@/lib/suppliers/mutations";

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

async function runSupplierAction(
  formData: FormData,
  fallbackPath: string,
  action: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<void>,
) {
  const redirectTo = getFormValue(formData, "redirectTo") || fallbackPath;
  const actor = await getActor();

  try {
    await action(actor);
  } catch (error) {
    rethrowRedirectError(error);
    const message = error instanceof Error ? error.message : "操作失败，请稍后重试。";
    redirect(buildRedirectTarget(redirectTo, "error", message));
  }

  redirect(buildRedirectTarget(redirectTo, "success", "保存成功"));
}

export async function upsertSupplierAction(formData: FormData) {
  return runSupplierAction(formData, "/suppliers", async (actor) => {
    await upsertSupplier(actor, {
      id: getFormValue(formData, "id"),
      code: getFormValue(formData, "code"),
      name: getFormValue(formData, "name"),
      contactName: getFormValue(formData, "contactName"),
      contactPhone: getFormValue(formData, "contactPhone"),
      remark: getFormValue(formData, "remark"),
    });
  });
}

export async function toggleSupplierAction(formData: FormData) {
  return runSupplierAction(formData, "/suppliers", async (actor) => {
    await toggleSupplier(actor, getFormValue(formData, "id"));
  });
}
