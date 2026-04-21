import {
  Prisma,
  RecycleEntryStatus,
  type RecycleBinEntry,
  type RecycleTargetType,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  findRecycleEntryByStatuses,
  findTargetIdsByStatuses,
} from "@/lib/recycle-bin/repository";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

export const PRODUCT_DOMAIN_CURRENTLY_HIDDEN_RECYCLE_STATUSES = [
  RecycleEntryStatus.ACTIVE,
  RecycleEntryStatus.ARCHIVED,
] as const;

export async function findProductDomainCurrentlyHiddenTargetIds(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
) {
  return findTargetIdsByStatuses(
    db,
    targetType,
    PRODUCT_DOMAIN_CURRENTLY_HIDDEN_RECYCLE_STATUSES,
  );
}

export async function findProductDomainCurrentlyHiddenEntry(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
): Promise<RecycleBinEntry | null> {
  return findRecycleEntryByStatuses(
    db,
    targetType,
    targetId,
    PRODUCT_DOMAIN_CURRENTLY_HIDDEN_RECYCLE_STATUSES,
  );
}
