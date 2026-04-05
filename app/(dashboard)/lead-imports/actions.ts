"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import {
  createLeadImportBatch,
  toggleLeadImportTemplate,
  upsertLeadImportTemplate,
} from "@/lib/lead-imports/mutations";
import {
  DEFAULT_LEAD_IMPORT_SOURCE,
  isLeadImportSourceValue,
  leadImportFieldDefinitions,
} from "@/lib/lead-imports/metadata";

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isNextRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
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

function buildRedirectTarget(
  redirectTo: string,
  status: "success" | "error",
  message: string,
) {
  const [pathname, queryString = ""] = redirectTo.split("?");
  const params = new URLSearchParams(queryString);
  params.set("noticeStatus", status);
  params.set("noticeMessage", message);
  return `${pathname}?${params.toString()}`;
}

function getSafeLeadImportSource(value: string) {
  return isLeadImportSourceValue(value) ? value : DEFAULT_LEAD_IMPORT_SOURCE;
}

export async function createLeadImportBatchAction(formData: FormData) {
  const actor = await getActor();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    redirect(buildRedirectTarget("/lead-imports", "error", "请先选择导入文件。"));
  }

  try {
    const result = await createLeadImportBatch(actor, {
      file,
      templateId: getValue(formData, "templateId"),
      defaultLeadSource: getSafeLeadImportSource(getValue(formData, "defaultLeadSource")),
      mappingConfig: getValue(formData, "mappingConfig"),
    });

    revalidatePath("/lead-imports");
    revalidatePath(`/lead-imports/${result.batchId}`);
    revalidatePath("/customers");
    revalidatePath("/leads");
    redirect(
      buildRedirectTarget(
        `/lead-imports/${result.batchId}`,
        "success",
        `导入完成：成功导入 ${result.successRows} 条线索，新增客户 ${result.createdCustomerRows} 个，关联已有客户 ${result.matchedCustomerRows} 个，重复剔除 ${result.duplicateRows} 行。`,
      ),
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "导入失败，请稍后重试。";
    redirect(buildRedirectTarget("/lead-imports", "error", message));
  }
}

export async function upsertLeadImportTemplateAction(formData: FormData) {
  const actor = await getActor();

  try {
    const mappingConfig = Object.fromEntries(
      leadImportFieldDefinitions.map((field) => [
        field.key,
        getValue(formData, `mapping_${field.key}`),
      ]),
    );

    await upsertLeadImportTemplate(actor, {
      id: getValue(formData, "id"),
      name: getValue(formData, "name"),
      description: getValue(formData, "description"),
      defaultLeadSource: getSafeLeadImportSource(getValue(formData, "defaultLeadSource")),
      mappingConfig,
    });

    revalidatePath("/lead-import-templates");
    revalidatePath("/lead-imports");
    redirect(buildRedirectTarget("/lead-import-templates", "success", "模板保存成功。"));
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "模板保存失败，请稍后重试。";
    redirect(buildRedirectTarget("/lead-import-templates", "error", message));
  }
}

export async function toggleLeadImportTemplateAction(formData: FormData) {
  const actor = await getActor();

  try {
    await toggleLeadImportTemplate(actor, getValue(formData, "id"));
    revalidatePath("/lead-import-templates");
    revalidatePath("/lead-imports");
    redirect(buildRedirectTarget("/lead-import-templates", "success", "模板状态已更新。"));
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "模板状态更新失败，请稍后重试。";
    redirect(buildRedirectTarget("/lead-import-templates", "error", message));
  }
}
