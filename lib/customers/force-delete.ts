import {
  OperationModule,
  OperationTargetType,
  RecycleEntryStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { canPermanentlyDeleteCustomers } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";

type ForceDeleteActor = {
  id: string;
  name: string;
  username: string;
  role: RoleCode;
  teamId: string | null;
};

type ForceDeleteCustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof forceDeleteCustomerSelect;
}>;

type ForceDeleteDependencySnapshot = Awaited<
  ReturnType<typeof collectForceDeleteDependenciesTx>
>;

type DeleteCountMap = Record<string, number>;

const forceDeleteTransactionOptions = {
  maxWait: 10_000,
  timeout: 60_000,
};

const forceDeleteCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  wechatId: true,
  province: true,
  city: true,
  district: true,
  address: true,
  status: true,
  level: true,
  ownershipMode: true,
  ownerId: true,
  lastOwnerId: true,
  publicPoolTeamId: true,
  publicPoolEnteredAt: true,
  publicPoolReason: true,
  claimLockedUntil: true,
  lastEffectiveFollowUpAt: true,
  remark: true,
  createdAt: true,
  updatedAt: true,
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
      code: true,
    },
  },
} satisfies Prisma.CustomerSelect;

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildScopedCustomerWhere(
  actor: ForceDeleteActor,
  customerId: string,
): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {
      id: customerId,
    };
  }

  if (actor.role === "SUPERVISOR" && actor.teamId) {
    return {
      id: customerId,
      OR: [
        {
          owner: {
            is: {
              teamId: actor.teamId,
            },
          },
        },
        {
          ownerId: null,
          publicPoolTeamId: actor.teamId,
        },
      ],
    };
  }

  return {
    id: "__force_delete_forbidden_customer__",
  };
}

function getPostDeleteRedirect(customer: ForceDeleteCustomerRecord) {
  return customer.ownerId ? "/customers" : "/customers/public-pool";
}

