import {
  LeadCustomerMergeAction,
  OperationModule,
  OperationTargetType,
  UserStatus,
  type ImportedCustomerDeletionSourceMode,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import {
  canForceDeleteImportedCustomer,
  canRequestImportedCustomerDeletion,
  canReviewImportedCustomerDeletion,
} from "@/lib/auth/access";
import { parseCustomerImportOperationLogData } from "@/lib/customers/customer-import-operation-log";
import {
  getImportedCustomerDeletionRequestStatusLabel,
  getImportedCustomerDeletionRequestStatusVariant,
  getImportedCustomerDeletionSourceModeLabel,
} from "@/lib/customers/imported-customer-deletion-metadata";
import { prisma } from "@/lib/db/prisma";
import { customerContinuationImportOperationActions } from "@/lib/lead-imports/metadata";

type DeletionActor = {
  id: string;
  name: string;
  username: string;
  role: RoleCode;
  teamId: string | null;
};

export type ImportedCustomerDeletionActor = DeletionActor;

type ReviewerSummary = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
  teamName: string | null;
};

const activeCustomerOwnershipModes = ["PRIVATE", "LOCKED"] as const;
const publicPoolCustomerDetailModes = ["PUBLIC", "LOCKED"] as const;

const importedCustomerDeletionTransactionOptions: {
  maxWait: number;
  timeout: number;
} = {
  maxWait: 10_000,
  timeout: 20_000,
};

const importedCustomerDeletionCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  ownerId: true,
  lastOwnerId: true,
  publicPoolTeamId: true,
  ownershipMode: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
    },
  },
  lastOwner: {
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
    },
  },
  publicPoolTeam: {
    select: {
      id: true,
      name: true,
      supervisorId: true,
      supervisor: {
        select: {
          id: true,
          name: true,
          username: true,
          teamId: true,
          userStatus: true,
          role: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  },
  _count: {
    select: {
      tradeOrders: true,
      salesOrders: true,
      orders: true,
      giftRecords: true,
      paymentPlans: true,
      paymentRecords: true,
      collectionTasks: true,
      shippingTasks: true,
      logisticsFollowUpTasks: true,
      codCollectionRecords: true,
    },
  },
} satisfies Prisma.CustomerSelect;

const importedCustomerDeletionRequestSummarySelect = {
  id: true,
  customerIdSnapshot: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  sourceMode: true,
  sourceBatchId: true,
  sourceBatchFileName: true,
  sourceRowNumber: true,
  status: true,
  requestReason: true,
  rejectReason: true,
  createdAt: true,
  reviewedAt: true,
  executedAt: true,
  outcomeSnapshot: true,
  reviewerId: true,
  requestedBy: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  reviewer: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  executedBy: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} satisfies Prisma.ImportedCustomerDeletionRequestSelect;

export type ImportedCustomerDeletionCustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof importedCustomerDeletionCustomerSelect;
}>;

type ImportedCustomerDeletionRequestRecord =
  Prisma.ImportedCustomerDeletionRequestGetPayload<{
    select: typeof importedCustomerDeletionRequestSummarySelect;
  }>;

type ImportedCustomerDeletionBlockerKey =
  | "TRADE_ORDER"
  | "SALES_ORDER"
  | "LEGACY_ORDER"
  | "GIFT_RECORD"
  | "PAYMENT_PLAN"
  | "PAYMENT_RECORD"
  | "COLLECTION_TASK"
  | "SHIPPING_TASK"
  | "LOGISTICS_FOLLOW_UP_TASK"
  | "COD_COLLECTION_RECORD";

const importedCustomerDeletionBlockerLabels: Record<
  ImportedCustomerDeletionBlockerKey,
  string
> = {
  TRADE_ORDER: "已存在成交主单",
  SALES_ORDER: "已存在供应商子单",
  LEGACY_ORDER: "已存在历史订单",
  GIFT_RECORD: "已存在礼品履约记录",
  PAYMENT_PLAN: "已存在收款计划",
  PAYMENT_RECORD: "已存在收款记录",
  COLLECTION_TASK: "已存在催收任务",
  SHIPPING_TASK: "已存在发货任务",
  LOGISTICS_FOLLOW_UP_TASK: "已存在物流跟进任务",
  COD_COLLECTION_RECORD: "已存在 COD 回款记录",
};

export type ImportedCustomerDeletionOrigin = {
  mode: ImportedCustomerDeletionSourceMode;
  modeLabel: string;
  batchId: string;
  batchFileName: string;
  rowNumber: number | null;
  createdAt: Date;
  leadId: string | null;
};

export type ImportedCustomerDeletionRequestSummary = {
  id: string;
  customerIdSnapshot: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  sourceMode: ImportedCustomerDeletionSourceMode;
  sourceModeLabel: string;
  sourceBatchId: string;
  sourceBatchFileName: string;
  sourceRowNumber: number | null;
  status: ImportedCustomerDeletionRequestRecord["status"];
  statusLabel: string;
  statusVariant: ReturnType<typeof getImportedCustomerDeletionRequestStatusVariant>;
  requestReason: string;
  rejectReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  executedAt: Date | null;
  requestedBy: {
    id: string;
    name: string;
    username: string;
  };
  reviewer:
    | {
        id: string;
        name: string;
        username: string;
      }
    | null;
  executedBy:
    | {
        id: string;
        name: string;
        username: string;
      }
    | null;
  outcomeSnapshot: Prisma.JsonValue | null;
};

export type ImportedCustomerDeletionGuard = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  source: ImportedCustomerDeletionOrigin | null;
  blockerKeys: ImportedCustomerDeletionBlockerKey[];
  blockerLabels: string[];
  pendingRequest: ImportedCustomerDeletionRequestSummary | null;
  latestRequest: ImportedCustomerDeletionRequestSummary | null;
  suggestedReviewer: ReviewerSummary | null;
  canDirectDelete: boolean;
  canRequestDeletion: boolean;
  canReviewPendingRequest: boolean;
  blockedReason: string | null;
  redirectAfterDelete: string;
};

