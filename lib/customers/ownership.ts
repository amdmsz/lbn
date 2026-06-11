import {
  AttendanceStatus,
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  OperationModule,
  OperationTargetType,
  PublicPoolReason,
  UserStatus,
  type Prisma,
  type RoleCode,
  type WechatAddStatus,
} from "@prisma/client";
import type { CallResultEffectLevelValue } from "@/lib/calls/metadata";
import { prisma } from "@/lib/db/prisma";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { PUBLIC_POOL_RECLAIM_COOLDOWN_HOURS } from "@/lib/customers/public-pool-metadata";
import { getResolvedTeamPublicPoolSetting } from "@/lib/customers/public-pool-settings";
import { getWechatAddedStatusEffectMeta } from "@/lib/wechat/metadata";

const DEFAULT_CLAIM_PROTECTION_DAYS = 2;
const EXPIRING_SOON_HOURS = 24;

type TransactionClient = Prisma.TransactionClient;

export type OwnershipActorContext = {
  id: string;
  role: RoleCode;
  name: string;
  username: string;
  teamId: string | null;
};

export type OwnershipTransitionActorContext =
  | OwnershipActorContext
  | {
      id: null;
      role: "SYSTEM";
      name: "System";
      username: "system";
      teamId: string | null;
    };

type OwnershipTargetSales = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
};

const ownershipCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  ownerId: true,
  ownershipMode: true,
  lastOwnerId: true,
  publicPoolEnteredAt: true,
  publicPoolReason: true,
  claimLockedUntil: true,
  lastEffectiveFollowUpAt: true,
  publicPoolTeamId: true,
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
} satisfies Prisma.CustomerSelect;

type OwnershipCustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof ownershipCustomerSelect;
}>;

export function createSystemOwnershipActorContext(
  teamId: string | null = null,
): OwnershipTransitionActorContext {
  return {
    id: null,
    role: "SYSTEM",
    name: "System",
    username: "system",
    teamId,
  };
}

export type EffectiveFollowUpMeta = {
  effectLevel: CallResultEffectLevelValue;
  resetsPublicPoolClock: boolean;
  claimProtectionDays: number;
  requiresSupervisorReview: boolean;
};

const liveInvitationEffectMeta: EffectiveFollowUpMeta = {
  effectLevel: "MEDIUM",
  resetsPublicPoolClock: true,
  claimProtectionDays: 3,
  requiresSupervisorReview: false,
};

const liveAttendanceEffectMeta: EffectiveFollowUpMeta = {
  effectLevel: "STRONG",
  resetsPublicPoolClock: true,
  claimProtectionDays: 5,
  requiresSupervisorReview: false,
};

const tradeOrderProgressEffectMeta: EffectiveFollowUpMeta = {
  effectLevel: "STRONG",
  resetsPublicPoolClock: true,
  claimProtectionDays: 14,
  requiresSupervisorReview: false,
};

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(base: Date, hours: number) {
  const next = new Date(base);
  next.setHours(next.getHours() + hours);
  return next;
}

function maxDate(first: Date | null, second: Date | null) {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return first.getTime() >= second.getTime() ? first : second;
}

function normalizeCurrentOwnershipMode(
  customer: Pick<OwnershipCustomerRecord, "ownerId" | "ownershipMode">,
) {
  if (!customer.ownerId) {
    return customer.ownershipMode === CustomerOwnershipMode.LOCKED
      ? CustomerOwnershipMode.LOCKED
      : CustomerOwnershipMode.PUBLIC;
  }

  return customer.ownershipMode === CustomerOwnershipMode.PUBLIC
    ? CustomerOwnershipMode.PRIVATE
    : customer.ownershipMode;
}

function isPublicPoolCustomer(
  customer: Pick<OwnershipCustomerRecord, "ownerId" | "ownershipMode">,
) {
  if (!customer.ownerId) {
    return true;
  }

  return (
    customer.ownershipMode === CustomerOwnershipMode.PUBLIC ||
    customer.ownershipMode === CustomerOwnershipMode.LOCKED
  );
}

function isProtectedCustomer(
  customer: Pick<OwnershipCustomerRecord, "claimLockedUntil">,
  now: Date,
) {
  return Boolean(
    customer.claimLockedUntil && customer.claimLockedUntil.getTime() > now.getTime(),
  );
}

function getResolvedPoolTeamId(customer: OwnershipCustomerRecord) {
  return customer.publicPoolTeamId ?? customer.owner?.teamId ?? customer.lastOwner?.teamId ?? null;
}

