import {
  CustomerOwnershipMode,
  CustomerStatus,
  OperationModule,
  OperationTargetType,
  TradeOrderStatus,
  Prisma,
  type RecycleDomain,
  type RecycleTargetType,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  RECYCLE_ARCHIVE_SNAPSHOT_VERSION,
  type CustomerRecycleArchiveSnapshot,
  type RecycleArchiveMaskedValue,
} from "@/lib/recycle-bin/archive-payload";
import type {
  RecycleArchivePayload,
  RecycleFinalizeBlocker,
  RecycleFinalizePreview,
  RecycleGuardBlocker,
  RecyclePurgeBlocker,
  RecyclePurgeGuard,
  RecycleRestoreBlocker,
  RecycleRestoreGuard,
  RecycleTargetSnapshot,
} from "@/lib/recycle-bin/types";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

type CustomerRecycleRecord = {
  id: string;
  name: string;
  phone: string;
  wechatId: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  remark: string | null;
  status: CustomerStatus;
  level: "NEW" | "REGULAR" | "VIP";
  ownershipMode: CustomerOwnershipMode;
  ownerId: string | null;
  lastOwnerId: string | null;
  publicPoolEnteredAt: Date | null;
  publicPoolReason: string | null;
  claimLockedUntil: Date | null;
  lastEffectiveFollowUpAt: Date | null;
  updatedAt: Date;
  owner: {
    id: string;
    name: string;
    username: string;
    teamId: string | null;
  } | null;
  _count: {
    leads: number;
    followUpTasks: number;
    callRecords: number;
    wechatRecords: number;
    liveInvitations: number;
    orders: number;
    salesOrders: number;
    tradeOrders: number;
    paymentPlans: number;
    paymentRecords: number;
    collectionTasks: number;
    giftRecords: number;
    shippingTasks: number;
    logisticsFollowUpTasks: number;
    codCollectionRecords: number;
    customerTags: number;
    mergeLogs: number;
    ownershipEvents: number;
  };
};

type CustomerRecycleRuntime = {
  approvedTradeOrderCount: number;
};

type CustomerBlockerGroup =
  | "object_state"
  | "customer_lifecycle"
  | "ownership_lifecycle"
  | "sales_engagement"
  | "transaction_chain"
  | "fulfillment_chain"
  | "import_audit";

function buildOwnerLabel(
  owner: {
    name: string;
    username: string;
  } | null,
) {
  return owner ? `${owner.name} (@${owner.username})` : "未分配负责人";
}

function getMaskedFieldValue(value: string | null | undefined): RecycleArchiveMaskedValue {
  return value?.trim() ? "CLEARED" : "EMPTY";
}

function hasCustomerAddress(
  customer: Pick<CustomerRecycleRecord, "province" | "city" | "district" | "address">,
) {
  return Boolean(
    customer.province?.trim() ||
      customer.city?.trim() ||
      customer.district?.trim() ||
      customer.address?.trim(),
  );
}

function buildCustomerArchiveSnapshot(input: {
  customer: CustomerRecycleRecord;
  runtime: CustomerRecycleRuntime;
  nameMasked: string;
  phoneMasked: string;
}): CustomerRecycleArchiveSnapshot {
  const { customer, runtime, nameMasked, phoneMasked } = input;

  return {
    entity: "CUSTOMER",
    snapshotVersion: RECYCLE_ARCHIVE_SNAPSHOT_VERSION,
    finalAction: "ARCHIVE",
    objectWeight: "HEAVY",
    targetMissing: false,
    customerId: customer.id,
    customerStatus: customer.status,
    ownershipMode: customer.ownershipMode,
    nameMasked,
    phoneMasked,
    wechatIdMasked: getMaskedFieldValue(customer.wechatId),
    addressMasked: hasCustomerAddress(customer) ? "CLEARED" : "EMPTY",
    remarkMasked: getMaskedFieldValue(customer.remark),
    owner: customer.owner
      ? {
          id: customer.owner.id,
          name: customer.owner.name,
          username: customer.owner.username,
          teamId: customer.owner.teamId,
          displayLabel: buildOwnerLabel(customer.owner),
        }
      : null,
    governanceAnchors: {
      approvedTradeOrderCount: runtime.approvedTradeOrderCount,
      linkedLeadCount: customer._count.leads,
      followUpTaskCount: customer._count.followUpTasks,
      callRecordCount: customer._count.callRecords,
      wechatRecordCount: customer._count.wechatRecords,
      liveInvitationCount: customer._count.liveInvitations,
      legacyOrderCount: customer._count.orders,
      salesOrderCount: customer._count.salesOrders,
      tradeOrderCount: customer._count.tradeOrders,
      paymentPlanCount: customer._count.paymentPlans,
      paymentRecordCount: customer._count.paymentRecords,
      collectionTaskCount: customer._count.collectionTasks,
      giftRecordCount: customer._count.giftRecords,
      shippingTaskCount: customer._count.shippingTasks,
      logisticsFollowUpCount: customer._count.logisticsFollowUpTasks,
      codCollectionCount: customer._count.codCollectionRecords,
      mergeLogCount: customer._count.mergeLogs,
      customerTagCount: customer._count.customerTags,
      ownershipEventCount: customer._count.ownershipEvents,
    },
  };
}

