import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  CollectionTaskStatus,
  OperationModule,
  OperationTargetType,
  PaymentCollectionChannel,
  PaymentPlanStageType,
  PaymentPlanStatus,
  PaymentPlanSubjectType,
  PaymentRecordChannel,
  PaymentRecordStatus,
  PaymentSourceType,
  PrismaClient,
  ShippingFulfillmentStatus,
} from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/liquor_crm",
  ),
  log: ["warn", "error"],
});

class DryRunRollbackError extends Error {
  constructor(result) {
    super("DRY_RUN_ROLLBACK");
    this.result = result;
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    orderId: "",
    limit: 0,
    fallbackUserId: "",
    verbose: false,
  };

  for (const token of argv.slice(2)) {
    if (token === "--apply") args.dryRun = false;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--verbose") args.verbose = true;
    else if (token.startsWith("--orderId=")) args.orderId = token.slice(10).trim();
    else if (token.startsWith("--limit=")) {
      const value = Number(token.slice(8));
      args.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } else if (token.startsWith("--fallback-user-id=")) {
      args.fallbackUserId = token.slice(19).trim();
    }
  }

  return args;
}

function toNumber(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOfDay(value) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value, days) {
  const next = startOfDay(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getPlanSeeds(order) {
  const finalAmount = roundCurrency(Math.max(toNumber(order.finalAmount), 0));
  const depositAmount = roundCurrency(Math.max(toNumber(order.depositAmount), 0));
  const balanceAmount = roundCurrency(Math.max(finalAmount - depositAmount, 0));

  switch (order.paymentScheme) {
    case "FULL_PREPAID":
      return [{ stageType: "FULL", collectionChannel: "PREPAID", plannedAmount: finalAmount, sequence: 1 }];
    case "DEPOSIT_PLUS_BALANCE":
      return [
        { stageType: "DEPOSIT", collectionChannel: "PREPAID", plannedAmount: depositAmount, sequence: 1 },
        { stageType: "BALANCE", collectionChannel: "PREPAID", plannedAmount: balanceAmount, sequence: 2 },
      ].filter((item) => item.plannedAmount > 0);
    case "FULL_COD":
      return [{ stageType: "FULL", collectionChannel: "COD", plannedAmount: finalAmount, sequence: 1 }];
    case "DEPOSIT_PLUS_COD":
      return [
        { stageType: "DEPOSIT", collectionChannel: "PREPAID", plannedAmount: depositAmount, sequence: 1 },
        { stageType: "BALANCE", collectionChannel: "COD", plannedAmount: balanceAmount, sequence: 2 },
      ].filter((item) => item.plannedAmount > 0);
    default:
      return [];
  }
}

function inferHistoricalTargets(order) {
  const finalAmount = roundCurrency(Math.max(toNumber(order.finalAmount), 0));
  const submittedAmount = roundCurrency(
    Math.min(
      finalAmount,
      Math.max(
        toNumber(order.collectedAmount),
        toNumber(order.paidAmount),
        roundCurrency(finalAmount - Math.max(toNumber(order.remainingAmount), 0)),
      ),
    ),
  );
  const confirmedAmount = roundCurrency(
    Math.min(Math.max(toNumber(order.paidAmount), 0), submittedAmount),
  );

  return {
    submittedAmount,
    confirmedAmount,
    submittedOnlyAmount: roundCurrency(Math.max(submittedAmount - confirmedAmount, 0)),
  };
}

function calculateProgress(plannedAmount, submittedAmount, confirmedAmount) {
  const planned = roundCurrency(Math.max(plannedAmount, 0));
  const submitted = roundCurrency(Math.min(Math.max(submittedAmount, 0), planned));
  const confirmed = roundCurrency(Math.min(Math.max(confirmedAmount, 0), submitted));
  const remaining = roundCurrency(Math.max(planned - submitted, 0));

  if (planned === 0 || confirmed >= planned) return { submitted, confirmed, remaining, status: PaymentPlanStatus.COLLECTED };
  if (confirmed > 0) return { submitted, confirmed, remaining, status: PaymentPlanStatus.PARTIALLY_COLLECTED };
  if (submitted > 0) return { submitted, confirmed, remaining, status: PaymentPlanStatus.SUBMITTED };
  return { submitted: 0, confirmed: 0, remaining: planned, status: PaymentPlanStatus.PENDING };
}

function deriveSummary(plans) {
  return plans.reduce(
    (summary, plan) => {
      summary.depositAmount = roundCurrency(
        summary.depositAmount +
          (plan.stageType === PaymentPlanStageType.DEPOSIT ? plan.plannedAmount : 0),
      );
      summary.collectedAmount = roundCurrency(summary.collectedAmount + plan.submittedAmount);
      summary.paidAmount = roundCurrency(summary.paidAmount + plan.confirmedAmount);
      summary.remainingAmount = roundCurrency(summary.remainingAmount + plan.remainingAmount);
      summary.codAmount = roundCurrency(
        summary.codAmount +
          (plan.collectionChannel === PaymentCollectionChannel.COD ? plan.plannedAmount : 0),
      );
      return summary;
    },
    { depositAmount: 0, collectedAmount: 0, paidAmount: 0, remainingAmount: 0, codAmount: 0 },
  );
}

function deriveCollectionTaskType(plan) {
  if (plan.collectionChannel === PaymentCollectionChannel.COD) return "COD_COLLECTION";
  if (plan.stageType === PaymentPlanStageType.BALANCE) return "BALANCE_COLLECTION";
  return "GENERAL_COLLECTION";
}

function resolveSubmitterId(order, fallbackUserId) {
  return order.ownerId || order.createdById || order.updatedById || order.customer?.ownerId || fallbackUserId || null;
}

async function loadOrder(tx, orderId) {
  return tx.salesOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true,
      reviewStatus: true,
      paymentScheme: true,
      finalAmount: true,
      depositAmount: true,
      collectedAmount: true,
      paidAmount: true,
      remainingAmount: true,
      codAmount: true,
      createdAt: true,
      reviewedAt: true,
      customerId: true,
      ownerId: true,
      createdById: true,
      updatedById: true,
      reviewerId: true,
      customer: { select: { ownerId: true } },
      shippingTask: { select: { id: true, shippingStatus: true, shippedAt: true } },
      paymentPlans: {
        where: { sourceType: PaymentSourceType.SALES_ORDER },
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          stageType: true,
          collectionChannel: true,
          plannedAmount: true,
          submittedAmount: true,
          confirmedAmount: true,
          remainingAmount: true,
          status: true,
          sequence: true,
          shippingTaskId: true,
          paymentRecords: { orderBy: [{ createdAt: "asc" }], select: { id: true, amount: true, status: true } },
          collectionTasks: { orderBy: [{ createdAt: "asc" }], select: { id: true, status: true, ownerId: true, shippingTaskId: true, dueAt: true, nextFollowUpAt: true } },
        },
      },
    },
  });
}