async function getResolvedPoolTeamIdForAssignmentTx(
  tx: TransactionClient,
  customer: OwnershipCustomerRecord,
  fallbackTeamId: string | null = null,
) {
  const directTeamId = getResolvedPoolTeamId(customer);

  if (directTeamId) {
    return directTeamId;
  }

  const latestScopedEvent = await tx.customerOwnershipEvent.findFirst({
    where: {
      customerId: customer.id,
      teamId: {
        not: null,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      teamId: true,
    },
  });

  return latestScopedEvent?.teamId ?? fallbackTeamId;
}

function getResolvedCustomerTeamId(input: {
  publicPoolTeamId?: string | null;
  owner?: { teamId: string | null } | null;
  lastOwner?: { teamId: string | null } | null;
}) {
  return input.publicPoolTeamId ?? input.owner?.teamId ?? input.lastOwner?.teamId ?? null;
}

function getDefaultClaimLockedUntil(baseAt: Date) {
  return addDays(baseAt, DEFAULT_CLAIM_PROTECTION_DAYS);
}

function applyTeamSettingToEffectMeta(
  meta: EffectiveFollowUpMeta,
  input: {
    strongEffectProtectionDays: number;
    mediumEffectProtectionDays: number;
    weakEffectResetsClock: boolean;
    negativeRequiresSupervisorReview: boolean;
  },
): EffectiveFollowUpMeta {
  if (meta.effectLevel === "STRONG") {
    return {
      ...meta,
      claimProtectionDays: input.strongEffectProtectionDays,
    };
  }

  if (meta.effectLevel === "MEDIUM") {
    return {
      ...meta,
      claimProtectionDays: input.mediumEffectProtectionDays,
    };
  }

  if (meta.effectLevel === "WEAK") {
    return {
      ...meta,
      resetsPublicPoolClock: input.weakEffectResetsClock,
      claimProtectionDays: 0,
    };
  }

  return {
    ...meta,
    requiresSupervisorReview: input.negativeRequiresSupervisorReview,
  };
}

function isExpiringSoon(lockedUntil: Date | null, now: Date) {
  if (!lockedUntil) {
    return false;
  }

  return lockedUntil.getTime() <= addHours(now, EXPIRING_SOON_HOURS).getTime();
}

export function getPublicPoolSegmentState(
  customer: OwnershipCustomerRecord,
  now = new Date(),
) {
  const claimable = isPublicPoolCustomer(customer) && !isProtectedCustomer(customer, now);

  return {
    claimable,
    locked: isPublicPoolCustomer(customer) && isProtectedCustomer(customer, now),
    expiringSoon: isPublicPoolCustomer(customer) && isExpiringSoon(customer.claimLockedUntil, now),
    currentMode: normalizeCurrentOwnershipMode(customer),
    poolTeamId: getResolvedPoolTeamId(customer),
  };
}

export async function getCustomerOwnershipActorContext(actorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
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
    throw new Error("Current user is unavailable.");
  }

  return {
    id: user.id,
    role: user.role.code,
    name: user.name,
    username: user.username,
    teamId: user.teamId,
  } satisfies OwnershipActorContext;
}

export async function getCustomerOwnershipActorContextTx(
  tx: TransactionClient,
  actorId: string,
) {
  const user = await tx.user.findUnique({
    where: { id: actorId },
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
    throw new Error("Current user is unavailable.");
  }

  return {
    id: user.id,
    role: user.role.code,
    name: user.name,
    username: user.username,
    teamId: user.teamId,
  } satisfies OwnershipActorContext;
}

export async function getAssignableSalesTarget(
  actor: OwnershipActorContext,
  userId: string,
) {
  const target = await prisma.user.findFirst({
    where: {
      id: userId,
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
  });

  if (!target) {
    throw new Error("Target sales user is unavailable.");
  }

  if (actor.role === "SUPERVISOR" && actor.teamId && target.teamId !== actor.teamId) {
    throw new Error("Supervisors can only assign to sales in the same team.");
  }

  return target satisfies OwnershipTargetSales;
}

async function getOwnershipCustomerTx(tx: TransactionClient, customerId: string) {
  await assertCustomerNotInActiveRecycleBin(
    tx,
    customerId,
    "当前客户已移入回收站，不能继续执行公海 / 归属链路动作。",
  );

  // 关键: 在 tx 内对目标客户行加 InnoDB 行锁, 把并发主管 assign / 销售 claim /
  // 主管 release / 系统 recycle 串行化. 没有这层锁时, 两个 tx 都用普通
  // findUnique 读到同一份 ownerId / claimLockedUntil 旧值, 都通过
  // isPublicPoolCustomer / isProtectedCustomer 守卫, 然后双双写 update +
  // OperationLog + CustomerOwnershipEvent — customer.ownerId 只能落一个,
  // 但审计链会留下两条相互矛盾的 before 快照和两条对不上库表真相的 ownership
  // event. 用 SELECT ... FOR UPDATE 让第二个 tx 阻塞直到第一个 tx 提交后,
  // 紧跟其后的 findUnique 才会读到真正最新的 ownerId / claimLockedUntil,
  // 守卫复算就会按事实拒绝抢占.
  await tx.$queryRaw`SELECT id FROM customer WHERE id = ${customerId} FOR UPDATE`;

  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: ownershipCustomerSelect,
  });

  if (!customer) {
    throw new Error("Customer is unavailable.");
  }

  return customer;
}

