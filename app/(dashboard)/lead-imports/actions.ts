"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import { createCustomerContinuationImportBatchAsync } from "@/lib/lead-imports/customer-continuation-import";
import {
  createLeadImportBatchAsync,
  toggleLeadImportTemplate,
  upsertLeadImportTemplate,
} from "@/lib/lead-imports/mutations";
import {
  DEFAULT_LEAD_IMPORT_SOURCE,
  buildLeadImportBatchProgress,
  isLeadImportMode,
  isLeadImportSourceValue,
  leadImportFieldDefinitions,
  type LeadImportBatchProgressSnapshot,
  type LeadImportMode,
} from "@/lib/lead-imports/metadata";

type CreateLeadImportBatchActionPayload = {
  batchId: string;
  mode: LeadImportMode;
  detailHref: string;
  progress: LeadImportBatchProgressSnapshot;
};

export type CreateLeadImportBatchActionState = {
  status: "idle" | "success" | "error";
  message: string;
  batch: CreateLeadImportBatchActionPayload | null;
};

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isNextRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
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

function getSafeLeadImportMode(value: string): LeadImportMode {
  return isLeadImportMode(value) ? value : "lead";
}

function getLeadImportDetailHref(mode: LeadImportMode, batchId: string) {
  return mode === "customer_continuation"
    ? `/lead-imports/${batchId}?mode=customer_continuation`
    : `/lead-imports/${batchId}`;
}

export async function createLeadImportBatchAction(
  _previousState: CreateLeadImportBatchActionState,
  formData: FormData,
): Promise<CreateLeadImportBatchActionState> {
  const actor = await getActor();
  const file = formData.get("file");
  const importMode = getSafeLeadImportMode(getValue(formData, "importMode"));

  if (!(file instanceof File)) {
    return {
      status: "error",
      message: "请先选择导入文件。",
      batch: null,
    };
  }

  try {
    const result =
      importMode === "customer_continuation"
        ? await createCustomerContinuationImportBatchAsync(actor, {
            file,
            defaultLeadSource: getSafeLeadImportSource(
              getValue(formData, "defaultLeadSource"),
            ),
            mappingConfig: getValue(formData, "mappingConfig"),
          })
        : await createLeadImportBatchAsync(actor, {
            file,
            templateId: getValue(formData, "templateId"),
            defaultLeadSource: getSafeLeadImportSource(
              getValue(formData, "defaultLeadSource"),
            ),
            mappingConfig: getValue(formData, "mappingConfig"),
            importMode,
          });

    revalidatePath("/lead-imports");
    revalidatePath(`/lead-imports/${result.id}`);
    revalidatePath("/customers");
    revalidatePath("/leads");

    return {
      status: "success",
      message:
        importMode === "customer_continuation"
          ? "客户续接批次已入队，系统正在后台处理。"
          : "线索导入批次已入队，系统正在后台处理。",
      batch: {
        batchId: result.id,
        mode: importMode,
        detailHref: getLeadImportDetailHref(importMode, result.id),
        progress: buildLeadImportBatchProgress({
          status: result.status,
          stage: result.stage,
          totalRows: result.totalRows,
          successRows: result.successRows,
          failedRows: result.failedRows,
          duplicateRows: result.duplicateRows,
          errorMessage: result.errorMessage,
          processingStartedAt: result.processingStartedAt,
          lastHeartbeatAt: result.lastHeartbeatAt,
          importedAt: result.importedAt,
        }),
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    return {
      status: "error",
      message: error instanceof Error ? error.message : "导入失败，请稍后重试。",
      batch: null,
    };
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
