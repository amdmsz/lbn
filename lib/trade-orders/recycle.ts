import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  findHiddenRecycleEntry,
  findHiddenTargetIds,
} from "@/lib/recycle-bin/repository";

type TradeOrderRecycleDbClient = typeof prisma | Prisma.TransactionClient;

export const ACTIVE_TRADE_ORDER_RECYCLE_ERROR =
  "当前成交主单已进入回收站，请先恢复后再继续操作。";

export async function findActiveTradeOrderRecycleEntry(
  db: TradeOrderRecycleDbClient,
  tradeOrderId: string,
) {
  return findHiddenRecycleEntry(db, "TRADE_ORDER", tradeOrderId);
}

export async function listActiveTradeOrderIds(db: TradeOrderRecycleDbClient) {
  return findHiddenTargetIds(db, "TRADE_ORDER");
}

export async function assertTradeOrderNotInActiveRecycleBin(
  db: TradeOrderRecycleDbClient,
  tradeOrderId: string,
  message = ACTIVE_TRADE_ORDER_RECYCLE_ERROR,
) {
  const entry = await findActiveTradeOrderRecycleEntry(db, tradeOrderId);

  if (entry) {
    throw new Error(message);
  }

  return entry;
}
