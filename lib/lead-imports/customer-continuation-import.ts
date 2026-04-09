import {
  CallResult,
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  LeadImportBatchStatus,
  LeadImportRowStatus,
  OperationModule,
  OperationTargetType,
  PublicPoolReason,
  UserStatus,
  WechatAddStatus,
  type LeadSource,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  createInitialPublicOwnershipEventTx,
  touchCustomerEffectiveFollowUpFromWechatTx,
} from "@/lib/customers/ownership";
import { prisma } from "@/lib/db/prisma";
import {
  buildImportedTagLookupCandidates,
  collectCustomerContinuationCategories,
  getCustomerContinuationOutcomeBadges,
  isCustomerContinuationSignalOnlyTagValue,
  resolveCustomerContinuationSignal,
  splitCustomerContinuationValues,
} from "@/lib/lead-imports/customer-continuation-signals";
import { parseLeadImportFile } from "@/lib/lead-imports/file-parser";
import {
  type CustomerContinuationImportAction,
  type CustomerContinuationImportMappingConfig,
  type CustomerContinuationImportSummary,
  type CustomerContinuationOwnerOutcome,
  type CustomerContinuationRowMappedData,
  type CustomerImportOperationLogData,
  DEFAULT_LEAD_IMPORT_SOURCE,
  customerContinuationImportFieldDefinitions,
  normalizeImportedPhone,
  sanitizeCustomerContinuationImportMapping,
} from "@/lib/lead-imports/metadata";

type Actor = {
  id: string;
  role: RoleCode;
};

type ExistingCustomerRecord = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  ownerId: string | null;
  ownershipMode: CustomerOwnershipMode;
  lastOwnerId: string | null;
  publicPoolEnteredAt: Date | null;
  publicPoolReason: PublicPoolReason | null;
  claimLockedUntil: Date | null;
  publicPoolTeamId: string | null;
  lastEffectiveFollowUpAt: Date | null;
};

type AssignableTagRecord = {
  id: string;
  code: string;
  name: string;
};

type ImportedCustomerSignal =
  | {
      kind: "WECHAT_ADDED";
      occurredAt: Date;
      marker: string;
      summary: string;
    }
  | {
      kind: "CALL_RESULT";
      occurredAt: Date;
      marker: string;
      result: Extract<CallResult, "HUNG_UP" | "REFUSED_WECHAT" | "INVALID_NUMBER">;
      resultCode: Extract<CallResult, "HUNG_UP" | "REFUSED_WECHAT" | "INVALID_NUMBER">;
      remark: string;
      nextFollowUpAt: Date | null;
    };

const createBatchSchema = z.object({
  defaultLeadSource: z.nativeEnum({
    INFO_FLOW: "INFO_FLOW",
  } as const satisfies Record<string, LeadSource>).default(DEFAULT_LEAD_IMPORT_SOURCE),
  mappingConfig: z.string().trim().min(2, "字段映射不能为空。"),
});

const SYSTEM_TAG_GROUP_CODE = "SYSTEM_CUSTOMER_IMPORT";
const SYSTEM_TAG_GROUP_NAME = "客户导入系统标签";
const SYSTEM_TAG_CODE = "CUSTOMER_CONTINUATION_IMPORT";
const SYSTEM_TAG_NAME = "续接迁移客户";
const IMPORTED_SIGNAL_PREFIX = "[customer-import-signal]";
const IMPORTED_WECHAT_ADDED_SUMMARY = `${IMPORTED_SIGNAL_PREFIX} 老系统映射：已加微信`;

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeOptional(value: string | null | undefined) {
  const next = value?.trim() ?? "";
  return next ? next : null;
}

function parseIntegerValue(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(/[,\s]/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.round(parsed));
}

