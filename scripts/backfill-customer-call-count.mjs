import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Customer.callCount 历史回填脚本 — Wave 11
//
// 背景:
//   "未加微客户至少拨打 5 遍" 工作流给每个客户记一个累计拨打次数
//   `customer.callCount` = 该客户 CallRecord 总条数 (创建一条 +1, 不论是否接通).
//   新数据走 createCallRecord 同事务 increment, 但迁移 20260610120000 不在
//   migration 里 backfill, 现存客户 callCount 默认落 0. 本脚本按 CallRecord
//   groupBy(customerId) 把历史累计数一次性回填回去.
//
// 设计取舍:
//   1. 与生产清理脚本一致, 用 PrismaMariaDb adapter 构造 client (见
//      scripts/cleanup-erroneous-import-2026-06-08.mjs). 纯 .mjs, 不依赖 tsx,
//      因为只用 PrismaClient 自身 API, 不 import TS 源码.
//   2. dry-run 是默认值. 必须显式 --execute 才会写库. dry-run 只读 + 打印
//      差异清单, 便于运维确认后再放行.
//   3. groupBy(customerId)._count 拿到每个客户的真实 CallRecord 条数, 再和
//      当前 customer.callCount 比对. 只更新 "有差异" 的客户 (current != actual),
//      减少无意义写入. 没有任何 CallRecord 的客户其 callCount 应为 0 —
//      groupBy 不会返回这些客户, 它们若已是 0 则不动; 若历史脏数据 > 0, 用
//      `--reset-orphans` 显式归零 (默认不动, 避免误伤).
//   4. 写入分批 (chunk) 执行, 每条 customer.update 单独走, 单条失败计入
//      errors[] 不阻塞后续. 不开大事务包所有 update — 与清理脚本同理由.
//
// 运行:
//   # dry-run (默认, 只读 + 打印差异):
//   npx tsx scripts/backfill-customer-call-count.mjs
//   # 或 node (本脚本不依赖 tsx):
//   node scripts/backfill-customer-call-count.mjs
//
//   # 真写 (看清单后追加):
//   node scripts/backfill-customer-call-count.mjs --execute
//
//   # 可选: 把 "0 条 CallRecord 但 callCount>0" 的脏客户归零:
//   node scripts/backfill-customer-call-count.mjs --execute --reset-orphans
//
// 安全约束:
//   * 必须显式 --execute, 默认 dry-run
//   * 只改 customer.callCount 单列, 不动 grade / owner / 任何业务字段
//   * 不写 OperationLog (纯运维派生字段回填, 非业务动作; 与 grade 回填同语义)
// ---------------------------------------------------------------------------

const ARG_PREFIX = "--";

function getFlag(name) {
  return process.argv.includes(`${ARG_PREFIX}${name}`);
}

