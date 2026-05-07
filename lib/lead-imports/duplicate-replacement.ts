import {
  AssignmentType,
  CustomerHistoryArchiveVisibility,
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  LeadDedupType,
  LeadCustomerMergeAction,
  LeadImportRowStatus,
  LeadSource,
  LeadStatus,
  OperationModule,
  OperationTargetType,
  PublicPoolReason,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { canAccessLeadImportModule } from "@/lib/auth/access";
import {
  assignCustomerToSalesTx,
  createInitialPublicOwnershipEventTx,
  getCustomerOwnershipActorContextTx,
} from "@/lib/customers/ownership";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import {
  buildLeadImportDuplicateCustomerSnapshot,
  getLeadImportDuplicateReplacementEligibility,
  leadImportDuplicateCustomerSelect,
  type LeadImportDuplicateCustomerRecord,
} from "@/lib/lead-imports/duplicate-customer";
import {
  DEFAULT_LEAD_IMPORT_SOURCE,
  isLeadImportSourceValue,
  type LeadImportRowMappedData,
} from "@/lib/lead-imports/metadata";
import { buildLeadImportBatchVisibilityWhere } from "@/lib/lead-imports/access";

type DuplicateReplacementActor = {
  id: string;
  role: RoleCode;
  teamId: string | null;
};

type DuplicateReplacementInput = {
  batchId: string;
  rowId: string;
  targetOwnerId: string;
  historyPolicy: "ARCHIVE" | "DISCARD";
  historyVisibility: CustomerHistoryArchiveVisibility;
  reason: string;
};

const duplicateReplacementTransactionOptions: {
  maxWait: number;
  timeout: number;
} = {
  maxWait: 10_000,
  timeout: 20_000,
};

type DuplicateReplacementCustomer = LeadImportDuplicateCustomerRecord;

type DuplicateReplacementSalesTarget = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
};

type DuplicateReplacementRowSnapshot = {
  id: string;
  rowNumber: number;
  normalizedPhone: string | null;
  phoneRaw: string | null;
  mappedName: string | null;
  mappedData: Prisma.JsonValue | null;
};

type DuplicateReplacementBatchSnapshot = {
  id: string;
  fileName: string;
  defaultLeadSource: LeadSource;
};