export type ImportedCustomerDeletionRequestResult = {
  requestId: string;
  message: string;
  reviewer: ReviewerSummary;
};

export type ImportedCustomerDeletionReviewResult = {
  status: "rejected" | "executed";
  requestId: string;
  customerId: string;
  customerName: string;
  redirectTo: string | null;
  batchId: string;
  message: string;
};

export type ImportedCustomerDeletionDirectItemResult = {
  customerId: string;
  customerName: string;
  sourceBatchId: string | null;
  redirectTo: string | null;
  status: "deleted" | "skipped";
  message: string;
};

export type ImportedCustomerDeletionDirectResult = {
  items: ImportedCustomerDeletionDirectItemResult[];
  successCount: number;
  skippedCount: number;
  failedCount: number;
};

type ImportedCustomerDeletionExecutionContext = {
  operationContext?: Prisma.InputJsonValue | null;
};

function getCustomerVisibilityWhereInput(actor: DeletionActor): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {
      ownerId: {
        not: null,
      },
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
    };
  }

  if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      return {
        id: "__missing_team_scope__",
      };
    }

    return {
      ownerId: {
        not: null,
      },
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
      owner: {
        is: {
          teamId: actor.teamId,
        },
      },
    };
  }

  if (actor.role === "SALES") {
    return {
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
      ownerId: actor.id,
    };
  }

  return {
    id: "__forbidden_customer_scope__",
  };
}

function getCustomerPublicPoolDetailWhereInput(
  actor: DeletionActor,
): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {
      ownerId: null,
      ownershipMode: {
        in: [...publicPoolCustomerDetailModes],
      },
    };
  }

  if ((actor.role === "SUPERVISOR" || actor.role === "SALES") && actor.teamId) {
    return {
      ownerId: null,
      ownershipMode: {
        in: [...publicPoolCustomerDetailModes],
      },
      publicPoolTeamId: actor.teamId,
    };
  }

  return {
    id: "__forbidden_public_pool_customer_detail__",
  };
}

function summarizeImportedCustomerDeletionRequest(
  record: ImportedCustomerDeletionRequestRecord,
): ImportedCustomerDeletionRequestSummary {
  return {
    id: record.id,
    customerIdSnapshot: record.customerIdSnapshot,
    customerNameSnapshot: record.customerNameSnapshot,
    customerPhoneSnapshot: record.customerPhoneSnapshot,
    sourceMode: record.sourceMode,
    sourceModeLabel: getImportedCustomerDeletionSourceModeLabel(record.sourceMode),
    sourceBatchId: record.sourceBatchId,
    sourceBatchFileName: record.sourceBatchFileName,
    sourceRowNumber: record.sourceRowNumber,
    status: record.status,
    statusLabel: getImportedCustomerDeletionRequestStatusLabel(record.status),
    statusVariant: getImportedCustomerDeletionRequestStatusVariant(record.status),
    requestReason: record.requestReason,
    rejectReason: record.rejectReason,
    createdAt: record.createdAt,
    reviewedAt: record.reviewedAt,
    executedAt: record.executedAt,
    requestedBy: record.requestedBy,
    reviewer: record.reviewer,
    executedBy: record.executedBy,
    outcomeSnapshot: record.outcomeSnapshot,
  };
}