async function processSalesOrder(orderId, options) {
  const run = async (tx) => {
    const result = {
      orderId,
      orderNo: "",
      createdPlans: 0,
      createdPaymentRecords: 0,
      createdCollectionTasks: 0,
      closedCollectionTasks: 0,
      recalibratedPlans: 0,
      recalibratedSummary: false,
      warnings: [],
    };

    let order = await loadOrder(tx, orderId);
    if (!order) return result;

    result.orderNo = order.orderNo;
    const shippingTaskId = order.shippingTask?.id ?? null;
    const ownerId = order.ownerId ?? order.customer?.ownerId ?? null;

    if (order.paymentPlans.length === 0) {
      for (const seed of getPlanSeeds(order)) {
        await tx.paymentPlan.create({
          data: {
            sourceType: PaymentSourceType.SALES_ORDER,
            salesOrderId: order.id,
            shippingTaskId,
            customerId: order.customerId,
            ownerId,
            subjectType: PaymentPlanSubjectType.GOODS,
            stageType: seed.stageType,
            collectionChannel: seed.collectionChannel,
            plannedAmount: seed.plannedAmount,
            submittedAmount: 0,
            confirmedAmount: 0,
            remainingAmount: seed.plannedAmount,
            status: PaymentPlanStatus.PENDING,
            sequence: seed.sequence,
            remark: "[Backfill] Created from historical SalesOrder summary.",
          },
        });
        result.createdPlans += 1;
      }
      order = await loadOrder(tx, orderId);
    }

    if (!order) throw new Error("回填过程中订单快照丢失。");

    const existingRecordCount = order.paymentPlans.reduce(
      (sum, plan) => sum + plan.paymentRecords.length,
      0,
    );
    const submitterId = resolveSubmitterId(order, options.fallbackUserId);
    const targets = inferHistoricalTargets(order);

    if (existingRecordCount === 0 && targets.submittedAmount > 0) {
      if (!submitterId) {
        result.warnings.push("订单缺少可用提交人，跳过历史 PaymentRecord 推断回填。");
      } else {
        let remainingConfirmed = targets.confirmedAmount;
        let remainingSubmittedOnly = targets.submittedOnlyAmount;
        const occurredAt = order.reviewedAt ?? order.createdAt;

        for (const plan of order.paymentPlans) {
          const plannedAmount = toNumber(plan.plannedAmount);
          const confirmedAmount = roundCurrency(Math.min(remainingConfirmed, plannedAmount));
          remainingConfirmed = roundCurrency(Math.max(remainingConfirmed - confirmedAmount, 0));
          const submittedOnlyAmount = roundCurrency(
            Math.min(remainingSubmittedOnly, Math.max(plannedAmount - confirmedAmount, 0)),
          );
          remainingSubmittedOnly = roundCurrency(
            Math.max(remainingSubmittedOnly - submittedOnlyAmount, 0),
          );

          if (confirmedAmount > 0) {
            await tx.paymentRecord.create({
              data: {
                paymentPlanId: plan.id,
                sourceType: PaymentSourceType.SALES_ORDER,
                salesOrderId: order.id,
                shippingTaskId,
                customerId: order.customerId,
                ownerId,
                amount: confirmedAmount,
                channel:
                  plan.collectionChannel === PaymentCollectionChannel.COD
                    ? PaymentRecordChannel.COD
                    : PaymentRecordChannel.ORDER_FORM_DECLARED,
                status: PaymentRecordStatus.CONFIRMED,
                occurredAt,
                submittedById: submitterId,
                confirmedById: order.reviewerId ?? null,
                confirmedAt: occurredAt,
                referenceNo: `BACKFILL:${order.orderNo}:${plan.sequence}:CONFIRMED`,
                remark: "[Backfill] Inferred confirmed payment from historical SalesOrder summary.",
              },
            });
            result.createdPaymentRecords += 1;
          }

          if (submittedOnlyAmount > 0) {
            await tx.paymentRecord.create({
              data: {
                paymentPlanId: plan.id,
                sourceType: PaymentSourceType.SALES_ORDER,
                salesOrderId: order.id,
                shippingTaskId,
                customerId: order.customerId,
                ownerId,
                amount: submittedOnlyAmount,
                channel:
                  plan.collectionChannel === PaymentCollectionChannel.COD
                    ? PaymentRecordChannel.COD
                    : PaymentRecordChannel.ORDER_FORM_DECLARED,
                status: PaymentRecordStatus.SUBMITTED,
                occurredAt,
                submittedById: submitterId,
                referenceNo: `BACKFILL:${order.orderNo}:${plan.sequence}:SUBMITTED`,
                remark: "[Backfill] Inferred submitted payment from historical SalesOrder summary.",
              },
            });
            result.createdPaymentRecords += 1;
          }
        }

        order = await loadOrder(tx, orderId);
      }
    }

    if (!order) throw new Error("回填过程中订单快照丢失。");

    for (const plan of order.paymentPlans) {
      const progress = calculateProgress(
        toNumber(plan.plannedAmount),
        plan.paymentRecords
          .filter((record) => record.status !== PaymentRecordStatus.REJECTED)
          .reduce((sum, record) => sum + toNumber(record.amount), 0),
        plan.paymentRecords
          .filter((record) => record.status === PaymentRecordStatus.CONFIRMED)
          .reduce((sum, record) => sum + toNumber(record.amount), 0),
      );

      const planNeedsUpdate =
        plan.shippingTaskId !== shippingTaskId ||
        toNumber(plan.submittedAmount) !== progress.submitted ||
        toNumber(plan.confirmedAmount) !== progress.confirmed ||
        toNumber(plan.remainingAmount) !== progress.remaining ||
        plan.status !== progress.status;

      if (planNeedsUpdate) {
        await tx.paymentPlan.update({
          where: { id: plan.id },
          data: {
            shippingTaskId,
            submittedAmount: progress.submitted,
            confirmedAmount: progress.confirmed,
            remainingAmount: progress.remaining,
            status: progress.status,
          },
        });
        result.recalibratedPlans += 1;
      }

      const activeTasks = plan.collectionTasks.filter(
        (task) =>
          task.status === CollectionTaskStatus.PENDING ||
          task.status === CollectionTaskStatus.IN_PROGRESS,
      );
      const codReady =
        plan.collectionChannel !== PaymentCollectionChannel.COD ||
        order.shippingTask?.shippingStatus === ShippingFulfillmentStatus.SHIPPED ||
        order.shippingTask?.shippingStatus === ShippingFulfillmentStatus.DELIVERED ||
        order.shippingTask?.shippingStatus === ShippingFulfillmentStatus.COMPLETED;
      const shouldKeepTask =
        order.reviewStatus !== "REJECTED" &&
        order.shippingTask?.shippingStatus !== ShippingFulfillmentStatus.CANCELED &&
        progress.remaining > 0 &&
        codReady &&
        ownerId;

      if (!shouldKeepTask) {
        for (const task of activeTasks) {
          await tx.collectionTask.update({
            where: { id: task.id },
            data: {
              status:
                progress.remaining <= 0
                  ? CollectionTaskStatus.COMPLETED
                  : CollectionTaskStatus.CANCELED,
              closedAt: new Date(),
              remark: "[Backfill] Closed by payment layer reconciliation.",
            },
          });
          result.closedCollectionTasks += 1;
        }
      } else {
        const dueAt =
          plan.collectionChannel === PaymentCollectionChannel.COD
            ? startOfDay(order.shippingTask?.shippedAt ?? order.createdAt)
            : startOfDay(order.reviewedAt ?? order.createdAt);
        const nextFollowUpAt = addDays(dueAt, 2);
        const activeTask = activeTasks[0] ?? null;

        if (!activeTask) {
          await tx.collectionTask.create({
            data: {
              paymentPlanId: plan.id,
              sourceType: PaymentSourceType.SALES_ORDER,
              salesOrderId: order.id,
              shippingTaskId,
              customerId: order.customerId,
              ownerId,
              taskType: deriveCollectionTaskType(plan),
              status: CollectionTaskStatus.PENDING,
              dueAt,
              nextFollowUpAt,
              remark: "[Backfill] Auto-created from historical SalesOrder payment plan.",
            },
          });
          result.createdCollectionTasks += 1;
        } else if (
          activeTask.ownerId !== ownerId ||
          activeTask.shippingTaskId !== shippingTaskId ||
          !activeTask.dueAt ||
          !activeTask.nextFollowUpAt ||
          activeTask.dueAt.getTime() !== dueAt.getTime() ||
          activeTask.nextFollowUpAt.getTime() !== nextFollowUpAt.getTime()
        ) {
          await tx.collectionTask.update({
            where: { id: activeTask.id },
            data: { ownerId, shippingTaskId, dueAt, nextFollowUpAt },
          });
        }
      }
    }

    order = await loadOrder(tx, orderId);
    if (!order) throw new Error("回填过程中订单快照丢失。");

    const summary = deriveSummary(
      order.paymentPlans.map((plan) => ({
        stageType: plan.stageType,
        collectionChannel: plan.collectionChannel,
        plannedAmount: toNumber(plan.plannedAmount),
        submittedAmount: toNumber(plan.submittedAmount),
        confirmedAmount: toNumber(plan.confirmedAmount),
        remainingAmount: toNumber(plan.remainingAmount),
      })),
    );

    if (
      toNumber(order.depositAmount) !== summary.depositAmount ||
      toNumber(order.collectedAmount) !== summary.collectedAmount ||
      toNumber(order.paidAmount) !== summary.paidAmount ||
      toNumber(order.remainingAmount) !== summary.remainingAmount ||
      toNumber(order.codAmount) !== summary.codAmount
    ) {
      await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          depositAmount: summary.depositAmount,
          collectedAmount: summary.collectedAmount,
          paidAmount: summary.paidAmount,
          remainingAmount: summary.remainingAmount,
          codAmount: summary.codAmount,
          updatedById: order.updatedById ?? null,
        },
      });
      result.recalibratedSummary = true;
    }

    await tx.operationLog.create({
      data: {
        actorId: null,
        module: OperationModule.PAYMENT,
        action: "sales_order.payment_backfilled",
        targetType: OperationTargetType.SALES_ORDER,
        targetId: order.id,
        description: `执行订单 ${order.orderNo} 的 payment layer 回填/校准`,
        afterData: {
          createdPlans: result.createdPlans,
          createdPaymentRecords: result.createdPaymentRecords,
          createdCollectionTasks: result.createdCollectionTasks,
          closedCollectionTasks: result.closedCollectionTasks,
          recalibratedPlans: result.recalibratedPlans,
          recalibratedSummary: result.recalibratedSummary,
        },
      },
    });

    if (options.dryRun) throw new DryRunRollbackError(result);
    return result;
  };

  try {
    return await prisma.$transaction(run);
  } catch (error) {
    if (error instanceof DryRunRollbackError) return error.result;
    throw error;
  }
}