function pushMoveBlocker(
  blockers: RecycleGuardBlocker[],
  input: {
    code: string;
    name: string;
    description: string;
    group: CustomerBlockerGroup;
    suggestedAction: string;
    count?: number;
  },
) {
  blockers.push({
    code: input.code,
    name: input.name,
    count: input.count ?? 1,
    blocksMoveToRecycleBin: true,
    blocksPermanentDelete: true,
    description: input.description,
    group: input.group,
    suggestedAction: input.suggestedAction,
  });
}

function pushPurgeBlocker(
  blockers: RecyclePurgeBlocker[],
  input: {
    code: string;
    name: string;
    description: string;
    group: CustomerBlockerGroup;
    suggestedAction: string;
  },
) {
  blockers.push({
    code: input.code,
    name: input.name,
    description: input.description,
    group: input.group,
    suggestedAction: input.suggestedAction,
  });
}

async function getCustomerRecord(
  db: RecycleDbClient,
  customerId: string,
): Promise<CustomerRecycleRecord | null> {
  return db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      phone: true,
      wechatId: true,
      province: true,
      city: true,
      district: true,
      address: true,
      remark: true,
      status: true,
      level: true,
      ownershipMode: true,
      ownerId: true,
      lastOwnerId: true,
      publicPoolEnteredAt: true,
      publicPoolReason: true,
      claimLockedUntil: true,
      lastEffectiveFollowUpAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          teamId: true,
        },
      },
      _count: {
        select: {
          leads: true,
          followUpTasks: true,
          callRecords: true,
          wechatRecords: true,
          liveInvitations: true,
          orders: true,
          salesOrders: true,
          tradeOrders: true,
          paymentPlans: true,
          paymentRecords: true,
          collectionTasks: true,
          giftRecords: true,
          shippingTasks: true,
          logisticsFollowUpTasks: true,
          codCollectionRecords: true,
          customerTags: true,
          mergeLogs: true,
          ownershipEvents: true,
        },
      },
    },
  });
}

async function getCustomerRuntime(
  db: RecycleDbClient,
  customerId: string,
): Promise<CustomerRecycleRuntime> {
  const approvedTradeOrderCount = await db.tradeOrder.count({
    where: {
      customerId,
      tradeStatus: TradeOrderStatus.APPROVED,
    },
  });

  return {
    approvedTradeOrderCount,
  };
}

