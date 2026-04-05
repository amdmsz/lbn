import {
  AttendanceStatus,
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  OperationModule,
  OperationTargetType,
  PublicPoolReason,
  UserStatus,
  type CallResult,
  type Prisma,
  type RoleCode,
  type WechatAddStatus,
} from "@prisma/client";
import {
  getCallResultEffectMeta,
  type FollowUpEffectLevel,
} from "@/lib/calls/metadata";
import { prisma } from "@/lib/db/prisma";
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
  effectLevel: FollowUpEffectLevel;
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
) {
  if (actor.role === "ADMIN") {
    return;
  }

  const poolTeamId = getResolvedPoolTeamId(customer);

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
    operationAction?: string;
    operationDescription?: string;
    operationMetadata?: Record<string, unknown> | null;
  },
) {
  const customer = await getOwnershipCustomerTx(tx, input.customerId);
  const now = new Date();
  const teamSetting = await getResolvedTeamPublicPoolSetting(
    getResolvedPoolTeamId(customer),
    tx,
  );

  if (isPublicPoolCustomer(customer)) {
    assertActorCanAccessPoolCustomer(input.actor, customer);
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

  if (customer.ownerId === input.targetSales.id && !isPublicPoolCustomer(customer)) {
    return null;
  }

  const operationAction =
    input.operationAction ??
    (isPublicPoolCustomer(customer)
      ? "customer.public_pool.assigned"
      : "customer.owner.reassigned");
  const operationDescription =
    input.operationDescription ??
    (isPublicPoolCustomer(customer)
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
    nextPublicPoolTeamId: input.targetSales.teamId ?? input.actor.teamId,
    eventReason: input.reason,
    note: input.note,
    operationAction,
    operationDescription,
    operationMetadata: input.operationMetadata,
  });
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

  if (input.actor.role !== "ADMIN" && isProtectedCustomer(customer, now)) {
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

  const nextPublicPoolTeamId =
    customer.publicPoolTeamId ?? customer.owner?.teamId ?? customer.lastOwner?.teamId ?? input.actor.teamId;
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

export async function touchCustomerEffectiveFollowUpFromCallTx(
  tx: TransactionClient,
  input: {
    customerId: string | null | undefined;
    occurredAt: Date;
    result: CallResult;
  },
) {
  return touchCustomerEffectiveFollowUpTx(tx, {
    customerId: input.customerId,
    occurredAt: input.occurredAt,
    meta: getCallResultEffectMeta(input.result),
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
