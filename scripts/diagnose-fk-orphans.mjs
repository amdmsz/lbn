import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// F09 schema FK 补全 — 阶段 1 诊断脚本 (read-only, 不动 schema)
//
// 用途:
//   audit F09 指出三张子表持有 supplierId / productId / skuId 字段, 但在
//   Prisma schema 上没有声明 @relation, 因此数据库层也没有外键约束.
//   在补 FK 之前, 必须先确认这些字段是否存在 "指向不存在父记录" 的 orphan
//   行 — 如果存在 orphan, 加 FK 时 MariaDB 会直接报错或截断数据.
//
//   本脚本只跑 raw SQL count + 取 5 个 sample id, 不做任何写操作.
//
// 涉及表 (table 名取 schema.prisma 中的 @@map):
//   - productbundleitem        (supplierId / productId / skuId)
//   - tradeorderitemcomponent  (supplierId / productId? / skuId?)
//   - shippingexportline       (supplierId)
//
// 父表:
//   - supplier(id)
//   - product(id)
//   - productsku(id)
//
// 输出:
//   - 控制台逐表打印总行数 / orphan 行数 / 5 个 sample id
//   - 末尾打印一份 JSON, 可直接复制粘贴到 plan 文档供后续 migration 决策引用
//
// 运行:
//   node scripts/diagnose-fk-orphans.mjs
//
// 注意:
//   - 必须在能访问目标 DATABASE_URL 的环境跑 (本机连测试库, 或运维在生产
//     连生产库一次性出快照). 不要把脚本接进任何自动化部署流水线.
//   - 输出可能包含真实业务 id, 拿到 orphan 数后请走内部渠道分析, 不要外泄.
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run FK orphan diagnosis.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

/**
 * @typedef {Object} OrphanCheck
 * @property {string} childTable      子表名 (与 @@map 对齐)
 * @property {string} childColumn     子表中的 FK 候选列
 * @property {string} parentTable     期望指向的父表
 * @property {string} parentColumn    父表主键列
 * @property {boolean} nullable       子列是否允许 NULL — NULL 不算 orphan
 */

/** @type {OrphanCheck[]} */
const CHECKS = [
  // ProductBundleItem
  {
    childTable: "productbundleitem",
    childColumn: "supplierId",
    parentTable: "supplier",
    parentColumn: "id",
    nullable: false,
  },
  {
    childTable: "productbundleitem",
    childColumn: "productId",
    parentTable: "product",
    parentColumn: "id",
    nullable: false,
  },
  {
    childTable: "productbundleitem",
    childColumn: "skuId",
    parentTable: "productsku",
    parentColumn: "id",
    nullable: false,
  },
  // TradeOrderItemComponent
  {
    childTable: "tradeorderitemcomponent",
    childColumn: "supplierId",
    parentTable: "supplier",
    parentColumn: "id",
    nullable: false,
  },
  {
    childTable: "tradeorderitemcomponent",
    childColumn: "productId",
    parentTable: "product",
    parentColumn: "id",
    nullable: true,
  },
  {
    childTable: "tradeorderitemcomponent",
    childColumn: "skuId",
    parentTable: "productsku",
    parentColumn: "id",
    nullable: true,
  },
  // ShippingExportLine
  {
    childTable: "shippingexportline",
    childColumn: "supplierId",
    parentTable: "supplier",
    parentColumn: "id",
    nullable: false,
  },
];

/**
 * 安全地把 raw SQL 结果中的 BigInt 转回 number (count 不会爆 number).
 * @param {unknown} value
 * @returns {number}
 */
function toCountNumber(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return 0;
}

/**
 * 跑单个 FK 候选列的诊断:
 *   1) 子表总行数
 *   2) 子列非空且父表查不到的 orphan 行数
 *   3) 5 个 orphan sample (子表 id + 失效的 fk 值)
 *
 * 全部用 $queryRawUnsafe — 但 childTable / childColumn / parentTable /
 * parentColumn 都来自本文件硬编码白名单, 不接受用户输入, 不存在注入风险.
 *
 * @param {OrphanCheck} check
 */
async function runCheck(check) {
  const { childTable, childColumn, parentTable, parentColumn, nullable } = check;

  const totalRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS total FROM \`${childTable}\``,
  );
  const total = toCountNumber(totalRows?.[0]?.total);

  const orphanWhere = nullable
    ? `WHERE c.\`${childColumn}\` IS NOT NULL AND p.\`${parentColumn}\` IS NULL`
    : `WHERE p.\`${parentColumn}\` IS NULL`;

  const orphanCountRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS orphans
     FROM \`${childTable}\` c
     LEFT JOIN \`${parentTable}\` p
       ON p.\`${parentColumn}\` = c.\`${childColumn}\`
     ${orphanWhere}`,
  );
  const orphans = toCountNumber(orphanCountRows?.[0]?.orphans);

  let sampleOrphans = [];
  if (orphans > 0) {
    const sampleRows = await prisma.$queryRawUnsafe(
      `SELECT c.\`id\` AS childId, c.\`${childColumn}\` AS fkValue
       FROM \`${childTable}\` c
       LEFT JOIN \`${parentTable}\` p
         ON p.\`${parentColumn}\` = c.\`${childColumn}\`
       ${orphanWhere}
       LIMIT 5`,
    );
    sampleOrphans = Array.isArray(sampleRows)
      ? sampleRows.map((row) => ({
          childId: row.childId,
          fkValue: row.fkValue,
        }))
      : [];
  }

  return {
    childTable,
    childColumn,
    parentTable,
    parentColumn,
    nullable,
    total,
    orphans,
    sampleOrphans,
  };
}

async function main() {
  console.log("[diagnose-fk-orphans] start");
  console.log(
    `[diagnose-fk-orphans] target DATABASE_URL host hint = ${databaseUrl.replace(/\/\/[^@]+@/, "//***@")}`,
  );

  const results = [];

  for (const check of CHECKS) {
    const result = await runCheck(check);
    results.push(result);

    const status = result.orphans === 0 ? "ok" : "ORPHANS";
    console.log(
      `[diagnose-fk-orphans] ${status.padEnd(8)} ${result.childTable}.${result.childColumn} -> ${result.parentTable}.${result.parentColumn}` +
        ` | total=${result.total} | orphans=${result.orphans}`,
    );
    if (result.orphans > 0) {
      console.log(`  sample (max 5):`);
      for (const sample of result.sampleOrphans) {
        console.log(`    - childId=${sample.childId} fkValue=${sample.fkValue}`);
      }
    }
  }

  const allClean = results.every((row) => row.orphans === 0);

  console.log("");
  console.log("[diagnose-fk-orphans] === JSON summary (复制到 plan 文档) ===");
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        allClean,
        checks: results,
      },
      (_key, value) => (typeof value === "bigint" ? Number(value) : value),
      2,
    ),
  );
  console.log("[diagnose-fk-orphans] === end JSON summary ===");
  console.log("");
  console.log(
    allClean
      ? "[diagnose-fk-orphans] result: 全部干净, 可继续走 FK migration 草稿"
      : "[diagnose-fk-orphans] result: 存在 orphan, 先在 plan 中决定修复策略再加 FK",
  );
}

main()
  .catch((error) => {
    console.error("[diagnose-fk-orphans] failed", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