function buildMoveGuard(
  customer: CustomerRecycleRecord,
): RecycleTargetSnapshot["guard"] {
  const blockers: RecycleGuardBlocker[] = [];

  if (customer.status !== CustomerStatus.ACTIVE) {
    pushMoveBlocker(blockers, {
      code: "customer_non_active",
      name: "非 ACTIVE 客户",
      description: `当前客户状态为 ${customer.status}，回收站只承接误建轻客户。`,
      group: "customer_lifecycle",
      suggestedAction: "改走 DORMANT / LOST / BLACKLISTED 状态治理，不走 recycle。",
    });
  }

  if (customer.ownershipMode === CustomerOwnershipMode.PUBLIC) {
    pushMoveBlocker(blockers, {
      code: "customer_public_pool",
      name: "公海客户",
      description: "当前客户已进入公海 ownership lifecycle，不应再按误建客户删除。",
      group: "ownership_lifecycle",
      suggestedAction: "改走 /customers/public-pool ownership lifecycle。",
    });
  }

  if (customer.ownershipMode === CustomerOwnershipMode.LOCKED) {
    pushMoveBlocker(blockers, {
      code: "customer_locked",
      name: "锁定客户",
      description: "当前客户仍在 claim lock / ownership 保护链内，不应直接移入回收站。",
      group: "ownership_lifecycle",
      suggestedAction: "改走 /customers/public-pool ownership lifecycle。",
    });
  }

  if (customer.publicPoolEnteredAt || customer.publicPoolReason) {
    pushMoveBlocker(blockers, {
      code: "customer_public_pool_history",
      name: "已有公海上下文",
      description: "当前客户已留下公海治理字段，说明不再属于纯草稿误建轻客户。",
      group: "ownership_lifecycle",
      suggestedAction: "改走 /customers/public-pool ownership lifecycle。",
    });
  }

  if (customer.lastOwnerId || customer._count.ownershipEvents > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_ownership_history",
      name: "已有归属历史",
      description: `当前客户已进入 ownership 链，已有 ${customer._count.ownershipEvents} 条归属事件。`,
      group: "ownership_lifecycle",
      suggestedAction: "改走 /customers/public-pool ownership lifecycle。",
    });
  }

  if (customer.claimLockedUntil) {
    pushMoveBlocker(blockers, {
      code: "customer_claim_lock",
      name: "存在 claim 锁定",
      description: "当前客户仍保留 claim protection 字段，说明已进入 ownership 保护链。",
      group: "ownership_lifecycle",
      suggestedAction: "改走 /customers/public-pool ownership lifecycle。",
    });
  }

  if (customer.lastEffectiveFollowUpAt) {
    pushMoveBlocker(blockers, {
      code: "customer_effective_follow_up",
      name: "已有有效跟进时间",
      description: "当前客户已经形成有效跟进，不再属于可直接删除的误建轻客户。",
      group: "sales_engagement",
      suggestedAction: "保留客户，改走冻结 / 失效 / 公海治理。",
    });
  }

  if (customer._count.followUpTasks > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_follow_up_tasks",
      name: "跟进任务",
      description: `当前客户已有 ${customer._count.followUpTasks} 条跟进任务。`,
      group: "sales_engagement",
      suggestedAction: "保留客户，改走冻结 / 失效 / 公海治理。",
      count: customer._count.followUpTasks,
    });
  }

  if (customer._count.callRecords > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_call_records",
      name: "通话记录",
      description: `当前客户已有 ${customer._count.callRecords} 条通话记录。`,
      group: "sales_engagement",
      suggestedAction: "保留客户，改走冻结 / 失效 / 公海治理。",
      count: customer._count.callRecords,
    });
  }

  if (customer._count.wechatRecords > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_wechat_records",
      name: "微信记录",
      description: `当前客户已有 ${customer._count.wechatRecords} 条微信记录。`,
      group: "sales_engagement",
      suggestedAction: "保留客户，改走冻结 / 失效 / 公海治理。",
      count: customer._count.wechatRecords,
    });
  }

  if (customer._count.liveInvitations > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_live_invitations",
      name: "直播邀约",
      description: `当前客户已有 ${customer._count.liveInvitations} 条直播邀约记录。`,
      group: "sales_engagement",
      suggestedAction: "保留客户，改走冻结 / 失效 / 公海治理。",
      count: customer._count.liveInvitations,
    });
  }

  if (customer._count.orders > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_legacy_orders",
      name: "历史订单",
      description: `当前客户已有 ${customer._count.orders} 条 legacy 订单记录。`,
      group: "transaction_chain",
      suggestedAction: "保留客户，在订单 / 支付域继续治理。",
      count: customer._count.orders,
    });
  }

  if (customer._count.tradeOrders > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_trade_orders",
      name: "成交主单",
      description: `当前客户已有 ${customer._count.tradeOrders} 张成交主单。`,
      group: "transaction_chain",
      suggestedAction: "保留客户，在订单 / 支付域继续治理。",
      count: customer._count.tradeOrders,
    });
  }

  if (customer._count.salesOrders > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_sales_orders",
      name: "供应商子单",
      description: `当前客户已有 ${customer._count.salesOrders} 张供应商子单。`,
      group: "transaction_chain",
      suggestedAction: "保留客户，在订单 / 支付域继续治理。",
      count: customer._count.salesOrders,
    });
  }

  if (customer._count.giftRecords > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_gift_records",
      name: "礼品记录",
      description: `当前客户已有 ${customer._count.giftRecords} 条礼品履约记录。`,
      group: "transaction_chain",
      suggestedAction: "保留客户，在订单 / 支付域继续治理。",
      count: customer._count.giftRecords,
    });
  }

  if (customer._count.paymentPlans > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_payment_plans",
      name: "支付计划",
      description: `当前客户已有 ${customer._count.paymentPlans} 条支付计划。`,
      group: "transaction_chain",
      suggestedAction: "保留客户，在订单 / 支付域继续治理。",
      count: customer._count.paymentPlans,
    });
  }

  if (customer._count.paymentRecords > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_payment_records",
      name: "支付记录",
      description: `当前客户已有 ${customer._count.paymentRecords} 条支付记录。`,
      group: "transaction_chain",
      suggestedAction: "保留客户，在订单 / 支付域继续治理。",
      count: customer._count.paymentRecords,
    });
  }

  if (customer._count.collectionTasks > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_collection_tasks",
      name: "催收任务",
      description: `当前客户已有 ${customer._count.collectionTasks} 条催收任务。`,
      group: "transaction_chain",
      suggestedAction: "保留客户，在订单 / 支付域继续治理。",
      count: customer._count.collectionTasks,
    });
  }

  if (customer._count.shippingTasks > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_shipping_tasks",
      name: "发货任务",
      description: `当前客户已有 ${customer._count.shippingTasks} 条发货任务。`,
      group: "fulfillment_chain",
      suggestedAction: "保留客户，在履约 / 物流链继续治理。",
      count: customer._count.shippingTasks,
    });
  }

  if (customer._count.logisticsFollowUpTasks > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_logistics_follow_ups",
      name: "物流跟进",
      description: `当前客户已有 ${customer._count.logisticsFollowUpTasks} 条物流跟进任务。`,
      group: "fulfillment_chain",
      suggestedAction: "保留客户，在履约 / 物流链继续治理。",
      count: customer._count.logisticsFollowUpTasks,
    });
  }

  if (customer._count.codCollectionRecords > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_cod_collection_records",
      name: "COD 回款记录",
      description: `当前客户已有 ${customer._count.codCollectionRecords} 条 COD 回款记录。`,
      group: "fulfillment_chain",
      suggestedAction: "保留客户，在履约 / 物流链继续治理。",
      count: customer._count.codCollectionRecords,
    });
  }

  if (customer._count.mergeLogs > 0) {
    pushMoveBlocker(blockers, {
      code: "customer_merge_logs",
      name: "归并审计链",
      description: `当前客户已有 ${customer._count.mergeLogs} 条 merge / import 审计记录。`,
      group: "import_audit",
      suggestedAction: "保留 merge / import 审计上下文，不做 recycle 清理。",
      count: customer._count.mergeLogs,
    });
  }

  return {
    canMoveToRecycleBin: blockers.length === 0,
    fallbackActionLabel: "改走客户状态 / 公海 / 归并治理",
    blockerSummary:
      blockers[0]?.description ??
      "当前客户仍是未进入 ownership、跟进、成交与履约链的误建轻客户，可移入回收站。",
    blockers,
    futureRestoreBlockers: [],
  };
}

