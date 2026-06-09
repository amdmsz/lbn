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
type ForceDeleteConfirmationMode = "customer_identity" | "batch_phrase";

const forceDeleteTransactionOptions = {
  maxWait: 10_000,
  timeout: 60_000,
};
export const CUSTOMER_BATCH_FORCE_HARD_DELETE_CONFIRMATION = "永久删除";

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
    // 公海客户的 publicPoolTeamId 是可变字段 — 每次 release / assign 都会被
    // 覆盖, 默认 fallback 到 actor.teamId. 如果只靠 publicPoolTeamId 锚定,
    // 主管 A 可以先把客户 release 进自己团队公海 (publicPoolTeamId 改成 A),
    // 然后立刻硬删 — 哪怕历史归属属于团队 B. 因此把 SUPERVISOR 对公海客户的
    // 强删范围收敛为:
    //   - 当前 owner 在 actor 团队 (PRIVATE 客户), 或
    //   - 公海客户的 lastOwner 在 actor 团队 (有历史归属), 或
    //   - 公海客户没有 lastOwner (从未被任何团队认领过)
    //     AND publicPoolTeamId === actor.teamId
    // SYSTEM 自动回收且 SYSTEM actor 无 teamId 时, publicPoolTeamId 会被写成
    // null. 这种 "悬空" 公海客户只允许 ADMIN 清理.
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
          lastOwner: {
            is: {
              teamId: actor.teamId,
            },
          },
        },
        {
          ownerId: null,
          lastOwnerId: null,
          publicPoolTeamId: actor.teamId,
        },
      ],
    };
  }

  return {
    id: "__force_delete_forbidden_customer__",
  };
}

/**
 * 服务端再次校验 SUPERVISOR 对加载后的客户记录是否仍在合法 scope.
 *
 * 防御纵深: 即使 buildScopedCustomerWhere 漏掉边界, 拿到 customer 后也要
 * 用真实字段重新校验. 防止以下越权:
 *   - 主管 A release 客户进自己团队公海 (publicPoolTeamId 改成 A 团队),
 *     此时即使 lastOwner.teamId === 团队 B, 仅靠 publicPoolTeamId 也会通过.
 *   - SYSTEM OWNER_LEFT_TEAM 回收时 actor.teamId 为 null, publicPoolTeamId
 *     被覆盖为 null, 但 customer.publicPoolTeamId 与 actor.teamId 凑巧相等
 *     (都为 null) 时会绕过 (虽然 actor.role 守卫已禁 null teamId 主管,
 *     这里仍保险一遍).
 */
