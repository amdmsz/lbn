import { randomUUID } from "node:crypto";
import {
  CustomerOwnershipMode,
  LeadCustomerMergeAction,
  LeadImportBatchStatus,
  LeadDedupType,
  LeadImportRowStatus,
  LeadSource,
  OperationModule,
  OperationTargetType,
  PublicPoolReason,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canAccessLeadImportModule } from "@/lib/auth/access";
import { createInitialPublicOwnershipEventTx } from "@/lib/customers/ownership";
import { prisma } from "@/lib/db/prisma";
import {
  createLeadImportBatchCompletedLog,
  createLeadImportBatchFailureLog,
  createQueuedLeadImportBatch,
  setLeadImportBatchFailed,
  updateLeadImportBatchProgress,
} from "@/lib/lead-imports/batch-state";
import { createCustomerContinuationImportBatch } from "@/lib/lead-imports/customer-continuation-import";
import { parseLeadImportBuffer, parseLeadImportFile } from "@/lib/lead-imports/file-parser";
import {
  LEAD_IMPORT_TEMPLATE_NONE_VALUE,
  leadImportFieldDefinitions,
  normalizeImportedPhone,
  sanitizeLeadImportMapping,
  type LeadImportFieldKey,
  type LeadImportMode,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";
import { enqueueLeadImportBatchJob, getLeadImportChunkSize } from "@/lib/lead-imports/queue";
import { readLeadImportSourceFile, saveLeadImportSourceFile } from "@/lib/lead-imports/storage";
import { withVisibleLeadWhere } from "@/lib/leads/visibility";

type Actor = {
  id: string;
  role: RoleCode;
};

type ImportedLeadData = ReturnType<typeof buildMappedLeadData>["mappedData"];

type LeadImportPersistedRowSummary = {
  rowNumber: number;
  status: LeadImportRowStatus;
  normalizedPhone: string | null;
  mergeAction: LeadCustomerMergeAction | null;
};

type LeadImportAggregateState = {
  processedRowNumbers: Set<number>;
  seenPhones: Map<string, number>;
  successRows: number;
  failedRows: number;
  duplicateRows: number;
  createdCustomerRows: number;
  matchedCustomerRows: number;
};

const createBatchSchema = z.object({
  templateId: z.string().trim().optional(),
  defaultLeadSource: z.nativeEnum(LeadSource),
  mappingConfig: z.string().trim().min(2, "字段映射不能为空。"),
});

const templateSchema = z.object({
  id: z.string().trim().default(""),
  name: z.string().trim().min(1, "模板名称不能为空。").max(100, "模板名称不能超过 100 个字符。"),
  description: z.string().trim().max(500, "模板描述不能超过 500 个字符。").default(""),
  defaultLeadSource: z.nativeEnum(LeadSource),
  mappingConfig: z.record(z.string(), z.string()).default({}),
});

function assertAccess(role: RoleCode) {
  if (!canAccessLeadImportModule(role)) {
    throw new Error("当前角色无权访问线索导入中心。");
  }
}

function normalizeOptional(value: string | null | undefined) {
  const next = value?.trim() ?? "";
  return next ? next : null;
}

function parseMappingConfig(raw: string) {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("字段映射格式不正确。");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("字段映射格式不正确。");
  }

  return value as LeadImportMappingConfig;
}

function getMappedValue(
  rawData: Record<string, string>,
  mapping: LeadImportMappingConfig,
  key: LeadImportFieldKey,
) {
  const header = mapping[key];
  return header ? rawData[header] ?? "" : "";
}

async function createOperationLog(
  tx: Prisma.TransactionClient,
  data: Prisma.OperationLogCreateInput,
) {
  await tx.operationLog.create({ data });
}

function buildMappedLeadData(
  rawData: Record<string, string>,
  mapping: LeadImportMappingConfig,
  defaultLeadSource: LeadSource,
) {
  const phoneRaw = getMappedValue(rawData, mapping, "phone");
  const normalizedPhone = normalizeImportedPhone(phoneRaw);
  const mappedData = {
    phone: normalizedPhone,
    name: normalizeOptional(getMappedValue(rawData, mapping, "name")),
    address: normalizeOptional(getMappedValue(rawData, mapping, "address")),
    interestedProduct: normalizeOptional(
      getMappedValue(rawData, mapping, "interestedProduct"),
    ),
    campaignName: normalizeOptional(getMappedValue(rawData, mapping, "campaignName")),
    sourceDetail: normalizeOptional(getMappedValue(rawData, mapping, "sourceDetail")),
    remark: normalizeOptional(getMappedValue(rawData, mapping, "remark")),
    source: defaultLeadSource,
  };

  return {
    phoneRaw,
    normalizedPhone,
    mappedData,
  };
}

function getSourceTagCodeCandidates(source: LeadSource) {
  return [
    source,
    `LEAD_SOURCE_${source}`,
    `IMPORT_SOURCE_${source}`,
    "INFO_FLOW",
    "LEAD_SOURCE_INFO_FLOW",
    "IMPORT_SOURCE_INFO_FLOW",
  ];
}

async function syncSourceTagToCustomer(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    sourceTagId: string | null;
    sourceTagCode: string | null;
  },
) {
  if (!input.sourceTagId) {
    return false;
  }

  const existingTag = await tx.customerTag.findUnique({
    where: {
      customerId_tagId: {
        customerId: input.customerId,
        tagId: input.sourceTagId,
      },
    },
    select: { id: true },
  });

  if (existingTag) {
    return false;
  }

  const createdTag = await tx.customerTag.create({
    data: {
      customerId: input.customerId,
      tagId: input.sourceTagId,
      assignedById: input.actorId,
    },
    select: { id: true },
  });

  await createOperationLog(tx, {
    actor: { connect: { id: input.actorId } },
    module: OperationModule.LEAD_IMPORT,
    action: "lead_import.customer_source_tag_synced",
    targetType: OperationTargetType.CUSTOMER,
    targetId: input.customerId,
    description: `导入来源标签已同步到客户 ${input.customerName} (${input.customerPhone})`,
    afterData: {
      customerTagId: createdTag.id,
      tagId: input.sourceTagId,
      tagCode: input.sourceTagCode,
    },
  });

  return true;
}

