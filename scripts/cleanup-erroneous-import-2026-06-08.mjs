import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// 错误导入批次紧急清理脚本 — 2026-06-08
//
// 背景:
//   今早 09:36 错误导入了一批 1000+ 客户 (类似 "6.8资源导入.xlsx"). 必须批量
//   清理, 但不能破坏已经接入到真实业务的客户 (任何已挂 TradeOrder /
//   PaymentRecord / ShippingTask 的客户都必须 skip).
//
// 设计取舍:
//   1. 走 .mjs + tsx 加载器, 复用 lib/customers/force-delete.ts 的
//      forceHardDeleteCustomer — 不要在脚本里再造一份硬删拓扑, 否则
//      "Lead detach + 回收站 entry purge + RevisionRequest 清理 +
//      OperationLog" 这条链路会和服务端漂移.
//
//   2. 现行 LeadImportBatchRollbackMode enum 只有 AUDIT_PRESERVED / HARD_DELETE.
//      user 提到的 HARD_DELETE_ALL_IMPORTED 不是合法 enum 值, 因此本脚本写入
//      LeadImportBatchRollback 时 mode = HARD_DELETE, 并在 executionSnapshot.
//      cleanupSource 标注 "erroneous_import_cleanup_2026_06_08" + 每个客户/
//      批次的 OperationLog action 用独立 namespace:
//        - lead_import.batch_rollback.cleanup_executed
//        - customer.cleanup_erroneous_import_skipped
//      事后审计仍然能从 OperationLog 上区分这是一次 "脚本驱动的批量清理".
//
//   3. forceHardDeleteCustomer 内部对每个客户开自己的 $transaction (60s
//      timeout). 我们不再外层再嵌一个事务包所有客户 — 否则单个客户失败会回滚
//      整个 1000+ 操作, 反而更不可控. 脚本逐条调用, 单条失败计入 errors[],
//      不阻塞后续清理. LeadImportBatchRollback 审计在批次维度补写.
//
//   4. dry-run 是默认值. 必须显式 --execute 才会真删. 所有 console 输出
//      格式化为表 + 总结块, 便于运维粘贴到工单确认后再放行.
//
// 运行:
//   # 必须用 tsx (而不是 node), 因为脚本要 dynamic import lib/customers/
//   # force-delete.ts (TypeScript 源码).
//   #
//   # dry-run (默认):
//   npx tsx scripts/cleanup-erroneous-import-2026-06-08.mjs \
//     --since="2026-06-08T09:00:00+08:00" \
//     --until="2026-06-08T12:00:00+08:00" \
//     --created-by-id=<userId> \
//     --file-name-pattern="6.8%导入%"
//
//   # 真删 (上面看清单后再追加):
//   npx tsx scripts/cleanup-erroneous-import-2026-06-08.mjs \
//     --since=... --until=... \
//     --reason="2026-06-08 09:36 误导入资源批量清理" \
//     --execute
//
//   # 可选: 指定 actor (默认取第一个 ADMIN)
//   #   --actor-username=admin01
//
// 安全约束:
//   * 必须显式 --execute, 默认 dry-run
//   * 任何已挂 TradeOrder / PaymentRecord / ShippingTask 的客户必须 skip
//   * 删除走 forceHardDeleteCustomer (内含 scope/role/RBAC/审计)
//   * actor 必须是真实 ADMIN, 不接受 SYSTEM 字符串
//   * 每个客户 OperationLog + 每个批次 LeadImportBatchRollback 留痕
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