function getImportedCustomerDeletionBlockerKeys(
  customer: ImportedCustomerDeletionCustomerRecord,
): ImportedCustomerDeletionBlockerKey[] {
  const keys: ImportedCustomerDeletionBlockerKey[] = [];

  if (customer._count.tradeOrders > 0) {
    keys.push("TRADE_ORDER");
  }
  if (customer._count.salesOrders > 0) {
    keys.push("SALES_ORDER");
  }
  if (customer._count.orders > 0) {
    keys.push("LEGACY_ORDER");
  }
  if (customer._count.giftRecords > 0) {
    keys.push("GIFT_RECORD");
  }
  if (customer._count.paymentPlans > 0) {
    keys.push("PAYMENT_PLAN");
  }
  if (customer._count.paymentRecords > 0) {
    keys.push("PAYMENT_RECORD");
  }
  if (customer._count.collectionTasks > 0) {
    keys.push("COLLECTION_TASK");
  }
  if (customer._count.shippingTasks > 0) {
    keys.push("SHIPPING_TASK");
  }
  if (customer._count.logisticsFollowUpTasks > 0) {
    keys.push("LOGISTICS_FOLLOW_UP_TASK");
  }
  if (customer._count.codCollectionRecords > 0) {
    keys.push("COD_COLLECTION_RECORD");
  }

  return keys;
}

function getPostDeleteRedirect(customer: ImportedCustomerDeletionCustomerRecord) {
  return customer.ownerId ? "/customers" : "/customers/public-pool";
}

function buildGuardBlockedReason(input: {
  role: RoleCode;
  source: ImportedCustomerDeletionOrigin | null;
  blockerLabels: string[];
  ownerId: string | null;
  pendingRequest: ImportedCustomerDeletionRequestSummary | null;
}) {
  if (!input.source) {
    return "仅支持删除导入新建客户，命中已有客户的导入记录不可删除。";
  }

  if (input.pendingRequest) {
    return "当前客户已有待审批删除申请，请先处理现有申请。";
  }

  if (input.blockerLabels.length > 0) {
    return `当前客户已进入交易或履约真相链路：${input.blockerLabels.join("、")}。`;
  }

  if (input.role !== "ADMIN" && input.ownerId) {
    return "当前客户已有负责人，只有管理员可跳过负责人限制直接删除。";
  }

  if (input.role === "SALES") {
    return "当前客户满足申请范围时，可提交删除申请给团队主管审批。";
  }

  return null;
}

function buildGuard(input: {
  actor: DeletionActor;
  customer: ImportedCustomerDeletionCustomerRecord;
  source: ImportedCustomerDeletionOrigin | null;
  latestRequest: ImportedCustomerDeletionRequestSummary | null;
  pendingRequest: ImportedCustomerDeletionRequestSummary | null;
  suggestedReviewer: ReviewerSummary | null;
}): ImportedCustomerDeletionGuard {
  const blockerKeys = getImportedCustomerDeletionBlockerKeys(input.customer);
  const blockerLabels = blockerKeys.map((key) => importedCustomerDeletionBlockerLabels[key]);
  const ownerRestricted = input.actor.role !== "ADMIN" && input.customer.ownerId !== null;
  const hasPendingRequest = Boolean(input.pendingRequest);
  const canDirectDelete =
    canForceDeleteImportedCustomer(input.actor.role) &&
    Boolean(input.source) &&
    blockerKeys.length === 0 &&
    !ownerRestricted &&
    !hasPendingRequest;
  const canRequestDeletion =
    canRequestImportedCustomerDeletion(input.actor.role) &&
    Boolean(input.source) &&
    blockerKeys.length === 0 &&
    !ownerRestricted &&
    !hasPendingRequest &&
    Boolean(input.suggestedReviewer);
  const canReviewPendingRequest =
    Boolean(input.pendingRequest) &&
    canReviewImportedCustomerDeletion(input.actor.role) &&
    (input.actor.role === "ADMIN" || input.pendingRequest?.reviewer?.id === input.actor.id);

  return {
    customerId: input.customer.id,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    source: input.source,
    blockerKeys,
    blockerLabels,
    pendingRequest: input.pendingRequest,
    latestRequest: input.latestRequest,
    suggestedReviewer: input.suggestedReviewer,
    canDirectDelete,
    canRequestDeletion,
    canReviewPendingRequest,
    blockedReason: buildGuardBlockedReason({
      role: input.actor.role,
      source: input.source,
      blockerLabels,
      ownerId: input.customer.ownerId,
      pendingRequest: input.pendingRequest,
    }),
    redirectAfterDelete: getPostDeleteRedirect(input.customer),
  };
}

export async function getImportedCustomerDeletionActorTx(
  tx: Prisma.TransactionClient | typeof prisma,
  userId: string,
): Promise<DeletionActor> {
  const user = await tx.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("当前账号不存在或已失效。");
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    teamId: user.teamId,
    role: user.role.code,
  };
}