function buildRestoreGuard(
  restoreRouteSnapshot: string,
  blockers: RecycleRestoreBlocker[],
): RecycleRestoreGuard {
  return {
    canRestore: blockers.length === 0,
    blockerSummary:
      blockers[0]?.description ?? "可以恢复到客户中心，恢复不会重写客户当前业务字段。",
    blockers,
    restoreRouteSnapshot,
  };
}

function buildPurgeGuard(blockers: RecyclePurgeBlocker[]): RecyclePurgeGuard {
  return {
    canPurge: blockers.length === 0,
    blockerSummary:
      blockers[0]?.description ?? "当前客户可从回收站中永久删除。",
    blockers,
  };
}

function buildPurgeBlockers(
  customer: CustomerRecycleRecord,
): RecyclePurgeBlocker[] {
  const blockers: RecyclePurgeBlocker[] = buildMoveGuard(customer).blockers.map(
    (blocker) => ({
      code: blocker.code,
      name: blocker.name,
      description: blocker.description,
      group: blocker.group,
      suggestedAction: blocker.suggestedAction,
    }),
  );

  if (customer._count.leads > 0) {
    pushPurgeBlocker(blockers, {
      code: "customer_linked_leads",
      name: "关联线索",
      description: `当前客户仍关联 ${customer._count.leads} 条线索，不能直接做最终 purge。`,
      group: "import_audit",
      suggestedAction: "保留 merge / import 审计上下文，不做 recycle 清理。",
    });
  }

  if (customer._count.customerTags > 0) {
    pushPurgeBlocker(blockers, {
      code: "customer_tags",
      name: "客户标签",
      description: `当前客户仍保留 ${customer._count.customerTags} 条客户标签关系，不能直接做最终 purge。`,
      group: "import_audit",
      suggestedAction: "保留 merge / import 审计上下文，不做 recycle 清理。",
    });
  }

  return blockers;
}