function parseDateInput(value, label) {
  if (!value) {
    throw new Error(`${label} 不能为空 (期望 ISO 时间字符串).`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} 不是有效 ISO 时间字符串: ${value}`);
  }

  return parsed;
}

function fmtIso(value) {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
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

const SAMPLE_LIMIT = 20;
const BATCH_DELETE_PROGRESS_EVERY = 25;
const PRINT_BATCH_ROW_LIMIT = 20;
const DEFAULT_REASON = "2026-06-08 09:36 误导入批量清理脚本";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL 未配置, 拒绝执行清理脚本.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

async function loadActor(actorUsername) {
  if (actorUsername) {
    const actor = await prisma.user.findFirst({
      where: {
        username: actorUsername,
        userStatus: "ACTIVE",
        role: {
          code: "ADMIN",
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        teamId: true,
        role: { select: { code: true } },
      },
    });

    if (!actor) {
      throw new Error(
        `指定的 --actor-username=${actorUsername} 不存在、未激活或不是 ADMIN.`,
      );
    }

    return actor;
  }

  const actor = await prisma.user.findFirst({
    where: {
      userStatus: "ACTIVE",
      role: { code: "ADMIN" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      name: true,
      teamId: true,
      role: { select: { code: true } },
    },
  });

  if (!actor) {
    throw new Error(
      "没有可用的 ADMIN 账号执行清理, 请用 --actor-username 显式指定, 或先 bootstrap 一个 ADMIN.",
    );
  }

  return actor;
}

async function findBatches({ since, until, createdById, fileNamePattern }) {
  const where = {
    createdAt: {
      gte: since,
      lt: until,
    },
  };

  if (createdById) {
    where.createdById = createdById;
  }

  if (fileNamePattern) {
    // MariaDB LIKE 模糊匹配. user 可以传 "6.8%导入%" 或 "6.8*导入*",
    // 这里把 * 统一映射成 % (兼容 shell glob 写法), 然后按 % 拆 token, 每个
    // token 都做一次 fileName.contains 校验 — 等价于 "AND fileName LIKE
    // '%t1%' AND fileName LIKE '%t2%'".
    // Prisma 不支持原生双锚点 (^abc...xyz$) 通配, 这是当前最干净的退路.
    const normalized = fileNamePattern.replace(/\*/g, "%");
    const tokens = normalized.split("%").map((value) => value.trim()).filter(Boolean);

    if (tokens.length === 1) {
      where.fileName = { contains: tokens[0] };
    } else if (tokens.length > 1) {
      where.AND = tokens.map((token) => ({
        fileName: { contains: token },
      }));
    }
  }

  const batches = await prisma.leadImportBatch.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fileName: true,
      status: true,
      totalRows: true,
      successRows: true,
      failedRows: true,
      duplicateRows: true,
      createdCustomerRows: true,
      matchedCustomerRows: true,
      createdById: true,
      createdAt: true,
      importedAt: true,
      report: true,
      createdBy: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
      rollback: { select: { id: true, mode: true, executedAt: true } },
    },
  });

  return batches;
}

async function listCandidateCustomerIdsForBatch(batchId) {
  // 链路:
  //   LeadImportRow.importedLeadId -> Lead.id
  //   Lead.customerId -> Customer.id
  //
  // 这里同时兜一层 LeadCustomerMergeLog: 个别历史路径下 Lead.customerId 已
  // 被 detach (例如已经走过 AUDIT_PRESERVE rollback), 但 merge_log 仍能定位
  // 当时建出来的 Customer 真身.
  const [rowsViaLead, rowsViaMerge] = await Promise.all([
    prisma.leadImportRow.findMany({
      where: {
        batchId,
        status: "IMPORTED",
        importedLeadId: { not: null },
      },
      select: {
        rowNumber: true,
        importedLeadId: true,
      },
    }),
    prisma.leadCustomerMergeLog.findMany({
      where: {
        batchId,
        action: "CREATED_CUSTOMER",
        customerId: { not: null },
      },
      select: {
        rowId: true,
        customerId: true,
      },
    }),
  ]);

  const leadIds = rowsViaLead
    .map((row) => row.importedLeadId)
    .filter((value) => Boolean(value));

  const leadToCustomer = leadIds.length
    ? await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, customerId: true },
      })
    : [];

  const customerIdSet = new Set();
  const leadToCustomerMap = new Map(
    leadToCustomer.map((row) => [row.id, row.customerId]),
  );

  for (const row of rowsViaLead) {
    const customerId = row.importedLeadId
      ? leadToCustomerMap.get(row.importedLeadId)
      : null;
    if (customerId) {
      customerIdSet.add(customerId);
    }
  }

  for (const row of rowsViaMerge) {
    if (row.customerId) {
      customerIdSet.add(row.customerId);
    }
  }

  return [...customerIdSet];
}

async function inspectCustomersForDeletion(customerIds) {
  if (customerIds.length === 0) {
    return [];
  }

  const results = [];

  // 分批查 — 1000+ 个 ID 一次性 IN 查可能触发 MariaDB packet 限制.
  for (const ids of chunk(customerIds, 200)) {
    const customers = await prisma.customer.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        ownerId: true,
        publicPoolTeamId: true,
        createdAt: true,
        _count: {
          select: {
            tradeOrders: true,
            paymentRecords: true,
            shippingTasks: true,
            collectionTasks: true,
            paymentPlans: true,
            codCollectionRecords: true,
            logisticsFollowUpTasks: true,
            // legacy / 礼品记录也要看一眼, 但 gift / legacy order 不是
            // 业务真相, 不作为 skip 决策依据.
            giftRecords: true,
            orders: true,
          },
        },
      },
    });

    for (const customer of customers) {
      const blockingReasons = [];

      if (customer._count.tradeOrders > 0) {
        blockingReasons.push(`tradeOrders=${customer._count.tradeOrders}`);
      }
      if (customer._count.paymentRecords > 0) {
        blockingReasons.push(`paymentRecords=${customer._count.paymentRecords}`);
      }
      if (customer._count.shippingTasks > 0) {
        blockingReasons.push(`shippingTasks=${customer._count.shippingTasks}`);
      }
      if (customer._count.paymentPlans > 0) {
        blockingReasons.push(`paymentPlans=${customer._count.paymentPlans}`);
      }
      if (customer._count.collectionTasks > 0) {
        blockingReasons.push(`collectionTasks=${customer._count.collectionTasks}`);
      }
      if (customer._count.codCollectionRecords > 0) {
        blockingReasons.push(
          `codCollectionRecords=${customer._count.codCollectionRecords}`,
        );
      }
      if (customer._count.logisticsFollowUpTasks > 0) {
        blockingReasons.push(
          `logisticsFollowUpTasks=${customer._count.logisticsFollowUpTasks}`,
        );
      }

      results.push({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        status: customer.status,
        ownerId: customer.ownerId,
        createdAt: customer.createdAt,
        hasBusinessRefs: blockingReasons.length > 0,
        blockingReasons: blockingReasons.join("; "),
        counts: customer._count,
      });
    }
  }

  return results;
}

function printBatchSummaryTable(batches) {
  if (batches.length === 0) {
    console.log("时间窗口内没有匹配的 LeadImportBatch.");
    return;
  }

  console.log("");
  console.log("=== 匹配 LeadImportBatch 列表 ===");
  console.table(
    batches.map((batch) => ({
      batchId: batch.id,
      fileName: batch.fileName,
      status: batch.status,
      totalRows: batch.totalRows,
      successRows: batch.successRows,
      createdCustomerRows: batch.createdCustomerRows,
      matchedCustomerRows: batch.matchedCustomerRows,
      createdBy: batch.createdBy?.username ?? batch.createdById,
      createdAt: fmtIso(batch.createdAt),
      hasRollback: batch.rollback ? "YES" : "no",
    })),
  );
}

function printCustomerSamples(batchId, fileName, customers) {
  if (customers.length === 0) {
    console.log(`[batch ${batchId} | ${fileName}] 没有找到本批次新建的客户.`);
    return;
  }

  console.log("");
  console.log(`=== 批次 ${batchId} (${fileName}) 关联客户预览 ===`);
  console.log(`关联客户总数: ${customers.length}`);
  const blocked = customers.filter((c) => c.hasBusinessRefs);
  console.log(
    `其中已挂业务真相 (TradeOrder/PaymentRecord/ShippingTask 等) 必 skip: ${blocked.length}`,
  );

  const sample = customers.slice(0, PRINT_BATCH_ROW_LIMIT);
  console.table(
    sample.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      status: customer.status,
      createdAt: fmtIso(customer.createdAt),
      hasBusinessRefs: customer.hasBusinessRefs ? "BLOCK" : "ok",
      blockingReasons: customer.blockingReasons || "",
    })),
  );

  if (customers.length > PRINT_BATCH_ROW_LIMIT) {
    console.log(
      `... 还有 ${customers.length - PRINT_BATCH_ROW_LIMIT} 条客户记录未展示.`,
    );
  }
}

async function executeBatchHardDelete({
  batches,
  customersByBatch,
  actor,
  reason,
}) {
  // 动态 import — tsx 加载器会在运行时解析 TS 源码.
  // dry-run 路径不会触发 import, 即使生产机器没有 tsx 也能跑诊断.
  const { forceHardDeleteCustomer, CUSTOMER_BATCH_FORCE_HARD_DELETE_CONFIRMATION } =
    await import("../lib/customers/force-delete.ts");

  const aggregate = {
    totalBatches: batches.length,
    deletedCustomers: 0,
    skippedBusinessRefs: 0,
    skippedNotInScope: 0,
    errors: [],
    perBatch: [],
  };

  let processedCustomers = 0;

  for (const batch of batches) {
    const customers = customersByBatch.get(batch.id) ?? [];
    const candidates = customers.filter((c) => !c.hasBusinessRefs);
    const skippedBusiness = customers.filter((c) => c.hasBusinessRefs);

    const perBatchResult = {
      batchId: batch.id,
      fileName: batch.fileName,
      candidateCount: candidates.length,
      skippedBusinessRefsCount: skippedBusiness.length,
      deletedCount: 0,
      errorCount: 0,
      deletedCustomerIds: [],
      skippedCustomerIds: skippedBusiness.map((c) => c.id),
      errors: [],
    };

    aggregate.skippedBusinessRefs += skippedBusiness.length;

    for (const customer of candidates) {
      try {
        const result = await forceHardDeleteCustomer(
          { id: actor.id, role: actor.role.code },
          {
            customerId: customer.id,
            confirmation: CUSTOMER_BATCH_FORCE_HARD_DELETE_CONFIRMATION,
            reason: `${reason} | batch=${batch.id} fileName=${batch.fileName}`,
            confirmationMode: "batch_phrase",
          },
        );

        perBatchResult.deletedCount += 1;
        perBatchResult.deletedCustomerIds.push(result.customerId);
        aggregate.deletedCustomers += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 区分 "scope 拒绝" 和 "其他失败".
        if (/不在你的可管理范围|当前客户不存在/.test(message)) {
          aggregate.skippedNotInScope += 1;
        } else {
          perBatchResult.errorCount += 1;
          perBatchResult.errors.push({ customerId: customer.id, message });
          aggregate.errors.push({
            batchId: batch.id,
            customerId: customer.id,
            message,
          });
        }
      }

      processedCustomers += 1;
      if (processedCustomers % BATCH_DELETE_PROGRESS_EVERY === 0) {
        console.log(
          `[execute] 已处理 ${processedCustomers} 条客户, 累计删除 ${aggregate.deletedCustomers}.`,
        );
      }
    }

    aggregate.perBatch.push(perBatchResult);

    // 为每个批次写一条 LeadImportBatchRollback (mode = HARD_DELETE).
    // 即使没有任何客户被删 (例如全部都已挂业务), 也要写一条审计快照, 让
    // 这批次在 UI 上不再可重复执行整批回滚.
    try {
      await prisma.$transaction(async (tx) => {
        const existingRollback = await tx.leadImportBatchRollback.findUnique({
          where: { batchId: batch.id },
          select: { id: true },
        });

        if (existingRollback) {
          // 批次此前已经被通过整批回滚清理过 — 我们仍然要落一条
          // OperationLog 说明 "本脚本又来检查了一遍", 但不重复写 rollback 记录.
          await tx.operationLog.create({
            data: {
              actorId: actor.id,
              module: "LEAD_IMPORT",
              action: "lead_import.batch_rollback.cleanup_skipped_existing",
              targetType: "LEAD_IMPORT_BATCH",
              targetId: batch.id,
              description: `脚本扫到此批次已有 LeadImportBatchRollback, 跳过 ${batch.fileName}.`,
              afterData: {
                cleanupSource: "erroneous_import_cleanup_2026_06_08",
                existingRollbackId: existingRollback.id,
                perBatchResult,
              },
            },
          });
          return;
        }

        const executionSnapshot = {
          version: "v1",
          importKind: "LEAD",
          mode: "HARD_DELETE",
          reason,
          executedAt: new Date().toISOString(),
          cleanupSource: "erroneous_import_cleanup_2026_06_08",
          summary: {
            totalRows: batch.totalRows,
            processedRows: candidates.length,
            ignoredRows: skippedBusiness.length,
            deletedCustomerRows: perBatchResult.deletedCount,
            alreadyRemovedCustomerRows: 0,
            auditPreservedLeadRows: 0,
            hardDeletedLeadRows: 0,
          },
          rows: [],
        };

        const precheckSnapshot = {
          version: "v1",
          importKind: "LEAD",
          mode: "HARD_DELETE",
          generatedAt: new Date().toISOString(),
          overallEligible: true,
          blockedReason: null,
          cleanupSource: "erroneous_import_cleanup_2026_06_08",
          summary: {
            totalRows: batch.totalRows,
            effectiveRows: customers.length,
            rollbackableRows: candidates.length,
            blockedRows: skippedBusiness.length,
            ignoredRows: 0,
            existingLeadBlockRows: 0,
            existingCustomerBlockRows: 0,
            customerDeleteRows: perBatchResult.deletedCount,
            alreadyRemovedCustomerRows: 0,
            auditPreservedLeadRows: 0,
            hardDeleteLeadRows: 0,
            leadHardDeleteBlockRows: 0,
          },
          rows: [],
        };

        const rollbackRecord = await tx.leadImportBatchRollback.create({
          data: {
            batchId: batch.id,
            mode: "HARD_DELETE",
            actorId: actor.id,
            precheckSnapshot,
            executionSnapshot,
          },
          select: { id: true },
        });

        await tx.operationLog.create({
          data: {
            actorId: actor.id,
            module: "LEAD_IMPORT",
            action: "lead_import.batch_rollback.cleanup_executed",
            targetType: "LEAD_IMPORT_BATCH",
            targetId: batch.id,
            description: `脚本批量清理误导入批次: ${batch.fileName}`,
            afterData: {
              cleanupSource: "erroneous_import_cleanup_2026_06_08",
              rollbackId: rollbackRecord.id,
              perBatchResult,
            },
          },
        });
      }, { maxWait: 10_000, timeout: 30_000 });
    } catch (auditError) {
      const message =
        auditError instanceof Error ? auditError.message : String(auditError);
      aggregate.errors.push({
        batchId: batch.id,
        customerId: null,
        message: `落 LeadImportBatchRollback 审计失败: ${message}`,
      });
    }

    console.log(
      `[execute] 批次 ${batch.id} 完成: deleted=${perBatchResult.deletedCount}, ` +
        `skippedBusiness=${perBatchResult.skippedBusinessRefsCount}, ` +
        `errors=${perBatchResult.errorCount}`,
    );
  }

  return aggregate;
}

function printFinalSummary({ mode, batches, customersByBatch, aggregate }) {
  console.log("");
  console.log("=== 总结 ===");

  const totalCustomers = batches.reduce(
    (acc, batch) => acc + (customersByBatch.get(batch.id)?.length ?? 0),
    0,
  );
  const totalBlocked = batches.reduce(
    (acc, batch) =>
      acc +
      (customersByBatch.get(batch.id)?.filter((c) => c.hasBusinessRefs).length ?? 0),
    0,
  );
  const totalDeletable = totalCustomers - totalBlocked;

  console.log(`模式: ${mode}`);
  console.log(`匹配批次数: ${batches.length}`);
  console.log(`关联客户总数 (含已 skip): ${totalCustomers}`);
  console.log(`已挂业务真相需 skip: ${totalBlocked}`);
  console.log(`可硬删客户数: ${totalDeletable}`);

  if (mode === "execute" && aggregate) {
    console.log("");
    console.log(`实际删除客户数: ${aggregate.deletedCustomers}`);
    console.log(`scope 拒绝跳过: ${aggregate.skippedNotInScope}`);
    console.log(`错误条数: ${aggregate.errors.length}`);

    if (aggregate.errors.length > 0) {
      console.log("--- 错误明细 (前 10 条) ---");
      console.table(aggregate.errors.slice(0, 10));
    }
  } else {
    console.log("");
    console.log("** 当前是 DRY-RUN 模式. 没有动 DB. **");
    console.log("** 检查清单后, 重新执行并追加 --execute 才会真删. **");
  }
}

async function main() {
  const since = parseDateInput(getArg("since"), "--since");
  const until = parseDateInput(getArg("until"), "--until");

  if (since >= until) {
    throw new Error("--since 必须严格早于 --until.");
  }

  const createdById = getArg("created-by-id");
  const fileNamePattern = getArg("file-name-pattern");
  const actorUsername = getArg("actor-username");
  const reasonArg = getArg("reason");
  const dryRun = !getFlag("execute");

  if (!dryRun && !reasonArg) {
    throw new Error("--execute 模式必须显式 --reason=... 说明本次清理原因.");
  }

  const reason = reasonArg || DEFAULT_REASON;

  console.log("[cleanup-erroneous-import-2026-06-08] start", {
    since: since.toISOString(),
    until: until.toISOString(),
    createdById: createdById || null,
    fileNamePattern: fileNamePattern || null,
    actorUsername: actorUsername || null,
    dryRun,
    reason,
  });

  const actor = await loadActor(actorUsername);
  console.log(
    `[cleanup-erroneous-import-2026-06-08] actor = @${actor.username} (${actor.role.code}, id=${actor.id})`,
  );

  const batches = await findBatches({
    since,
    until,
    createdById: createdById || undefined,
    fileNamePattern: fileNamePattern || undefined,
  });

  printBatchSummaryTable(batches);

  if (batches.length === 0) {
    printFinalSummary({
      mode: dryRun ? "dry-run" : "execute",
      batches,
      customersByBatch: new Map(),
      aggregate: null,
    });
    return;
  }

  const customersByBatch = new Map();

  for (const batch of batches) {
    const customerIds = await listCandidateCustomerIdsForBatch(batch.id);
    const customers = await inspectCustomersForDeletion(customerIds);
    customersByBatch.set(batch.id, customers);
    printCustomerSamples(batch.id, batch.fileName, customers.slice(0, SAMPLE_LIMIT * 5));
  }

  let aggregate = null;

  if (dryRun) {
    console.log("");
    console.log("[dry-run] 不会执行删除. 仅输出清单.");
  } else {
    console.log("");
    console.log("[execute] 进入真删模式. 每个客户走 forceHardDeleteCustomer.");
    aggregate = await executeBatchHardDelete({
      batches,
      customersByBatch,
      actor,
      reason,
    });
  }

  printFinalSummary({
    mode: dryRun ? "dry-run" : "execute",
    batches,
    customersByBatch,
    aggregate,
  });
}

main()
  .catch((error) => {
    console.error(
      "[cleanup-erroneous-import-2026-06-08] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