function assertActorCanAccessPoolCustomer(
  actor: OwnershipTransitionActorContext,
  customer: OwnershipCustomerRecord,
  resolvedPoolTeamId: string | null = getResolvedPoolTeamId(customer),
) {
  if (actor.role === "ADMIN") {
    return;
  }

  const poolTeamId = resolvedPoolTeamId;

  if (actor.role === "SYSTEM") {
    if (!actor.teamId || !poolTeamId || poolTeamId !== actor.teamId) {
      throw new Error("Customer is outside the current public-pool scope.");
    }

    return;
  }

  if (!actor.teamId || !poolTeamId || poolTeamId !== actor.teamId) {
    throw new Error("Customer is outside the current public-pool scope.");
  }
}

function assertActorCanManageOwnedCustomer(
  actor: OwnershipActorContext,
  customer: OwnershipCustomerRecord,
) {
  if (actor.role === "ADMIN") {
    return;
  }

  if (actor.role !== "SUPERVISOR") {
    throw new Error("Current role cannot manage customer ownership.");
  }

  if (!actor.teamId || customer.owner?.teamId !== actor.teamId) {
    throw new Error("Customer is outside the current team scope.");
  }
}

async function persistOwnershipTransitionTx(
  tx: TransactionClient,
  input: {
    customer: OwnershipCustomerRecord;
    actor: OwnershipTransitionActorContext;
    nextOwnerId: string | null;
    nextOwnershipMode: CustomerOwnershipMode;
    nextLastOwnerId: string | null;
    nextPublicPoolEnteredAt: Date | null;
    nextPublicPoolReason: PublicPoolReason | null;
    nextClaimLockedUntil: Date | null;
    nextPublicPoolTeamId: string | null;
    eventReason: CustomerOwnershipEventReason;
    note?: string | null;
    operationAction: string;
    operationDescription: string;
    operationMetadata?: Record<string, unknown> | null;
  },
) {
  const updated = await tx.customer.update({
    where: { id: input.customer.id },
    data: {
      ownerId: input.nextOwnerId,
      ownershipMode: input.nextOwnershipMode,
      lastOwnerId: input.nextLastOwnerId,
      publicPoolEnteredAt: input.nextPublicPoolEnteredAt,
      publicPoolReason: input.nextPublicPoolReason,
      claimLockedUntil: input.nextClaimLockedUntil,
      publicPoolTeamId: input.nextPublicPoolTeamId,
    },
    select: ownershipCustomerSelect,
  });

  const event = await tx.customerOwnershipEvent.create({
    data: {
      customerId: input.customer.id,
      fromOwnerId: input.customer.ownerId,
      toOwnerId: input.nextOwnerId,
      fromOwnershipMode: normalizeCurrentOwnershipMode(input.customer),
      toOwnershipMode: input.nextOwnershipMode,
      reason: input.eventReason,
      actorId: input.actor.id,
      teamId: input.nextPublicPoolTeamId ?? getResolvedPoolTeamId(input.customer),
      note: input.note ?? null,
      effectiveFollowUpAt: input.customer.lastEffectiveFollowUpAt,
      claimLockedUntil: input.nextClaimLockedUntil,
    },
    select: {
      id: true,
    },
  });

  await tx.operationLog.create({
    data: {
      actorId: input.actor.id,
      module: OperationModule.CUSTOMER,
      action: input.operationAction,
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.customer.id,
      description: input.operationDescription,
      beforeData: {
        ownerId: input.customer.ownerId,
        ownershipMode: normalizeCurrentOwnershipMode(input.customer),
        lastOwnerId: input.customer.lastOwnerId,
        publicPoolEnteredAt: input.customer.publicPoolEnteredAt,
        publicPoolReason: input.customer.publicPoolReason,
        claimLockedUntil: input.customer.claimLockedUntil,
        publicPoolTeamId: input.customer.publicPoolTeamId,
        ...(input.operationMetadata ?? {}),
      },
      afterData: {
        ownerId: updated.ownerId,
        ownershipMode: normalizeCurrentOwnershipMode(updated),
        lastOwnerId: updated.lastOwnerId,
        publicPoolEnteredAt: updated.publicPoolEnteredAt,
        publicPoolReason: updated.publicPoolReason,
        claimLockedUntil: updated.claimLockedUntil,
        publicPoolTeamId: updated.publicPoolTeamId,
        customerOwnershipEventId: event.id,
        reason: input.eventReason,
        ...(input.operationMetadata ?? {}),
      },
    },
  });

  return {
    customer: updated,
    eventId: event.id,
  };
}