function assertDuplicateReplacementAccess(actor: DuplicateReplacementActor) {
  if (!canAccessLeadImportModule(actor.role)) {
    throw new Error("当前角色无权访问线索导入中心。");
  }

  if (actor.role !== "ADMIN" && actor.role !== "SUPERVISOR") {
    throw new Error("仅管理员或主管可以把重复客户改为新线索。");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseMappedData(
  value: Prisma.JsonValue | null,
  fallbackSource: LeadSource,
): LeadImportRowMappedData {
  if (!isRecord(value)) {
    throw new Error("该导入行缺少可用的字段映射，不能作为新线索。");
  }

  const sourceValue = typeof value.source === "string" ? value.source : fallbackSource;

  return {
    phone: typeof value.phone === "string" ? value.phone : null,
    name: typeof value.name === "string" ? value.name : null,
    address: typeof value.address === "string" ? value.address : null,
    interestedProduct:
      typeof value.interestedProduct === "string" ? value.interestedProduct : null,
    campaignName: typeof value.campaignName === "string" ? value.campaignName : null,
    sourceDetail: typeof value.sourceDetail === "string" ? value.sourceDetail : null,
    remark: typeof value.remark === "string" ? value.remark : null,
    source: isLeadImportSourceValue(sourceValue) ? sourceValue : fallbackSource,
  };
}

function assertCustomerVisibleToActor(
  actor: DuplicateReplacementActor,
  customer: DuplicateReplacementCustomer,
) {
  if (actor.role === "ADMIN") {
    return;
  }

  if (!actor.teamId) {
    throw new Error("当前主管未配置团队范围，不能替换重复客户。");
  }

  if (customer.owner?.teamId === actor.teamId) {
    return;
  }

  if (!customer.ownerId && customer.publicPoolTeamId === actor.teamId) {
    return;
  }

  throw new Error("当前重复客户不在你的团队范围内，不能替换为新线索。");
}

function getSnapshotCustomerId(value: Prisma.JsonValue | null) {
  if (!isRecord(value)) {
    return null;
  }

  const duplicateCustomer = value.duplicateCustomer;
  if (!isRecord(duplicateCustomer)) {
    return null;
  }

  return typeof duplicateCustomer.customerId === "string"
    ? duplicateCustomer.customerId
    : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getSafeLeadSource(value: LeadSource | null | undefined) {
  return value && isLeadImportSourceValue(value) ? value : DEFAULT_LEAD_IMPORT_SOURCE;
}

function getSalesLabel(sales: Pick<DuplicateReplacementSalesTarget, "name" | "username">) {
  return `${sales.name} (@${sales.username})`;
}

function normalizeHistoryVisibility(
  value: CustomerHistoryArchiveVisibility,
  historyPolicy: DuplicateReplacementInput["historyPolicy"],
) {
  if (historyPolicy === "DISCARD") {
    return CustomerHistoryArchiveVisibility.SUPERVISOR_ONLY;
  }

  return value === CustomerHistoryArchiveVisibility.ALL_ROLES
    ? CustomerHistoryArchiveVisibility.ALL_ROLES
    : CustomerHistoryArchiveVisibility.SUPERVISOR_ONLY;
}

async function getTargetSalesTx(
  tx: Prisma.TransactionClient,
  actor: DuplicateReplacementActor,
  targetOwnerId: string,
) {
  const targetSales = await tx.user.findFirst({
    where: {
      id: targetOwnerId,
      userStatus: UserStatus.ACTIVE,
      disabledAt: null,
      role: {
        code: "SALES",
      },
      ...(actor.role === "SUPERVISOR"
        ? actor.teamId
          ? { teamId: actor.teamId }
          : { id: "__missing_duplicate_replacement_team_scope__" }
        : {}),
    },
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
    },
  });

  if (!targetSales) {
    throw new Error("请选择当前团队内可用的业务员。");
  }

  return targetSales satisfies DuplicateReplacementSalesTarget;
}

async function buildCustomerHistoryArchiveSnapshotTx(
  tx: Prisma.TransactionClient,
  input: {
    batch: DuplicateReplacementBatchSnapshot;
    row: DuplicateReplacementRowSnapshot;
    customer: DuplicateReplacementCustomer;
    duplicateSnapshot: ReturnType<typeof buildLeadImportDuplicateCustomerSnapshot>;
    mappedData: LeadImportRowMappedData;
    targetSales: DuplicateReplacementSalesTarget;
    reason: string;
  },
) {
  const [
    leads,
    mergeLogs,
    callRecords,
    wechatRecords,
    followUpTasks,
    customerTags,
    ownershipEvents,
  ] = await Promise.all([
    tx.lead.findMany({
      where: { customerId: input.customer.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        name: true,
        phone: true,
        source: true,
        status: true,
        remark: true,
        owner: {
          select: {
            name: true,
            username: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        lastFollowUpAt: true,
        nextFollowUpAt: true,
      },
    }),
    tx.leadCustomerMergeLog.findMany({
      where: { customerId: input.customer.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        batchId: true,
        rowId: true,
        leadId: true,
        leadIdSnapshot: true,
        leadNameSnapshot: true,
        leadPhoneSnapshot: true,
        action: true,
        source: true,
        phone: true,
        tagSynced: true,
        note: true,
        actorId: true,
        createdAt: true,
      },
    }),
    tx.callRecord.findMany({
      where: { customerId: input.customer.id },
      orderBy: { callTime: "desc" },
      take: 30,
      select: {
        id: true,
        leadId: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        callTime: true,
        durationSeconds: true,
        result: true,
        resultCode: true,
        remark: true,
        nextFollowUpAt: true,
        createdAt: true,
      },
    }),
    tx.wechatRecord.findMany({
      where: { customerId: input.customer.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        leadId: true,
        addedStatus: true,
        addedAt: true,
        wechatAccount: true,
        wechatNickname: true,
        wechatRemarkName: true,
        tags: true,
        summary: true,
        nextFollowUpAt: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        createdAt: true,
      },
    }),
    tx.followUpTask.findMany({
      where: { customerId: input.customer.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        leadId: true,
        owner: {
          select: {
            name: true,
            username: true,
          },
        },
        type: true,
        status: true,
        priority: true,
        subject: true,
        content: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    tx.customerTag.findMany({
      where: { customerId: input.customer.id },
      orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
      take: 50,
      select: {
        id: true,
        createdAt: true,
        tag: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
        assignedBy: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    tx.customerOwnershipEvent.findMany({
      where: { customerId: input.customer.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        fromOwner: {
          select: {
            name: true,
            username: true,
          },
        },
        toOwner: {
          select: {
            name: true,
            username: true,
          },
        },
        fromOwnershipMode: true,
        toOwnershipMode: true,
        reason: true,
        note: true,
        effectiveFollowUpAt: true,
        claimLockedUntil: true,
        createdAt: true,
        actor: {
          select: {
            name: true,
            username: true,
          },
        },
        team: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    }),
  ]);

  return {
    archivedAt: new Date().toISOString(),
    reason: input.reason,
    sourceCustomer: input.duplicateSnapshot,
    sourceImport: {
      batchId: input.batch.id,
      fileName: input.batch.fileName,
      rowId: input.row.id,
      rowNumber: input.row.rowNumber,
      normalizedPhone: input.row.normalizedPhone,
      phoneRaw: input.row.phoneRaw,
      mappedName: input.row.mappedName,
      mappedData: input.mappedData,
    },
    reassignment: {
      targetOwnerId: input.targetSales.id,
      targetOwnerLabel: getSalesLabel(input.targetSales),
    },
    counts: {
      leads: leads.length,
      mergeLogs: mergeLogs.length,
      callRecords: input.customer._count.callRecords,
      wechatRecords: input.customer._count.wechatRecords,
      followUpTasks: followUpTasks.length,
      customerTags: customerTags.length,
      ownershipEvents: ownershipEvents.length,
    },
    leads,
    mergeLogs,
    callRecords,
    wechatRecords,
    followUpTasks,
    customerTags,
    ownershipEvents,
  };
}

async function detachDuplicateCustomerOperationalHistoryTx(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const callRecordIds = (
    await tx.callRecord.findMany({
      where: { customerId },
      select: { id: true },
    })
  ).map((record) => record.id);

  const [detachedLeads, detachedMergeLogs, deletedCustomerTags, deletedFollowUpTasks] =
    await Promise.all([
      tx.lead.updateMany({
        where: { customerId },
        data: { customerId: null },
      }),
      tx.leadCustomerMergeLog.updateMany({
        where: { customerId },
        data: { customerId: null },
      }),
      tx.customerTag.deleteMany({
        where: { customerId },
      }),
      tx.followUpTask.deleteMany({
        where: { customerId },
      }),
    ]);

  const [
    detachedCallRecords,
    detachedWechatRecords,
    detachedCallActionEvents,
    detachedAudienceRecords,
    detachedCandidateAudienceRecords,
    deletedOwnershipEvents,
  ] = await Promise.all([
    tx.callRecord.updateMany({
      where: { customerId },
      data: { customerId: null },
    }),
    tx.wechatRecord.updateMany({
      where: { customerId },
      data: { customerId: null },
    }),
    tx.callActionEvent.updateMany({
      where: {
        OR: [
          { customerId },
          ...(callRecordIds.length > 0 ? [{ callRecordId: { in: callRecordIds } }] : []),
        ],
      },
      data: { customerId: null },
    }),
    tx.liveAudienceRecord.updateMany({
      where: { customerId },
      data: { customerId: null },
    }),
    tx.liveAudienceRecord.updateMany({
      where: { candidateCustomerId: customerId },
      data: { candidateCustomerId: null },
    }),
    tx.customerOwnershipEvent.deleteMany({
      where: { customerId },
    }),
  ]);

  return {
    detachedLeadCount: detachedLeads.count,
    detachedMergeLogCount: detachedMergeLogs.count,
    deletedCustomerTagCount: deletedCustomerTags.count,
    deletedFollowUpTaskCount: deletedFollowUpTasks.count,
    detachedCallRecordCount: detachedCallRecords.count,
    detachedWechatRecordCount: detachedWechatRecords.count,
    detachedCallActionEventCount: detachedCallActionEvents.count,
    detachedLiveAudienceRecordCount: detachedAudienceRecords.count,
    detachedCandidateLiveAudienceRecordCount: detachedCandidateAudienceRecords.count,
    deletedOwnershipEventCount: deletedOwnershipEvents.count,
  };
}

export async function replaceDuplicateCustomerWithNewLead(
  actor: DuplicateReplacementActor,
  input: DuplicateReplacementInput,
) {
  assertDuplicateReplacementAccess(actor);

  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("请填写作为新线索的判断说明。");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.leadImportBatch.findFirst({
      where: {
        AND: [
          { id: input.batchId },
          buildLeadImportBatchVisibilityWhere(actor),
        ],
      },
      select: {
        id: true,
        fileName: true,
        defaultLeadSource: true,
        successRows: true,
        duplicateRows: true,
      },
    });

    if (!batch) {
      throw new Error("导入批次不存在或当前账号无权访问。");
    }

    const row = await tx.leadImportRow.findFirst({
      where: {
        id: input.rowId,
        batchId: batch.id,
        status: LeadImportRowStatus.DUPLICATE,
        dedupType: LeadDedupType.EXISTING_CUSTOMER,
      },
      select: {
        id: true,
        rowNumber: true,
        normalizedPhone: true,
        phoneRaw: true,
        mappedName: true,
        mappedData: true,
      },
    });

    if (!row) {
      throw new Error("该导入行不是可替换的重复客户行，可能已经处理过。");
    }

    const customerId = getSnapshotCustomerId(row.mappedData);
    if (!customerId) {
      throw new Error("该重复行缺少命中客户快照，请重新导入后再处理。");
    }

    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: leadImportDuplicateCustomerSelect,
    });

    if (!customer) {
      throw new Error("原重复客户已不存在，不能替换为新线索。");
    }

    await assertCustomerNotInActiveRecycleBin(
      tx,
      customer.id,
      "原重复客户已在回收站中，不能在导入详情里重复剔除。",
    );
    assertCustomerVisibleToActor(actor, customer);

    const eligibility = getLeadImportDuplicateReplacementEligibility(
      customer,
    );
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason);
    }

    const mappedData = parseMappedData(row.mappedData, batch.defaultLeadSource);
    const phone = mappedData.phone || row.normalizedPhone || row.phoneRaw;
    if (!phone) {
      throw new Error("该导入行缺少手机号，不能作为新线索。");
    }

    const targetSales = await getTargetSalesTx(tx, actor, input.targetOwnerId);
    const historyVisibility = normalizeHistoryVisibility(
      input.historyVisibility,
      input.historyPolicy,
    );

    const existingLead = await tx.lead.findFirst({
      where: {
        phone,
        OR: [{ customerId: null }, { customerId: { not: customer.id } }],
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (existingLead) {
      throw new Error(
        `系统内已存在同手机号线索：${existingLead.name ?? existingLead.id}，请先处理该线索。`,
      );
    }

    const beforeCustomerSnapshot = buildLeadImportDuplicateCustomerSnapshot(customer);
    const archiveSnapshot =
      input.historyPolicy === "ARCHIVE"
        ? await buildCustomerHistoryArchiveSnapshotTx(tx, {
            batch,
            row,
            customer,
            duplicateSnapshot: beforeCustomerSnapshot,
            mappedData,
            targetSales,
            reason,
          })
        : null;
    const detachedHistory = await detachDuplicateCustomerOperationalHistoryTx(
      tx,
      customer.id,
    );

    await tx.customer.delete({
      where: {
        id: customer.id,
      },
    });

    const publicPoolTeamId = targetSales.teamId ?? actor.teamId ?? null;
    const publicPoolEnteredAt = new Date();
    const createdCustomer = await tx.customer.create({
      data: {
        name: mappedData.name ?? row.mappedName ?? phone,
        phone,
        address: mappedData.address,
        remark: mappedData.remark,
        ownershipMode: CustomerOwnershipMode.PUBLIC,
        publicPoolEnteredAt,
        publicPoolReason: PublicPoolReason.UNASSIGNED_IMPORT,
        publicPoolTeamId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    await createInitialPublicOwnershipEventTx(tx, {
      actorId: actor.id,
      actorTeamId: publicPoolTeamId,
      customerId: createdCustomer.id,
      note: `重复客户转新线索：导入批次 ${batch.fileName} 第 ${row.rowNumber} 行`,
    });

    const ownershipActor = await getCustomerOwnershipActorContextTx(tx, actor.id);
    await assignCustomerToSalesTx(tx, {
      actor: ownershipActor,
      targetSales,
      customerId: createdCustomer.id,
      reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
      note: `重复客户转新线索后重新分配：${reason}`,
      fallbackPublicPoolTeamId: publicPoolTeamId,
      operationAction: "customer.owner.assigned_from_duplicate_import_replacement",
      operationDescription: `Duplicate import replacement assigned ${createdCustomer.name} to ${targetSales.name}.`,
      operationMetadata: {
        batchId: batch.id,
        rowId: row.id,
        rowNumber: row.rowNumber,
        oldCustomerId: customer.id,
      },
    });

    const createdLead = await tx.lead.create({
      data: {
        source: getSafeLeadSource(mappedData.source),
        sourceDetail: mappedData.sourceDetail,
        campaignName: mappedData.campaignName,
        name: mappedData.name ?? row.mappedName,
        phone,
        address: mappedData.address,
        interestedProduct: mappedData.interestedProduct,
        remark: mappedData.remark,
        status: LeadStatus.ASSIGNED,
        ownerId: targetSales.id,
        customerId: createdCustomer.id,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    const leadAssignment = await tx.leadAssignment.create({
      data: {
        leadId: createdLead.id,
        toUserId: targetSales.id,
        assignedById: actor.id,
        assignmentType: AssignmentType.REASSIGN,
        note: `重复客户转新线索后重新分配：${reason}`,
      },
      select: {
        id: true,
      },
    });

    await tx.leadCustomerMergeLog.create({
      data: {
        batchId: batch.id,
        rowId: row.id,
        leadId: createdLead.id,
        leadIdSnapshot: createdLead.id,
        leadNameSnapshot: createdLead.name,
        leadPhoneSnapshot: createdLead.phone,
        customerId: createdCustomer.id,
        action: LeadCustomerMergeAction.CREATED_CUSTOMER,
        source: getSafeLeadSource(mappedData.source),
        phone,
        tagSynced: false,
        actorId: actor.id,
        note: `重复老客户 ${customer.name} 已按主管判断转为新线索并重新建客。`,
      },
    });

    const archive = archiveSnapshot
      ? await tx.customerHistoryArchive.create({
          data: {
            sourceCustomerId: customer.id,
            sourceCustomerName: customer.name,
            sourceCustomerPhone: customer.phone,
            sourceOwnerLabel: beforeCustomerSnapshot.ownerLabel,
            sourceExecutionClass: beforeCustomerSnapshot.executionClass,
            targetLeadId: createdLead.id,
            targetCustomerId: createdCustomer.id,
            sourceBatchId: batch.id,
            sourceRowId: row.id,
            visibility: historyVisibility,
            reason,
            snapshot: toJson(archiveSnapshot),
            createdById: actor.id,
          },
          select: {
            id: true,
          },
        })
      : null;

    const replacementSummary = {
      batchId: batch.id,
      rowId: row.id,
      rowNumber: row.rowNumber,
      oldCustomerId: customer.id,
      oldCustomerName: customer.name,
      oldCustomerPhone: customer.phone,
      newLeadId: createdLead.id,
      newLeadName: createdLead.name,
      newLeadPhone: createdLead.phone,
      newCustomerId: createdCustomer.id,
      newCustomerName: createdCustomer.name,
      targetOwnerId: targetSales.id,
      targetOwnerName: targetSales.name,
      targetOwnerUsername: targetSales.username,
      leadAssignmentId: leadAssignment.id,
      historyPolicy: input.historyPolicy,
      historyVisibility,
      archiveId: archive?.id ?? null,
      reason,
      ...detachedHistory,
    };

    await tx.leadImportRow.update({
      where: {
        id: row.id,
      },
      data: {
        status: LeadImportRowStatus.IMPORTED,
        importedLeadId: createdLead.id,
        errorReason: `已由主管选择作为新线索并分配给 ${getSalesLabel(targetSales)}：${reason}`,
        mappedData: toJson({
          ...mappedData,
          duplicateCustomer: {
            ...beforeCustomerSnapshot,
            replacementEligible: false,
            replacementReason:
              input.historyPolicy === "ARCHIVE"
                ? "已作为新线索重新导入，原客户跟进历史已归档。"
                : "已作为新线索重新导入，原客户历史未保留到新客户。",
          },
          replacement: {
            oldCustomerId: customer.id,
            newLeadId: createdLead.id,
            newCustomerId: createdCustomer.id,
            targetOwnerId: targetSales.id,
            targetOwnerLabel: getSalesLabel(targetSales),
            historyPolicy: input.historyPolicy,
            historyVisibility,
            archiveId: archive?.id ?? null,
            replacedAt: new Date().toISOString(),
            reason,
          },
        }),
      },
    });

    await tx.leadImportBatch.update({
      where: {
        id: batch.id,
      },
      data: {
        successRows: batch.successRows + 1,
        duplicateRows: Math.max(0, batch.duplicateRows - 1),
        createdCustomerRows: {
          increment: 1,
        },
      },
    });

    await tx.operationLog.createMany({
      data: [
        {
          actorId: actor.id,
          module: OperationModule.LEAD_IMPORT,
          action: "lead_import.duplicate_customer_replaced_as_new_lead",
          targetType: OperationTargetType.LEAD_IMPORT_ROW,
          targetId: row.id,
          description: `导入第 ${row.rowNumber} 行由重复客户改为新线索 ${createdLead.name ?? createdLead.phone}`,
          beforeData: toJson({
            duplicateCustomer: beforeCustomerSnapshot,
            row: {
              batchId: batch.id,
              rowNumber: row.rowNumber,
              phone,
            },
          }),
          afterData: toJson(replacementSummary),
        },
        {
          actorId: actor.id,
          module: OperationModule.CUSTOMER,
          action: "customer.duplicate_import_replaced",
          targetType: OperationTargetType.CUSTOMER,
          targetId: customer.id,
          description: `剔除未接通未加微重复客户 ${customer.name}，导入行转为新客户 ${createdCustomer.name}`,
          beforeData: toJson(beforeCustomerSnapshot),
          afterData: toJson(replacementSummary),
        },
        {
          actorId: actor.id,
          module: OperationModule.LEAD,
          action: "lead.created_from_duplicate_customer_replacement",
          targetType: OperationTargetType.LEAD,
          targetId: createdLead.id,
          description: `重复客户导入行已创建新线索并分配给 ${getSalesLabel(targetSales)}`,
          beforeData: toJson({
            duplicateCustomer: beforeCustomerSnapshot,
          }),
          afterData: toJson(replacementSummary),
        },
        {
          actorId: actor.id,
          module: OperationModule.CUSTOMER,
          action: "customer.created_from_duplicate_import_replacement",
          targetType: OperationTargetType.CUSTOMER,
          targetId: createdCustomer.id,
          description: `重复客户导入行已创建新客户 ${createdCustomer.name} 并分配给 ${getSalesLabel(targetSales)}`,
          beforeData: toJson({
            duplicateCustomer: beforeCustomerSnapshot,
          }),
          afterData: toJson(replacementSummary),
        },
      ],
    });

    return {
      leadId: createdLead.id,
      oldCustomerId: customer.id,
      customerId: createdCustomer.id,
      message: `已剔除原客户 ${customer.name}，第 ${row.rowNumber} 行已作为新线索分配给 ${getSalesLabel(targetSales)}。`,
    };
  }, duplicateReplacementTransactionOptions);
}