function parseDateTimeText(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

function parseOptionalDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveImportedSignal(summary: CustomerContinuationImportSummary, tags: string[]) {
  const derivedSignal = resolveCustomerContinuationSignal({
    tags,
    summary,
  });

  if (!derivedSignal) {
    return null;
  }

  const occurredAt = parseOptionalDateTime(summary.latestFollowUpAt) ?? new Date();
  if (derivedSignal.kind === "WECHAT_ADDED") {
    return {
      kind: "WECHAT_ADDED",
      occurredAt,
      marker: IMPORTED_WECHAT_ADDED_SUMMARY,
      summary: IMPORTED_WECHAT_ADDED_SUMMARY,
    } satisfies ImportedCustomerSignal;
  }

  return {
    kind: "CALL_RESULT",
    occurredAt,
    marker: derivedSignal.marker,
    result:
      derivedSignal.resultCode === "HUNG_UP"
        ? CallResult.HUNG_UP
        : derivedSignal.resultCode === "REFUSED_WECHAT"
          ? CallResult.REFUSED_WECHAT
          : CallResult.INVALID_NUMBER,
    resultCode: derivedSignal.resultCode,
    remark: derivedSignal.remark,
    nextFollowUpAt: derivedSignal.nextFollowUpRequired ? occurredAt : null,
  } satisfies ImportedCustomerSignal;
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

  return value as CustomerContinuationImportMappingConfig;
}

function getMappedValue(
  rawData: Record<string, string>,
  mapping: CustomerContinuationImportMappingConfig,
  key: keyof CustomerContinuationImportMappingConfig,
) {
  const header = mapping[key];
  return header ? rawData[header] ?? "" : "";
}

function buildMappedCustomerData(
  rawData: Record<string, string>,
  mapping: CustomerContinuationImportMappingConfig,
) {
  const phoneRaw = getMappedValue(rawData, mapping, "phone");
  const normalizedPhone = normalizeImportedPhone(phoneRaw);
  const ownerUsername = normalizeOptional(getMappedValue(rawData, mapping, "ownerUsername"));
  const tags = splitCustomerContinuationValues(getMappedValue(rawData, mapping, "tags"));
  const summary: CustomerContinuationImportSummary = {
    historicalTotalSpent: normalizeOptional(
      getMappedValue(rawData, mapping, "historicalTotalSpent"),
    ),
    purchaseCount: parseIntegerValue(
      normalizeOptional(getMappedValue(rawData, mapping, "purchaseCount")),
    ),
    latestPurchasedProduct: normalizeOptional(
      getMappedValue(rawData, mapping, "latestPurchasedProduct"),
    ),
    latestIntent: normalizeOptional(getMappedValue(rawData, mapping, "latestIntent")),
    latestFollowUpAt: parseDateTimeText(
      normalizeOptional(getMappedValue(rawData, mapping, "latestFollowUpAt")),
    ),
    latestFollowUpResult: normalizeOptional(
      getMappedValue(rawData, mapping, "latestFollowUpResult"),
    ),
    note: normalizeOptional(getMappedValue(rawData, mapping, "note")),
  };

  return {
    phoneRaw,
    normalizedPhone,
    mappedCustomer: {
      name: normalizeOptional(getMappedValue(rawData, mapping, "name")),
      address: normalizeOptional(getMappedValue(rawData, mapping, "address")),
      ownerUsername,
      tags,
      summary,
    },
  };
}

function registerWarning(map: Map<string, number>, value: string | null | undefined) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return;
  }

  map.set(nextValue, (map.get(nextValue) ?? 0) + 1);
}

function buildOwnershipSnapshot(customer: ExistingCustomerRecord | null) {
  return {
    ownerId: customer?.ownerId ?? null,
    ownershipMode: customer?.ownershipMode ?? null,
    lastOwnerId: customer?.lastOwnerId ?? null,
    publicPoolEnteredAt: customer?.publicPoolEnteredAt ?? null,
    publicPoolReason: customer?.publicPoolReason ?? null,
    claimLockedUntil: customer?.claimLockedUntil ?? null,
    publicPoolTeamId: customer?.publicPoolTeamId ?? null,
  };
}

async function createOperationLog(
  tx: Prisma.TransactionClient,
  data: Prisma.OperationLogCreateInput,
) {
  await tx.operationLog.create({ data });
}