export async function createInitialPublicOwnershipEventTx(
  tx: TransactionClient,
  input: {
    actorId: string;
    actorTeamId: string | null;
    customerId: string;
    note?: string | null;
  },
) {
  const customer = await getOwnershipCustomerTx(tx, input.customerId);
  const actor = await getCustomerOwnershipActorContextTx(tx, input.actorId);

  if (customer.ownerId) {
    return null;
  }

  const effectivePoolTeamId = customer.publicPoolTeamId ?? input.actorTeamId;

  return persistOwnershipTransitionTx(tx, {
    customer,
    actor,
    nextOwnerId: null,
    nextOwnershipMode: CustomerOwnershipMode.PUBLIC,
    nextLastOwnerId: customer.lastOwnerId,
    nextPublicPoolEnteredAt: customer.publicPoolEnteredAt ?? new Date(),
    nextPublicPoolReason: customer.publicPoolReason ?? PublicPoolReason.UNASSIGNED_IMPORT,
    nextClaimLockedUntil: null,
    nextPublicPoolTeamId: effectivePoolTeamId,
    eventReason: CustomerOwnershipEventReason.UNASSIGNED_IMPORT,
    note: input.note,
    operationAction: "customer.public_pool.entered_from_import",
    operationDescription: `Customer ${customer.name} entered the public pool from import.`,
  });
}

export async function assignCustomerToSalesTx(
  tx: TransactionClient,
  input: {
    actor: OwnershipTransitionActorContext;
    targetSales: OwnershipTargetSales;
    customerId: string;
    reason: CustomerOwnershipEventReason;
    note?: string | null;
    isBatch?: boolean;
    requireCurrentPublicPool?: boolean;
    claimLockedUntilOverride?: Date | null;
    fallbackPublicPoolTeamId?: string | null;
    operationAction?: string;
    operationDescription?: string;
    operationMetadata?: Record<string, unknown> | null;
  },
) {
  const customer = await getOwnershipCustomerTx(tx, input.customerId);
  const now = new Date();
  const currentIsPublicPoolCustomer = isPublicPoolCustomer(customer);
  const resolvedPoolTeamId = currentIsPublicPoolCustomer
    ? await getResolvedPoolTeamIdForAssignmentTx(
        tx,
        customer,
        input.fallbackPublicPoolTeamId ?? null,
      )
    : getResolvedPoolTeamId(customer);
  const teamSetting = await getResolvedTeamPublicPoolSetting(resolvedPoolTeamId, tx);

  if (currentIsPublicPoolCustomer) {
    assertActorCanAccessPoolCustomer(input.actor, customer, resolvedPoolTeamId);

    // 公海客户仍在 claim 保护期内时,只有 ADMIN 兜底可以指派 — 防止主管手动指派
    // 或 SYSTEM 自动分配在 preview->apply 的窗口里偷走刚被 SALES 自助 release
    // 又立即被另一名 SALES claim 走 (lock 重置) 的客户.
    if (isProtectedCustomer(customer, now) && input.actor.role !== "ADMIN") {
      throw new Error("Customer is still under claim protection.");
    }
  } else {
    if (input.requireCurrentPublicPool) {
      return null;
    }

    if (input.actor.role === "SYSTEM") {
      throw new Error("System auto-assign cannot reassign owned customers.");
    }

    assertActorCanManageOwnedCustomer(input.actor, customer);
  }

  if (input.isBatch && !teamSetting.batchAssignEnabled) {
    throw new Error("Batch assign is disabled by the current team public-pool rule.");
  }

  if (customer.ownerId === input.targetSales.id && !currentIsPublicPoolCustomer) {
    return null;
  }

  const operationAction =
    input.operationAction ??
    (currentIsPublicPoolCustomer
      ? "customer.public_pool.assigned"
      : "customer.owner.reassigned");
  const operationDescription =
    input.operationDescription ??
    (currentIsPublicPoolCustomer
      ? `Assigned ${customer.name} to ${input.targetSales.name} from the public pool.`
      : `Transferred ${customer.name} to ${input.targetSales.name}.`);

  return persistOwnershipTransitionTx(tx, {
    customer,
    actor: input.actor,
    nextOwnerId: input.targetSales.id,
    nextOwnershipMode: CustomerOwnershipMode.PRIVATE,
    nextLastOwnerId: input.targetSales.id,
    nextPublicPoolEnteredAt: null,
    nextPublicPoolReason: null,
    nextClaimLockedUntil:
      input.claimLockedUntilOverride === undefined
        ? getDefaultClaimLockedUntil(now)
        : input.claimLockedUntilOverride,
    nextPublicPoolTeamId:
      input.targetSales.teamId ?? resolvedPoolTeamId ?? input.actor.teamId,
    eventReason: input.reason,
    note: input.note,
    operationAction,
    operationDescription,
    operationMetadata: input.operationMetadata,
  });
}

