import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  findHiddenRecycleEntry,
  findHiddenTargetIds,
} from "@/lib/recycle-bin/repository";
import type { RecycleLifecycleActor } from "@/lib/recycle-bin/types";

type CustomerRecycleDbClient = typeof prisma | Prisma.TransactionClient;

export const ACTIVE_CUSTOMER_RECYCLE_ERROR =
  "当前客户已进入回收/封存生命周期，不能继续写入；如需继续操作请先恢复。";

export const CUSTOMER_RECYCLE_REASON_OPTIONS = [
  { value: "mistaken_creation", label: "误建轻客户" },
  { value: "test_data", label: "测试数据" },
  { value: "duplicate", label: "重复创建" },
  { value: "no_longer_needed", label: "已不需要" },
  { value: "other", label: "其他" },
] as const;

export type CustomerRecycleReasonCode =
  (typeof CUSTOMER_RECYCLE_REASON_OPTIONS)[number]["value"];

export type CustomerRecycleScopeActor = RecycleLifecycleActor & {
  teamId: string | null;
};

export type CustomerRecycleSnapshot = {
  phone: string | null;
  status: string | null;
  level: string | null;
  ownershipMode: string | null;
  ownerId: string | null;
  ownerLabel: string | null;
  ownerTeamId: string | null;
  lastEffectiveFollowUpAt: string | null;
  approvedTradeOrderCount: number;
  linkedLeadCount: number;
};

export async function findActiveCustomerRecycleEntry(
  db: CustomerRecycleDbClient,
  customerId: string,
) {
  return findHiddenRecycleEntry(db, "CUSTOMER", customerId);
}

export async function listActiveCustomerIds(db: CustomerRecycleDbClient) {
  return findHiddenTargetIds(db, "CUSTOMER");
}

export async function assertCustomerNotInActiveRecycleBin(
  db: CustomerRecycleDbClient,
  customerId: string,
  message = ACTIVE_CUSTOMER_RECYCLE_ERROR,
) {
  const entry = await findActiveCustomerRecycleEntry(db, customerId);

  if (entry) {
    throw new Error(message);
  }

  return entry;
}

export async function getCustomerRecycleScopeActor(
  db: CustomerRecycleDbClient,
  actor: RecycleLifecycleActor,
): Promise<CustomerRecycleScopeActor> {
  const user = await db.user.findUnique({
    where: { id: actor.id },
    select: { teamId: true },
  });

  return {
    ...actor,
    teamId: user?.teamId ?? null,
  };
}

export function parseCustomerRecycleSnapshot(
  value: unknown,
): CustomerRecycleSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const snapshot = value as Record<string, unknown>;

  return {
    phone: typeof snapshot.phone === "string" ? snapshot.phone : null,
    status: typeof snapshot.status === "string" ? snapshot.status : null,
    level: typeof snapshot.level === "string" ? snapshot.level : null,
    ownershipMode:
      typeof snapshot.ownershipMode === "string" ? snapshot.ownershipMode : null,
    ownerId: typeof snapshot.ownerId === "string" ? snapshot.ownerId : null,
    ownerLabel:
      typeof snapshot.ownerLabel === "string" ? snapshot.ownerLabel : null,
    ownerTeamId:
      typeof snapshot.ownerTeamId === "string" ? snapshot.ownerTeamId : null,
    lastEffectiveFollowUpAt:
      typeof snapshot.lastEffectiveFollowUpAt === "string"
        ? snapshot.lastEffectiveFollowUpAt
        : null,
    approvedTradeOrderCount:
      typeof snapshot.approvedTradeOrderCount === "number"
        ? snapshot.approvedTradeOrderCount
        : 0,
    linkedLeadCount:
      typeof snapshot.linkedLeadCount === "number" ? snapshot.linkedLeadCount : 0,
  };
}

export function canActorAccessCustomerRecycleTarget(
  actor: Pick<CustomerRecycleScopeActor, "id" | "role" | "teamId">,
  input: {
    ownerId: string | null;
    ownerTeamId: string | null;
  },
) {
  if (actor.role === "ADMIN") {
    return true;
  }

  if (actor.role === "SUPERVISOR") {
    return Boolean(actor.teamId && input.ownerTeamId && input.ownerTeamId === actor.teamId);
  }

  if (actor.role === "SALES") {
    return input.ownerId === actor.id;
  }

  return false;
}

export async function assertActorCanAccessCustomerRecycleTarget(
  db: CustomerRecycleDbClient,
  actor: RecycleLifecycleActor,
  input: {
    customerId: string;
    snapshotJson?: unknown;
  },
) {
  const scopeActor = await getCustomerRecycleScopeActor(db, actor);
  const currentCustomer = await db.customer.findUnique({
    where: { id: input.customerId },
    select: {
      ownerId: true,
      owner: {
        select: {
          teamId: true,
        },
      },
    },
  });
  const snapshot = parseCustomerRecycleSnapshot(input.snapshotJson);
  const ownerId = currentCustomer?.ownerId ?? snapshot?.ownerId ?? null;
  const ownerTeamId =
    currentCustomer?.owner?.teamId ?? snapshot?.ownerTeamId ?? null;

  if (
    !canActorAccessCustomerRecycleTarget(scopeActor, {
      ownerId,
      ownerTeamId,
    })
  ) {
    throw new Error("当前客户不存在，或已不在你的客户范围内。");
  }

  return scopeActor;
}

export async function listVisibleCustomerRecycleTargetIds(
  db: CustomerRecycleDbClient,
  actor: RecycleLifecycleActor,
  activeEntries: Array<{
    targetId: string;
    blockerSnapshotJson: unknown;
  }>,
) {
  const scopeActor = await getCustomerRecycleScopeActor(db, actor);

  if (scopeActor.role === "ADMIN") {
    return new Set(activeEntries.map((entry) => entry.targetId));
  }

  const targetIds = [...new Set(activeEntries.map((entry) => entry.targetId))];

  if (targetIds.length === 0) {
    return new Set<string>();
  }

  const customers = await db.customer.findMany({
    where: {
      id: {
        in: targetIds,
      },
    },
    select: {
      id: true,
      ownerId: true,
      owner: {
        select: {
          teamId: true,
        },
      },
    },
  });

  const currentById = new Map(
    customers.map((customer) => [
      customer.id,
      {
        ownerId: customer.ownerId,
        ownerTeamId: customer.owner?.teamId ?? null,
      },
    ]),
  );

  return new Set(
    activeEntries
      .filter((entry) => {
        const current = currentById.get(entry.targetId);
        const snapshot = parseCustomerRecycleSnapshot(entry.blockerSnapshotJson);

        return canActorAccessCustomerRecycleTarget(scopeActor, {
          ownerId: current?.ownerId ?? snapshot?.ownerId ?? null,
          ownerTeamId: current?.ownerTeamId ?? snapshot?.ownerTeamId ?? null,
        });
      })
      .map((entry) => entry.targetId),
  );
}
