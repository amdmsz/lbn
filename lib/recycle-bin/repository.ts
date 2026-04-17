import {
  Prisma,
  RecycleEntryStatus,
  type RecycleDomain,
  type RecycleBinEntry,
  type RecycleDeleteReasonCode,
  type RecycleTargetType,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

export const HIDDEN_RECYCLE_ENTRY_STATUSES = [
  RecycleEntryStatus.ACTIVE,
  RecycleEntryStatus.ARCHIVED,
] as const;

export function buildActiveRecycleEntryKey(
  targetType: RecycleTargetType,
  targetId: string,
) {
  return `${targetType}:${targetId}`;
}

export async function findActiveRecycleEntry(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
) {
  return db.recycleBinEntry.findFirst({
    where: {
      targetType,
      targetId,
      status: RecycleEntryStatus.ACTIVE,
    },
  });
}

export async function findRecycleEntryByStatuses(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
  statuses: readonly RecycleEntryStatus[],
) {
  return db.recycleBinEntry.findFirst({
    where: {
      targetType,
      targetId,
      status: {
        in: [...statuses],
      },
    },
  });
}

export async function findHiddenRecycleEntry(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
) {
  return findRecycleEntryByStatuses(
    db,
    targetType,
    targetId,
    HIDDEN_RECYCLE_ENTRY_STATUSES,
  );
}

export async function findRecycleEntryById(db: RecycleDbClient, entryId: string) {
  return db.recycleBinEntry.findUnique({
    where: {
      id: entryId,
    },
  });
}

export async function findActiveTargetIds(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
) {
  return findTargetIdsByStatuses(db, targetType, [RecycleEntryStatus.ACTIVE]);
}

export async function findTargetIdsByStatuses(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  statuses: readonly RecycleEntryStatus[],
) {
  const rows = await db.recycleBinEntry.findMany({
    where: {
      targetType,
      status: {
        in: [...statuses],
      },
    },
    select: {
      targetId: true,
    },
  });

  return rows.map((row) => row.targetId);
}

export async function findHiddenTargetIds(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
) {
  return findTargetIdsByStatuses(db, targetType, HIDDEN_RECYCLE_ENTRY_STATUSES);
}

export async function findActiveRecycleEntriesByTargetIds(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetIds: string[],
) {
  return findRecycleEntriesByTargetIdsAndStatuses(
    db,
    targetType,
    targetIds,
    [RecycleEntryStatus.ACTIVE],
  );
}

export async function findRecycleEntriesByTargetIdsAndStatuses(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetIds: string[],
  statuses: readonly RecycleEntryStatus[],
) {
  if (targetIds.length === 0) {
    return [];
  }

  return db.recycleBinEntry.findMany({
    where: {
      targetType,
      targetId: {
        in: targetIds,
      },
      status: {
        in: [...statuses],
      },
    },
    select: {
      id: true,
      targetId: true,
    },
  });
}

export async function findHiddenRecycleEntriesByTargetIds(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetIds: string[],
) {
  return findRecycleEntriesByTargetIdsAndStatuses(
    db,
    targetType,
    targetIds,
    HIDDEN_RECYCLE_ENTRY_STATUSES,
  );
}

export async function countActiveRecycleEntries(
  db: RecycleDbClient,
  input?: {
    domain?: RecycleDomain;
  },
) {
  return countRecycleEntries(db, {
    domain: input?.domain,
    statuses: [RecycleEntryStatus.ACTIVE],
  });
}

export async function listActiveRecycleEntries(
  db: RecycleDbClient,
  input?: {
    domain?: RecycleDomain;
  },
) {
  return listRecycleEntries(db, {
    domain: input?.domain,
    statuses: [RecycleEntryStatus.ACTIVE],
  });
}

export async function countRecycleEntries(
  db: RecycleDbClient,
  input?: {
    domain?: RecycleDomain;
    statuses?: readonly RecycleEntryStatus[];
  },
) {
  return db.recycleBinEntry.count({
    where: {
      domain: input?.domain,
      status: input?.statuses?.length
        ? {
            in: [...input.statuses],
          }
        : undefined,
    },
  });
}

export async function listRecycleEntries(
  db: RecycleDbClient,
  input?: {
    domain?: RecycleDomain;
    statuses?: readonly RecycleEntryStatus[];
  },
) {
  return db.recycleBinEntry.findMany({
    where: {
      domain: input?.domain,
      status: input?.statuses?.length
        ? {
            in: [...input.statuses],
          }
        : undefined,
    },
    include: {
      deletedBy: {
        select: {
          name: true,
          username: true,
        },
      },
      resolvedBy: {
        select: {
          name: true,
          username: true,
        },
      },
    },
    orderBy: [
      {
        resolvedAt: "desc",
      },
      {
        deletedAt: "desc",
      },
    ],
  });
}

export async function listExpiredActiveRecycleEntries(
  db: RecycleDbClient,
  input?: {
    domain?: RecycleDomain;
    limit?: number;
    now?: Date;
  },
) {
  return db.recycleBinEntry.findMany({
    where: {
      status: RecycleEntryStatus.ACTIVE,
      domain: input?.domain,
      recycleExpiresAt: {
        lte: input?.now ?? new Date(),
      },
    },
    orderBy: [
      {
        recycleExpiresAt: "asc",
      },
      {
        deletedAt: "asc",
      },
    ],
    take: input?.limit,
  });
}

export async function countExpiredActiveRecycleEntries(
  db: RecycleDbClient,
  input?: {
    domain?: RecycleDomain;
    now?: Date;
  },
) {
  return db.recycleBinEntry.count({
    where: {
      status: RecycleEntryStatus.ACTIVE,
      domain: input?.domain,
      recycleExpiresAt: {
        lte: input?.now ?? new Date(),
      },
    },
  });
}

export async function createActiveRecycleEntry(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
    titleSnapshot: string;
    secondarySnapshot?: string | null;
    originalStatusSnapshot?: string | null;
    restoreRouteSnapshot: string;
    deleteReasonCode: RecycleDeleteReasonCode;
    deleteReasonText?: string | null;
    deletedById: string;
    recycleExpiresAt: Date;
    blockerSnapshotJson?: unknown;
  },
) {
  return db.recycleBinEntry.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      domain: input.domain,
      titleSnapshot: input.titleSnapshot,
      secondarySnapshot: input.secondarySnapshot ?? null,
      originalStatusSnapshot: input.originalStatusSnapshot ?? null,
      restoreRouteSnapshot: input.restoreRouteSnapshot,
      deleteReasonCode: input.deleteReasonCode,
      deleteReasonText: input.deleteReasonText ?? null,
      deletedById: input.deletedById,
      recycleExpiresAt: input.recycleExpiresAt,
      status: RecycleEntryStatus.ACTIVE,
      activeEntryKey: buildActiveRecycleEntryKey(input.targetType, input.targetId),
      blockerSnapshotJson:
        input.blockerSnapshotJson === undefined
          ? Prisma.JsonNull
          : (input.blockerSnapshotJson as Prisma.InputJsonValue),
    },
  });
}