async function getForceDeleteActorTx(
  tx: Prisma.TransactionClient | typeof prisma,
  userId: string,
): Promise<ForceDeleteActor> {
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

async function findScopedCustomerForForceDeleteTx(
  tx: Prisma.TransactionClient,
  actor: ForceDeleteActor,
  customerId: string,
) {
  return tx.customer.findFirst({
    where: buildScopedCustomerWhere(actor, customerId),
    select: forceDeleteCustomerSelect,
  });
}

async function collectForceDeleteDependenciesTx(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const [
    tradeOrders,
    directSalesOrders,
    legacyOrders,
    giftRecords,
    directShippingTasks,
    directPaymentPlans,
    directPaymentRecords,
    directCollectionTasks,
    directLogisticsTasks,
    directCodRecords,
    directCallRecords,
    directLiveInvitations,
  ] = await Promise.all([
    tx.tradeOrder.findMany({
      where: { customerId },
      select: { id: true, tradeNo: true },
    }),
    tx.salesOrder.findMany({
      where: { customerId },
      select: { id: true, orderNo: true, tradeOrderId: true },
    }),
    tx.order.findMany({
      where: { customerId },
      select: { id: true },
    }),
    tx.giftRecord.findMany({
      where: { customerId },
      select: { id: true },
    }),
    tx.shippingTask.findMany({
      where: { customerId },
      select: {
        id: true,
        tradeOrderId: true,
        salesOrderId: true,
        orderId: true,
        giftRecordId: true,
      },
    }),
    tx.paymentPlan.findMany({
      where: { customerId },
      select: {
        id: true,
        tradeOrderId: true,
        salesOrderId: true,
        shippingTaskId: true,
        giftRecordId: true,
      },
    }),
    tx.paymentRecord.findMany({
      where: { customerId },
      select: {
        id: true,
        paymentPlanId: true,
        tradeOrderId: true,
        salesOrderId: true,
        shippingTaskId: true,
        giftRecordId: true,
      },
    }),
    tx.collectionTask.findMany({
      where: { customerId },
      select: {
        id: true,
        paymentPlanId: true,
        tradeOrderId: true,
        salesOrderId: true,
        shippingTaskId: true,
        giftRecordId: true,
      },
    }),
    tx.logisticsFollowUpTask.findMany({
      where: { customerId },
      select: {
        id: true,
        tradeOrderId: true,
        salesOrderId: true,
        shippingTaskId: true,
      },
    }),
    tx.codCollectionRecord.findMany({
      where: { customerId },
      select: {
        id: true,
        paymentPlanId: true,
        paymentRecordId: true,
        tradeOrderId: true,
        salesOrderId: true,
        shippingTaskId: true,
      },
    }),
    tx.callRecord.findMany({
      where: { customerId },
      select: { id: true },
    }),
    tx.liveInvitation.findMany({
      where: { customerId },
      select: { id: true },
    }),
  ]);

  // Keep parent/root id sets customer-owned. Child rows can be deleted when they
  // point at these roots, but child foreign keys must not promote another
  // customer's parent record into the hard-delete scope.
  const tradeOrderIds = uniqueStrings(tradeOrders.map((record) => record.id));
  const salesOrderIds = uniqueStrings(directSalesOrders.map((record) => record.id));
  const legacyOrderIds = uniqueStrings(legacyOrders.map((record) => record.id));
  const giftRecordIds = uniqueStrings(giftRecords.map((record) => record.id));

  const expandedShippingTasks = await tx.shippingTask.findMany({
    where: {
      OR: [
        { id: { in: directShippingTasks.map((record) => record.id) } },
        { tradeOrderId: { in: tradeOrderIds } },
        { salesOrderId: { in: salesOrderIds } },
        { orderId: { in: legacyOrderIds } },
        { giftRecordId: { in: giftRecordIds } },
      ],
    },
    select: {
      id: true,
      tradeOrderId: true,
      salesOrderId: true,
      orderId: true,
      giftRecordId: true,
    },
  });
  const shippingTaskIds = uniqueStrings(expandedShippingTasks.map((record) => record.id));

  const tradeOrderItems = await tx.tradeOrderItem.findMany({
    where: {
      tradeOrderId: {
        in: tradeOrderIds,
      },
    },
    select: { id: true },
  });
  const tradeOrderItemIds = uniqueStrings(tradeOrderItems.map((record) => record.id));

  const tradeOrderComponents = await tx.tradeOrderItemComponent.findMany({
    where: {
      OR: [
        { tradeOrderId: { in: tradeOrderIds } },
        { tradeOrderItemId: { in: tradeOrderItemIds } },
      ],
    },
    select: { id: true },
  });
  const tradeOrderComponentIds = uniqueStrings(
    tradeOrderComponents.map((record) => record.id),
  );

  const paymentPlans = await tx.paymentPlan.findMany({
    where: {
      OR: [
        { id: { in: directPaymentPlans.map((record) => record.id) } },
        { customerId },
        { tradeOrderId: { in: tradeOrderIds } },
        { salesOrderId: { in: salesOrderIds } },
        { shippingTaskId: { in: shippingTaskIds } },
        { giftRecordId: { in: giftRecordIds } },
      ],
    },
    select: {
      id: true,
      tradeOrderId: true,
      salesOrderId: true,
      shippingTaskId: true,
      giftRecordId: true,
    },
  });
  const paymentPlanIds = uniqueStrings(paymentPlans.map((record) => record.id));

  const paymentRecords = await tx.paymentRecord.findMany({
    where: {
      OR: [
        { id: { in: directPaymentRecords.map((record) => record.id) } },
        { customerId },
        { paymentPlanId: { in: paymentPlanIds } },
        { tradeOrderId: { in: tradeOrderIds } },
        { salesOrderId: { in: salesOrderIds } },
        { shippingTaskId: { in: shippingTaskIds } },
        { giftRecordId: { in: giftRecordIds } },
      ],
    },
    select: { id: true, paymentPlanId: true },
  });
  const paymentRecordIds = uniqueStrings(paymentRecords.map((record) => record.id));

  const collectionTasks = await tx.collectionTask.findMany({
    where: {
      OR: [
        { id: { in: directCollectionTasks.map((record) => record.id) } },
        { customerId },
        { paymentPlanId: { in: paymentPlanIds } },
        { tradeOrderId: { in: tradeOrderIds } },
        { salesOrderId: { in: salesOrderIds } },
        { shippingTaskId: { in: shippingTaskIds } },
        { giftRecordId: { in: giftRecordIds } },
      ],
    },
    select: { id: true },
  });
  const collectionTaskIds = uniqueStrings(collectionTasks.map((record) => record.id));

  const logisticsTasks = await tx.logisticsFollowUpTask.findMany({
    where: {
      OR: [
        { id: { in: directLogisticsTasks.map((record) => record.id) } },
        { customerId },
        { tradeOrderId: { in: tradeOrderIds } },
        { salesOrderId: { in: salesOrderIds } },
        { shippingTaskId: { in: shippingTaskIds } },
      ],
    },
    select: { id: true },
  });
  const logisticsTaskIds = uniqueStrings(logisticsTasks.map((record) => record.id));

  const codRecords = await tx.codCollectionRecord.findMany({
    where: {
      OR: [
        { id: { in: directCodRecords.map((record) => record.id) } },
        { customerId },
        { paymentPlanId: { in: paymentPlanIds } },
        { paymentRecordId: { in: paymentRecordIds } },
        { tradeOrderId: { in: tradeOrderIds } },
        { salesOrderId: { in: salesOrderIds } },
        { shippingTaskId: { in: shippingTaskIds } },
      ],
    },
    select: { id: true },
  });
  const codRecordIds = uniqueStrings(codRecords.map((record) => record.id));

  const callRecordIds = uniqueStrings(directCallRecords.map((record) => record.id));
  const callRecordings = await tx.callRecording.findMany({
    where: {
      OR: [{ customerId }, { callRecordId: { in: callRecordIds } }],
    },
    select: { id: true, callRecordId: true },
  });
  const callRecordingIds = uniqueStrings(callRecordings.map((record) => record.id));
  const outboundSessions = await tx.outboundCallSession.findMany({
    where: {
      OR: [{ customerId }, { callRecordId: { in: callRecordIds } }],
    },
    select: { id: true, callRecordId: true },
  });
  const outboundSessionIds = uniqueStrings(outboundSessions.map((record) => record.id));

  const liveInvitationIds = uniqueStrings(
    directLiveInvitations.map((record) => record.id),
  );
  const liveAudienceRecords = await tx.liveAudienceRecord.findMany({
    where: {
      OR: [
        { customerId },
        { candidateCustomerId: customerId },
        { liveInvitationId: { in: liveInvitationIds } },
      ],
    },
    select: { id: true },
  });
  const liveAudienceRecordIds = uniqueStrings(
    liveAudienceRecords.map((record) => record.id),
  );

  const shippingExportLines = await tx.shippingExportLine.findMany({
    where: {
      OR: [
        { tradeOrderId: { in: tradeOrderIds } },
        { salesOrderId: { in: salesOrderIds } },
        { shippingTaskId: { in: shippingTaskIds } },
      ],
    },
    select: { id: true },
  });

  return {
    tradeOrderIds,
    tradeOrderItemIds,
    tradeOrderComponentIds,
    salesOrderIds,
    legacyOrderIds,
    giftRecordIds,
    shippingTaskIds,
    paymentPlanIds,
    paymentRecordIds,
    collectionTaskIds,
    logisticsTaskIds,
    codRecordIds,
    callRecordIds,
    callRecordingIds,
    outboundSessionIds,
    liveInvitationIds,
    liveAudienceRecordIds,
    shippingExportLineIds: uniqueStrings(shippingExportLines.map((record) => record.id)),
    tradeOrders: tradeOrders.map((record) => ({
      id: record.id,
      tradeNo: record.tradeNo,
    })),
    salesOrders: directSalesOrders.map((record) => ({
      id: record.id,
      orderNo: record.orderNo,
    })),
  };
}

function buildDependencyCounts(dependencies: ForceDeleteDependencySnapshot) {
  return {
    tradeOrders: dependencies.tradeOrderIds.length,
    salesOrders: dependencies.salesOrderIds.length,
    legacyOrders: dependencies.legacyOrderIds.length,
    giftRecords: dependencies.giftRecordIds.length,
    shippingTasks: dependencies.shippingTaskIds.length,
    shippingExportLines: dependencies.shippingExportLineIds.length,
    paymentPlans: dependencies.paymentPlanIds.length,
    paymentRecords: dependencies.paymentRecordIds.length,
    collectionTasks: dependencies.collectionTaskIds.length,
    logisticsFollowUpTasks: dependencies.logisticsTaskIds.length,
    codCollectionRecords: dependencies.codRecordIds.length,
    callRecords: dependencies.callRecordIds.length,
    callRecordings: dependencies.callRecordingIds.length,
    outboundCallSessions: dependencies.outboundSessionIds.length,
    liveInvitations: dependencies.liveInvitationIds.length,
    liveAudienceRecords: dependencies.liveAudienceRecordIds.length,
  };
}

async function createForceDeleteAuditLogTx(
  tx: Prisma.TransactionClient,
  input: {
    actor: ForceDeleteActor;
    customer: ForceDeleteCustomerRecord;
    dependencies: ForceDeleteDependencySnapshot;
    reason: string;
  },
) {
  await tx.operationLog.create({
    data: {
      actorId: input.actor.id,
      module: OperationModule.CUSTOMER,
      action: "customer.force_hard_deleted",
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.customer.id,
      description: `强制硬删除客户：${input.customer.name}`,
      beforeData: toInputJson({
        customer: {
          id: input.customer.id,
          name: input.customer.name,
          phone: input.customer.phone,
          status: input.customer.status,
          level: input.customer.level,
          ownershipMode: input.customer.ownershipMode,
          ownerId: input.customer.ownerId,
          ownerName: input.customer.owner?.name ?? null,
          ownerUsername: input.customer.owner?.username ?? null,
          ownerTeamId: input.customer.owner?.teamId ?? null,
          lastOwnerId: input.customer.lastOwnerId,
          publicPoolTeamId: input.customer.publicPoolTeamId,
          publicPoolTeamName: input.customer.publicPoolTeam?.name ?? null,
          createdAt: input.customer.createdAt,
          updatedAt: input.customer.updatedAt,
        },
        dependencies: buildDependencyCounts(input.dependencies),
        tradeOrders: input.dependencies.tradeOrders,
        salesOrders: input.dependencies.salesOrders,
      }),
      afterData: toInputJson({
        reason: input.reason,
        actor: {
          id: input.actor.id,
          name: input.actor.name,
          username: input.actor.username,
          role: input.actor.role,
          teamId: input.actor.teamId,
        },
        finalAction: "FORCE_HARD_DELETE",
      }),
    },
  });
}

async function executeForceDeleteCleanupTx(
  tx: Prisma.TransactionClient,
  input: {
    actor: ForceDeleteActor;
    customerId: string;
    dependencies: ForceDeleteDependencySnapshot;
    reason: string;
  },
) {
  const { dependencies } = input;
  const deleted: DeleteCountMap = {};

  const detachedLeads = await tx.lead.updateMany({
    where: { customerId: input.customerId },
    data: { customerId: null },
  });
  deleted.detachedLeads = detachedLeads.count;

  const detachedMergeLogs = await tx.leadCustomerMergeLog.updateMany({
    where: { customerId: input.customerId },
    data: { customerId: null },
  });
  deleted.detachedLeadCustomerMergeLogs = detachedMergeLogs.count;

  const detachedHistoryArchives = await tx.customerHistoryArchive.updateMany({
    where: { targetCustomerId: input.customerId },
    data: { targetCustomerId: null },
  });
  deleted.detachedCustomerHistoryArchives = detachedHistoryArchives.count;

  const resolvedRecycleEntries = await tx.recycleBinEntry.updateMany({
    where: {
      targetType: {
        in: ["CUSTOMER", "TRADE_ORDER"],
      },
      targetId: {
        in: [input.customerId, ...dependencies.tradeOrderIds],
      },
      status: {
        in: [RecycleEntryStatus.ACTIVE, RecycleEntryStatus.ARCHIVED],
      },
    },
    data: {
      status: RecycleEntryStatus.PURGED,
      activeEntryKey: null,
      resolvedAt: new Date(),
      resolvedById: input.actor.id,
      archivePayloadJson: toInputJson({
        finalAction: "FORCE_HARD_DELETE",
        reason: input.reason,
      }),
    },
  });
  deleted.resolvedRecycleEntries = resolvedRecycleEntries.count;

  const closedImportedDeletionRequests = await tx.importedCustomerDeletionRequest.updateMany({
    where: {
      customerIdSnapshot: input.customerId,
      status: "PENDING_SUPERVISOR",
    },
    data: {
      status: "EXECUTED",
      reviewerId: input.actor.id,
      reviewedAt: new Date(),
      executedById: input.actor.id,
      executedAt: new Date(),
      outcomeSnapshot: toInputJson({
        finalAction: "FORCE_HARD_DELETE",
        reason: input.reason,
      }),
    },
  });
  deleted.closedImportedCustomerDeletionRequests =
    closedImportedDeletionRequests.count;

  deleted.callActionEvents = (
    await tx.callActionEvent.deleteMany({
      where: {
        OR: [
          { customerId: input.customerId },
          { callRecordId: { in: dependencies.callRecordIds } },
          { outboundSessionId: { in: dependencies.outboundSessionIds } },
        ],
      },
    })
  ).count;
  deleted.callAiAnalyses = (
    await tx.callAiAnalysis.deleteMany({
      where: {
        OR: [
          { callRecordId: { in: dependencies.callRecordIds } },
          { recordingId: { in: dependencies.callRecordingIds } },
        ],
      },
    })
  ).count;
  deleted.callQualityReviews = (
    await tx.callQualityReview.deleteMany({
      where: {
        OR: [
          { callRecordId: { in: dependencies.callRecordIds } },
          { recordingId: { in: dependencies.callRecordingIds } },
        ],
      },
    })
  ).count;
  deleted.callRecordingUploads = (
    await tx.callRecordingUpload.deleteMany({
      where: { recordingId: { in: dependencies.callRecordingIds } },
    })
  ).count;
  deleted.outboundCallSessions = (
    await tx.outboundCallSession.deleteMany({
      where: { id: { in: dependencies.outboundSessionIds } },
    })
  ).count;
  deleted.callRecordings = (
    await tx.callRecording.deleteMany({
      where: { id: { in: dependencies.callRecordingIds } },
    })
  ).count;
  deleted.callRecords = (
    await tx.callRecord.deleteMany({
      where: { id: { in: dependencies.callRecordIds } },
    })
  ).count;

  deleted.liveAudienceRecords = (
    await tx.liveAudienceRecord.deleteMany({
      where: { id: { in: dependencies.liveAudienceRecordIds } },
    })
  ).count;
  deleted.liveInvitations = (
    await tx.liveInvitation.deleteMany({
      where: { id: { in: dependencies.liveInvitationIds } },
    })
  ).count;

  deleted.codCollectionRecords = (
    await tx.codCollectionRecord.deleteMany({
      where: { id: { in: dependencies.codRecordIds } },
    })
  ).count;
  deleted.collectionTasks = (
    await tx.collectionTask.deleteMany({
      where: { id: { in: dependencies.collectionTaskIds } },
    })
  ).count;
  deleted.paymentRecords = (
    await tx.paymentRecord.deleteMany({
      where: { id: { in: dependencies.paymentRecordIds } },
    })
  ).count;
  deleted.paymentPlans = (
    await tx.paymentPlan.deleteMany({
      where: { id: { in: dependencies.paymentPlanIds } },
    })
  ).count;
  deleted.logisticsFollowUpTasks = (
    await tx.logisticsFollowUpTask.deleteMany({
      where: { id: { in: dependencies.logisticsTaskIds } },
    })
  ).count;
  deleted.shippingExportLines = (
    await tx.shippingExportLine.deleteMany({
      where: { id: { in: dependencies.shippingExportLineIds } },
    })
  ).count;
  deleted.salesOrderGiftItems = (
    await tx.salesOrderGiftItem.deleteMany({
      where: { salesOrderId: { in: dependencies.salesOrderIds } },
    })
  ).count;
  deleted.salesOrderItems = (
    await tx.salesOrderItem.deleteMany({
      where: {
        OR: [
          { salesOrderId: { in: dependencies.salesOrderIds } },
          { tradeOrderId: { in: dependencies.tradeOrderIds } },
          { tradeOrderItemId: { in: dependencies.tradeOrderItemIds } },
          {
            tradeOrderItemComponentId: {
              in: dependencies.tradeOrderComponentIds,
            },
          },
        ],
      },
    })
  ).count;
  deleted.tradeOrderItemComponents = (
    await tx.tradeOrderItemComponent.deleteMany({
      where: { id: { in: dependencies.tradeOrderComponentIds } },
    })
  ).count;
  deleted.tradeOrderItems = (
    await tx.tradeOrderItem.deleteMany({
      where: { id: { in: dependencies.tradeOrderItemIds } },
    })
  ).count;
  deleted.shippingTasks = (
    await tx.shippingTask.deleteMany({
      where: { id: { in: dependencies.shippingTaskIds } },
    })
  ).count;
  deleted.giftRecords = (
    await tx.giftRecord.deleteMany({
      where: { id: { in: dependencies.giftRecordIds } },
    })
  ).count;
  deleted.legacyOrders = (
    await tx.order.deleteMany({
      where: { id: { in: dependencies.legacyOrderIds } },
    })
  ).count;
  deleted.salesOrders = (
    await tx.salesOrder.deleteMany({
      where: { id: { in: dependencies.salesOrderIds } },
    })
  ).count;
  deleted.tradeOrders = (
    await tx.tradeOrder.deleteMany({
      where: { id: { in: dependencies.tradeOrderIds } },
    })
  ).count;

  deleted.followUpTasks = (
    await tx.followUpTask.deleteMany({
      where: { customerId: input.customerId },
    })
  ).count;
  deleted.wechatRecords = (
    await tx.wechatRecord.deleteMany({
      where: { customerId: input.customerId },
    })
  ).count;
  deleted.customerTags = (
    await tx.customerTag.deleteMany({
      where: { customerId: input.customerId },
    })
  ).count;
  deleted.customerOwnershipEvents = (
    await tx.customerOwnershipEvent.deleteMany({
      where: { customerId: input.customerId },
    })
  ).count;

  await tx.customer.delete({
    where: { id: input.customerId },
  });
  deleted.customers = 1;

  return deleted;
}

export type ForceHardDeleteCustomerResult = {
  customerId: string;
  customerName: string;
  redirectTo: string;
  deletedCounts: DeleteCountMap;
};

export async function forceHardDeleteCustomer(
  viewer: {
    id: string;
    role: RoleCode;
  },
  input: {
    customerId: string;
    confirmation: string;
    reason: string;
  },
): Promise<ForceHardDeleteCustomerResult> {
  return prisma.$transaction(async (tx) => {
    const actor = await getForceDeleteActorTx(tx, viewer.id);

    if (actor.role !== viewer.role) {
      throw new Error("当前账号角色已更新，请刷新后重试。");
    }

    if (!canPermanentlyDeleteCustomers(actor.role)) {
      throw new Error("只有主管以上可以强制硬删除客户。");
    }

    const customer = await findScopedCustomerForForceDeleteTx(
      tx,
      actor,
      input.customerId,
    );

    if (!customer) {
      throw new Error("当前客户不存在、已删除，或不在你的可管理范围内。");
    }

    const confirmation = input.confirmation.trim();

    if (confirmation !== customer.name && confirmation !== customer.phone) {
      throw new Error("确认内容不匹配，请输入客户姓名或手机号。");
    }

    const reason = input.reason.trim();

    if (!reason) {
      throw new Error("请填写强制硬删除原因。");
    }

    const dependencies = await collectForceDeleteDependenciesTx(tx, customer.id);

    await createForceDeleteAuditLogTx(tx, {
      actor,
      customer,
      dependencies,
      reason,
    });

    const deletedCounts = await executeForceDeleteCleanupTx(tx, {
      actor,
      customerId: customer.id,
      dependencies,
      reason,
    });

    return {
      customerId: customer.id,
      customerName: customer.name,
      redirectTo: getPostDeleteRedirect(customer),
      deletedCounts,
    };
  }, forceDeleteTransactionOptions);
}