function printResults(results, options) {
  const summary = results.reduce(
    (acc, item) => {
      acc.orders += 1;
      acc.createdPlans += item.createdPlans;
      acc.createdPaymentRecords += item.createdPaymentRecords;
      acc.createdCollectionTasks += item.createdCollectionTasks;
      acc.closedCollectionTasks += item.closedCollectionTasks;
      acc.recalibratedPlans += item.recalibratedPlans;
      acc.recalibratedSummary += item.recalibratedSummary ? 1 : 0;
      acc.warningCount += item.warnings.length;
      return acc;
    },
    { orders: 0, createdPlans: 0, createdPaymentRecords: 0, createdCollectionTasks: 0, closedCollectionTasks: 0, recalibratedPlans: 0, recalibratedSummary: 0, warningCount: 0 },
  );

  console.log(`模式: ${options.dryRun ? "DRY RUN（仅预览）" : "APPLY（实际写入）"}`);
  console.log(`订单数: ${summary.orders}`);
  console.log(`新建 PaymentPlan: ${summary.createdPlans}`);
  console.log(`新建 PaymentRecord: ${summary.createdPaymentRecords}`);
  console.log(`新建 CollectionTask: ${summary.createdCollectionTasks}`);
  console.log(`关闭 CollectionTask: ${summary.closedCollectionTasks}`);
  console.log(`校准 PaymentPlan: ${summary.recalibratedPlans}`);
  console.log(`校准 SalesOrder 摘要: ${summary.recalibratedSummary}`);
  console.log(`警告数: ${summary.warningCount}`);

  for (const item of results) {
    if (options.verbose || item.createdPlans || item.createdPaymentRecords || item.createdCollectionTasks || item.closedCollectionTasks || item.recalibratedPlans || item.recalibratedSummary || item.warnings.length) {
      console.log(
        `- ${item.orderNo || item.orderId}: plan+${item.createdPlans}, record+${item.createdPaymentRecords}, task+${item.createdCollectionTasks}, taskClose+${item.closedCollectionTasks}, planSync+${item.recalibratedPlans}, summary=${item.recalibratedSummary ? "yes" : "no"}`,
      );
      for (const warning of item.warnings) console.log(`  warning: ${warning}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const orders = await prisma.salesOrder.findMany({
    where: options.orderId ? { id: options.orderId } : {},
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: options.limit > 0 ? options.limit : undefined,
    select: { id: true },
  });

  if (orders.length === 0) {
    console.log("没有找到可处理的 SalesOrder。");
    return;
  }

  const results = [];
  for (const order of orders) results.push(await processSalesOrder(order.id, options));
  printResults(results, options);
}

main()
  .catch((error) => {
    console.error("Payment layer 回填失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