async function ensureImportedCustomerSignalTx(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    batchId: string;
    rowNumber: number;
    customerId: string;
    customerName: string;
    customerPhone: string;
    salesId: string;
    signal: ImportedCustomerSignal | null;
  },
) {
  if (!input.signal) {
    return null;
  }

  if (input.signal.kind === "WECHAT_ADDED") {
    const existingWechatTouch = await tx.wechatRecord.findFirst({
      where: {
        customerId: input.customerId,
        addedStatus: WechatAddStatus.ADDED,
      },
      select: { id: true },
    });

    if (existingWechatTouch) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      } as const;
    }

    const existingCallTouch = await tx.callRecord.findFirst({
      where: {
        customerId: input.customerId,
        OR: [
          { result: CallResult.WECHAT_ADDED },
          { resultCode: "WECHAT_ADDED" },
        ],
      },
      select: { id: true },
    });

    if (existingCallTouch) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      } as const;
    }

    const existingImportedRecord = await tx.wechatRecord.findFirst({
      where: {
        customerId: input.customerId,
        summary: input.signal.marker,
      },
      select: { id: true },
    });

    if (existingImportedRecord) {
      return {
        kind: input.signal.kind,
        status: "already_imported",
      } as const;
    }

    const created = await tx.wechatRecord.create({
      data: {
        customerId: input.customerId,
        salesId: input.salesId,
        addedStatus: WechatAddStatus.ADDED,
        addedAt: input.signal.occurredAt,
        summary: input.signal.summary,
      },
      select: {
        id: true,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: input.actorId } },
      module: OperationModule.WECHAT,
      action: "wechat_record.created_from_customer_import",
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.customerId,
      description: `客户续接导入补齐微信记录：${input.customerName} (${input.customerPhone})`,
      afterData: {
        customerId: input.customerId,
        salesId: input.salesId,
        wechatRecordId: created.id,
        addedStatus: WechatAddStatus.ADDED,
        addedAt: input.signal.occurredAt,
        importKind: "CUSTOMER_CONTINUATION",
        batchId: input.batchId,
        rowNumber: input.rowNumber,
        marker: input.signal.marker,
      },
    });

    await touchCustomerEffectiveFollowUpFromWechatTx(tx, {
      customerId: input.customerId,
      occurredAt: input.signal.occurredAt,
      addedStatus: WechatAddStatus.ADDED,
    });

    return {
      kind: input.signal.kind,
      status: "created",
      wechatRecordId: created.id,
    } as const;
  }

  const existingImportedRecord = await tx.callRecord.findFirst({
    where: {
      customerId: input.customerId,
      remark: input.signal.marker,
    },
    select: { id: true },
  });

  if (existingImportedRecord) {
    return {
      kind: input.signal.kind,
      status: "already_imported",
    } as const;
  }

  if (input.signal.resultCode === "REFUSED_WECHAT") {
    const existingRejectedWechat = await tx.wechatRecord.findFirst({
      where: {
        customerId: input.customerId,
        addedStatus: WechatAddStatus.REJECTED,
      },
      select: { id: true },
    });

    if (existingRejectedWechat) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      } as const;
    }
  }

  if (input.signal.resultCode === "INVALID_NUMBER") {
    const existingInvalidCall = await tx.callRecord.findFirst({
      where: {
        customerId: input.customerId,
        OR: [
          { result: CallResult.INVALID_NUMBER },
          { resultCode: "INVALID_NUMBER" },
        ],
      },
      select: { id: true },
    });

    if (existingInvalidCall) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      } as const;
    }
  }

  const created = await tx.callRecord.create({
    data: {
      customerId: input.customerId,
      salesId: input.salesId,
      callTime: input.signal.occurredAt,
      durationSeconds: 0,
      result: input.signal.result,
      resultCode: input.signal.resultCode,
      remark: input.signal.remark,
      nextFollowUpAt: input.signal.nextFollowUpAt,
    },
    select: {
      id: true,
    },
  });

  await createOperationLog(tx, {
    actor: { connect: { id: input.actorId } },
    module: OperationModule.CALL,
    action: "call_record.created_from_customer_import",
    targetType: OperationTargetType.CUSTOMER,
    targetId: input.customerId,
    description: `客户续接导入补齐通话结果：${input.customerName} (${input.customerPhone})`,
    afterData: {
      customerId: input.customerId,
      salesId: input.salesId,
      callRecordId: created.id,
      callTime: input.signal.occurredAt,
      result: input.signal.result,
      resultCode: input.signal.resultCode,
      nextFollowUpAt: input.signal.nextFollowUpAt,
      importKind: "CUSTOMER_CONTINUATION",
      batchId: input.batchId,
      rowNumber: input.rowNumber,
      marker: input.signal.marker,
    },
  });

  return {
    kind: input.signal.kind,
    status: "created",
    callRecordId: created.id,
    resultCode: input.signal.resultCode,
  } as const;
}

async function ensureSystemCustomerContinuationTagTx(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  let group = await tx.tagGroup.findUnique({
    where: { code: SYSTEM_TAG_GROUP_CODE },
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  });

  if (!group) {
    group = await tx.tagGroup.create({
      data: {
        code: SYSTEM_TAG_GROUP_CODE,
        name: SYSTEM_TAG_GROUP_NAME,
        description: "系统为客户续接迁移导入维护的稳定标签。",
        sortOrder: 980,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actorId } },
      module: OperationModule.MASTER_DATA,
      action: "tag_group.created",
      targetType: OperationTargetType.TAG_GROUP,
      targetId: group.id,
      description: `创建系统标签组：${group.name}`,
      afterData: {
        code: SYSTEM_TAG_GROUP_CODE,
        systemManaged: true,
      },
    });
  } else if (!group.isActive || group.name !== SYSTEM_TAG_GROUP_NAME) {
    const beforeData = {
      name: group.name,
      isActive: group.isActive,
    };
    group = await tx.tagGroup.update({
      where: { id: group.id },
      data: {
        name: SYSTEM_TAG_GROUP_NAME,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actorId } },
      module: OperationModule.MASTER_DATA,
      action: "tag_group.updated",
      targetType: OperationTargetType.TAG_GROUP,
      targetId: group.id,
      description: `更新系统标签组：${group.name}`,
      beforeData,
      afterData: {
        name: group.name,
        isActive: group.isActive,
        systemManaged: true,
      },
    });
  }

  let tag = await tx.tag.findUnique({
    where: { code: SYSTEM_TAG_CODE },
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
      groupId: true,
    },
  });

  if (!tag) {
    tag = await tx.tag.create({
      data: {
        code: SYSTEM_TAG_CODE,
        groupId: group.id,
        name: SYSTEM_TAG_NAME,
        description: "用于标记客户续接迁移导入客户的系统标签。",
        sortOrder: 980,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        groupId: true,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actorId } },
      module: OperationModule.MASTER_DATA,
      action: "tag.created",
      targetType: OperationTargetType.TAG,
      targetId: tag.id,
      description: `创建系统标签：${tag.name}`,
      afterData: {
        code: tag.code,
        systemManaged: true,
      },
    });
  } else if (!tag.isActive || tag.groupId !== group.id || tag.name !== SYSTEM_TAG_NAME) {
    const beforeData = {
      name: tag.name,
      isActive: tag.isActive,
      groupId: tag.groupId,
    };
    tag = await tx.tag.update({
      where: { id: tag.id },
      data: {
        groupId: group.id,
        name: SYSTEM_TAG_NAME,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        groupId: true,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actorId } },
      module: OperationModule.MASTER_DATA,
      action: "tag.updated",
      targetType: OperationTargetType.TAG,
      targetId: tag.id,
      description: `更新系统标签：${tag.name}`,
      beforeData,
      afterData: {
        name: tag.name,
        groupId: tag.groupId,
        isActive: tag.isActive,
        systemManaged: true,
      },
    });
  }

  return tag;
}

