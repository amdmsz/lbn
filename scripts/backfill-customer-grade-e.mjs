import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Customer.grade E (拒加) 存量回填脚本
//
// 背景:
//   "客户分类"(executionClass) 与 "客户分级"(grade) 合并为一套后, grade 新增
//   E 档 = 客户明确拒绝加微信. 新数据由 lib/customers/grade.ts 在 mutation 时
//   自然推导, 但存量拒加客户的 grade 还停在 null / D, 本脚本一次性补成 E.
//
// 口径 (与 readCustomerGradeSignal 一致):
//   拒加信号 = CallRecord.result = REFUSED_WECHAT 或 WechatRecord.addedStatus
//   = REJECTED. 仅当当前 grade 为 null 或 D 时升 E — 优先级 A>B>C>F>E>D,
//   不顶掉 A/B/C/F.
//
// 运行:
//   node scripts/backfill-customer-grade-e.mjs            # dry-run (默认)
//   node scripts/backfill-customer-grade-e.mjs --execute  # 真写
//
// 安全约束:
//   * 必须显式 --execute, 默认 dry-run
//   * 只把 grade ∈ (null, D) 的拒加客户改为 E, 幂等可重跑
//   * 不写 OperationLog (纯运维派生字段回填, 与 callCount 回填同语义)
// ---------------------------------------------------------------------------

function getFlag(name) {
  return process.argv.includes(`--${name}`);
}

function chunk(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

const CHUNK_SIZE = 500;
const PRINT_SAMPLE_LIMIT = 20;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL 未配置, 拒绝执行回填脚本.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

async function collectRefusedCustomerIds() {
  const [refusedCalls, rejectedWechats] = await Promise.all([
    prisma.callRecord.findMany({
      where: { result: "REFUSED_WECHAT", customerId: { not: null } },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    prisma.wechatRecord.findMany({
      where: { addedStatus: "REJECTED" },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
  ]);

  const ids = new Set();
  for (const row of refusedCalls) {
    if (row.customerId) ids.add(row.customerId);
  }
  for (const row of rejectedWechats) {
    if (row.customerId) ids.add(row.customerId);
  }
  return [...ids];
}

async function main() {
  const dryRun = !getFlag("execute");
  console.log("[backfill-customer-grade-e] start", { dryRun });

  const refusedIds = await collectRefusedCustomerIds();
  console.log(`[backfill-customer-grade-e] 拒加信号客户数: ${refusedIds.length}`);

  // 只升 null / D → E. A/B/C/F 不动 (优先级更高).
  const candidates = [];
  for (const batch of chunk(refusedIds, CHUNK_SIZE)) {
    const rows = await prisma.customer.findMany({
      where: {
        id: { in: batch },
        OR: [{ grade: null }, { grade: "D" }],
      },
      select: { id: true, grade: true, name: true },
    });
    candidates.push(...rows);
  }

  console.log("");
  console.log("=== grade E 回填概览 ===");
  console.log(`需升级为 E (当前 grade ∈ null/D): ${candidates.length}`);
  if (candidates.length > 0) {
    console.table(
      candidates.slice(0, PRINT_SAMPLE_LIMIT).map((row) => ({
        customerId: row.id,
        name: row.name,
        current: row.grade ?? "null",
        target: "E",
      })),
    );
    if (candidates.length > PRINT_SAMPLE_LIMIT) {
      console.log(`... 还有 ${candidates.length - PRINT_SAMPLE_LIMIT} 条未展示.`);
    }
  }

  if (candidates.length === 0) {
    console.log("没有需要回填的客户.");
    return;
  }

  if (dryRun) {
    console.log("");
    console.log("** 当前是 DRY-RUN 模式. 没有动 DB. **");
    console.log("** 检查清单后, 重新执行并追加 --execute 才会真写. **");
    return;
  }

  console.log("");
  console.log("[execute] 进入真写模式, 分批 updateMany.");
  let updated = 0;
  for (const batch of chunk(candidates.map((row) => row.id), CHUNK_SIZE)) {
    const result = await prisma.customer.updateMany({
      where: {
        id: { in: batch },
        OR: [{ grade: null }, { grade: "D" }],
      },
      data: { grade: "E" },
    });
    updated += result.count;
    console.log(`[execute] 累计写入 ${updated}/${candidates.length}.`);
  }

  console.log("");
  console.log("=== 总结 ===");
  console.log(`实际升级为 E 的客户数: ${updated}`);
}

main()
  .catch((error) => {
    console.error(
      "[backfill-customer-grade-e] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