async function createOrMatchCustomerForLead(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    batchId: string;
    rowNumber: number;
    fileName: string;
    source: LeadSource;
    lead: {
      id: string;
      phone: string;
      name: string | null;
      ownerId: string | null;
    };
    mappedData: ImportedLeadData;
    existingCustomerMap: Map<
      string,
      {
        id: string;
        phone: string;
        name: string;
      }
    >;
    sourceTag: {
      id: string;
      code: string;
    } | null;
    actorTeamId: string | null;
  },
) {
  const matchedCustomer = input.existingCustomerMap.get(input.lead.phone);
  const publicPoolEnteredAt = new Date();
  const customer =
    matchedCustomer ??
    (await tx.customer.create({
      data: {
        name: input.mappedData.name ?? input.lead.name ?? input.lead.phone,
        phone: input.lead.phone,
        address: input.mappedData.address,
        remark: input.mappedData.remark,
        ownerId: input.lead.ownerId,
        ownershipMode: CustomerOwnershipMode.PUBLIC,
        publicPoolEnteredAt,
        publicPoolReason: PublicPoolReason.UNASSIGNED_IMPORT,
        publicPoolTeamId: input.actorTeamId,
      },
      select: {
        id: true,
        phone: true,
        name: true,
      },
    }));

  if (!matchedCustomer) {
    input.existingCustomerMap.set(customer.phone, customer);

    await createInitialPublicOwnershipEventTx(tx, {
      actorId: input.actorId,
      actorTeamId: input.actorTeamId,
      customerId: customer.id,
      note: `Lead import batch ${input.fileName} row ${input.rowNumber}`,
    });
  }

  const action = matchedCustomer
    ? LeadCustomerMergeAction.MATCHED_EXISTING_CUSTOMER
    : LeadCustomerMergeAction.CREATED_CUSTOMER;

  await tx.lead.update({
    where: { id: input.lead.id },
    data: {
      customerId: customer.id,
    },
  });

  const tagSynced = await syncSourceTagToCustomer(tx, {
    actorId: input.actorId,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    sourceTagId: input.sourceTag?.id ?? null,
    sourceTagCode: input.sourceTag?.code ?? null,
  });

  await createOperationLog(tx, {
    actor: { connect: { id: input.actorId } },
    module: OperationModule.LEAD_IMPORT,
    action:
      action === LeadCustomerMergeAction.CREATED_CUSTOMER
        ? "lead_import.customer_created_from_batch"
        : "lead_import.customer_matched_existing",
    targetType: OperationTargetType.CUSTOMER,
    targetId: customer.id,
    description:
      action === LeadCustomerMergeAction.CREATED_CUSTOMER
        ? `导入批次 ${input.fileName} 自动创建客户 ${customer.name}`
        : `导入批次 ${input.fileName} 命中已有客户 ${customer.name}`,
    afterData: {
      batchId: input.batchId,
      rowNumber: input.rowNumber,
      leadId: input.lead.id,
      phone: customer.phone,
      source: input.source,
      tagSynced,
    },
  });

  await createOperationLog(tx, {
    actor: { connect: { id: input.actorId } },
    module: OperationModule.LEAD_IMPORT,
    action: "lead_import.customer_linked_to_lead",
    targetType: OperationTargetType.LEAD,
    targetId: input.lead.id,
    description: `导入线索已归并到客户 ${customer.name} (${customer.phone})`,
    afterData: {
      batchId: input.batchId,
      rowNumber: input.rowNumber,
      customerId: customer.id,
      mergeAction: action,
      source: input.source,
      tagSynced,
    },
  });

  return {
    customer,
    action,
    tagSynced,
  };
}

function buildLeadImportBatchReport(input: {
  headers: string[];
  mappingConfig: LeadImportMappingConfig;
  templateName: string | null;
}) {
  return {
    importKind: "LEAD",
    headers: input.headers,
    mappingConfig: input.mappingConfig,
    templateName: input.templateName,
    generatedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonValue;
}

async function loadPersistedLeadImportState(batchId: string) {
  const rows = await prisma.leadImportRow.findMany({
    where: { batchId },
    orderBy: { rowNumber: "asc" },
    select: {
      rowNumber: true,
      status: true,
      normalizedPhone: true,
      mergeLogs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          action: true,
        },
      },
    },
  });

  return rows.reduce<LeadImportAggregateState>(
    (summary, row) => {
      summary.processedRowNumbers.add(row.rowNumber);

      if (
        row.normalizedPhone &&
        row.status !== LeadImportRowStatus.DUPLICATE &&
        !summary.seenPhones.has(row.normalizedPhone)
      ) {
        summary.seenPhones.set(row.normalizedPhone, row.rowNumber);
      }

      if (row.status === LeadImportRowStatus.IMPORTED) {
        summary.successRows += 1;
      }
      if (row.status === LeadImportRowStatus.FAILED) {
        summary.failedRows += 1;
      }
      if (row.status === LeadImportRowStatus.DUPLICATE) {
        summary.duplicateRows += 1;
      }

      const mergeAction = row.mergeLogs[0]?.action ?? null;
      if (mergeAction === LeadCustomerMergeAction.CREATED_CUSTOMER) {
        summary.createdCustomerRows += 1;
      }
      if (mergeAction === LeadCustomerMergeAction.MATCHED_EXISTING_CUSTOMER) {
        summary.matchedCustomerRows += 1;
      }

      return summary;
    },
    {
      processedRowNumbers: new Set<number>(),
      seenPhones: new Map<string, number>(),
      successRows: 0,
      failedRows: 0,
      duplicateRows: 0,
      createdCustomerRows: 0,
      matchedCustomerRows: 0,
    },
  );
}