function buildFinalizePreview(input: {
  targetExists: boolean;
  blockers: RecycleFinalizeBlocker[];
}): RecycleFinalizePreview {
  if (!input.targetExists) {
    return {
      canFinalize: true,
      targetExists: false,
      finalAction: "PURGE",
      finalActionLabel: "可 purge",
      blockerSummary: "原始客户已不存在，回收站条目会按 PURGE 终态收口。",
      blockers: [],
      canEarlyPurge: true,
      earlyPurgeRequiresAdmin: true,
    };
  }

  if (input.blockers.length === 0) {
    return {
      canFinalize: true,
      targetExists: true,
      finalAction: "PURGE",
      finalActionLabel: "可 purge",
      blockerSummary: "当前客户仍满足误建轻客户条件，可直接执行 PURGE。",
      blockers: [],
      canEarlyPurge: true,
      earlyPurgeRequiresAdmin: true,
    };
  }

  return {
    canFinalize: true,
    targetExists: true,
    finalAction: "ARCHIVE",
    finalActionLabel: "仅封存",
    blockerSummary:
      input.blockers[0]?.description ??
      "当前客户已进入需要保留业务真相或审计锚点的链路，仅封存。",
    blockers: input.blockers,
    canEarlyPurge: false,
    earlyPurgeRequiresAdmin: true,
  };
}

function buildArchivedCustomerName(customerId: string) {
  return `已封存客户#${customerId.slice(-6).toUpperCase()}`;
}

function buildArchivedCustomerPhone(customerId: string) {
  return `ARCHIVED:${customerId}`;
}

export async function getCustomerRecycleTarget(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
): Promise<RecycleTargetSnapshot | null> {
  if (targetType !== "CUSTOMER") {
    return null;
  }

  const [customer, runtime] = await Promise.all([
    getCustomerRecord(db, targetId),
    getCustomerRuntime(db, targetId),
  ]);

  if (!customer) {
    return null;
  }

  const guard = buildMoveGuard(customer);
  const ownerLabel = buildOwnerLabel(customer.owner);

  return {
    targetType: "CUSTOMER",
    targetId: customer.id,
    domain: "CUSTOMER",
    titleSnapshot: customer.name,
    secondarySnapshot: customer.phone,
    originalStatusSnapshot: customer.status,
    restoreRouteSnapshot: `/customers/${customer.id}`,
    operationModule: OperationModule.CUSTOMER,
    operationTargetType: OperationTargetType.CUSTOMER,
    operationAction: "customer.moved_to_recycle_bin",
    operationDescription: `Moved customer to recycle bin: ${customer.name}`,
    guard,
    blockerSnapshotJson: {
      phone: customer.phone,
      status: customer.status,
      level: customer.level,
      ownershipMode: customer.ownershipMode,
      ownerId: customer.ownerId,
      ownerLabel,
      ownerTeamId: customer.owner?.teamId ?? null,
      lastEffectiveFollowUpAt: customer.lastEffectiveFollowUpAt?.toISOString() ?? null,
      approvedTradeOrderCount: runtime.approvedTradeOrderCount,
      linkedLeadCount: customer._count.leads,
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
    },
  };
}

