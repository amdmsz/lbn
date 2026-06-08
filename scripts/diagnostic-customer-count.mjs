import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

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

const todayDeleted = await p.operationLog.count({
  where: {
    action: { contains: "hard_delete" },
    createdAt: { gte: new Date("2026-06-08T00:00:00+08:00") },
  },
});

const recentDeletes = await p.operationLog.findMany({
  where: {
    action: { contains: "delete" },
    createdAt: { gte: new Date("2026-06-07T00:00:00+08:00") },
  },
  orderBy: { createdAt: "desc" },
  take: 20,
  select: { action: true, actorId: true, createdAt: true, targetType: true, description: true },
});

console.log("=== Customer counts ===");
console.log(JSON.stringify({ total, active, archived, recycled, todayCreated: today, yesterdayCreated, beforeYesterday }, null, 2));
console.log("");
console.log("=== Today delete OperationLog count ===");
console.log(todayDeleted);
console.log("");
console.log("=== Last 20 delete-related OperationLog (since yesterday) ===");
for (const r of recentDeletes) {
  console.log(r.createdAt.toISOString(), "|", r.targetType, "|", r.action, "|", r.actorId, "|", (r.description || "").slice(0, 100));
}

await p.$disconnect();
