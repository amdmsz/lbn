import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL missing");

const p = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

const total = await p.customer.count();
const archived = await p.customer.count({ where: { phone: { startsWith: "ARCHIVED:" } } });

const statusBreakdown = await p.customer.groupBy({ by: ["status"], _count: { _all: true } });

const today = await p.customer.count({ where: { createdAt: { gte: new Date("2026-06-08T00:00:00+08:00") } } });
const yesterdayCreated = await p.customer.count({
  where: { createdAt: { gte: new Date("2026-06-07T00:00:00+08:00"), lt: new Date("2026-06-08T00:00:00+08:00") } },
});
const beforeYesterday = await p.customer.count({
  where: { createdAt: { lt: new Date("2026-06-07T00:00:00+08:00") } },
});

const recycleBinCustomers = await p.recycleBinEntry.count({
  where: { targetType: "CUSTOMER", status: "ACTIVE" },
});

const todayHardDelete = await p.operationLog.count({
  where: {
    action: { contains: "hard_delete" },
    createdAt: { gte: new Date("2026-06-08T00:00:00+08:00") },
  },
});

const todayCustomerDelete = await p.operationLog.count({
  where: {
    targetType: "CUSTOMER",
    action: { contains: "delete" },
    createdAt: { gte: new Date("2026-06-08T00:00:00+08:00") },
  },
});

const last30 = await p.operationLog.findMany({
  where: {
    OR: [
      { action: { contains: "delete" } },
      { action: { contains: "recycle" } },
      { action: { contains: "force" } },
    ],
    createdAt: { gte: new Date("2026-06-07T00:00:00+08:00") },
  },
  orderBy: { createdAt: "desc" },
  take: 30,
  select: { action: true, actorId: true, createdAt: true, targetType: true, description: true },
});

console.log("=== Customer table counts ===");
console.log(JSON.stringify({ total, archivedPhone: archived, todayCreated: today, yesterdayCreated, beforeYesterday, recycleBinActiveCustomers: recycleBinCustomers }, null, 2));
console.log("");
console.log("=== Customer.status breakdown ===");
for (const r of statusBreakdown) console.log(`  ${r.status}: ${r._count._all}`);
console.log("");
console.log(`=== OperationLog: action like %hard_delete% today: ${todayHardDelete} ===`);
console.log(`=== OperationLog: targetType=CUSTOMER + delete today: ${todayCustomerDelete} ===`);
console.log("");
console.log("=== Last 30 delete/recycle/force OperationLog (since yesterday) ===");
for (const r of last30) {
  console.log(r.createdAt.toISOString(), "|", r.targetType, "|", r.action, "|", r.actorId, "|", (r.description || "").slice(0, 80));
}

await p.$disconnect();