// 指派/认领冷却: 该销售在冷却窗口内是否拨打过这位客户. 用于防止"昨天拨了 5 遍
// 未接通回流公海, 今天又落回同一个人手里"的循环.
export async function hasRecentCallFromSalesTx(
  tx: TransactionClient,
  input: {
    customerId: string;
    salesId: string;
    now: Date;
  },
) {
  const cooldownStart = new Date(
    input.now.getTime() - PUBLIC_POOL_RECLAIM_COOLDOWN_HOURS * 60 * 60 * 1000,
  );
  const recentCall = await tx.callRecord.findFirst({
    where: {
      customerId: input.customerId,
      salesId: input.salesId,
      callTime: {
        gte: cooldownStart,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(recentCall);
}

export async function claimPublicPoolCustomerTx(
  tx: TransactionClient,
  input: {
    actor: OwnershipActorContext;
    customerId: string;
    note?: string | null;
  },
) {
  if (input.actor.role !== "SALES") {
    throw new Error("Only sales can claim public-pool customers.");
  }

  const customer = await getOwnershipCustomerTx(tx, input.customerId);
  const now = new Date();
  const teamSetting = await getResolvedTeamPublicPoolSetting(
    getResolvedPoolTeamId(customer),
    tx,
  );

  if (!isPublicPoolCustomer(customer)) {
    throw new Error("Customer is not in the public pool.");
  }

  assertActorCanAccessPoolCustomer(input.actor, customer);

  if (!teamSetting.salesCanClaim) {
    throw new Error("Sales claim is disabled by the current team public-pool rule.");
  }

  if (isProtectedCustomer(customer, now)) {
    throw new Error("Customer is currently protected and cannot be claimed.");
  }

  if (
    await hasRecentCallFromSalesTx(tx, {
      customerId: customer.id,
      salesId: input.actor.id,
      now,
    })
  ) {
    throw new Error(
      `您在 ${PUBLIC_POOL_RECLAIM_COOLDOWN_HOURS} 小时内拨打过该客户，冷却期内不能认领。`,
    );
  }

  return persistOwnershipTransitionTx(tx, {
    customer,
    actor: input.actor,
    nextOwnerId: input.actor.id,
    nextOwnershipMode: CustomerOwnershipMode.PRIVATE,
    nextLastOwnerId: input.actor.id,
    nextPublicPoolEnteredAt: null,
    nextPublicPoolReason: null,
    nextClaimLockedUntil: getDefaultClaimLockedUntil(now),
    nextPublicPoolTeamId: input.actor.teamId,
    eventReason: CustomerOwnershipEventReason.SALES_CLAIM,
    note: input.note,
    operationAction: "customer.public_pool.claimed",
    operationDescription: `Claimed ${customer.name} from the public pool.`,
  });
}

export async function releaseCustomerToPublicPoolTx(
  tx: TransactionClient,
  input: {
    actor: OwnershipActorContext;
    customerId: string;
    reason: PublicPoolReason;
    note?: string | null;
    isBatch?: boolean;
  },
) {
  const customer = await getOwnershipCustomerTx(tx, input.customerId);
  const now = new Date();
  const teamSetting = await getResolvedTeamPublicPoolSetting(
    getResolvedPoolTeamId(customer),
    tx,
  );

  if (!customer.ownerId) {
    return null;
  }

  if (input.actor.role === "SALES") {
    if (!teamSetting.salesCanRelease) {
      throw new Error("Sales release is disabled by the current team public-pool rule.");
    }

    if (customer.ownerId !== input.actor.id) {
      throw new Error("Sales can only release their own customers.");
    }
  } else {
    assertActorCanManageOwnedCustomer(input.actor, customer);
  }

  if (input.isBatch && !teamSetting.batchRecycleEnabled) {
    throw new Error("Batch recycle is disabled by the current team public-pool rule.");
  }

  // 未接通回流是主管在分配次日的例行动作 — 客户被指派时自带 2 天 claim-lock,
  // 不放行的话, 昨天刚分出去的未接通客户永远回不了公海. 仅该原因对 SUPERVISOR 放行.
  const canBypassClaimLock =
    input.actor.role === "ADMIN" ||
    (input.actor.role === "SUPERVISOR" &&
      input.reason === PublicPoolReason.UNREACHABLE_RECYCLE);

  if (!canBypassClaimLock && isProtectedCustomer(customer, now)) {
    throw new Error("Customer is still under claim protection.");
  }

  return persistOwnershipTransitionTx(tx, {
    customer,
    actor: input.actor,
    nextOwnerId: null,
    nextOwnershipMode: CustomerOwnershipMode.PUBLIC,
    nextLastOwnerId: customer.ownerId,
    nextPublicPoolEnteredAt: now,
    nextPublicPoolReason: input.reason,
    nextClaimLockedUntil: null,
    nextPublicPoolTeamId: customer.owner?.teamId ?? input.actor.teamId,
    eventReason: input.reason,
    note: input.note,
    operationAction:
      input.reason === PublicPoolReason.MANUAL_RELEASE
        ? "customer.public_pool.released"
        : "customer.public_pool.recycled",
    operationDescription:
      input.reason === PublicPoolReason.MANUAL_RELEASE
        ? `Released ${customer.name} into the public pool.`
        : `Recycled ${customer.name} into the public pool.`,
  });
}

export async function recycleCustomerToPublicPoolTx(
  tx: TransactionClient,
  input: {
    actor: OwnershipTransitionActorContext;
    customerId: string;
    reason: PublicPoolReason;
    note?: string | null;
    expectedOwnerId?: string | null;
    respectClaimProtection?: boolean;
    enforceActorScope?: boolean;
    operationAction?: string;
    operationDescription?: string;
  },
) {
  const customer = await getOwnershipCustomerTx(tx, input.customerId);
  const now = new Date();

  if (!customer.ownerId || isPublicPoolCustomer(customer)) {
    return null;
  }

  if (input.expectedOwnerId && customer.ownerId !== input.expectedOwnerId) {
    return null;
  }

  if (input.enforceActorScope ?? input.actor.role !== "SYSTEM") {
    if (input.actor.role === "SYSTEM") {
      throw new Error("System actor cannot enforce manual ownership scope.");
    }

    assertActorCanManageOwnedCustomer(input.actor, customer);
  }

  if ((input.respectClaimProtection ?? true) && isProtectedCustomer(customer, now)) {
    throw new Error("Customer is still under claim protection.");
  }

  // 回退链顺序: 当前 publicPoolTeamId -> 当前 owner.teamId -> lastOwner.teamId ->
  // 历史 customerOwnershipEvent.teamId (吸收 lastOwner 已被硬删的场景) ->
  // actor.teamId. 用 ForAssignmentTx 帮助函数复用历史事件兜底逻辑.
  // 若全部为 null (例: SYSTEM 全局 cron sweep + lastOwner 硬删 + 历史无 teamId 事件),
  // 不能继续写 null — 否则客户会成为 "team-less 公海" 孤儿: SUPERVISOR/SALES 看不见 (queries.ts:1182),
  // auto-assign 也跳过 (public-pool-auto-assign.ts:441), 审计事件 teamId 也丢失溯源 (ownership.ts:482).
  // 此时保留原 customer.publicPoolTeamId (即使仍 null) 不如直接 throw 让上游决策路径吃异常 —
  // public-pool-recycle.ts:classifyApplyError 会把该错误归类为 failed/skipped 写回 report,
  // 不会污染 publicPoolTeamId 字段.
  const resolvedNextPublicPoolTeamId = await getResolvedPoolTeamIdForAssignmentTx(
    tx,
    customer,
    input.actor.teamId,
  );

  if (resolvedNextPublicPoolTeamId === null) {
    console.warn(
      `[recycleCustomerToPublicPoolTx] cannot resolve nextPublicPoolTeamId for customer ${customer.id}; ` +
        `publicPoolTeamId=${customer.publicPoolTeamId}, owner.teamId=${customer.owner?.teamId ?? null}, ` +
        `lastOwner.teamId=${customer.lastOwner?.teamId ?? null}, actor.teamId=${input.actor.teamId}, ` +
        `actor.role=${input.actor.role}. Recycle aborted to avoid creating a team-less public-pool orphan.`,
    );
    throw new Error(
      "Cannot recycle customer: no team scope available for the resulting public-pool customer.",
    );
  }

  const nextPublicPoolTeamId = resolvedNextPublicPoolTeamId;
  const operationAction =
    input.operationAction ??
    (input.reason === PublicPoolReason.OWNER_LEFT_TEAM
      ? "customer.public_pool.owner_exit_recycled"
      : "customer.public_pool.auto_recycled");
  const operationDescription =
    input.operationDescription ??
    (input.reason === PublicPoolReason.OWNER_LEFT_TEAM
      ? `Recycled ${customer.name} into the public pool because the owner lost eligibility.`
      : `Recycled ${customer.name} into the public pool because the customer became inactive.`);

  return persistOwnershipTransitionTx(tx, {
    customer,
    actor: input.actor,
    nextOwnerId: null,
    nextOwnershipMode: CustomerOwnershipMode.PUBLIC,
    nextLastOwnerId: customer.ownerId,
    nextPublicPoolEnteredAt: now,
    nextPublicPoolReason: input.reason,
    nextClaimLockedUntil: null,
    nextPublicPoolTeamId,
    eventReason: input.reason,
    note: input.note,
    operationAction,
    operationDescription,
  });
}

export async function claimPublicPoolCustomers(
  actorId: string,
  input: {
    customerIds: string[];
    note?: string | null;
  },
) {
  const actor = await getCustomerOwnershipActorContext(actorId);
  const customerIds = [...new Set(input.customerIds)];
  let successCount = 0;
  const skipped: Array<{ customerId: string; reason: string }> = [];

  for (const customerId of customerIds) {
    try {
      await prisma.$transaction((tx) =>
        claimPublicPoolCustomerTx(tx, {
          actor,
          customerId,
          note: input.note,
        }),
      );
      successCount += 1;
    } catch (error) {
      skipped.push({
        customerId,
        reason: error instanceof Error ? error.message : "Claim failed.",
      });
    }
  }

  return {
    successCount,
    skipped,
  };
}

export async function assignCustomersToSales(
  actorId: string,
  input: {
    customerIds: string[];
    targetSalesId: string;
    note?: string | null;
    reason?: CustomerOwnershipEventReason;
  },
) {
  const actor = await getCustomerOwnershipActorContext(actorId);
  const targetSales = await getAssignableSalesTarget(actor, input.targetSalesId);
  const customerIds = [...new Set(input.customerIds)];
  const isBatch = customerIds.length > 1;
  let successCount = 0;
  const skipped: Array<{ customerId: string; reason: string }> = [];

  for (const customerId of customerIds) {
    try {
      await prisma.$transaction((tx) =>
        assignCustomerToSalesTx(tx, {
          actor,
          targetSales,
          customerId,
          reason: input.reason ?? CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
          note: input.note,
          isBatch,
        }),
      );
      successCount += 1;
    } catch (error) {
      skipped.push({
        customerId,
        reason: error instanceof Error ? error.message : "Assignment failed.",
      });
    }
  }

  return {
    successCount,
    skipped,
  };
}

export async function releaseCustomersToPublicPool(
  actorId: string,
  input: {
    customerIds: string[];
    reason: PublicPoolReason;
    note?: string | null;
  },
) {
  const actor = await getCustomerOwnershipActorContext(actorId);
  const customerIds = [...new Set(input.customerIds)];
  const isBatch = customerIds.length > 1;
  let successCount = 0;
  const skipped: Array<{ customerId: string; reason: string }> = [];

  for (const customerId of customerIds) {
    try {
      const result = await prisma.$transaction((tx) =>
        releaseCustomerToPublicPoolTx(tx, {
          actor,
          customerId,
          reason: input.reason,
          note: input.note,
          isBatch,
        }),
      );

      if (result) {
        successCount += 1;
      } else {
        skipped.push({
          customerId,
          reason: "Customer is already public.",
        });
      }
    } catch (error) {
      skipped.push({
        customerId,
        reason: error instanceof Error ? error.message : "Recycle failed.",
      });
    }
  }

  return {
    successCount,
    skipped,
  };
}

export async function touchCustomerEffectiveFollowUpTx(
  tx: TransactionClient,
  input: {
    customerId: string | null | undefined;
    occurredAt: Date;
    meta: EffectiveFollowUpMeta;
  },
) {
  if (!input.customerId) {
    return null;
  }

  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      ownerId: true,
      publicPoolTeamId: true,
      claimLockedUntil: true,
      lastEffectiveFollowUpAt: true,
      owner: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!customer) {
    return null;
  }

  const teamSetting = await getResolvedTeamPublicPoolSetting(
    getResolvedCustomerTeamId(customer),
    tx,
  );
  const resolvedMeta = applyTeamSettingToEffectMeta(input.meta, teamSetting);

  const nextEffectiveFollowUpAt = resolvedMeta.resetsPublicPoolClock
    ? maxDate(customer.lastEffectiveFollowUpAt, input.occurredAt)
    : customer.lastEffectiveFollowUpAt;
  const nextClaimLockedUntil =
    customer.ownerId && resolvedMeta.claimProtectionDays > 0
      ? maxDate(
          customer.claimLockedUntil,
          addDays(input.occurredAt, resolvedMeta.claimProtectionDays),
        )
      : customer.claimLockedUntil;

  if (
    nextEffectiveFollowUpAt?.getTime() === customer.lastEffectiveFollowUpAt?.getTime() &&
    nextClaimLockedUntil?.getTime() === customer.claimLockedUntil?.getTime()
  ) {
    return null;
  }

  return tx.customer.update({
    where: { id: customer.id },
    data: {
      lastEffectiveFollowUpAt: nextEffectiveFollowUpAt,
      claimLockedUntil: nextClaimLockedUntil,
    },
    select: {
      id: true,
      lastEffectiveFollowUpAt: true,
      claimLockedUntil: true,
    },
  });
}

export async function touchCustomerEffectiveFollowUpFromWechatTx(
  tx: TransactionClient,
  input: {
    customerId: string | null | undefined;
    occurredAt: Date;
    addedStatus: WechatAddStatus;
  },
) {
  return touchCustomerEffectiveFollowUpTx(tx, {
    customerId: input.customerId,
    occurredAt: input.occurredAt,
    meta: getWechatAddedStatusEffectMeta(input.addedStatus),
  });
}

export function getLiveInvitationEffectMeta(input: {
  attended: boolean;
  attendanceStatus: AttendanceStatus;
  watchDurationMinutes: number;
  giftQualified: boolean;
}) {
  if (
    input.attended ||
    input.attendanceStatus === AttendanceStatus.ATTENDED ||
    input.watchDurationMinutes > 0 ||
    input.giftQualified
  ) {
    return liveAttendanceEffectMeta;
  }

  return liveInvitationEffectMeta;
}

export async function touchCustomerEffectiveFollowUpFromLiveInvitationTx(
  tx: TransactionClient,
  input: {
    customerId: string | null | undefined;
    occurredAt: Date;
    attended: boolean;
    attendanceStatus: AttendanceStatus;
    watchDurationMinutes: number;
    giftQualified: boolean;
  },
) {
  return touchCustomerEffectiveFollowUpTx(tx, {
    customerId: input.customerId,
    occurredAt: input.occurredAt,
    meta: getLiveInvitationEffectMeta(input),
  });
}

export function getTradeOrderProgressEffectMeta() {
  return tradeOrderProgressEffectMeta;
}

export async function touchCustomerEffectiveFollowUpFromTradeOrderTx(
  tx: TransactionClient,
  input: {
    customerId: string | null | undefined;
    occurredAt: Date;
  },
) {
  return touchCustomerEffectiveFollowUpTx(tx, {
    customerId: input.customerId,
    occurredAt: input.occurredAt,
    meta: getTradeOrderProgressEffectMeta(),
  });
}