function chunk(values, size) {
  if (size <= 0) {
    return [values];
  }

  const result = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

const UPDATE_CHUNK_SIZE = 200;
const UPDATE_PROGRESS_EVERY = 500;
const PRINT_SAMPLE_LIMIT = 20;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL 未配置, 拒绝执行回填脚本.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

async function buildActualCallCountMap() {
  // CallRecord 全表 groupBy(customerId). CallRecord.customerId 是 NOT NULL FK,
  // 所以每组都有合法 customerId. _count._all = 该客户 CallRecord 真实条数.
  const groups = await prisma.callRecord.groupBy({
    by: ["customerId"],
    _count: { _all: true },
  });

  const actualByCustomer = new Map();
  for (const group of groups) {
    actualByCustomer.set(group.customerId, group._count._all);
  }
  return actualByCustomer;
}

async function buildCurrentCallCountMap() {
  // 现存 customer.callCount 当前值. 只拉 id + callCount, 全表但每行极小.
  const rows = await prisma.customer.findMany({
    select: { id: true, callCount: true },
  });

  const currentByCustomer = new Map();
  for (const row of rows) {
    currentByCustomer.set(row.id, row.callCount);
  }
  return currentByCustomer;
}

function computeDiffs({ currentByCustomer, actualByCustomer, resetOrphans }) {
  const diffs = [];

  // 1. 有 CallRecord 的客户: 目标 = 实际条数. current != actual 即需更新.
  for (const [customerId, actual] of actualByCustomer.entries()) {
    const current = currentByCustomer.get(customerId);
    if (current === undefined) {
      // CallRecord 指向一个不存在的 customer (理论上 FK 保证不会发生); 跳过.
      continue;
    }
    if (current !== actual) {
      diffs.push({ customerId, current, target: actual, kind: "sync" });
    }
  }

  // 2. 没有任何 CallRecord 的客户: 目标 = 0. 默认不动 (避免误伤手填值);
  //    只有 --reset-orphans 时才把 callCount>0 的归零.
  if (resetOrphans) {
    for (const [customerId, current] of currentByCustomer.entries()) {
      if (!actualByCustomer.has(customerId) && current !== 0) {
        diffs.push({ customerId, current, target: 0, kind: "reset_orphan" });
      }
    }
  }

  return diffs;
}

function printDiffSummary({ diffs, resetOrphans }) {
  const syncDiffs = diffs.filter((d) => d.kind === "sync");
  const orphanDiffs = diffs.filter((d) => d.kind === "reset_orphan");

  console.log("");
  console.log("=== callCount 回填差异概览 ===");
  console.log(`需同步 (有 CallRecord, current != actual): ${syncDiffs.length}`);
  console.log(
    `孤儿归零 (0 条 CallRecord 但 callCount>0): ${orphanDiffs.length}` +
      (resetOrphans ? "" : " (默认不动, 加 --reset-orphans 才处理)"),
  );

  const sample = diffs.slice(0, PRINT_SAMPLE_LIMIT);
  if (sample.length > 0) {
    console.table(
      sample.map((d) => ({
        customerId: d.customerId,
        kind: d.kind,
        current: d.current,
        target: d.target,
      })),
    );
    if (diffs.length > PRINT_SAMPLE_LIMIT) {
      console.log(`... 还有 ${diffs.length - PRINT_SAMPLE_LIMIT} 条差异未展示.`);
    }
  }
}

async function executeBackfill(diffs) {
  const aggregate = {
    updated: 0,
    errors: [],
  };

  let processed = 0;

  for (const batch of chunk(diffs, UPDATE_CHUNK_SIZE)) {
    for (const diff of batch) {
      try {
        await prisma.customer.update({
          where: { id: diff.customerId },
          data: { callCount: diff.target },
        });
        aggregate.updated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        aggregate.errors.push({ customerId: diff.customerId, message });
      }

      processed += 1;
      if (processed % UPDATE_PROGRESS_EVERY === 0) {
        console.log(
          `[execute] 已处理 ${processed}/${diffs.length}, 累计写入 ${aggregate.updated}.`,
        );
      }
    }
  }

  return aggregate;
}

async function main() {
  const dryRun = !getFlag("execute");
  const resetOrphans = getFlag("reset-orphans");

  console.log("[backfill-customer-call-count] start", { dryRun, resetOrphans });

  const [actualByCustomer, currentByCustomer] = await Promise.all([
    buildActualCallCountMap(),
    buildCurrentCallCountMap(),
  ]);

  console.log(
    `[backfill-customer-call-count] customers=${currentByCustomer.size}, ` +
      `customers_with_calls=${actualByCustomer.size}`,
  );

  const diffs = computeDiffs({ currentByCustomer, actualByCustomer, resetOrphans });

  printDiffSummary({ diffs, resetOrphans });

  if (diffs.length === 0) {
    console.log("");
    console.log("没有需要回填的差异, callCount 已与 CallRecord 计数一致.");
    return;
  }

  if (dryRun) {
    console.log("");
    console.log("** 当前是 DRY-RUN 模式. 没有动 DB. **");
    console.log("** 检查清单后, 重新执行并追加 --execute 才会真写. **");
    return;
  }

  console.log("");
  console.log("[execute] 进入真写模式, 逐条 customer.update callCount.");
  const aggregate = await executeBackfill(diffs);

  console.log("");
  console.log("=== 总结 ===");
  console.log(`实际写入客户数: ${aggregate.updated}`);
  console.log(`错误条数: ${aggregate.errors.length}`);
  if (aggregate.errors.length > 0) {
    console.log("--- 错误明细 (前 10 条) ---");
    console.table(aggregate.errors.slice(0, 10));
  }
}

main()
  .catch((error) => {
    console.error(
      "[backfill-customer-call-count] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
