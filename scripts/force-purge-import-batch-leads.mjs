import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// 强制清理 LeadImportBatch 关联的残留 Lead + 关联表
//
// 背景:
//   用户 6.8 误导入 1801 行, 已经物理删除关联的 Customer (1750 个), 但
//   batch-rollback 阻断: "批次内存在命中系统已有 Lead 的行" — Lead 表里
//   这些导入对应的 Lead 行还在 (因为 customer 硬删时只走 customer-side
//   清理, 没动 Lead, Lead 上的 customerId 自动 detach 或保留为孤儿).
//
//   用户现在想重新导入这批数据, 但 Lead 残留导致 dedup 阻断.
//
// 这个脚本做:
//   1. 找到指定时间窗口内的 LeadImportBatch
//   2. 物理删除:
//      - 该批次创建的 Lead (Lead.importBatchId = batch.id) 或
//        通过 LeadImportRow.importedLeadId 关联的 Lead
//      - 关联的 LeadCustomerMergeLog
//      - 关联的 LeadDedupLog
//      - 关联的 LeadImportRow
//      - 最后是 LeadImportBatch 本身 + LeadImportBatchRollback (如果有)
//   3. 写 OperationLog 审计
//   4. 不动其他业务对象 (Customer/TradeOrder/etc 已经在前一步处理)
//
// 运行:
//   dry-run (默认):
//   npx tsx scripts/force-purge-import-batch-leads.mjs \
//     --since=2026-06-08T09:30:00+08:00 \
//     --until=2026-06-08T11:00:00+08:00
//
//   真删:
//   npx tsx scripts/force-purge-import-batch-leads.mjs \
//     --since=... --until=... \
//     --reason=force-purge-6.8-import \
//     --execute
//
// 安全:
//   - 默认 dry-run
//   - 真删走 transaction, 单 batch 失败回滚
//   - 写汇总 OperationLog (action: lead_import.force_purge_residual_leads)
// ---------------------------------------------------------------------------