function applyLeadImportRowSummary(
  summary: LeadImportAggregateState,
  row: LeadImportPersistedRowSummary,
) {
  summary.processedRowNumbers.add(row.rowNumber);

  if (
    row.normalizedPhone &&
    row.status !== LeadImportRowStatus.DUPLICATE &&
    !summary.seenPhones.has(row.normalizedPhone)
  ) {
    summary.seenPhones.set(row.normalizedPhone, row.rowNumber);
  }

  if (row.status === LeadImportRowStatus.IMPORTED) {
    summary.successRows += 1;
  }
  if (row.status === LeadImportRowStatus.FAILED) {
    summary.failedRows += 1;
  }
  if (row.status === LeadImportRowStatus.DUPLICATE) {
    summary.duplicateRows += 1;
  }
  if (row.mergeAction === LeadCustomerMergeAction.CREATED_CUSTOMER) {
    summary.createdCustomerRows += 1;
  }
  if (row.mergeAction === LeadCustomerMergeAction.MATCHED_EXISTING_CUSTOMER) {
    summary.matchedCustomerRows += 1;
  }
}

async function processLeadImportRowTx(
  input: {
    actor: Actor;
    actorTeamId: string | null;
    batchId: string;
    fileName: string;
    row: { rowNumber: number; rawData: Record<string, string> };
    mappingConfig: LeadImportMappingConfig;
    defaultLeadSource: LeadSource;
    existingLeadMap: Map<
      string,
      {
        id: string;
        phone: string;
        name: string | null;
      }
    >;
    existingCustomerMap: Map<
      string,
      {
        id: string;
        phone: string;
        name: string;
      }
    >;
    seenPhones: Map<string, number>;
    sourceTag: {
      id: string;
      code: string;
    } | null;
  },
): Promise<{
  rowSummary: LeadImportPersistedRowSummary;
  importedLead:
    | {
        id: string;
        phone: string;
        name: string | null;
      }
    | null;
  customer:
    | {
        id: string;
        phone: string;
        name: string;
      }
    | null;
}> {
  return prisma.$transaction(async (tx) => {
    const existingRow = await tx.leadImportRow.findUnique({
      where: {
        batchId_rowNumber: {
          batchId: input.batchId,
          rowNumber: input.row.rowNumber,
        },
      },
      select: {
        rowNumber: true,
        status: true,
        normalizedPhone: true,
        mergeLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            action: true,
            customer: {
              select: {
                id: true,
                phone: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (existingRow) {
      return {
        rowSummary: {
          rowNumber: existingRow.rowNumber,
          status: existingRow.status,
          normalizedPhone: existingRow.normalizedPhone,
          mergeAction: existingRow.mergeLogs[0]?.action ?? null,
        },
        importedLead: null,
        customer: existingRow.mergeLogs[0]?.customer ?? null,
      };
    }

    const { phoneRaw, normalizedPhone, mappedData } = buildMappedLeadData(
      input.row.rawData,
      input.mappingConfig,
      input.defaultLeadSource,
    );

    let status: LeadImportRowStatus = LeadImportRowStatus.IMPORTED;
    let errorReason: string | null = null;
    let dedupType: LeadDedupType | null = null;
    let matchedLeadId: string | null = null;
    let importedLeadId: string | null = null;
    let linkedCustomerId: string | null = null;
    let linkedCustomerName: string | null = null;
    let mergeAction: LeadCustomerMergeAction | null = null;
    let tagSynced = false;
    let importedLead:
      | {
          id: string;
          phone: string;
          name: string | null;
          ownerId: string | null;
        }
      | null = null;
    let customer:
      | {
          id: string;
          phone: string;
          name: string;
        }
      | null = null;

    if (!phoneRaw.trim()) {
      status = LeadImportRowStatus.FAILED;
      errorReason = "手机号为空";
    } else if (!normalizedPhone) {
      status = LeadImportRowStatus.FAILED;
      errorReason = "手机号格式无效";
    } else if (input.seenPhones.has(normalizedPhone)) {
      status = LeadImportRowStatus.DUPLICATE;
      errorReason = `与本批次第 ${input.seenPhones.get(normalizedPhone)} 行手机号重复`;
      dedupType = LeadDedupType.BATCH_DUPLICATE;
    } else if (input.existingLeadMap.has(normalizedPhone)) {
      status = LeadImportRowStatus.DUPLICATE;
      errorReason = "系统内已存在相同手机号的线索";
      dedupType = LeadDedupType.EXISTING_LEAD;
      matchedLeadId = input.existingLeadMap.get(normalizedPhone)?.id ?? null;
    } else {
      importedLead = await tx.lead.create({
        data: {
          source: input.defaultLeadSource,
          phone: normalizedPhone,
          name: mappedData.name,
          address: mappedData.address,
          interestedProduct: mappedData.interestedProduct,
          campaignName: mappedData.campaignName,
          sourceDetail: mappedData.sourceDetail,
          remark: mappedData.remark,
          status: "NEW",
        },
        select: {
          id: true,
          phone: true,
          name: true,
          ownerId: true,
        },
      });

      importedLeadId = importedLead.id;

      await createOperationLog(tx, {
        actor: { connect: { id: input.actor.id } },
        module: OperationModule.LEAD_IMPORT,
        action: "lead.imported_from_batch",
        targetType: OperationTargetType.LEAD,
        targetId: importedLead.id,
        description: `通过导入批次 ${input.fileName} 创建线索 ${importedLead.name ?? importedLead.phone}`,
        afterData: {
          batchId: input.batchId,
          rowNumber: input.row.rowNumber,
          phone: importedLead.phone,
          source: input.defaultLeadSource,
        },
      });

      const mergeResult = await createOrMatchCustomerForLead(tx, {
        actorId: input.actor.id,
        batchId: input.batchId,
        rowNumber: input.row.rowNumber,
        fileName: input.fileName,
        source: input.defaultLeadSource,
        lead: importedLead,
        mappedData,
        existingCustomerMap: input.existingCustomerMap,
        sourceTag: input.sourceTag,
        actorTeamId: input.actorTeamId,
      });

      customer = mergeResult.customer;
      linkedCustomerId = mergeResult.customer.id;
      linkedCustomerName = mergeResult.customer.name;
      mergeAction = mergeResult.action;
      tagSynced = mergeResult.tagSynced;
    }

    const createdRow = await tx.leadImportRow.create({
      data: {
        batchId: input.batchId,
        rowNumber: input.row.rowNumber,
        status,
        phoneRaw: normalizeOptional(phoneRaw),
        normalizedPhone: normalizeOptional(normalizedPhone),
        mappedName: mappedData.name,
        errorReason,
        rawData: input.row.rawData as Prisma.InputJsonValue,
        mappedData: mappedData as Prisma.InputJsonValue,
        dedupType,
        matchedLeadId,
        importedLeadId,
      },
      select: {
        id: true,
        rowNumber: true,
        status: true,
        normalizedPhone: true,
      },
    });

    if (dedupType) {
      await tx.leadDedupLog.create({
        data: {
          batchId: input.batchId,
          rowId: createdRow.id,
          phone: normalizedPhone || phoneRaw,
          dedupType,
          matchedLeadId,
          reason: errorReason,
        },
      });
    }

    if (importedLeadId && linkedCustomerId && mergeAction) {
      await tx.leadCustomerMergeLog.create({
        data: {
          batchId: input.batchId,
          rowId: createdRow.id,
          leadId: importedLeadId,
          leadIdSnapshot: importedLeadId,
          leadNameSnapshot: importedLead?.name ?? null,
          leadPhoneSnapshot: importedLead?.phone ?? normalizedPhone ?? phoneRaw,
          customerId: linkedCustomerId,
          action: mergeAction,
          source: input.defaultLeadSource,
          phone: normalizedPhone || phoneRaw,
          tagSynced,
          actorId: input.actor.id,
          note: linkedCustomerName,
        },
      });
    }

    return {
      rowSummary: {
        rowNumber: createdRow.rowNumber,
        status: createdRow.status,
        normalizedPhone: createdRow.normalizedPhone,
        mergeAction,
      },
      importedLead: importedLead
        ? {
            id: importedLead.id,
            phone: importedLead.phone,
            name: importedLead.name,
          }
        : null,
      customer,
    };
  });
}

export async function createLeadImportBatch(
  actor: Actor,
  input: {
    file: File;
    templateId?: string;
    defaultLeadSource: LeadSource;
    mappingConfig: string;
    importMode?: LeadImportMode;
  },
) {
  assertAccess(actor.role);

  if (input.importMode === "customer_continuation") {
    return createCustomerContinuationImportBatch(actor, {
      file: input.file,
      defaultLeadSource: input.defaultLeadSource,
      mappingConfig: input.mappingConfig,
    });
  }

  if (!input.file || input.file.size === 0) {
    throw new Error("请先选择要上传的文件。");
  }

  const parsedInput = createBatchSchema.parse({
    templateId: input.templateId,
    defaultLeadSource: input.defaultLeadSource,
    mappingConfig: input.mappingConfig,
  });

  const parsedFile = await parseLeadImportFile(input.file);
  const mappingConfig = sanitizeLeadImportMapping(
    parseMappingConfig(parsedInput.mappingConfig),
    parsedFile.headers,
  );

  const missingHeaders = leadImportFieldDefinitions
    .filter((field) => field.required && !mappingConfig[field.key])
    .map((field) => field.label);

  if (missingHeaders.length > 0) {
    throw new Error(`导入文件缺少固定模板列：${missingHeaders.join(" / ")}`);
  }

  const template =
    parsedInput.templateId &&
    parsedInput.templateId !== LEAD_IMPORT_TEMPLATE_NONE_VALUE
      ? await prisma.leadImportTemplate.findFirst({
          where: {
            id: parsedInput.templateId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : null;

  const batch = await prisma.leadImportBatch.create({
    data: {
      createdById: actor.id,
      templateId: template?.id ?? null,
      fileName: input.file.name,
      fileType: parsedFile.fileType,
      status: LeadImportBatchStatus.IMPORTING,
      defaultLeadSource: parsedInput.defaultLeadSource,
      mappingConfig: mappingConfig as Prisma.InputJsonValue,
      headers: parsedFile.headers as Prisma.InputJsonValue,
      totalRows: parsedFile.rows.length,
    },
    select: { id: true },
  });

  try {
    const actorTeam = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { teamId: true },
    });

    const uniqueCandidatePhones = [
      ...new Set(
        parsedFile.rows
          .map((row) =>
            normalizeImportedPhone(getMappedValue(row.rawData, mappingConfig, "phone")),
          )
          .filter(Boolean),
      ),
    ];

    const [existingLeads, existingCustomers] = await Promise.all([
      prisma.lead.findMany({
        where: withVisibleLeadWhere({
          phone: {
            in: uniqueCandidatePhones,
          },
        }),
        select: {
          id: true,
          phone: true,
          name: true,
        },
      }),
      prisma.customer.findMany({
        where: {
          phone: {
            in: uniqueCandidatePhones,
          },
        },
        select: {
          id: true,
          phone: true,
          name: true,
        },
      }),
    ]);

    const existingLeadMap = new Map(existingLeads.map((lead) => [lead.phone, lead]));
    const existingCustomerMap = new Map(
      existingCustomers.map((customer) => [customer.phone, customer]),
    );
    const seenPhones = new Map<string, number>();

    const report = await prisma.$transaction(async (tx) => {
      let successRows = 0;
      let failedRows = 0;
      let duplicateRows = 0;
      let createdCustomerRows = 0;
      let matchedCustomerRows = 0;
      const sourceTag = await tx.tag.findFirst({
        where: {
          isActive: true,
          code: {
            in: getSourceTagCodeCandidates(parsedInput.defaultLeadSource),
          },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
        },
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.LEAD_IMPORT,
        action: "lead_import.batch_created",
        targetType: OperationTargetType.LEAD_IMPORT_BATCH,
        targetId: batch.id,
        description: `创建线索导入批次：${input.file.name}`,
        afterData: {
          fileName: input.file.name,
          fileType: parsedFile.fileType,
          totalRows: parsedFile.rows.length,
          templateId: template?.id ?? null,
          defaultLeadSource: parsedInput.defaultLeadSource,
        },
      });

      for (const row of parsedFile.rows) {
        const { phoneRaw, normalizedPhone, mappedData } = buildMappedLeadData(
          row.rawData,
          mappingConfig,
          parsedInput.defaultLeadSource,
        );

        let status: LeadImportRowStatus = LeadImportRowStatus.IMPORTED;
        let errorReason: string | null = null;
        let dedupType: LeadDedupType | null = null;
        let matchedLeadId: string | null = null;
        let importedLeadId: string | null = null;
        let linkedCustomerId: string | null = null;
        let linkedCustomerName: string | null = null;
        let mergeAction: LeadCustomerMergeAction | null = null;
        let tagSynced = false;
        let createdLeadSnapshot: {
          name: string | null;
          phone: string;
        } | null = null;

        if (!phoneRaw.trim()) {
          status = LeadImportRowStatus.FAILED;
          errorReason = "手机号为空";
          failedRows += 1;
        } else if (!normalizedPhone) {
          status = LeadImportRowStatus.FAILED;
          errorReason = "手机号格式无效";
          failedRows += 1;
        } else if (seenPhones.has(normalizedPhone)) {
          status = LeadImportRowStatus.DUPLICATE;
          errorReason = `与本批次第 ${seenPhones.get(normalizedPhone)} 行手机号重复`;
          dedupType = LeadDedupType.BATCH_DUPLICATE;
          duplicateRows += 1;
        } else if (existingLeadMap.has(normalizedPhone)) {
          status = LeadImportRowStatus.DUPLICATE;
          errorReason = "系统内已存在相同手机号的线索";
          dedupType = LeadDedupType.EXISTING_LEAD;
          matchedLeadId = existingLeadMap.get(normalizedPhone)?.id ?? null;
          duplicateRows += 1;
        } else {
          const createdLead = await tx.lead.create({
            data: {
              source: parsedInput.defaultLeadSource,
              phone: normalizedPhone,
              name: mappedData.name,
              address: mappedData.address,
              interestedProduct: mappedData.interestedProduct,
              campaignName: mappedData.campaignName,
              sourceDetail: mappedData.sourceDetail,
              remark: mappedData.remark,
              status: "NEW",
            },
            select: {
              id: true,
              phone: true,
              name: true,
              ownerId: true,
            },
          });

          createdLeadSnapshot = {
            name: createdLead.name,
            phone: createdLead.phone,
          };
          importedLeadId = createdLead.id;
          successRows += 1;
          seenPhones.set(normalizedPhone, row.rowNumber);

          await createOperationLog(tx, {
            actor: { connect: { id: actor.id } },
            module: OperationModule.LEAD_IMPORT,
            action: "lead.imported_from_batch",
            targetType: OperationTargetType.LEAD,
            targetId: createdLead.id,
            description: `通过导入批次 ${input.file.name} 创建线索 ${createdLead.name ?? createdLead.phone}`,
            afterData: {
              batchId: batch.id,
              rowNumber: row.rowNumber,
              phone: createdLead.phone,
              source: parsedInput.defaultLeadSource,
            },
          });

          const mergeResult = await createOrMatchCustomerForLead(tx, {
            actorId: actor.id,
            batchId: batch.id,
            rowNumber: row.rowNumber,
            fileName: input.file.name,
            source: parsedInput.defaultLeadSource,
            lead: createdLead,
            mappedData,
            existingCustomerMap,
            sourceTag,
            actorTeamId: actorTeam?.teamId ?? null,
          });

          linkedCustomerId = mergeResult.customer.id;
          linkedCustomerName = mergeResult.customer.name;
          mergeAction = mergeResult.action;
          tagSynced = mergeResult.tagSynced;

          if (mergeAction === LeadCustomerMergeAction.CREATED_CUSTOMER) {
            createdCustomerRows += 1;
          } else {
            matchedCustomerRows += 1;
          }
        }

        if (
          normalizedPhone &&
          !seenPhones.has(normalizedPhone) &&
          status !== LeadImportRowStatus.DUPLICATE
        ) {
          seenPhones.set(normalizedPhone, row.rowNumber);
        }

        const createdRow = await tx.leadImportRow.create({
          data: {
            batchId: batch.id,
            rowNumber: row.rowNumber,
            status,
            phoneRaw: normalizeOptional(phoneRaw),
            normalizedPhone: normalizeOptional(normalizedPhone),
            mappedName: mappedData.name,
            errorReason,
            rawData: row.rawData as Prisma.InputJsonValue,
            mappedData: mappedData as Prisma.InputJsonValue,
            dedupType,
            matchedLeadId,
            importedLeadId,
          },
          select: {
            id: true,
          },
        });

        if (dedupType) {
          await tx.leadDedupLog.create({
            data: {
              batchId: batch.id,
              rowId: createdRow.id,
              phone: normalizedPhone || phoneRaw,
              dedupType,
              matchedLeadId,
              reason: errorReason,
            },
          });
        }

        if (importedLeadId && linkedCustomerId && mergeAction) {
          await tx.leadCustomerMergeLog.create({
            data: {
              batchId: batch.id,
              rowId: createdRow.id,
              leadId: importedLeadId,
              leadIdSnapshot: importedLeadId,
              leadNameSnapshot: createdLeadSnapshot?.name ?? null,
              leadPhoneSnapshot:
                createdLeadSnapshot?.phone ?? normalizedPhone ?? phoneRaw,
              customerId: linkedCustomerId,
              action: mergeAction,
              source: parsedInput.defaultLeadSource,
              phone: normalizedPhone || phoneRaw,
              tagSynced,
              actorId: actor.id,
              note: linkedCustomerName,
            },
          });
        }
      }

      await tx.leadImportBatch.update({
        where: { id: batch.id },
        data: {
          status: LeadImportBatchStatus.COMPLETED,
          successRows,
          failedRows,
          duplicateRows,
          createdCustomerRows,
          matchedCustomerRows,
          importedAt: new Date(),
          report: {
            headers: parsedFile.headers,
            mappingConfig,
            templateName: template?.name ?? null,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.LEAD_IMPORT,
        action: "lead_import.batch_completed",
        targetType: OperationTargetType.LEAD_IMPORT_BATCH,
        targetId: batch.id,
        description: `完成线索导入批次：${input.file.name}`,
        afterData: {
          totalRows: parsedFile.rows.length,
          successRows,
          failedRows,
          duplicateRows,
          createdCustomerRows,
          matchedCustomerRows,
        },
      });

      return {
        successRows,
        failedRows,
        duplicateRows,
        createdCustomerRows,
        matchedCustomerRows,
      };
    });

    return {
      batchId: batch.id,
      ...report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败，请稍后重试。";

    await prisma.leadImportBatch.update({
      where: { id: batch.id },
      data: {
        status: LeadImportBatchStatus.FAILED,
        errorMessage: message,
      },
    });

    await prisma.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.LEAD_IMPORT,
        action: "lead_import.batch_failed",
        targetType: OperationTargetType.LEAD_IMPORT_BATCH,
        targetId: batch.id,
        description: `线索导入批次失败：${input.file.name}`,
        afterData: {
          errorMessage: message,
        },
      },
    });

    throw error;
  }
}

export async function processLeadImportBatchAsync(
  batchId: string,
  options?: {
    queueJobId?: string | null;
  },
) {
  const batch = await prisma.leadImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      createdById: true,
      template: {
        select: {
          name: true,
        },
      },
      fileName: true,
      defaultLeadSource: true,
      mappingConfig: true,
      sourceFilePath: true,
      status: true,
      processingStartedAt: true,
    },
  });

  if (!batch) {
    throw new Error("导入批次不存在。");
  }

  if (!batch.sourceFilePath) {
    throw new Error("导入批次缺少源文件，请重新上传。");
  }

  const processingStartedAt = batch.processingStartedAt ?? new Date();
  const persistedState = await loadPersistedLeadImportState(batch.id);

  await updateLeadImportBatchProgress({
    batchId: batch.id,
    status: LeadImportBatchStatus.IMPORTING,
    stage: "PARSING",
    queueJobId: options?.queueJobId ?? undefined,
    successRows: persistedState.successRows,
    failedRows: persistedState.failedRows,
    duplicateRows: persistedState.duplicateRows,
    createdCustomerRows: persistedState.createdCustomerRows,
    matchedCustomerRows: persistedState.matchedCustomerRows,
    errorMessage: null,
    processingStartedAt,
  });

  const sourceBuffer = await readLeadImportSourceFile(batch.sourceFilePath);
  const parsedFile = parseLeadImportBuffer(sourceBuffer, batch.fileName);
  const mappingConfig = sanitizeLeadImportMapping(
    (batch.mappingConfig && typeof batch.mappingConfig === "object"
      ? batch.mappingConfig
      : {}) as LeadImportMappingConfig,
    parsedFile.headers,
  );
  const actorTeam = await prisma.user.findUnique({
    where: { id: batch.createdById },
    select: { teamId: true },
  });

  const uniqueCandidatePhones = [
    ...new Set(
      parsedFile.rows
        .map((row) => normalizeImportedPhone(getMappedValue(row.rawData, mappingConfig, "phone")))
        .filter(Boolean),
    ),
  ];

  const [existingLeads, existingCustomers, sourceTag] = await Promise.all([
    prisma.lead.findMany({
      where: withVisibleLeadWhere({
        phone: {
          in: uniqueCandidatePhones,
        },
      }),
      select: {
        id: true,
        phone: true,
        name: true,
      },
    }),
    prisma.customer.findMany({
      where: {
        phone: {
          in: uniqueCandidatePhones,
        },
      },
      select: {
        id: true,
        phone: true,
        name: true,
      },
    }),
    prisma.tag.findFirst({
      where: {
        isActive: true,
        code: {
          in: getSourceTagCodeCandidates(batch.defaultLeadSource),
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
      },
    }),
  ]);

  const existingLeadMap = new Map(existingLeads.map((lead) => [lead.phone, lead]));
  const existingCustomerMap = new Map(
    existingCustomers.map((customer) => [customer.phone, customer]),
  );

  await updateLeadImportBatchProgress({
    batchId: batch.id,
    status: LeadImportBatchStatus.IMPORTING,
    stage: "MATCHING",
    queueJobId: options?.queueJobId ?? undefined,
    successRows: persistedState.successRows,
    failedRows: persistedState.failedRows,
    duplicateRows: persistedState.duplicateRows,
    createdCustomerRows: persistedState.createdCustomerRows,
    matchedCustomerRows: persistedState.matchedCustomerRows,
    processingStartedAt,
  });

  const chunkSize = getLeadImportChunkSize();

  for (let index = 0; index < parsedFile.rows.length; index += chunkSize) {
    const chunkRows = parsedFile.rows.slice(index, index + chunkSize);

    for (const row of chunkRows) {
      if (persistedState.processedRowNumbers.has(row.rowNumber)) {
        continue;
      }

      const result = await processLeadImportRowTx({
        actor: {
          id: batch.createdById,
          role: "ADMIN",
        },
        actorTeamId: actorTeam?.teamId ?? null,
        batchId: batch.id,
        fileName: batch.fileName,
        row,
        mappingConfig,
        defaultLeadSource: batch.defaultLeadSource,
        existingLeadMap,
        existingCustomerMap,
        seenPhones: persistedState.seenPhones,
        sourceTag,
      });

      if (!persistedState.processedRowNumbers.has(result.rowSummary.rowNumber)) {
        applyLeadImportRowSummary(persistedState, result.rowSummary);
      }

      if (
        result.rowSummary.normalizedPhone &&
        result.rowSummary.status !== LeadImportRowStatus.DUPLICATE
      ) {
        persistedState.seenPhones.set(
          result.rowSummary.normalizedPhone,
          result.rowSummary.rowNumber,
        );
      }

      if (result.importedLead) {
        existingLeadMap.set(result.importedLead.phone, result.importedLead);
      }

      if (result.customer) {
        existingCustomerMap.set(result.customer.phone, result.customer);
      }
    }

    await updateLeadImportBatchProgress({
      batchId: batch.id,
      status: LeadImportBatchStatus.IMPORTING,
      stage: "WRITING",
      queueJobId: options?.queueJobId ?? undefined,
      successRows: persistedState.successRows,
      failedRows: persistedState.failedRows,
      duplicateRows: persistedState.duplicateRows,
      createdCustomerRows: persistedState.createdCustomerRows,
      matchedCustomerRows: persistedState.matchedCustomerRows,
      processingStartedAt,
    });
  }

  const report = buildLeadImportBatchReport({
    headers: parsedFile.headers,
    mappingConfig,
    templateName: batch.template?.name ?? null,
  });

  await updateLeadImportBatchProgress({
    batchId: batch.id,
    status: LeadImportBatchStatus.IMPORTING,
    stage: "FINALIZING",
    queueJobId: options?.queueJobId ?? undefined,
    successRows: persistedState.successRows,
    failedRows: persistedState.failedRows,
    duplicateRows: persistedState.duplicateRows,
    createdCustomerRows: persistedState.createdCustomerRows,
    matchedCustomerRows: persistedState.matchedCustomerRows,
    report,
    processingStartedAt,
  });

  const importedAt = new Date();
  const completedBatch = await updateLeadImportBatchProgress({
    batchId: batch.id,
    status: LeadImportBatchStatus.COMPLETED,
    stage: "COMPLETED",
    queueJobId: options?.queueJobId ?? undefined,
    successRows: persistedState.successRows,
    failedRows: persistedState.failedRows,
    duplicateRows: persistedState.duplicateRows,
    createdCustomerRows: persistedState.createdCustomerRows,
    matchedCustomerRows: persistedState.matchedCustomerRows,
    report,
    errorMessage: null,
    processingStartedAt,
    importedAt,
  });

  await createLeadImportBatchCompletedLog({
    actorId: batch.createdById,
    batchId: batch.id,
    fileName: batch.fileName,
    importKind: "LEAD",
    afterData: {
      importKind: "LEAD",
      totalRows: parsedFile.rows.length,
      successRows: persistedState.successRows,
      failedRows: persistedState.failedRows,
      duplicateRows: persistedState.duplicateRows,
      createdCustomerRows: persistedState.createdCustomerRows,
      matchedCustomerRows: persistedState.matchedCustomerRows,
      report,
    },
  });

  return {
    batchId: completedBatch.id,
    successRows: completedBatch.successRows,
    failedRows: completedBatch.failedRows,
    duplicateRows: completedBatch.duplicateRows,
    createdCustomerRows: completedBatch.createdCustomerRows,
    matchedCustomerRows: completedBatch.matchedCustomerRows,
  };
}

export async function createLeadImportBatchAsync(
  actor: Actor,
  input: {
    file: File;
    templateId?: string;
    defaultLeadSource: LeadSource;
    mappingConfig: string;
    importMode?: LeadImportMode;
  },
) {
  assertAccess(actor.role);

  if (!input.file || input.file.size === 0) {
    throw new Error("请先选择要上传的文件。");
  }

  const parsedInput = createBatchSchema.parse({
    templateId: input.templateId,
    defaultLeadSource: input.defaultLeadSource,
    mappingConfig: input.mappingConfig,
  });

  const parsedFile = await parseLeadImportFile(input.file);
  const mappingConfig = sanitizeLeadImportMapping(
    parseMappingConfig(parsedInput.mappingConfig),
    parsedFile.headers,
  );

  const missingHeaders = leadImportFieldDefinitions
    .filter((field) => field.required && !mappingConfig[field.key])
    .map((field) => field.label);

  if (missingHeaders.length > 0) {
    throw new Error(`导入文件缺少固定模板列：${missingHeaders.join(" / ")}`);
  }

  const template =
    parsedInput.templateId &&
    parsedInput.templateId !== LEAD_IMPORT_TEMPLATE_NONE_VALUE
      ? await prisma.leadImportTemplate.findFirst({
          where: {
            id: parsedInput.templateId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : null;

  const batchId = randomUUID();
  let createdBatch:
    | Awaited<ReturnType<typeof createQueuedLeadImportBatch>>
    | null = null;

  try {
    const sourceFilePath = await saveLeadImportSourceFile({
      batchId,
      file: input.file,
    });

    createdBatch = await createQueuedLeadImportBatch({
      batchId,
      actorId: actor.id,
      templateId: template?.id ?? null,
      fileName: input.file.name,
      fileType: parsedFile.fileType,
      defaultLeadSource: parsedInput.defaultLeadSource,
      mappingConfig: mappingConfig as Prisma.InputJsonValue,
      headers: parsedFile.headers as Prisma.InputJsonValue,
      totalRows: parsedFile.rows.length,
      sourceFilePath,
      report: {
        importKind: "LEAD",
        templateName: template?.name ?? null,
      } satisfies Prisma.InputJsonValue,
    });

    const job = await enqueueLeadImportBatchJob({
      batchId,
      mode: "lead",
    });

    const queuedBatch = await updateLeadImportBatchProgress({
      batchId,
      status: LeadImportBatchStatus.QUEUED,
      stage: "QUEUED",
      queueJobId: job.id?.toString() ?? batchId,
      successRows: createdBatch.successRows,
      failedRows: createdBatch.failedRows,
      duplicateRows: createdBatch.duplicateRows,
      createdCustomerRows: createdBatch.createdCustomerRows,
      matchedCustomerRows: createdBatch.matchedCustomerRows,
      errorMessage: null,
    });

    return queuedBatch;
  } catch (error) {
    if (createdBatch) {
      const message = error instanceof Error ? error.message : "导入入队失败，请稍后重试。";
      await setLeadImportBatchFailed({
        batchId: createdBatch.id,
        message,
      });
      await createLeadImportBatchFailureLog({
        actorId: actor.id,
        batchId: createdBatch.id,
        fileName: input.file.name,
        importKind: "LEAD",
        message,
        attempt: 1,
        attemptsAllowed: 1,
      });
    }

    throw error;
  }
}

export async function upsertLeadImportTemplate(
  actor: Actor,
  input: z.input<typeof templateSchema>,
) {
  assertAccess(actor.role);
  const parsed = templateSchema.parse(input);

  const sanitizedMapping = Object.fromEntries(
    leadImportFieldDefinitions
      .map((field) => [field.key, normalizeOptional(parsed.mappingConfig[field.key] ?? "")])
      .filter((entry): entry is [LeadImportFieldKey, string] => Boolean(entry[1])),
  );

  if (!sanitizedMapping.phone) {
    throw new Error("模板中必须配置手机号字段映射。");
  }

  return prisma.$transaction(async (tx) => {
    if (parsed.id) {
      const existing = await tx.leadImportTemplate.findUnique({
        where: { id: parsed.id },
      });

      if (!existing) {
        throw new Error("导入模板不存在。");
      }

      const updated = await tx.leadImportTemplate.update({
        where: { id: parsed.id },
        data: {
          name: parsed.name,
          description: normalizeOptional(parsed.description),
          defaultLeadSource: parsed.defaultLeadSource,
          mappingConfig: sanitizedMapping as Prisma.InputJsonValue,
        },
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.LEAD_IMPORT,
        action: "lead_import_template.updated",
        targetType: OperationTargetType.LEAD_IMPORT_TEMPLATE,
        targetId: updated.id,
        description: `更新导入模板：${updated.name}`,
        beforeData: existing,
        afterData: updated,
      });

      return updated;
    }

    const created = await tx.leadImportTemplate.create({
      data: {
        name: parsed.name,
        description: normalizeOptional(parsed.description),
        defaultLeadSource: parsed.defaultLeadSource,
        mappingConfig: sanitizedMapping as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.LEAD_IMPORT,
      action: "lead_import_template.created",
      targetType: OperationTargetType.LEAD_IMPORT_TEMPLATE,
      targetId: created.id,
      description: `创建导入模板：${created.name}`,
      afterData: created,
    });

    return created;
  });
}

export async function toggleLeadImportTemplate(actor: Actor, templateId: string) {
  assertAccess(actor.role);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.leadImportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      throw new Error("导入模板不存在。");
    }

    const updated = await tx.leadImportTemplate.update({
      where: { id: templateId },
      data: {
        isActive: !existing.isActive,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.LEAD_IMPORT,
      action: "lead_import_template.toggled",
      targetType: OperationTargetType.LEAD_IMPORT_TEMPLATE,
      targetId: updated.id,
      description: `${updated.isActive ? "启用" : "停用"}导入模板：${updated.name}`,
      beforeData: {
        isActive: existing.isActive,
      },
      afterData: {
        isActive: updated.isActive,
      },
    });

    return updated;
  });
}