export function assertSupervisorCanForceDeleteCustomer(
  actor: ForceDeleteActor,
  customer: ForceDeleteCustomerRecord,
): void {
  if (actor.role !== "SUPERVISOR") {
    return;
  }

  if (!actor.teamId) {
    throw new Error("当前主管账号未绑定团队，无法执行强制硬删除。");
  }

  // 私有客户: 必须 owner 在主管团队
  if (customer.ownerId) {
    if (customer.owner?.teamId !== actor.teamId) {
      throw new Error("当前客户不在你的可管理范围内。");
    }
    return;
  }

  // 公海客户: lastOwner 在主管团队即可
  if (customer.lastOwnerId && customer.lastOwner?.teamId === actor.teamId) {
    return;
  }

  // 公海客户从未被任何 owner 持有过, 且 publicPoolTeamId 严格等于主管团队
  if (
    !customer.lastOwnerId
    && customer.publicPoolTeamId
    && customer.publicPoolTeamId === actor.teamId
  ) {
    return;
  }

  throw new Error("当前客户的历史归属不在你的团队范围内，请联系 ADMIN 清理。");
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

  // 今晚新加的 TradeOrderRevisionRequest 跟 TradeOrder 是 ON DELETE RESTRICT.
  // 强删客户时必须先清掉关联的 revision 申请, 否则 FK 违约整个事务回滚 —
  // 用户会发现 "含 revision 历史的客户都不能强删".
  const revisionRequests = await tx.tradeOrderRevisionRequest.findMany({
    where: { tradeOrderId: { in: tradeOrderIds } },
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
    tradeOrderRevisionRequestIds: uniqueStrings(
      revisionRequests.map((record) => record.id),
    ),
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
    tradeOrderRevisionRequests: dependencies.tradeOrderRevisionRequestIds.length,
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
    purgeAttachedLeads: boolean;
  },
) {
  const { dependencies } = input;
  const deleted: DeleteCountMap = {};

  // Lead/LeadAssignment/CustomerHistoryArchive 走 fetch-then-detach, 同时落
  // OperationLog. 单纯 updateMany 会留下三类悬挂记录:
  // 1) Lead.ownerId 仍指向原 SALES → orphan lead 仍出现在 SALES /leads 视图,
  //    且 importedCustomerDeletionGuard 在原 lead 上找不到 origin 锚点.
  // 2) LeadAssignment 仍保留旧链, 但没有任何审计痕迹说明 customer 已强删.
  // 3) CustomerHistoryArchive.targetCustomerId 置 null 后, source 仍在,
  //    UI / 后续查询无法区分 "归档 → 客户重新建" vs "归档 → 客户已硬删".
  // 解决: detach 前快照 → updateMany → 按行写 OperationLog (重要动作必留审计).
  //
  // 当 purgeAttachedLeads=true 时把 Lead 行物理清理掉, 用于 "重新导入同 phone"
  // 场景 — 否则导入 dedup 仍能找到旧 Lead 残骸把新导入挡掉.
  const detachedLeadRecords = await tx.lead.findMany({
    where: { customerId: input.customerId },
    select: { id: true, ownerId: true, status: true, phone: true },
  });
  const detachedLeadIds = uniqueStrings(detachedLeadRecords.map((record) => record.id));
  const detachedLeadAssignments = detachedLeadIds.length
    ? await tx.leadAssignment.findMany({
        where: { leadId: { in: detachedLeadIds } },
        select: { id: true, leadId: true, toUserId: true, fromUserId: true },
      })
    : [];

  const purgeLeads = input.purgeAttachedLeads && detachedLeadIds.length > 0;
  const leadAuditAction = purgeLeads
    ? "lead.purged_by_force_delete"
    : "lead.customer_detached_by_force_delete";
  const leadAuditDescription = purgeLeads
    ? `客户被强制硬删除, Lead 已物理清理. 销售视图与导入 dedup 都不再保留残留`
    : `客户被强制硬删除，Lead 已自动 detach 并解除负责人，需主管复核。`;

  if (purgeLeads) {
    // 物理清理路径: 先按 detach 路径快照审计, 再按 FK 依赖顺序物理删除.
    // Lead 上还挂着这些 FK 子表:
    //   - LeadAssignment.leadId (NOT NULL, NoAction) — 必须先删
    //   - LeadTag.leadId (NOT NULL, NoAction) — 必须先删
    //   - LeadCustomerMergeLog.leadId (nullable, SetNull) — 显式删 (替代 SetNull)
    //   - FollowUpTask/CallRecord/WechatRecord/LiveInvitation/Order/GiftRecord
    //     (.leadId nullable, NoAction) — 客户 cleanup 已经删过 customer 自己的,
    //     这里把剩下仅靠 leadId 关联的也清零 (设 NULL), 避免 FK 残留
    //   - CustomerHistoryArchive.targetLeadId (nullable, SetNull) — 自动 nullify
    //   - LeadDedupLog.matchedLeadId 是普通字符串字段 (无 FK), 不需要清理
  } else {
    const detachedLeads = await tx.lead.updateMany({
      where: { customerId: input.customerId },
      data: {
        customerId: null,
        // 同步把 ownerId 清空 — 客户已强删, 原 SALES 不应再把这条孤儿 lead
        // 当成自己客户继续跟进; 走 supervisor 复核 / 重新分配链路.
        ownerId: null,
      },
    });
    deleted.detachedLeads = detachedLeads.count;
  }

  if (detachedLeadRecords.length > 0) {
    await tx.operationLog.createMany({
      data: detachedLeadRecords.map((record) => ({
        actorId: input.actor.id,
        module: OperationModule.LEAD,
        action: leadAuditAction,
        targetType: OperationTargetType.LEAD,
        targetId: record.id,
        description: leadAuditDescription,
        beforeData: toInputJson({
          customerId: input.customerId,
          ownerId: record.ownerId,
          status: record.status,
          phone: record.phone,
        }),
        afterData: toInputJson(
          purgeLeads
            ? {
                purged: true,
                reason: input.reason,
                actorRole: input.actor.role,
              }
            : {
                customerId: null,
                ownerId: null,
                reason: input.reason,
                actorRole: input.actor.role,
              },
        ),
      })),
    });
  }

  if (detachedLeadAssignments.length > 0) {
    await tx.operationLog.createMany({
      data: detachedLeadAssignments.map((assignment) => ({
        actorId: input.actor.id,
        module: OperationModule.LEAD,
        action: "lead_assignment.customer_detached_by_force_delete",
        targetType: OperationTargetType.LEAD_ASSIGNMENT,
        targetId: assignment.id,
        description: `所属客户被强制硬删除，Lead 分配链路保留作为历史审计。`,
        beforeData: toInputJson({
          customerId: input.customerId,
          leadId: assignment.leadId,
          toUserId: assignment.toUserId,
          fromUserId: assignment.fromUserId,
        }),
        afterData: toInputJson({
          reason: input.reason,
          actorRole: input.actor.role,
          purged: purgeLeads,
        }),
      })),
    });
  }
  deleted.detachedLeadAssignments = detachedLeadAssignments.length;

  if (purgeLeads) {
    // 1) LeadAssignment 物理删 — 必须先删 leadId NOT NULL 的子表
    deleted.purgedLeadAssignments = (
      await tx.leadAssignment.deleteMany({
        where: { leadId: { in: detachedLeadIds } },
      })
    ).count;

    // 2) LeadTag 物理删 — leadId NOT NULL
    deleted.purgedLeadTags = (
      await tx.leadTag.deleteMany({
        where: { leadId: { in: detachedLeadIds } },
      })
    ).count;

    // 3) LeadCustomerMergeLog 物理删 — 替代默认 SetNull 行为, 真正消失
    deleted.purgedLeadCustomerMergeLogs = (
      await tx.leadCustomerMergeLog.deleteMany({
        where: { leadId: { in: detachedLeadIds } },
      })
    ).count;

    // 4) 客户自己的 followUpTask / callRecord / wechatRecord / liveInvitation /
    //    order / giftRecord 已经在 executeForceDeleteCleanupTx 后段被 deleteMany
    //    清掉了 (按 customerId 或聚合 id 集合). 剩下的可能仍有 "只挂在 Lead 上但
    //    customerId=null" 的孤儿行 — 把 leadId 清零, 避免 FK NoAction 违约.
    await tx.followUpTask.updateMany({
      where: { leadId: { in: detachedLeadIds } },
      data: { leadId: null },
    });
    await tx.callRecord.updateMany({
      where: { leadId: { in: detachedLeadIds } },
      data: { leadId: null },
    });
    await tx.wechatRecord.updateMany({
      where: { leadId: { in: detachedLeadIds } },
      data: { leadId: null },
    });
    await tx.liveInvitation.updateMany({
      where: { leadId: { in: detachedLeadIds } },
      data: { leadId: null },
    });
    await tx.order.updateMany({
      where: { leadId: { in: detachedLeadIds } },
      data: { leadId: null },
    });
    await tx.giftRecord.updateMany({
      where: { leadId: { in: detachedLeadIds } },
      data: { leadId: null },
    });

    // 5) 最后物理删 Lead — CustomerHistoryArchive.targetLeadId 走 SetNull,
    //    LeadDedupLog.matchedLeadId 不是 FK, 跟 Lead 删除无关 (字符串字段保留为
    //    历史 dedup 痕迹, 不影响新导入).
    deleted.purgedLeads = (
      await tx.lead.deleteMany({
        where: { id: { in: detachedLeadIds } },
      })
    ).count;
  } else {
    const detachedMergeLogs = await tx.leadCustomerMergeLog.updateMany({
      where: { customerId: input.customerId },
      data: { customerId: null },
    });
    deleted.detachedLeadCustomerMergeLogs = detachedMergeLogs.count;
  }

  const historyArchiveRecords = await tx.customerHistoryArchive.findMany({
    where: { targetCustomerId: input.customerId },
    select: { id: true, sourceCustomerId: true, sourceBatchId: true },
  });
  const detachedHistoryArchives = await tx.customerHistoryArchive.updateMany({
    where: { targetCustomerId: input.customerId },
    data: { targetCustomerId: null },
  });
  deleted.detachedCustomerHistoryArchives = detachedHistoryArchives.count;

  if (historyArchiveRecords.length > 0) {
    // sourceCustomerId 是 NOT NULL 不能清, 用 OperationLog 显式标记
    // "源客户已硬删", 让 UI/归档查询能区分 "归档已悬挂" 这一状态.
    await tx.operationLog.createMany({
      data: historyArchiveRecords.map((archive) => ({
        actorId: input.actor.id,
        module: OperationModule.CUSTOMER,
        action: "customer_history_archive.source_customer_hard_deleted",
        targetType: OperationTargetType.CUSTOMER,
        targetId: archive.sourceCustomerId,
        description: `客户已强制硬删除，关联的 CustomerHistoryArchive 仅保留快照。`,
        beforeData: toInputJson({
          archiveId: archive.id,
          targetCustomerId: input.customerId,
          sourceBatchId: archive.sourceBatchId,
        }),
        afterData: toInputJson({
          archiveId: archive.id,
          targetCustomerId: null,
          sourceCustomerHardDeletedAt: new Date().toISOString(),
          reason: input.reason,
          actorRole: input.actor.role,
        }),
      })),
    });
  }

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
  // 必须在 tx.tradeOrder.deleteMany 之前清 RevisionRequest, 不然 FK RESTRICT 报错
  deleted.tradeOrderRevisionRequests = (
    await tx.tradeOrderRevisionRequest.deleteMany({
      where: { id: { in: dependencies.tradeOrderRevisionRequestIds } },
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
  /**
   * 本次实际物理清理的 Lead 行数 (purgeAttachedLeads=true 时 > 0).
   * purgeAttachedLeads=false (默认) 时为 0 — Lead 仅 detach, 行仍在表里.
   */
  purgedLeadCount: number;
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
    confirmationMode?: ForceDeleteConfirmationMode;
    /**
     * 当 true 时, 把客户关联的 Lead 行连同 LeadAssignment / LeadTag /
     * LeadCustomerMergeLog 一起物理删除 — 用于 "重新导入此批 phone" 场景, 避免
     * 旧 Lead 残骸继续命中导入 dedup. 默认 false, 保留原有 detach 行为
     * (向后兼容).
     */
    purgeAttachedLeads?: boolean;
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

    // 防御纵深: buildScopedCustomerWhere 已经按字段过滤过, 这里再用加载后的
    // 真实 record 重新校验一遍, 避免 publicPoolTeamId 这种可变字段被绕过.
    assertSupervisorCanForceDeleteCustomer(actor, customer);

    const confirmation = input.confirmation.trim();

    if (input.confirmationMode === "batch_phrase") {
      if (confirmation !== CUSTOMER_BATCH_FORCE_HARD_DELETE_CONFIRMATION) {
        throw new Error(`确认内容不匹配，请输入“${CUSTOMER_BATCH_FORCE_HARD_DELETE_CONFIRMATION}”。`);
      }
    } else if (confirmation !== customer.name && confirmation !== customer.phone) {
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

    const purgeAttachedLeads = input.purgeAttachedLeads === true;
    const deletedCounts = await executeForceDeleteCleanupTx(tx, {
      actor,
      customerId: customer.id,
      dependencies,
      reason,
      purgeAttachedLeads,
    });

    return {
      customerId: customer.id,
      customerName: customer.name,
      redirectTo: getPostDeleteRedirect(customer),
      deletedCounts,
      purgedLeadCount: deletedCounts.purgedLeads ?? 0,
    };
  }, forceDeleteTransactionOptions);
}