export async function findVisibleImportedCustomerForDeletionTx(
  tx: Prisma.TransactionClient | typeof prisma,
  actor: DeletionActor,
  customerId: string,
) {
  return tx.customer.findFirst({
    where: {
      AND: [
        {
          id: customerId,
        },
        {
          OR: [
            getCustomerVisibilityWhereInput(actor),
            getCustomerPublicPoolDetailWhereInput(actor),
          ],
        },
      ],
    },
    select: importedCustomerDeletionCustomerSelect,
  });
}

export async function findImportedCustomerForDeletionByIdTx(
  tx: Prisma.TransactionClient | typeof prisma,
  customerId: string,
) {
  return tx.customer.findUnique({
    where: {
      id: customerId,
    },
    select: importedCustomerDeletionCustomerSelect,
  });
}

async function findImportedCustomerDeletionRequestsTx(
  tx: Prisma.TransactionClient | typeof prisma,
  customerId: string,
) {
  const [latestRecord, pendingRecord] = await Promise.all([
    tx.importedCustomerDeletionRequest.findFirst({
      where: {
        customerIdSnapshot: customerId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: importedCustomerDeletionRequestSummarySelect,
    }),
    tx.importedCustomerDeletionRequest.findFirst({
      where: {
        customerIdSnapshot: customerId,
        status: "PENDING_SUPERVISOR",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: importedCustomerDeletionRequestSummarySelect,
    }),
  ]);

  return {
    latestRequest: latestRecord
      ? summarizeImportedCustomerDeletionRequest(latestRecord)
      : null,
    pendingRequest: pendingRecord
      ? summarizeImportedCustomerDeletionRequest(pendingRecord)
      : null,
  };
}

async function findImportedCustomerDeletionOriginTx(
  tx: Prisma.TransactionClient | typeof prisma,
  customerId: string,
): Promise<ImportedCustomerDeletionOrigin | null> {
  const [leadOrigin, continuationLogs] = await Promise.all([
    tx.leadCustomerMergeLog.findFirst({
      where: {
        customerId,
        action: LeadCustomerMergeAction.CREATED_CUSTOMER,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        createdAt: true,
        leadId: true,
        batchId: true,
        batch: {
          select: {
            fileName: true,
          },
        },
        row: {
          select: {
            rowNumber: true,
          },
        },
      },
    }),
    tx.operationLog.findMany({
      where: {
        targetType: OperationTargetType.CUSTOMER,
        targetId: customerId,
        action: {
          in: [...customerContinuationImportOperationActions],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        createdAt: true,
        afterData: true,
      },
    }),
  ]);

  const continuationOriginRecord = continuationLogs.find((record) => {
    const parsed = parseCustomerImportOperationLogData(record.afterData);
    return parsed?.action === "CREATED_CUSTOMER";
  });
  const continuationOriginData = continuationOriginRecord
    ? parseCustomerImportOperationLogData(continuationOriginRecord.afterData)
    : null;

  const leadOriginCandidate = leadOrigin
    ? {
        mode: "LEAD" as const,
        modeLabel: getImportedCustomerDeletionSourceModeLabel("LEAD"),
        batchId: leadOrigin.batchId,
        batchFileName: leadOrigin.batch.fileName,
        rowNumber: leadOrigin.row?.rowNumber ?? null,
        createdAt: leadOrigin.createdAt,
        leadId: leadOrigin.leadId,
      }
    : null;
  const continuationOriginCandidate =
    continuationOriginRecord && continuationOriginData
      ? {
          mode: "CUSTOMER_CONTINUATION" as const,
          modeLabel: getImportedCustomerDeletionSourceModeLabel(
            "CUSTOMER_CONTINUATION",
          ),
          batchId: continuationOriginData.batchId,
          batchFileName: continuationOriginData.batchFileName,
          rowNumber: continuationOriginData.rowNumber,
          createdAt: continuationOriginRecord.createdAt,
          leadId: null,
        }
      : null;

  if (!leadOriginCandidate) {
    return continuationOriginCandidate;
  }

  if (!continuationOriginCandidate) {
    return leadOriginCandidate;
  }

  return leadOriginCandidate.createdAt <= continuationOriginCandidate.createdAt
    ? leadOriginCandidate
    : continuationOriginCandidate;
}

async function resolveSupervisorReviewerTx(
  tx: Prisma.TransactionClient | typeof prisma,
  customer: ImportedCustomerDeletionCustomerRecord,
  requesterTeamId: string | null,
) {
  const orderedTeamIds = [
    customer.publicPoolTeamId,
    customer.owner?.teamId ?? null,
    customer.lastOwner?.teamId ?? null,
    requesterTeamId,
  ].filter((teamId, index, list): teamId is string => Boolean(teamId) && list.indexOf(teamId) === index);

  if (orderedTeamIds.length === 0) {
    return null;
  }

  const teams = await tx.team.findMany({
    where: {
      id: {
        in: orderedTeamIds,
      },
    },
    select: {
      id: true,
      name: true,
      supervisor: {
        select: {
          id: true,
          name: true,
          username: true,
          teamId: true,
          userStatus: true,
          role: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  });

  const teamMap = new Map(teams.map((team) => [team.id, team]));

  for (const teamId of orderedTeamIds) {
    const team = teamMap.get(teamId);

    if (!team?.supervisor) {
      continue;
    }

    if (
      team.supervisor.userStatus !== UserStatus.ACTIVE ||
      team.supervisor.role.code !== "SUPERVISOR"
    ) {
      continue;
    }

    return {
      id: team.supervisor.id,
      name: team.supervisor.name,
      username: team.supervisor.username,
      teamId: team.supervisor.teamId,
      teamName: team.name,
    } satisfies ReviewerSummary;
  }

  return null;
}

async function createImportedCustomerDeletionOperationLogTx(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    targetCustomerId: string;
    action:
      | "customer.imported_customer_delete.requested"
      | "customer.imported_customer_delete.rejected"
      | "customer.imported_customer_delete.approved"
      | "customer.imported_customer_delete.executed";
    description: string;
    beforeData?: Prisma.InputJsonValue | null;
    afterData?: Prisma.InputJsonValue | null;
  },
) {
  await tx.operationLog.create({
    data: {
      actorId: input.actorId,
      module: OperationModule.CUSTOMER,
      action: input.action,
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.targetCustomerId,
      description: input.description,
      beforeData: input.beforeData ?? undefined,
      afterData: input.afterData ?? undefined,
    },
  });
}

export async function resolveImportedCustomerDeletionGuardTx(
  tx: Prisma.TransactionClient | typeof prisma,
  actor: DeletionActor,
  customerId: string,
) {
  const customer = await findVisibleImportedCustomerForDeletionTx(tx, actor, customerId);

  if (!customer) {
    return null;
  }

  const [{ latestRequest, pendingRequest }, source, suggestedReviewer] =
    await Promise.all([
      findImportedCustomerDeletionRequestsTx(tx, customer.id),
      findImportedCustomerDeletionOriginTx(tx, customer.id),
      resolveSupervisorReviewerTx(tx, customer, actor.teamId),
    ]);

  return buildGuard({
    actor,
    customer,
    source,
    latestRequest,
    pendingRequest,
    suggestedReviewer,
  });
}

export async function executeImportedCustomerDeletionTx(
  tx: Prisma.TransactionClient,
  input: {
    actor: DeletionActor;
    customer: ImportedCustomerDeletionCustomerRecord;
    guard: ImportedCustomerDeletionGuard;
    request:
      | {
          id: string;
          reason: string;
        }
      | null;
    reason: string;
  } & ImportedCustomerDeletionExecutionContext,
) {
  const detachedLeads = await tx.lead.updateMany({
    where: {
      customerId: input.customer.id,
    },
    data: {
      customerId: null,
    },
  });
  const detachedMergeLogs = await tx.leadCustomerMergeLog.updateMany({
    where: {
      customerId: input.customer.id,
    },
    data: {
      customerId: null,
    },
  });
  const deletedCustomerTags = await tx.customerTag.deleteMany({
    where: {
      customerId: input.customer.id,
    },
  });
  const deletedFollowUpTasks = await tx.followUpTask.deleteMany({
    where: {
      customerId: input.customer.id,
    },
  });
  const deletedCallRecords = await tx.callRecord.deleteMany({
    where: {
      customerId: input.customer.id,
    },
  });
  const deletedWechatRecords = await tx.wechatRecord.deleteMany({
    where: {
      customerId: input.customer.id,
    },
  });
  const deletedLiveInvitations = await tx.liveInvitation.deleteMany({
    where: {
      customerId: input.customer.id,
    },
  });
  const deletedOwnershipEvents = await tx.customerOwnershipEvent.deleteMany({
    where: {
      customerId: input.customer.id,
    },
  });

  await tx.customer.delete({
    where: {
      id: input.customer.id,
    },
  });

  const outcomeSnapshot = {
    sourceMode: input.guard.source?.mode ?? null,
    sourceBatchId: input.guard.source?.batchId ?? null,
    sourceBatchFileName: input.guard.source?.batchFileName ?? null,
    sourceRowNumber: input.guard.source?.rowNumber ?? null,
    redirectTo: input.guard.redirectAfterDelete,
    deletionReason: input.reason,
    detachedLeadCount: detachedLeads.count,
    detachedMergeLogCount: detachedMergeLogs.count,
    deletedCustomerTagCount: deletedCustomerTags.count,
    deletedFollowUpTaskCount: deletedFollowUpTasks.count,
    deletedCallRecordCount: deletedCallRecords.count,
    deletedWechatRecordCount: deletedWechatRecords.count,
    deletedLiveInvitationCount: deletedLiveInvitations.count,
    deletedOwnershipEventCount: deletedOwnershipEvents.count,
    operationContext: input.operationContext ?? null,
  } satisfies Prisma.InputJsonValue;

  if (input.request) {
    await tx.importedCustomerDeletionRequest.update({
      where: {
        id: input.request.id,
      },
      data: {
        status: "EXECUTED",
        reviewerId: input.actor.id,
        reviewedAt: new Date(),
        executedById: input.actor.id,
        executedAt: new Date(),
        outcomeSnapshot,
      },
    });

    await createImportedCustomerDeletionOperationLogTx(tx, {
      actorId: input.actor.id,
      targetCustomerId: input.customer.id,
      action: "customer.imported_customer_delete.approved",
      description: `审批通过导入客户删除申请：${input.customer.name}`,
      afterData: {
        requestId: input.request.id,
        requestReason: input.request.reason,
        operationContext: input.operationContext ?? null,
      },
    });
  }

  await createImportedCustomerDeletionOperationLogTx(tx, {
    actorId: input.actor.id,
    targetCustomerId: input.customer.id,
    action: "customer.imported_customer_delete.executed",
    description: `执行导入客户删除：${input.customer.name}`,
    beforeData: {
      ownerId: input.customer.ownerId,
      ownerName: input.customer.owner?.name ?? null,
      publicPoolTeamId: input.customer.publicPoolTeamId,
    },
    afterData: {
      outcomeSnapshot,
      requestId: input.request?.id ?? null,
      operationContext: input.operationContext ?? null,
    },
  });

  return {
    sourceBatchId: input.guard.source?.batchId ?? null,
    redirectTo: input.guard.redirectAfterDelete,
    outcomeSnapshot,
  };
}

export async function resolveImportedCustomerDeletionGuard(
  viewer: {
    id: string;
    role: RoleCode;
  },
  customerId: string,
) {
  const actor = await getImportedCustomerDeletionActorTx(prisma, viewer.id);

  if (actor.role !== viewer.role) {
    throw new Error("当前账号角色已更新，请刷新后重试。");
  }

  return resolveImportedCustomerDeletionGuardTx(prisma, actor, customerId);
}

export async function requestImportedCustomerDeletion(
  viewer: {
    id: string;
    role: RoleCode;
  },
  input: {
    customerId: string;
    reason: string;
  },
): Promise<ImportedCustomerDeletionRequestResult> {
  const actor = await getImportedCustomerDeletionActorTx(prisma, viewer.id);

  if (actor.role !== viewer.role) {
    throw new Error("当前账号角色已更新，请刷新后重试。");
  }

  if (!canRequestImportedCustomerDeletion(actor.role)) {
    throw new Error("当前角色不能发起导入客户删除申请。");
  }

  return prisma.$transaction(
    async (tx) => {
      const customer = await findVisibleImportedCustomerForDeletionTx(
        tx,
        actor,
        input.customerId,
      );

      if (!customer) {
        throw new Error("当前客户不存在、已删除，或不在你的可见范围内。");
      }

      const [{ latestRequest, pendingRequest }, source] = await Promise.all([
        findImportedCustomerDeletionRequestsTx(tx, customer.id),
        findImportedCustomerDeletionOriginTx(tx, customer.id),
      ]);
      const reviewer = await resolveSupervisorReviewerTx(tx, customer, actor.teamId);
      const guard = buildGuard({
        actor,
        customer,
        source,
        latestRequest,
        pendingRequest,
        suggestedReviewer: reviewer,
      });

      if (!guard.canRequestDeletion) {
        throw new Error(
          guard.blockedReason ??
            "当前客户不满足导入删除申请条件，请确认是否仍为导入新建、公海客户且没有交易数据。",
        );
      }

      if (!reviewer) {
        throw new Error("找不到可审批的团队主管，请先配置团队主管或由管理员处理。");
      }

      const request = await tx.importedCustomerDeletionRequest.create({
        data: {
          customerIdSnapshot: customer.id,
          customerNameSnapshot: customer.name,
          customerPhoneSnapshot: customer.phone,
          sourceMode: guard.source!.mode,
          sourceBatchId: guard.source!.batchId,
          sourceBatchFileName: guard.source!.batchFileName,
          sourceRowNumber: guard.source!.rowNumber,
          requestReason: input.reason,
          reviewerId: reviewer.id,
          requestedById: actor.id,
        },
        select: {
          id: true,
        },
      });

      await createImportedCustomerDeletionOperationLogTx(tx, {
        actorId: actor.id,
        targetCustomerId: customer.id,
        action: "customer.imported_customer_delete.requested",
        description: `提交导入客户删除申请：${customer.name}`,
        afterData: {
          requestId: request.id,
          reviewerId: reviewer.id,
          reviewerName: reviewer.name,
          requestReason: input.reason,
          sourceMode: guard.source?.mode ?? null,
          sourceBatchId: guard.source?.batchId ?? null,
          sourceRowNumber: guard.source?.rowNumber ?? null,
        },
      });

      return {
        requestId: request.id,
        reviewer,
        message: `已提交删除申请，等待 ${reviewer.name} 审批。`,
      };
    },
    importedCustomerDeletionTransactionOptions,
  );
}

export async function reviewImportedCustomerDeletion(
  viewer: {
    id: string;
    role: RoleCode;
  },
  input: {
    requestId: string;
    decision: "approve" | "reject";
    reason?: string;
  },
): Promise<ImportedCustomerDeletionReviewResult> {
  const actor = await getImportedCustomerDeletionActorTx(prisma, viewer.id);

  if (actor.role !== viewer.role) {
    throw new Error("当前账号角色已更新，请刷新后重试。");
  }

  if (!canReviewImportedCustomerDeletion(actor.role)) {
    throw new Error("当前角色不能审批导入客户删除申请。");
  }

  return prisma.$transaction(
    async (tx) => {
      const request = await tx.importedCustomerDeletionRequest.findUnique({
        where: {
          id: input.requestId,
        },
        select: importedCustomerDeletionRequestSummarySelect,
      });

      if (!request) {
        throw new Error("删除申请不存在或已失效。");
      }

      const requestSummary = summarizeImportedCustomerDeletionRequest(request);

      if (requestSummary.status !== "PENDING_SUPERVISOR") {
        throw new Error("该删除申请已处理，请刷新后查看最新状态。");
      }

      if (actor.role !== "ADMIN" && requestSummary.reviewer?.id !== actor.id) {
        throw new Error("当前申请不在你的审批范围内。");
      }

      if (input.decision === "reject") {
        const rejectReason = input.reason?.trim();

        if (!rejectReason) {
          throw new Error("请填写驳回原因。");
        }

        await tx.importedCustomerDeletionRequest.update({
          where: {
            id: requestSummary.id,
          },
          data: {
            status: "REJECTED",
            reviewerId: actor.id,
            reviewedAt: new Date(),
            rejectReason,
          },
        });

        await createImportedCustomerDeletionOperationLogTx(tx, {
          actorId: actor.id,
          targetCustomerId: requestSummary.customerIdSnapshot,
          action: "customer.imported_customer_delete.rejected",
          description: `驳回导入客户删除申请：${requestSummary.customerNameSnapshot}`,
          afterData: {
            requestId: requestSummary.id,
            rejectReason,
          },
        });

        return {
          status: "rejected",
          requestId: requestSummary.id,
          customerId: requestSummary.customerIdSnapshot,
          customerName: requestSummary.customerNameSnapshot,
          redirectTo: null,
          batchId: requestSummary.sourceBatchId,
          message: `已驳回 ${requestSummary.customerNameSnapshot} 的删除申请。`,
        };
      }

      const customer = await findVisibleImportedCustomerForDeletionTx(
        tx,
        actor,
        requestSummary.customerIdSnapshot,
      );

      if (!customer) {
        const existingCustomer = await findImportedCustomerForDeletionByIdTx(
          tx,
          requestSummary.customerIdSnapshot,
        );

        if (existingCustomer) {
          throw new Error(
            "当前客户仍存在，但你已不在可审批范围内，请联系管理员或在对应团队下处理。",
          );
        }

        await tx.importedCustomerDeletionRequest.update({
          where: {
            id: requestSummary.id,
          },
          data: {
            status: "EXECUTED",
            reviewerId: actor.id,
            reviewedAt: new Date(),
            executedById: actor.id,
            executedAt: new Date(),
            outcomeSnapshot: {
              deletedElsewhere: true,
            },
          },
        });

        await createImportedCustomerDeletionOperationLogTx(tx, {
          actorId: actor.id,
          targetCustomerId: requestSummary.customerIdSnapshot,
          action: "customer.imported_customer_delete.approved",
          description: `审批通过导入客户删除申请：${requestSummary.customerNameSnapshot}`,
          afterData: {
            requestId: requestSummary.id,
            deletedElsewhere: true,
          },
        });

        await createImportedCustomerDeletionOperationLogTx(tx, {
          actorId: actor.id,
          targetCustomerId: requestSummary.customerIdSnapshot,
          action: "customer.imported_customer_delete.executed",
          description: `执行导入客户删除收口：${requestSummary.customerNameSnapshot}`,
          afterData: {
            requestId: requestSummary.id,
            deletedElsewhere: true,
          },
        });

        return {
          status: "executed",
          requestId: requestSummary.id,
          customerId: requestSummary.customerIdSnapshot,
          customerName: requestSummary.customerNameSnapshot,
          redirectTo: null,
          batchId: requestSummary.sourceBatchId,
          message: `${requestSummary.customerNameSnapshot} 已不存在，申请已按已删除收口。`,
        };
      }

      const [{ latestRequest, pendingRequest }, source, suggestedReviewer] =
        await Promise.all([
          findImportedCustomerDeletionRequestsTx(tx, customer.id),
          findImportedCustomerDeletionOriginTx(tx, customer.id),
          resolveSupervisorReviewerTx(tx, customer, actor.teamId),
        ]);
      const guard = buildGuard({
        actor,
        customer,
        source,
        latestRequest,
        pendingRequest,
        suggestedReviewer,
      });

      if (!guard.canReviewPendingRequest) {
        throw new Error(
          guard.blockedReason ??
            "当前客户已不满足删除条件，请确认负责人、公海状态和交易阻断数据。",
        );
      }

      const execution = await executeImportedCustomerDeletionTx(tx, {
        actor,
        customer,
        guard,
        request: {
          id: requestSummary.id,
          reason: requestSummary.requestReason,
        },
        reason: requestSummary.requestReason,
      });

      return {
        status: "executed",
        requestId: requestSummary.id,
        customerId: requestSummary.customerIdSnapshot,
        customerName: requestSummary.customerNameSnapshot,
        redirectTo: execution.redirectTo,
        batchId: requestSummary.sourceBatchId,
        message: `已审批并删除 ${requestSummary.customerNameSnapshot}。`,
      };
    },
    importedCustomerDeletionTransactionOptions,
  );
}

export async function deleteImportedCustomersDirect(
  viewer: {
    id: string;
    role: RoleCode;
  },
  input: {
    customerIds: string[];
    reason: string;
  },
): Promise<ImportedCustomerDeletionDirectResult> {
  const actor = await getImportedCustomerDeletionActorTx(prisma, viewer.id);

  if (actor.role !== viewer.role) {
    throw new Error("当前账号角色已更新，请刷新后重试。");
  }

  if (!canForceDeleteImportedCustomer(actor.role)) {
    throw new Error("当前角色不能直接删除导入客户。");
  }

  const uniqueCustomerIds = [...new Set(input.customerIds)];
  const items: ImportedCustomerDeletionDirectItemResult[] = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const customerId of uniqueCustomerIds) {
    try {
      const item = await prisma.$transaction(
        async (tx) => {
          const customer = await findVisibleImportedCustomerForDeletionTx(
            tx,
            actor,
            customerId,
          );

          if (!customer) {
            return {
              customerId,
              customerName: customerId,
              sourceBatchId: null,
              redirectTo: null,
              status: "skipped" as const,
              message: "客户不存在、已删除，或不在当前可管理范围内。",
            };
          }

          const [{ latestRequest, pendingRequest }, source, suggestedReviewer] =
            await Promise.all([
              findImportedCustomerDeletionRequestsTx(tx, customer.id),
              findImportedCustomerDeletionOriginTx(tx, customer.id),
              resolveSupervisorReviewerTx(tx, customer, actor.teamId),
            ]);
          const guard = buildGuard({
            actor,
            customer,
            source,
            latestRequest,
            pendingRequest,
            suggestedReviewer,
          });

          if (!guard.canDirectDelete) {
            return {
              customerId: customer.id,
              customerName: customer.name,
              sourceBatchId: guard.source?.batchId ?? null,
              redirectTo: null,
              status: "skipped" as const,
              message:
                guard.blockedReason ??
                "当前客户不满足直接删除条件，请检查负责人、公海状态或交易阻断数据。",
            };
          }

          const execution = await executeImportedCustomerDeletionTx(tx, {
            actor,
            customer,
            guard,
            request: null,
            reason: input.reason,
          });

          return {
            customerId: customer.id,
            customerName: customer.name,
            sourceBatchId: execution.sourceBatchId,
            redirectTo: execution.redirectTo,
            status: "deleted" as const,
            message: `已删除 ${customer.name}。`,
          };
        },
        importedCustomerDeletionTransactionOptions,
      );

      items.push(item);

      if (item.status === "deleted") {
        successCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      items.push({
        customerId,
        customerName: customerId,
        sourceBatchId: null,
        redirectTo: null,
        status: "skipped",
        message: error instanceof Error ? error.message : "删除失败，请稍后重试。",
      });
    }
  }

  return {
    items,
    successCount,
    skippedCount,
    failedCount,
  };
}