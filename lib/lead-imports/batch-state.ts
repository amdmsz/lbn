import {
  LeadImportBatchStatus,
  OperationModule,
  OperationTargetType,
  type LeadImportFileType,
  type LeadSource,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type LeadImportBatchStageValue, type LeadImportKind } from "@/lib/lead-imports/metadata";

type CreateQueuedLeadImportBatchInput = {
  batchId: string;
  actorId: string;
  templateId: string | null;
  fileName: string;
  fileType: LeadImportFileType;
  defaultLeadSource: LeadSource;
  mappingConfig: Prisma.InputJsonValue;
  headers: Prisma.InputJsonValue;
  totalRows: number;
  sourceFilePath: string;
  report: Prisma.InputJsonValue;
};

type UpdateLeadImportBatchProgressInput = {
  batchId: string;
  stage: LeadImportBatchStageValue;
  status?: LeadImportBatchStatus;
  queueJobId?: string | null;
  successRows: number;
  failedRows: number;
  duplicateRows: number;
  createdCustomerRows: number;
  matchedCustomerRows: number;
  report?: Prisma.InputJsonValue;
  errorMessage?: string | null;
  processingStartedAt?: Date | null;
  importedAt?: Date | null;
};

export async function createQueuedLeadImportBatch(
  input: CreateQueuedLeadImportBatchInput,
) {
  const batch = await prisma.leadImportBatch.create({
    data: {
      id: input.batchId,
      createdById: input.actorId,
      templateId: input.templateId,
      fileName: input.fileName,
      fileType: input.fileType,
      status: LeadImportBatchStatus.QUEUED,
      stage: "QUEUED",
      defaultLeadSource: input.defaultLeadSource,
      mappingConfig: input.mappingConfig,
      headers: input.headers,
      sourceFilePath: input.sourceFilePath,
      totalRows: input.totalRows,
      report: input.report,
    },
    select: {
      id: true,
      status: true,
      stage: true,
      totalRows: true,
      successRows: true,
      failedRows: true,
      duplicateRows: true,
      createdCustomerRows: true,
      matchedCustomerRows: true,
      errorMessage: true,
      processingStartedAt: true,
      lastHeartbeatAt: true,
      importedAt: true,
    },
  });

  await prisma.operationLog.create({
    data: {
      actorId: input.actorId,
      module: OperationModule.LEAD_IMPORT,
      action: "lead_import.batch_created",
      targetType: OperationTargetType.LEAD_IMPORT_BATCH,
      targetId: batch.id,
      description: `创建导入批次：${input.fileName}`,
      afterData: {
        fileName: input.fileName,
        fileType: input.fileType,
        totalRows: input.totalRows,
        status: LeadImportBatchStatus.QUEUED,
      },
    },
  });

  return batch;
}

export async function updateLeadImportBatchProgress(
  input: UpdateLeadImportBatchProgressInput,
) {
  return prisma.leadImportBatch.update({
    where: { id: input.batchId },
    data: {
      status: input.status,
      stage: input.stage,
      queueJobId: input.queueJobId === undefined ? undefined : input.queueJobId,
      successRows: input.successRows,
      failedRows: input.failedRows,
      duplicateRows: input.duplicateRows,
      createdCustomerRows: input.createdCustomerRows,
      matchedCustomerRows: input.matchedCustomerRows,
      report: input.report,
      errorMessage: input.errorMessage === undefined ? undefined : input.errorMessage,
      processingStartedAt:
        input.processingStartedAt === undefined ? undefined : input.processingStartedAt,
      lastHeartbeatAt: new Date(),
      importedAt: input.importedAt === undefined ? undefined : input.importedAt,
    },
    select: {
      id: true,
      status: true,
      stage: true,
      totalRows: true,
      successRows: true,
      failedRows: true,
      duplicateRows: true,
      createdCustomerRows: true,
      matchedCustomerRows: true,
      errorMessage: true,
      processingStartedAt: true,
      lastHeartbeatAt: true,
      importedAt: true,
    },
  });
}

export async function setLeadImportBatchFailed(input: {
  batchId: string;
  message: string;
}) {
  return prisma.leadImportBatch.update({
    where: { id: input.batchId },
    data: {
      status: LeadImportBatchStatus.FAILED,
      stage: "FAILED",
      errorMessage: input.message,
      lastHeartbeatAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      stage: true,
      totalRows: true,
      successRows: true,
      failedRows: true,
      duplicateRows: true,
      createdCustomerRows: true,
      matchedCustomerRows: true,
      errorMessage: true,
      processingStartedAt: true,
      lastHeartbeatAt: true,
      importedAt: true,
    },
  });
}

export async function createLeadImportBatchFailureLog(input: {
  actorId: string;
  batchId: string;
  fileName: string;
  importKind: LeadImportKind;
  message: string;
  attempt: number;
  attemptsAllowed: number;
}) {
  await prisma.operationLog.create({
    data: {
      actorId: input.actorId,
      module: OperationModule.LEAD_IMPORT,
      action: "lead_import.batch_failed",
      targetType: OperationTargetType.LEAD_IMPORT_BATCH,
      targetId: input.batchId,
      description: `导入批次失败：${input.fileName}`,
      afterData: {
        errorMessage: input.message,
        importKind: input.importKind,
        attempt: input.attempt,
        attemptsAllowed: input.attemptsAllowed,
      },
    },
  });
}

export async function createLeadImportBatchCompletedLog(input: {
  actorId: string;
  batchId: string;
  fileName: string;
  importKind: LeadImportKind;
  afterData: Prisma.InputJsonValue;
}) {
  await prisma.operationLog.create({
    data: {
      actorId: input.actorId,
      module: OperationModule.LEAD_IMPORT,
      action: "lead_import.batch_completed",
      targetType: OperationTargetType.LEAD_IMPORT_BATCH,
      targetId: input.batchId,
      description: `完成导入批次：${input.fileName}`,
      afterData: input.afterData,
    },
  });
}
