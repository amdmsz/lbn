import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL missing");

const p = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

const total = await p.customer.count();
const archived = await p.customer.count({ where: { phone: { startsWith: "ARCHIVED:" } } });
const active = await p.customer.count({ where: { status: "ACTIVE" } });
const recycled = await p.customer.count({ where: { status: "RECYCLED" } });
const today = await p.customer.count({ where: { createdAt: { gte: new Date("2026-06-08T00:00:00+08:00") } } });
const yesterdayCreated = await p.customer.count({
  where: { createdAt: { gte: new Date("2026-06-07T00:00:00+08:00"), lt: new Date("2026-06-08T00:00:00+08:00") } },
});
const beforeYesterday = await p.customer.count({
  where: { createdAt: { lt: new Date("2026-06-07T00:00:00+08:00") } },
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
      { action: { contains: "hard_delete" } },
      { action: { contains: "recycle" } },
      { action: { contains: "force_delete" } },
    ],
    createdAt: { gte: new Date("2026-06-07T00:00:00+08:00") },
  },
  orderBy: { createdAt: "desc" },
  take: 30,
  select: { action: true, actorId: true, createdAt: true, targetType: true, description: true },
});

console.log("=== Customer counts ===");
console.log(JSON.stringify({ total, active, archived, recycled, todayCreated: today, yesterdayCreated, beforeYesterday }, null, 2));
console.log("");
console.log(`=== Today hard_delete OperationLog: ${todayHardDelete} ===`);
console.log(`=== Today CUSTOMER delete OperationLog: ${todayCustomerDelete} ===`);
console.log("");
console.log("=== Last 30 delete-related OperationLog (since yesterday 00:00) ===");
for (const r of last30) {
  console.log(r.createdAt.toISOString(), "|", r.targetType, "|", r.action, "|", r.actorId, "|", (r.description || "").slice(0, 80));
}

await p.$disconnect();