async function upsertCustomerTagsTx(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    tags: AssignableTagRecord[];
    actorId: string;
  },
) {
  const assignedTags: AssignableTagRecord[] = [];

  for (const tag of [...new Map(input.tags.map((item) => [item.id, item])).values()]) {
    const existing = await tx.customerTag.findUnique({
      where: {
        customerId_tagId: {
          customerId: input.customerId,
          tagId: tag.id,
        },
      },
      select: {
        tag: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (existing) {
      assignedTags.push(existing.tag);
      continue;
    }

    const created = await tx.customerTag.create({
      data: {
        customerId: input.customerId,
        tagId: tag.id,
        assignedById: input.actorId,
      },
      select: {
        tag: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    assignedTags.push(created.tag);
  }

  return assignedTags;
}

async function createOwnershipEventAndLogTx(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    customerId: string;
    before: ReturnType<typeof buildOwnershipSnapshot>;
    after: ReturnType<typeof buildOwnershipSnapshot> & {
      lastEffectiveFollowUpAt: Date | null;
    };
    reason: CustomerOwnershipEventReason;
    action: string;
    description: string;
    note?: string | null;
    afterData?: Record<string, unknown> | null;
  },
) {
  const event = await tx.customerOwnershipEvent.create({
    data: {
      customerId: input.customerId,
      fromOwnerId: input.before.ownerId,
      toOwnerId: input.after.ownerId,
      fromOwnershipMode: input.before.ownershipMode,
      toOwnershipMode: input.after.ownershipMode ?? CustomerOwnershipMode.PRIVATE,
      reason: input.reason,
      actorId: input.actorId,
      teamId: input.after.publicPoolTeamId ?? null,
      note: input.note ?? null,
      effectiveFollowUpAt: input.after.lastEffectiveFollowUpAt ?? null,
      claimLockedUntil: input.after.claimLockedUntil ?? null,
    },
    select: {
      id: true,
    },
  });

  await createOperationLog(tx, {
    actor: { connect: { id: input.actorId } },
    module: OperationModule.CUSTOMER,
    action: input.action,
    targetType: OperationTargetType.CUSTOMER,
    targetId: input.customerId,
    description: input.description,
    beforeData: input.before,
    afterData: {
      ...input.after,
      ...(input.afterData ?? {}),
      customerOwnershipEventId: event.id,
      reason: input.reason,
    },
  });

  return event;
}

function buildCustomerImportLogData(input: {
  batchId: string;
  batchFileName: string;
  rowNumber: number;
  action: Exclude<CustomerContinuationImportAction, "FAILED">;
  ownerUsername: string | null;
  ownerName: string | null;
  ownerResolved: boolean;
  ownerOutcome: CustomerContinuationOwnerOutcome;
  assignedTagNames: string[];
  unresolvedTags: string[];
  summary: CustomerContinuationImportSummary;
}): CustomerImportOperationLogData {
  return {
    importKind: "CUSTOMER_CONTINUATION",
    batchId: input.batchId,
    batchFileName: input.batchFileName,
    rowNumber: input.rowNumber,
    action: input.action,
    importedAt: new Date().toISOString(),
    owner: {
      username: input.ownerUsername,
      name: input.ownerName,
      resolved: input.ownerResolved,
    },
    ownerOutcome: input.ownerOutcome,
    tags: {
      assigned: input.assignedTagNames,
      unresolved: input.unresolvedTags,
    },
    summary: input.summary,
  };
}

export async function createCustomerContinuationImportBatch(
  actor: Actor,
  input: {
    file: File;
    defaultLeadSource?: LeadSource;
    mappingConfig: string;
  },
) {
  if (!input.file || input.file.size === 0) {
    throw new Error("请先选择要上传的文件。");
  }

  const parsedInput = createBatchSchema.parse({
    defaultLeadSource: input.defaultLeadSource ?? DEFAULT_LEAD_IMPORT_SOURCE,
    mappingConfig: input.mappingConfig,
  });

  const parsedFile = await parseLeadImportFile(input.file);
  const mappingConfig = sanitizeCustomerContinuationImportMapping(
    parseMappingConfig(parsedInput.mappingConfig),
    parsedFile.headers,
  );

  const missingHeaders = customerContinuationImportFieldDefinitions
    .filter((field) => field.required && !mappingConfig[field.key])
    .map((field) => field.label);

  if (missingHeaders.length > 0) {
    throw new Error(`导入文件缺少固定模板列：${missingHeaders.join(" / ")}`);
  }

  const batch = await prisma.leadImportBatch.create({
    data: {
      createdById: actor.id,
      templateId: null,
      fileName: input.file.name,
      fileType: parsedFile.fileType,
      status: LeadImportBatchStatus.IMPORTING,
      defaultLeadSource: parsedInput.defaultLeadSource,
      mappingConfig: mappingConfig as Prisma.InputJsonValue,
      headers: parsedFile.headers as Prisma.InputJsonValue,
      totalRows: parsedFile.rows.length,
      report: {
        importKind: "CUSTOMER_CONTINUATION",
        templateVersion: "v1",
      } satisfies Prisma.InputJsonValue,
    },
    select: {
      id: true,
    },
  });

  try {
    const actorUser = await prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        teamId: true,
      },
    });

    const candidateRows = parsedFile.rows.map((row) => ({
      rowNumber: row.rowNumber,
      rawData: row.rawData,
      mapped: buildMappedCustomerData(row.rawData, mappingConfig),
    }));
    const uniquePhones = [
      ...new Set(candidateRows.map((row) => row.mapped.normalizedPhone).filter(Boolean)),
    ];
    const ownerUsernames = [
      ...new Set(
        candidateRows
          .map((row) => row.mapped.mappedCustomer.ownerUsername)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const importedTagValues = [
      ...new Set(
        candidateRows.flatMap((row) => row.mapped.mappedCustomer.tags).filter(Boolean),
      ),
    ];
    const importedTagLookupValues = [
      ...new Set(
        importedTagValues.flatMap((value) => buildImportedTagLookupCandidates(value)),
      ),
    ];

    const [existingCustomers, resolvedOwners, activeTags] = await Promise.all([
      prisma.customer.findMany({
        where: {
          phone: {
            in: uniquePhones,
          },
        },
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          ownerId: true,
          ownershipMode: true,
          lastOwnerId: true,
          publicPoolEnteredAt: true,
          publicPoolReason: true,
          claimLockedUntil: true,
          publicPoolTeamId: true,
          lastEffectiveFollowUpAt: true,
        },
      }),
      ownerUsernames.length > 0
        ? prisma.user.findMany({
            where: {
              username: {
                in: ownerUsernames,
              },
              userStatus: UserStatus.ACTIVE,
              role: {
                code: "SALES",
              },
            },
            select: {
              id: true,
              name: true,
              username: true,
              teamId: true,
            },
          })
        : Promise.resolve([]),
      importedTagLookupValues.length > 0
        ? prisma.tag.findMany({
            where: {
              isActive: true,
              OR: [
                {
                  code: {
                    in: importedTagLookupValues.map((value) => value.toUpperCase()),
                  },
                },
                {
                  name: {
                    in: importedTagLookupValues,
                  },
                },
              ],
            },
            select: {
              id: true,
              code: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const existingCustomerMap = new Map(existingCustomers.map((item) => [item.phone, item]));
    const resolvedOwnerMap = new Map(resolvedOwners.map((item) => [item.username, item]));
    const tagByCode = new Map(activeTags.map((item) => [item.code.toUpperCase(), item]));
    const tagByName = new Map(activeTags.map((item) => [item.name, item]));
    const seenPhones = new Map<string, number>();
    const unresolvedOwnerValues = new Map<string, number>();
    const unresolvedTagValues = new Map<string, number>();

    const report = await prisma.$transaction(async (tx) => {
      const systemTag = await ensureSystemCustomerContinuationTagTx(tx, actor.id);
      let successRows = 0;
      let failedRows = 0;
      let duplicateRows = 0;
      let createdCustomers = 0;
      let createdPrivateCustomers = 0;
      let createdPublicCustomers = 0;
      let matchedExistingCustomers = 0;
      let updatedExistingCustomers = 0;
      let unresolvedOwners = 0;
      let unresolvedTags = 0;
      let categoryACustomers = 0;
      let categoryBCustomers = 0;
      let categoryCCustomers = 0;
      let categoryDCustomers = 0;
      let wechatAddedCustomers = 0;
      let pendingInvitationCustomers = 0;
      let pendingCallbackCustomers = 0;
      let refusedWechatCustomers = 0;
      let invalidNumberCustomers = 0;

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.LEAD_IMPORT,
        action: "lead_import.batch_created",
        targetType: OperationTargetType.LEAD_IMPORT_BATCH,
        targetId: batch.id,
        description: `创建客户续接导入批次：${input.file.name}`,
        afterData: {
          fileName: input.file.name,
          fileType: parsedFile.fileType,
          totalRows: parsedFile.rows.length,
          importKind: "CUSTOMER_CONTINUATION",
        },
      });

      for (const row of candidateRows) {
        const { phoneRaw, normalizedPhone, mappedCustomer } = row.mapped;
        let status: LeadImportRowStatus = LeadImportRowStatus.IMPORTED;
        let errorReason: string | null = null;
        let customerId: string | null = null;
        let customerName: string | null = null;
        let action: CustomerContinuationImportAction = "FAILED";
        let ownerOutcome: CustomerContinuationOwnerOutcome = "UNRESOLVED";
        const unresolvedTagsForRow: string[] = [];

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
          duplicateRows += 1;
        } else {
          seenPhones.set(normalizedPhone, row.rowNumber);

          const resolvedOwner = mappedCustomer.ownerUsername
            ? resolvedOwnerMap.get(mappedCustomer.ownerUsername) ?? null
            : null;
          const ownerResolved = Boolean(resolvedOwner);
          const importedCategories = collectCustomerContinuationCategories({
            tags: mappedCustomer.tags,
            summary: mappedCustomer.summary,
          });
          const importedSignal = resolveImportedSignal(
            mappedCustomer.summary,
            mappedCustomer.tags,
          );
          const outcomeBadges = getCustomerContinuationOutcomeBadges({
            tags: mappedCustomer.tags,
            summary: mappedCustomer.summary,
          });

          if (mappedCustomer.ownerUsername && !resolvedOwner) {
            unresolvedOwners += 1;
            registerWarning(unresolvedOwnerValues, mappedCustomer.ownerUsername);
          }

          const assignedTagCandidates: AssignableTagRecord[] = [systemTag];
          for (const tagValue of mappedCustomer.tags) {
            const resolvedTag =
              buildImportedTagLookupCandidates(tagValue)
                .map(
                  (candidate) =>
                    tagByCode.get(candidate.toUpperCase()) ?? tagByName.get(candidate) ?? null,
                )
                .find((candidate): candidate is AssignableTagRecord => Boolean(candidate)) ??
              null;

            if (resolvedTag) {
              assignedTagCandidates.push(resolvedTag);
              continue;
            }

            if (isCustomerContinuationSignalOnlyTagValue(tagValue)) {
              continue;
            }

            unresolvedTags += 1;
            unresolvedTagsForRow.push(tagValue);
            registerWarning(unresolvedTagValues, tagValue);
          }

          const existingCustomer = existingCustomerMap.get(normalizedPhone) ?? null;

          if (existingCustomer) {
            const nextData: Prisma.CustomerUpdateInput = {};
            let updated = false;
            let effectiveCustomer = existingCustomer;

            if (
              mappedCustomer.name &&
              (!existingCustomer.name.trim() || existingCustomer.name === existingCustomer.phone)
            ) {
              nextData.name = mappedCustomer.name;
            }

            if (mappedCustomer.address && !existingCustomer.address?.trim()) {
              nextData.address = mappedCustomer.address;
            }

            if (Object.keys(nextData).length > 0) {
              effectiveCustomer = await tx.customer.update({
                where: { id: existingCustomer.id },
                data: nextData,
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  address: true,
                  ownerId: true,
                  ownershipMode: true,
                  lastOwnerId: true,
                  publicPoolEnteredAt: true,
                  publicPoolReason: true,
                  claimLockedUntil: true,
                  publicPoolTeamId: true,
                  lastEffectiveFollowUpAt: true,
                },
              });
              updated = true;
              updatedExistingCustomers += 1;
            }

            if (!effectiveCustomer.ownerId && resolvedOwner) {
              const now = new Date();
              const before = buildOwnershipSnapshot(effectiveCustomer);

              effectiveCustomer = await tx.customer.update({
                where: { id: effectiveCustomer.id },
                data: {
                  ownerId: resolvedOwner.id,
                  ownershipMode: CustomerOwnershipMode.PRIVATE,
                  lastOwnerId: resolvedOwner.id,
                  publicPoolEnteredAt: null,
                  publicPoolReason: null,
                  claimLockedUntil: addDays(now, 2),
                  publicPoolTeamId: resolvedOwner.teamId ?? actorUser?.teamId ?? null,
                },
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  address: true,
                  ownerId: true,
                  ownershipMode: true,
                  lastOwnerId: true,
                  publicPoolEnteredAt: true,
                  publicPoolReason: true,
                  claimLockedUntil: true,
                  publicPoolTeamId: true,
                  lastEffectiveFollowUpAt: true,
                },
              });

              ownerOutcome = "ASSIGNED";

              await createOwnershipEventAndLogTx(tx, {
                actorId: actor.id,
                customerId: effectiveCustomer.id,
                before,
                after: {
                  ...buildOwnershipSnapshot(effectiveCustomer),
                  lastEffectiveFollowUpAt: effectiveCustomer.lastEffectiveFollowUpAt,
                },
                reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
                note: `Customer continuation import batch ${input.file.name} row ${row.rowNumber}`,
                action: "customer.customer_import.assigned_existing_unowned",
                description: `客户续接导入为已有客户 ${effectiveCustomer.name} 补齐负责人 ${resolvedOwner.name}`,
              });
            } else if (effectiveCustomer.ownerId) {
              ownerOutcome = "KEPT_EXISTING";
            } else {
              ownerOutcome = "PUBLIC_POOL";
            }

            const assignedTags = await upsertCustomerTagsTx(tx, {
              customerId: effectiveCustomer.id,
              tags: assignedTagCandidates,
              actorId: actor.id,
            });
            const signalSync = await ensureImportedCustomerSignalTx(tx, {
              actorId: actor.id,
              batchId: batch.id,
              rowNumber: row.rowNumber,
              customerId: effectiveCustomer.id,
              customerName: effectiveCustomer.name,
              customerPhone: effectiveCustomer.phone,
              salesId: effectiveCustomer.ownerId ?? resolvedOwner?.id ?? actor.id,
              signal: importedSignal,
            });

            const customerImport = buildCustomerImportLogData({
              batchId: batch.id,
              batchFileName: input.file.name,
              rowNumber: row.rowNumber,
              action: "MATCHED_EXISTING_CUSTOMER",
              ownerUsername: resolvedOwner?.username ?? mappedCustomer.ownerUsername ?? null,
              ownerName: resolvedOwner?.name ?? null,
              ownerResolved,
              ownerOutcome,
              assignedTagNames: assignedTags.map((tag) => tag.name),
              unresolvedTags: unresolvedTagsForRow,
              summary: mappedCustomer.summary,
            });

            await createOperationLog(tx, {
              actor: { connect: { id: actor.id } },
              module: OperationModule.CUSTOMER,
              action: "customer.customer_import.matched_existing",
              targetType: OperationTargetType.CUSTOMER,
              targetId: effectiveCustomer.id,
              description: `客户续接导入命中已有客户 ${effectiveCustomer.name}`,
              beforeData: {
                updatedFields: updated,
              },
              afterData: {
                customerImport,
                importedSignal: signalSync,
              },
            });

            existingCustomerMap.set(normalizedPhone, effectiveCustomer);
            successRows += 1;
            matchedExistingCustomers += 1;
            customerId = effectiveCustomer.id;
            customerName = effectiveCustomer.name;
            action = "MATCHED_EXISTING_CUSTOMER";
          } else {
            const now = new Date();
            const shouldAssignOwner = Boolean(resolvedOwner);
            const createdCustomer = await tx.customer.create({
              data: {
                name: mappedCustomer.name ?? normalizedPhone,
                phone: normalizedPhone,
                address: mappedCustomer.address,
                ownerId: shouldAssignOwner ? resolvedOwner!.id : null,
                ownershipMode: shouldAssignOwner
                  ? CustomerOwnershipMode.PRIVATE
                  : CustomerOwnershipMode.PUBLIC,
                lastOwnerId: shouldAssignOwner ? resolvedOwner!.id : null,
                publicPoolEnteredAt: shouldAssignOwner ? null : now,
                publicPoolReason: shouldAssignOwner
                  ? null
                  : PublicPoolReason.UNASSIGNED_IMPORT,
                claimLockedUntil: shouldAssignOwner ? addDays(now, 2) : null,
                publicPoolTeamId: shouldAssignOwner
                  ? resolvedOwner!.teamId ?? actorUser?.teamId ?? null
                  : actorUser?.teamId ?? null,
              },
              select: {
                id: true,
                name: true,
                phone: true,
                address: true,
                ownerId: true,
                ownershipMode: true,
                lastOwnerId: true,
                publicPoolEnteredAt: true,
                publicPoolReason: true,
                claimLockedUntil: true,
                publicPoolTeamId: true,
                lastEffectiveFollowUpAt: true,
              },
            });

            if (shouldAssignOwner) {
              ownerOutcome = "ASSIGNED";
              await createOwnershipEventAndLogTx(tx, {
                actorId: actor.id,
                customerId: createdCustomer.id,
                before: buildOwnershipSnapshot(null),
                after: {
                  ...buildOwnershipSnapshot(createdCustomer),
                  lastEffectiveFollowUpAt: createdCustomer.lastEffectiveFollowUpAt,
                },
                reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
                note: `Customer continuation import batch ${input.file.name} row ${row.rowNumber}`,
                action: "customer.customer_import.created_private",
                description: `客户续接导入创建私有客户 ${createdCustomer.name} 并归属给 ${resolvedOwner!.name}`,
              });
            } else {
              ownerOutcome = "PUBLIC_POOL";
              await createInitialPublicOwnershipEventTx(tx, {
                actorId: actor.id,
                actorTeamId: actorUser?.teamId ?? null,
                customerId: createdCustomer.id,
                note: `Customer continuation import batch ${input.file.name} row ${row.rowNumber}`,
              });
            }

            const assignedTags = await upsertCustomerTagsTx(tx, {
              customerId: createdCustomer.id,
              tags: assignedTagCandidates,
              actorId: actor.id,
            });
            const signalSync = await ensureImportedCustomerSignalTx(tx, {
              actorId: actor.id,
              batchId: batch.id,
              rowNumber: row.rowNumber,
              customerId: createdCustomer.id,
              customerName: createdCustomer.name,
              customerPhone: createdCustomer.phone,
              salesId: createdCustomer.ownerId ?? resolvedOwner?.id ?? actor.id,
              signal: importedSignal,
            });

            const customerImport = buildCustomerImportLogData({
              batchId: batch.id,
              batchFileName: input.file.name,
              rowNumber: row.rowNumber,
              action: "CREATED_CUSTOMER",
              ownerUsername: resolvedOwner?.username ?? mappedCustomer.ownerUsername ?? null,
              ownerName: resolvedOwner?.name ?? null,
              ownerResolved,
              ownerOutcome,
              assignedTagNames: assignedTags.map((tag) => tag.name),
              unresolvedTags: unresolvedTagsForRow,
              summary: mappedCustomer.summary,
            });

            await createOperationLog(tx, {
              actor: { connect: { id: actor.id } },
              module: OperationModule.CUSTOMER,
              action: "customer.customer_import.created",
              targetType: OperationTargetType.CUSTOMER,
              targetId: createdCustomer.id,
              description: `客户续接导入创建客户 ${createdCustomer.name}`,
              afterData: {
                customerImport,
                importedSignal: signalSync,
              },
            });

            existingCustomerMap.set(normalizedPhone, createdCustomer);
            successRows += 1;
            createdCustomers += 1;
            if (shouldAssignOwner) {
              createdPrivateCustomers += 1;
            } else {
              createdPublicCustomers += 1;
            }
            customerId = createdCustomer.id;
            customerName = createdCustomer.name;
            action = "CREATED_CUSTOMER";
          }

          for (const category of importedCategories) {
            if (category === "A") {
              categoryACustomers += 1;
            }
            if (category === "B") {
              categoryBCustomers += 1;
            }
            if (category === "C") {
              categoryCCustomers += 1;
            }
            if (category === "D") {
              categoryDCustomers += 1;
            }
          }

          for (const badge of outcomeBadges) {
            if (badge.key === "WECHAT_ADDED") {
              wechatAddedCustomers += 1;
            }
            if (badge.key === "PENDING_INVITATION") {
              pendingInvitationCustomers += 1;
            }
            if (badge.key === "PENDING_CALLBACK") {
              pendingCallbackCustomers += 1;
            }
            if (badge.key === "REFUSED_WECHAT") {
              refusedWechatCustomers += 1;
            }
            if (badge.key === "INVALID_NUMBER") {
              invalidNumberCustomers += 1;
            }
          }
        }

        const rowMappedData: CustomerContinuationRowMappedData = {
          importKind: "CUSTOMER_CONTINUATION",
          mappedCustomer: {
            name: mappedCustomer.name,
            phone: normalizedPhone || "",
            ownerUsername: mappedCustomer.ownerUsername,
            tags: mappedCustomer.tags,
            unresolvedTags: unresolvedTagsForRow,
            summary: mappedCustomer.summary,
          },
          result: {
            customerId,
            customerName,
            action,
            ownerOutcome,
          },
        };

        await tx.leadImportRow.create({
          data: {
            batchId: batch.id,
            rowNumber: row.rowNumber,
            status,
            phoneRaw: normalizeOptional(phoneRaw),
            normalizedPhone: normalizeOptional(normalizedPhone),
            mappedName: mappedCustomer.name,
            errorReason,
            rawData: row.rawData as Prisma.InputJsonValue,
            mappedData: rowMappedData as Prisma.InputJsonValue,
          },
        });
      }

      const batchReport = {
        importKind: "CUSTOMER_CONTINUATION",
        templateVersion: "v1",
        summary: {
          createdCustomers,
          createdPrivateCustomers,
          createdPublicCustomers,
          matchedExistingCustomers,
          updatedExistingCustomers,
          unresolvedOwners,
          unresolvedTags,
          categoryACustomers,
          categoryBCustomers,
          categoryCCustomers,
          categoryDCustomers,
          wechatAddedCustomers,
          pendingInvitationCustomers,
          pendingCallbackCustomers,
          refusedWechatCustomers,
          invalidNumberCustomers,
        },
        warnings: {
          unresolvedOwnerValues: [...unresolvedOwnerValues.entries()].map(([value, count]) => ({
            value,
            count,
          })),
          unresolvedTagValues: [...unresolvedTagValues.entries()].map(([value, count]) => ({
            value,
            count,
          })),
        },
      } satisfies Prisma.InputJsonValue;

      await tx.leadImportBatch.update({
        where: { id: batch.id },
        data: {
          status: LeadImportBatchStatus.COMPLETED,
          successRows,
          failedRows,
          duplicateRows,
          createdCustomerRows: createdCustomers,
          matchedCustomerRows: matchedExistingCustomers,
          importedAt: new Date(),
          report: batchReport,
        },
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.LEAD_IMPORT,
        action: "lead_import.batch_completed",
        targetType: OperationTargetType.LEAD_IMPORT_BATCH,
        targetId: batch.id,
        description: `完成客户续接导入批次：${input.file.name}`,
        afterData: {
          importKind: "CUSTOMER_CONTINUATION",
          totalRows: parsedFile.rows.length,
          successRows,
          failedRows,
          duplicateRows,
          createdCustomerRows: createdCustomers,
          matchedCustomerRows: matchedExistingCustomers,
          batchReport,
        },
      });

      return {
        successRows,
        failedRows,
        duplicateRows,
        createdCustomerRows: createdCustomers,
        matchedCustomerRows: matchedExistingCustomers,
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
        description: `客户续接导入批次失败：${input.file.name}`,
        afterData: {
          errorMessage: message,
          importKind: "CUSTOMER_CONTINUATION",
        },
      },
    });

    throw error;
  }
}
