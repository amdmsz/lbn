import {
  LeadDedupType,
  LeadImportRowStatus,
  LeadSource,
  OperationModule,
  OperationTargetType,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { canAccessLeadImportModule } from "@/lib/auth/access";
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
  return value as Prisma.InputJsonValue;
}

function getSafeLeadSource(value: LeadSource | null | undefined) {
  return value && isLeadImportSourceValue(value) ? value : DEFAULT_LEAD_IMPORT_SOURCE;
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

    const existingLead = await tx.lead.findFirst({
      where: {
        phone,
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
    const [detachedLeads, detachedMergeLogs, deletedCustomerTags, deletedFollowUpTasks] =
      await Promise.all([
        tx.lead.updateMany({
          where: { customerId: customer.id },
          data: { customerId: null },
        }),
        tx.leadCustomerMergeLog.updateMany({
          where: { customerId: customer.id },
          data: { customerId: null },
        }),
        tx.customerTag.deleteMany({
          where: { customerId: customer.id },
        }),
        tx.followUpTask.deleteMany({
          where: { customerId: customer.id },
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
        where: { customerId: customer.id },
        data: { customerId: null },
      }),
      tx.wechatRecord.updateMany({
        where: { customerId: customer.id },
        data: { customerId: null },
      }),
      tx.callActionEvent.updateMany({
        where: { customerId: customer.id },
        data: { customerId: null },
      }),
      tx.liveAudienceRecord.updateMany({
        where: { customerId: customer.id },
        data: { customerId: null },
      }),
      tx.liveAudienceRecord.updateMany({
        where: { candidateCustomerId: customer.id },
        data: { candidateCustomerId: null },
      }),
      tx.customerOwnershipEvent.deleteMany({
        where: { customerId: customer.id },
      }),
    ]);

    await tx.customer.delete({
      where: {
        id: customer.id,
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
        status: "NEW",
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

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
      reason,
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

    await tx.leadImportRow.update({
      where: {
        id: row.id,
      },
      data: {
        status: LeadImportRowStatus.IMPORTED,
        importedLeadId: createdLead.id,
        errorReason: `已由主管选择作为新线索：${reason}`,
        mappedData: toJson({
          ...mappedData,
          duplicateCustomer: {
            ...beforeCustomerSnapshot,
            replacementEligible: false,
            replacementReason: "已作为新线索重新导入，原客户已剔除。",
          },
          replacement: {
            oldCustomerId: customer.id,
            newLeadId: createdLead.id,
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
          description: `剔除未接通未加微重复客户 ${customer.name}，导入行转为新线索 ${createdLead.name ?? createdLead.phone}`,
          beforeData: toJson(beforeCustomerSnapshot),
          afterData: toJson(replacementSummary),
        },
      ],
    });

    return {
      leadId: createdLead.id,
      oldCustomerId: customer.id,
      message: `已剔除原客户 ${customer.name}，第 ${row.rowNumber} 行已作为新线索进入待分配。`,
    };
  }, duplicateReplacementTransactionOptions);
}