export async function resolveRecycleEntryAsRestored(
  db: RecycleDbClient,
  input: {
    entryId: string;
    resolvedById: string;
  },
) {
  return db.recycleBinEntry.update({
    where: {
      id: input.entryId,
    },
    data: {
      status: RecycleEntryStatus.RESTORED,
      activeEntryKey: null,
      resolvedAt: new Date(),
      resolvedById: input.resolvedById,
    },
  });
}

export async function resolveRecycleEntryAsPurged(
  db: RecycleDbClient,
  input: {
    entryId: string;
    resolvedById: string;
  },
) {
  return db.recycleBinEntry.update({
    where: {
      id: input.entryId,
    },
    data: {
      status: RecycleEntryStatus.PURGED,
      activeEntryKey: null,
      resolvedAt: new Date(),
      resolvedById: input.resolvedById,
    },
  });
}

export async function resolveRecycleEntryAsArchived(
  db: RecycleDbClient,
  input: {
    entryId: string;
    resolvedById: string;
    archivePayloadJson: unknown;
  },
) {
  return db.recycleBinEntry.update({
    where: {
      id: input.entryId,
    },
    data: {
      status: RecycleEntryStatus.ARCHIVED,
      activeEntryKey: null,
      resolvedAt: new Date(),
      resolvedById: input.resolvedById,
      archivePayloadJson:
        input.archivePayloadJson === undefined
          ? Prisma.JsonNull
          : (input.archivePayloadJson as Prisma.InputJsonValue),
    },
  });
}

export function isRecycleEntryUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function isActiveRecycleEntry(entry: Pick<RecycleBinEntry, "status"> | null) {
  return entry?.status === RecycleEntryStatus.ACTIVE;
}

export function isHiddenRecycleEntry(entry: Pick<RecycleBinEntry, "status"> | null) {
  return Boolean(
    entry &&
      HIDDEN_RECYCLE_ENTRY_STATUSES.includes(
        entry.status as (typeof HIDDEN_RECYCLE_ENTRY_STATUSES)[number],
      ),
  );
}