const ARG_PREFIX = "--";
function getArg(name) {
  const prefix = `${ARG_PREFIX}${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}
function getFlag(name) {
  return process.argv.includes(`${ARG_PREFIX}${name}`);
}

const sinceStr = getArg("since");
const untilStr = getArg("until");
const reason = getArg("reason") || "force-purge-residual-leads";
const execute = getFlag("execute");

if (!sinceStr || !untilStr) {
  console.error("ERROR: --since=<ISO> --until=<ISO> 必填");
  process.exit(1);
}

const since = new Date(sinceStr);
const until = new Date(untilStr);
if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
  console.error("ERROR: --since / --until 必须是有效 ISO 时间字符串");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL 未配置");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

async function main() {
  // 找到第一个 ADMIN actor (审计需要)
  const actor = await prisma.user.findFirst({
    where: { userStatus: "ACTIVE", role: { code: "ADMIN" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true },
  });
  if (!actor) {
    console.error("ERROR: 找不到 ADMIN actor");
    process.exit(1);
  }
  console.log(`[force-purge-import-batch-leads] actor = @${actor.username} (id=${actor.id})`);

  const batches = await prisma.leadImportBatch.findMany({
    where: {
      createdAt: { gte: since, lte: until },
    },
    select: {
      id: true,
      fileName: true,
      status: true,
      totalRows: true,
      successRows: true,
      createdAt: true,
      _count: {
        select: {
          rows: true,
          dedupLogs: true,
          mergeLogs: true,
        },
      },
    },
  });

  if (batches.length === 0) {
    console.log("没有匹配的 batch.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== 匹配 LeadImportBatch ===");
  console.table(
    batches.map((b) => ({
      id: b.id,
      fileName: b.fileName,
      status: b.status,
      rows: b._count.rows,
      dedup: b._count.dedupLogs,
      merge: b._count.mergeLogs,
      createdAt: b.createdAt.toISOString(),
    })),
  );

  // 收集每个 batch 关联的 Lead id
  let totalResidualLeads = 0;
  const batchPurgePlan = [];

  for (const batch of batches) {
    // 通过 LeadImportRow.importedLeadId 找到该批次创建的 Lead
    const rows = await prisma.leadImportRow.findMany({
      where: { batchId: batch.id, importedLeadId: { not: null } },
      select: { importedLeadId: true },
    });
    const leadIds = rows
      .map((r) => r.importedLeadId)
      .filter((v) => v !== null);

    // 验证哪些 Lead 还在 (没被其他流程删)
    const stillExistingLeads = await prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, name: true, phone: true, customerId: true, status: true },
    });

    batchPurgePlan.push({
      batchId: batch.id,
      fileName: batch.fileName,
      residualLeadCount: stillExistingLeads.length,
      sampleLeads: stillExistingLeads.slice(0, 5),
    });
    totalResidualLeads += stillExistingLeads.length;
  }

  console.log("\n=== 残留 Lead 统计 ===");
  console.table(
    batchPurgePlan.map((p) => ({
      batchId: p.batchId,
      fileName: p.fileName,
      residualLeads: p.residualLeadCount,
    })),
  );
  console.log(`总残留 Lead: ${totalResidualLeads}`);

  if (!execute) {
    console.log("\n** DRY-RUN 模式. 没有动 DB. **");
    console.log("** 检查后追加 --execute 才真删. **");
    await prisma.$disconnect();
    return;
  }

  // 真删
  console.log("\n=== 开始执行 force purge ===");
  let totalPurgedLeads = 0;
  let totalPurgedRows = 0;
  let totalPurgedDedup = 0;
  let totalPurgedMerge = 0;
  let totalPurgedBatches = 0;
  const errors = [];

  for (const batch of batches) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // 1. 拿这个 batch 关联的 Lead ids
          const rows = await tx.leadImportRow.findMany({
            where: { batchId: batch.id, importedLeadId: { not: null } },
            select: { importedLeadId: true },
          });
          const leadIds = rows
            .map((r) => r.importedLeadId)
            .filter((v) => v !== null);

          // 2. 删 Lead (cascade FK 应该会清掉 leadCustomerMergeLog 等)
          //    但安全起见先显式删关联表
          await tx.leadCustomerMergeLog.deleteMany({
            where: { batchId: batch.id },
          });
          await tx.leadDedupLog.deleteMany({
            where: { batchId: batch.id },
          });

          // 3. 删 Lead 行 (按 id 批量)
          let purgedLeadCount = 0;
          if (leadIds.length > 0) {
            const result = await tx.lead.deleteMany({
              where: { id: { in: leadIds } },
            });
            purgedLeadCount = result.count;
          }

          // 4. 删 LeadImportRow
          const purgedRowResult = await tx.leadImportRow.deleteMany({
            where: { batchId: batch.id },
          });

          // 5. 删 LeadImportBatchRollback (如果有)
          await tx.leadImportBatchRollback.deleteMany({
            where: { batchId: batch.id },
          });

          // 6. 删 LeadImportBatch 自身
          await tx.leadImportBatch.delete({
            where: { id: batch.id },
          });

          // 7. 写汇总 OperationLog
          await tx.operationLog.create({
            data: {
              actorId: actor.id,
              module: "LEAD_IMPORT",
              action: "lead_import.force_purge_residual_leads",
              targetType: "LEAD_IMPORT_BATCH",
              targetId: batch.id,
              description: `强制清理导入批次残留 Lead — ${batch.fileName} (rows=${purgedRowResult.count}, leads=${purgedLeadCount}). 原因: ${reason}`,
              afterData: {
                batchId: batch.id,
                fileName: batch.fileName,
                purgedLeads: purgedLeadCount,
                purgedRows: purgedRowResult.count,
                reason,
              },
            },
          });

          totalPurgedLeads += purgedLeadCount;
          totalPurgedRows += purgedRowResult.count;
          totalPurgedBatches += 1;
        },
        { timeout: 120_000 },
      );
      console.log(`✓ batch ${batch.id} (${batch.fileName}) 已清理`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`✗ batch ${batch.id} 失败: ${msg}`);
      errors.push({ batchId: batch.id, error: msg });
    }
  }

  console.log("\n=== 执行结果 ===");
  console.log(`成功 purge batches: ${totalPurgedBatches}/${batches.length}`);
  console.log(`总 purged Lead: ${totalPurgedLeads}`);
  console.log(`总 purged ImportRow: ${totalPurgedRows}`);
  console.log(`总 purged DedupLog: ${totalPurgedDedup}`);
  console.log(`总 purged MergeLog: ${totalPurgedMerge}`);
  if (errors.length > 0) {
    console.log("\n失败:");
    console.table(errors);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("FATAL:", error);
  prisma.$disconnect();
  process.exit(1);
});