export async function buildCustomerRestoreGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
    restoreRouteSnapshot: string;
  },
) {
  if (input.domain !== "CUSTOMER" || input.targetType !== "CUSTOMER") {
    return null;
  }

  const customer = await getCustomerRecord(db, input.targetId);

  if (!customer) {
    return buildRestoreGuard(input.restoreRouteSnapshot, [
      {
        code: "customer_missing",
        name: "对象缺失",
        description: "原始客户已不存在，当前不能恢复。",
        group: "object_state",
        suggestedAction: "先确认原始客户记录是否仍然存在；不存在则不再恢复。",
      },
    ]);
  }

  return buildRestoreGuard(input.restoreRouteSnapshot, []);
}

export async function buildCustomerPurgeGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "CUSTOMER" || input.targetType !== "CUSTOMER") {
    return null;
  }

  const customer = await getCustomerRecord(db, input.targetId);

  if (!customer) {
    return buildPurgeGuard([
      {
        code: "customer_missing",
        name: "对象缺失",
        description: "原始客户已不存在，当前不能执行永久删除。",
        group: "object_state",
        suggestedAction: "先确认原始客户记录是否仍然存在；不存在则不再继续 purge。",
      },
    ]);
  }

  return buildPurgeGuard(buildPurgeBlockers(customer));
}

export async function buildCustomerFinalizePreview(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "CUSTOMER" || input.targetType !== "CUSTOMER") {
    return null;
  }

  const customer = await getCustomerRecord(db, input.targetId);

  if (!customer) {
    return buildFinalizePreview({
      targetExists: false,
      blockers: [],
    });
  }

  return buildFinalizePreview({
    targetExists: true,
    blockers: buildPurgeBlockers(customer),
  });
}

export async function purgeCustomerTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
  },
) {
  if (input.targetType !== "CUSTOMER") {
    return false;
  }

  await db.customer.delete({
    where: {
      id: input.targetId,
    },
  });

  return true;
}

export async function archiveCustomerTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    preview: RecycleFinalizePreview;
  },
): Promise<RecycleArchivePayload | null> {
  if (input.targetType !== "CUSTOMER") {
    return null;
  }

  const [customer, runtime] = await Promise.all([
    getCustomerRecord(db, input.targetId),
    getCustomerRuntime(db, input.targetId),
  ]);

  if (!customer) {
    return {
      finalAction: "ARCHIVE",
      archivedAt: new Date().toISOString(),
      blockerSummary: input.preview.blockerSummary,
      blockers: input.preview.blockers,
      snapshot: {
        entity: "CUSTOMER",
        snapshotVersion: RECYCLE_ARCHIVE_SNAPSHOT_VERSION,
        finalAction: "ARCHIVE",
        objectWeight: "HEAVY",
        customerId: input.targetId,
        targetMissing: true,
        customerStatus: null,
        ownershipMode: null,
        nameMasked: null,
        phoneMasked: null,
        wechatIdMasked: null,
        addressMasked: null,
        remarkMasked: null,
        owner: null,
        governanceAnchors: null,
      },
    };
  }

  const archivedName = buildArchivedCustomerName(customer.id);
  const archivedPhone = buildArchivedCustomerPhone(customer.id);

  await db.customer.update({
    where: {
      id: customer.id,
    },
    data: {
      name: archivedName,
      phone: archivedPhone,
      wechatId: null,
      province: null,
      city: null,
      district: null,
      address: null,
      remark: null,
    },
  });

  return {
    finalAction: "ARCHIVE",
    archivedAt: new Date().toISOString(),
    blockerSummary: input.preview.blockerSummary,
    blockers: input.preview.blockers,
    snapshot: buildCustomerArchiveSnapshot({
      customer,
      runtime,
      nameMasked: archivedName,
      phoneMasked: archivedPhone,
    }),
  };
}
