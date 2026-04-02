import {
  LeadCustomerMergeAction,
  LeadImportBatchStatus,
  LeadDedupType,
  LeadImportRowStatus,
  LeadSource,
  OperationModule,
  OperationTargetType,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canAccessLeadImportModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { parseLeadImportFile } from "@/lib/lead-imports/file-parser";
import {
  LEAD_IMPORT_TEMPLATE_NONE_VALUE,
  leadImportFieldDefinitions,
  normalizeImportedPhone,
  sanitizeLeadImportMapping,
  type LeadImportFieldKey,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";

type Actor = {
  id: string;
  role: RoleCode;
};

type ImportedLeadData = ReturnType<typeof buildMappedLeadData>["mappedData"];

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
  },
) {
  const matchedCustomer = input.existingCustomerMap.get(input.lead.phone);
  const customer =
    matchedCustomer ??
    (await tx.customer.create({
      data: {
        name: input.mappedData.name ?? input.lead.name ?? input.lead.phone,
        phone: input.lead.phone,
        address: input.mappedData.address,
        remark: input.mappedData.remark,
        ownerId: input.lead.ownerId,
      },
      select: {
        id: true,
        phone: true,
        name: true,
      },
    }));

  if (!matchedCustomer) {
    input.existingCustomerMap.set(customer.phone, customer);
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

export async function createLeadImportBatch(
  actor: Actor,
  input: {
    file: File;
    templateId?: string;
    defaultLeadSource: LeadSource;
    mappingConfig: string;
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
