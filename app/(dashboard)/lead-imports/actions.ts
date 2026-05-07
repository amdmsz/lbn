"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/session";
import { deleteImportedCustomersDirect } from "@/lib/customers/imported-customer-deletion";
import { executeLeadImportBatchRollback } from "@/lib/lead-imports/batch-rollback";
import { createCustomerContinuationImportBatchAsync } from "@/lib/lead-imports/customer-continuation-import";
import { replaceDuplicateCustomerWithNewLead } from "@/lib/lead-imports/duplicate-replacement";
import {
  createLeadImportBatchAsync,
  toggleLeadImportTemplate,
  upsertLeadImportTemplate,
} from "@/lib/lead-imports/mutations";
import {
  DEFAULT_LEAD_IMPORT_SOURCE,
  buildLeadImportBatchProgress,
  isLeadImportBatchRollbackMode,
  isLeadImportMode,
  isLeadImportSourceValue,
  leadImportFieldDefinitions,
  type LeadImportBatchProgressSnapshot,
  type LeadImportBatchRollbackMode,
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

const importedCustomerBatchDeleteSchema = z.object({
  batchId: z.string().trim().min(1, "缺少批次 ID"),
  customerIds: z.array(z.string().trim().min(1)).min(1, "请先选择客户"),
  reason: z.string().trim().min(1, "请填写删除原因").max(500, "删除原因不能超过 500 字"),
});

export type DeleteImportedCustomersBatchActionResult = {
  status: "success" | "error";
  message: string;
  successCount: number;
  skippedCount: number;
  failedCount: number;
};

const leadImportBatchRollbackSchema = z.object({
  batchId: z.string().trim().min(1, "缺少批次 ID"),
  mode: z.string().trim().refine(isLeadImportBatchRollbackMode, "撤销模式无效"),
  reason: z.string().trim().min(1, "请填写整批撤销原因").max(500, "撤销原因不能超过 500 字"),
});

const duplicateCustomerReplacementSchema = z.object({
  batchId: z.string().trim().min(1, "缺少批次 ID"),
  rowId: z.string().trim().min(1, "缺少导入行 ID"),
  targetOwnerId: z.string().trim().min(1, "请选择重新分配的业务员"),
  historyPolicy: z.enum(["ARCHIVE", "DISCARD"]).default("ARCHIVE"),
  historyVisibility: z
    .enum(["SUPERVISOR_ONLY", "ALL_ROLES"])
    .default("SUPERVISOR_ONLY"),
  reason: z.string().trim().min(1, "请填写判断说明").max(500, "判断说明不能超过 500 字"),
});

export type ExecuteLeadImportBatchRollbackActionResult = {
  status: "success" | "error";
  message: string;
  rollbackMode: LeadImportBatchRollbackMode;
};

export type ReplaceDuplicateCustomerActionResult = {
  status: "success" | "error";
  message: string;
  leadId: string | null;
  oldCustomerId: string | null;
  customerId: string | null;
};

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
export async function deleteImportedCustomersFromBatchAction(
  input: z.input<typeof importedCustomerBatchDeleteSchema>,
): Promise<DeleteImportedCustomersBatchActionResult> {
  const actor = await getActor();
  const parsed = importedCustomerBatchDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  try {
    const result = await deleteImportedCustomersDirect(actor, {
      sourceBatchId: parsed.data.batchId,
      customerIds: parsed.data.customerIds,
      reason: parsed.data.reason,
    });

    revalidatePath("/customers");
    revalidatePath("/customers/public-pool");
    revalidatePath("/lead-imports");
    revalidatePath(`/lead-imports/${parsed.data.batchId}`);
    revalidatePath("/leads");
    revalidatePath("/dashboard");

    for (const customerId of parsed.data.customerIds) {
      revalidatePath(`/customers/${customerId}`);
    }

    const message =
      result.successCount > 0
        ? `已删除 ${result.successCount} 位客户，跳过 ${result.skippedCount} 位，失败 ${result.failedCount} 位。`
        : result.items[0]?.message ?? "没有客户满足删除条件。";

    return {
      status: result.successCount > 0 ? "success" : "error",
      message,
      successCount: result.successCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "批量删除失败，请稍后重试。",
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }
}

export async function executeLeadImportBatchRollbackAction(
  input: z.input<typeof leadImportBatchRollbackSchema>,
): Promise<ExecuteLeadImportBatchRollbackActionResult> {
  const actor = await getActor();
  const parsed = leadImportBatchRollbackSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      rollbackMode: "AUDIT_PRESERVED",
    };
  }

  try {
    const result = await executeLeadImportBatchRollback(actor, {
      batchId: parsed.data.batchId,
      mode: parsed.data.mode,
      reason: parsed.data.reason,
    });

    revalidatePath("/customers");
    revalidatePath("/customers/public-pool");
    revalidatePath("/lead-imports");
    revalidatePath(`/lead-imports/${parsed.data.batchId}`);
    revalidatePath(`/lead-imports/${parsed.data.batchId}?mode=customer_continuation`);
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    for (const customerId of result.affectedCustomerIds) {
      revalidatePath(`/customers/${customerId}`);
    }

    return {
      status: "success",
      message: result.message,
      rollbackMode: result.mode,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "整批撤销失败，请稍后重试。",
      rollbackMode: parsed.data.mode,
    };
  }
}

export async function replaceDuplicateCustomerWithNewLeadAction(
  input: z.input<typeof duplicateCustomerReplacementSchema>,
): Promise<ReplaceDuplicateCustomerActionResult> {
  const actor = await getActor();
  const parsed = duplicateCustomerReplacementSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交数据不完整。",
      leadId: null,
      oldCustomerId: null,
      customerId: null,
    };
  }

  try {
    const result = await replaceDuplicateCustomerWithNewLead(actor, parsed.data);

    revalidatePath("/lead-imports");
    revalidatePath(`/lead-imports/${parsed.data.batchId}`);
    revalidatePath("/leads");
    revalidatePath("/customers");
    revalidatePath("/customers/public-pool");
    revalidatePath("/dashboard");
    revalidatePath(`/customers/${result.oldCustomerId}`);
    revalidatePath(`/customers/${result.customerId}`);

    return {
      status: "success",
      message: result.message,
      leadId: result.leadId,
      oldCustomerId: result.oldCustomerId,
      customerId: result.customerId,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "作为新线索处理失败，请稍后重试。",
      leadId: null,
      oldCustomerId: null,
      customerId: null,
    };
  }
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
    teamId: session.user.teamId,
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
