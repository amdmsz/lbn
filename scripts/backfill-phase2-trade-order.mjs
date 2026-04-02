import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  OperationModule,
  OperationTargetType,
  PrismaClient,
  SalesOrderReviewStatus,
  SalesSubOrderStatus,
  TradeOrderComponentType,
  TradeOrderItemComponentSourceType,
  TradeOrderItemSourceType,
  TradeOrderItemType,
  TradeOrderStatus,
} from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/liquor_crm",
  ),
  log: ["warn", "error"],
});

const MODE_REPORT_ONLY = "report-only";
const MODE_DRY_RUN = "dry-run";
const MODE_APPLY = "apply";

const SKIP_REASON_ALREADY_BACKFILLED = "ALREADY_BACKFILLED";
const SKIP_REASON_PARTIAL_REQUIRES_REPAIR = "PARTIAL_BACKFILL_REQUIRES_REPAIR";

const WARNING_GIFT_NAME_EMPTY = "GIFT_NAME_EMPTY";
const WARNING_PARTIAL_BACKFILL_DETECTED = "PARTIAL_BACKFILL_DETECTED";
const WARNING_PAYMENT_PLAN_SKIPPED_GIFT_RECORD_ONLY = "PAYMENT_PLAN_SKIPPED_GIFT_RECORD_ONLY";
const WARNING_SHIPPING_TASK_SKIPPED_GIFT_RECORD_ONLY =
  "SHIPPING_TASK_SKIPPED_GIFT_RECORD_ONLY";
const WARNING_GIFT_PRODUCT_SNAPSHOT_MISSING = "GIFT_PRODUCT_SNAPSHOT_MISSING";

const ERROR_MISSING_CUSTOMER_ID = "MISSING_CUSTOMER_ID";
const ERROR_MISSING_SUPPLIER_ID = "MISSING_SUPPLIER_ID";
const ERROR_BROKEN_SALES_ORDER_ITEM_LINK = "BROKEN_SALES_ORDER_ITEM_LINK";
const ERROR_TRADE_NO_CONFLICT = "TRADE_NO_CONFLICT";
const ERROR_SUB_ORDER_NO_CONFLICT = "SUB_ORDER_NO_CONFLICT";
const ERROR_DUPLICATE_TRADE_ORDER_MAPPING = "DUPLICATE_TRADE_ORDER_MAPPING";
const ERROR_DUPLICATE_COMPONENT_MAPPING = "DUPLICATE_COMPONENT_MAPPING";
const ERROR_INVALID_EXISTING_TRADE_ORDER_ID = "INVALID_EXISTING_TRADE_ORDER_ID";
const ERROR_INVALID_EXISTING_COMPONENT_ID = "INVALID_EXISTING_COMPONENT_ID";
const ERROR_PAYMENT_RECORD_CANNOT_RESOLVE_TRADE_ORDER =
  "PAYMENT_RECORD_CANNOT_RESOLVE_TRADE_ORDER";
const ERROR_COLLECTION_TASK_CANNOT_RESOLVE_TRADE_ORDER =
  "COLLECTION_TASK_CANNOT_RESOLVE_TRADE_ORDER";
const ERROR_COD_RECORD_CANNOT_RESOLVE_TRADE_ORDER =
  "COD_RECORD_CANNOT_RESOLVE_TRADE_ORDER";
const ERROR_LOGISTICS_TASK_CANNOT_RESOLVE_TRADE_ORDER =
  "LOGISTICS_TASK_CANNOT_RESOLVE_TRADE_ORDER";
const ERROR_REPAIR_NOT_ALLOWED_CONFLICTING_SNAPSHOT =
  "REPAIR_NOT_ALLOWED_CONFLICTING_SNAPSHOT";
const ERROR_NO_ORDER_LINES = "NO_ORDER_LINES";
const ERROR_DB_SCHEMA_OUTDATED = "DB_SCHEMA_OUTDATED";
const ERROR_UNKNOWN = "UNKNOWN_ERROR";

class DryRunRollbackError extends Error {
  constructor(result) {
    super("DRY_RUN_ROLLBACK");
    this.result = result;
  }
}

class BackfillOrderError extends Error {
  constructor({ code, phase, message, salesOrderId, entityType, entityId, retryable = false }) {
    super(message);
    this.code = code;
    this.phase = phase;
    this.salesOrderId = salesOrderId ?? null;
    this.entityType = entityType ?? "SalesOrder";
    this.entityId = entityId ?? salesOrderId ?? null;
    this.retryable = retryable;
  }
}

function parseArgs(argv) {
  const args = {
    mode: "",
    limit: 0,
    orderId: "",
    orderNo: "",
    resumeFrom: "",
    onlyMissingTradeOrder: false,
    repairPartial: false,
    verbose: false,
    reportFile: "",
    fallbackUserId: "",
    strict: false,
  };

  for (const token of argv.slice(2)) {
    if (token === "--report-only") args.mode = MODE_REPORT_ONLY;
    else if (token === "--dry-run") args.mode = MODE_DRY_RUN;
    else if (token === "--apply") args.mode = MODE_APPLY;
    else if (token === "--only-missing-trade-order") args.onlyMissingTradeOrder = true;
    else if (token === "--repair-partial") args.repairPartial = true;
    else if (token === "--verbose") args.verbose = true;
    else if (token === "--strict") args.strict = true;
    else if (token.startsWith("--limit=")) {
      const value = Number(token.slice(8));
      args.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } else if (token.startsWith("--order-id=")) {
      args.orderId = token.slice(11).trim();
    } else if (token.startsWith("--orderId=")) {
      args.orderId = token.slice(10).trim();
    } else if (token.startsWith("--order-no=")) {
      args.orderNo = token.slice(11).trim();
    } else if (token.startsWith("--resume-from=")) {
      args.resumeFrom = token.slice(14).trim();
    } else if (token.startsWith("--report-file=")) {
      args.reportFile = token.slice(14).trim();
    } else if (token.startsWith("--fallback-user-id=")) {
      args.fallbackUserId = token.slice(19).trim();
    }
  }

  if (!args.mode) {
    throw new Error("必须显式传入一个模式：--report-only、--dry-run 或 --apply。");
  }
  if (args.orderId && args.orderNo) {
    throw new Error("--order-id 与 --order-no 不能同时使用。");
  }
  if (args.onlyMissingTradeOrder && args.repairPartial) {
    throw new Error("--only-missing-trade-order 与 --repair-partial 不能同时使用。");
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

function normalizeMoney(value) {
  return roundCurrency(toNumber(value));
}

function trimOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value) {
  const trimmed = trimOrEmpty(value);
  return trimmed.length > 0 ? trimmed : null;
}

function serializeError(error) {
  if (error instanceof BackfillOrderError) {
    return {
      code: error.code,
      phase: error.phase,
      message: error.message,
      salesOrderId: error.salesOrderId,
      entityType: error.entityType,
      entityId: error.entityId,
      retryable: error.retryable,
    };
  }

  if (error && typeof error === "object" && "code" in error && error.code === "P2022") {
    return {
      code: ERROR_DB_SCHEMA_OUTDATED,
      phase: "PRECHECK",
      message:
        "当前数据库尚未应用 Phase 1 schema，缺少 TradeOrder 回填所需列。请先执行 Phase 1 migration。",
      salesOrderId: null,
      entityType: "Database",
      entityId: null,
      retryable: false,
    };
  }

  return {
    code: ERROR_UNKNOWN,
    phase: "UNKNOWN",
    message: error instanceof Error ? error.message : String(error),
    salesOrderId: null,
    entityType: "Unknown",
    entityId: null,
    retryable: false,
  };
}

function createWarning({
  code,
  phase,
  message,
  salesOrderId,
  entityType = "SalesOrder",
  entityId = null,
}) {
  return {
    code,
    severity: "WARNING",
    salesOrderId: salesOrderId ?? null,
    entityType,
    entityId,
    phase,
    message,
  };
}

function createReport(options) {
  return {
    meta: {
      scriptName: "phase2-backfill-trade-order",
      scriptVersion: "v1",
      mode: options.mode,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: 0,
      args: {
        limit: options.limit,
        orderId: options.orderId || null,
        orderNo: options.orderNo || null,
        resumeFrom: options.resumeFrom || null,
        onlyMissingTradeOrder: options.onlyMissingTradeOrder,
        repairPartial: options.repairPartial,
        verbose: options.verbose,
        strict: options.strict,
        reportFile: options.reportFile || null,
        fallbackUserId: options.fallbackUserId || null,
      },
    },
    summary: {
      result: "SUCCESS",
      scannedOrders: 0,
      eligibleOrders: 0,
      processedOrders: 0,
      skippedOrders: 0,
      repairedOrders: 0,
      warningOrders: 0,
      failedOrders: 0,
    },
    counters: {
      tradeOrdersCreated: 0,
      tradeOrdersReused: 0,
      tradeOrderItemsCreated: 0,
      tradeOrderItemComponentsCreated: 0,
      salesOrdersAnchored: 0,
      salesOrderItemsAnchored: 0,
      giftItemsConverted: 0,
      shippingTasksAnchored: 0,
      paymentPlansAnchored: 0,
      paymentRecordsAnchored: 0,
      collectionTasksAnchored: 0,
      codCollectionRecordsAnchored: 0,
      logisticsFollowUpTasksAnchored: 0,
    },
    candidateOrders: [],
    processedOrders: [],
    skippedOrders: [],
    repairedOrders: [],
    warningOrders: [],
    failedOrders: [],
    warnings: [],
    errors: [],
  };
}

function finalizeReport(report) {
  const endedAt = new Date();
  report.meta.endedAt = endedAt.toISOString();
  report.meta.durationMs =
    endedAt.getTime() - new Date(report.meta.startedAt).getTime();
  report.summary.processedOrders = report.processedOrders.length;
  report.summary.skippedOrders = report.skippedOrders.length;
  report.summary.repairedOrders = report.repairedOrders.length;
  report.summary.warningOrders = report.warningOrders.length;
  report.summary.failedOrders = report.failedOrders.length;

  if (report.failedOrders.length > 0) {
    report.summary.result =
      report.processedOrders.length > 0 || report.skippedOrders.length > 0
        ? "PARTIAL_FAILURE"
        : "FAILED";
  } else if (report.warnings.length > 0) {
    report.summary.result = "SUCCESS_WITH_WARNINGS";
  }
}

function pushWarnings(report, warnings, warningOrder) {
  if (warnings.length === 0) return;
  report.warnings.push(...warnings);
  if (warningOrder) report.warningOrders.push(warningOrder);
}

function pushError(report, errorPayload, failedOrder) {
  report.errors.push({
    code: errorPayload.code,
    severity: "ERROR",
    salesOrderId: errorPayload.salesOrderId,
    entityType: errorPayload.entityType,
    entityId: errorPayload.entityId,
    phase: errorPayload.phase,
    message: errorPayload.message,
    retryable: errorPayload.retryable,
  });
  report.failedOrders.push(failedOrder);
}

function buildDesiredTradeNo(orderNo) {
  return `TOH-${orderNo}`;
}

function buildDesiredSubOrderNo(tradeNo) {
  return `${tradeNo}-S01`;
}

function deriveTradeStatus(reviewStatus) {
  switch (reviewStatus) {
    case SalesOrderReviewStatus.APPROVED:
      return TradeOrderStatus.APPROVED;
    case SalesOrderReviewStatus.REJECTED:
      return TradeOrderStatus.REJECTED;
    case SalesOrderReviewStatus.PENDING_REVIEW:
    default:
      return TradeOrderStatus.PENDING_REVIEW;
  }
}

function deriveSubOrderStatus(reviewStatus) {
  switch (reviewStatus) {
    case SalesOrderReviewStatus.APPROVED:
      return SalesSubOrderStatus.READY_FOR_FULFILLMENT;
    case SalesOrderReviewStatus.REJECTED:
      return SalesSubOrderStatus.CANCELED;
    default:
      return SalesSubOrderStatus.PENDING_PARENT_REVIEW;
  }
}

function makeGiftFallbackName() {
  return "未命名赠品";
}

function parseResumeToken(token) {
  if (!token) return null;
  if (token.startsWith("id:")) return { type: "id", value: token.slice(3) };
  if (token.startsWith("no:")) return { type: "no", value: token.slice(3) };
  return { type: "id", value: token };
}

async function resolveResumeCursor(options) {
  const token = parseResumeToken(options.resumeFrom);
  if (!token?.value) return null;

  if (token.type === "no") {
    return prisma.salesOrder.findUnique({
      where: { orderNo: token.value },
      select: { id: true, createdAt: true },
    });
  }

  return prisma.salesOrder.findUnique({
    where: { id: token.value },
    select: { id: true, createdAt: true },
  });
}

async function listCandidateOrderIds(options) {
  const resumeCursor = await resolveResumeCursor(options);
  const andClauses = [];

  if (options.orderId) andClauses.push({ id: options.orderId });
  else if (options.orderNo) andClauses.push({ orderNo: options.orderNo });
  else {
    if (options.onlyMissingTradeOrder) andClauses.push({ tradeOrderId: null });
    if (resumeCursor) {
      andClauses.push({
        OR: [
          { createdAt: { gt: resumeCursor.createdAt } },
          { createdAt: resumeCursor.createdAt, id: { gt: resumeCursor.id } },
        ],
      });
    }
  }

  const where = andClauses.length > 0 ? { AND: andClauses } : {};

  return prisma.salesOrder.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take:
      options.orderId || options.orderNo
        ? 1
        : options.limit > 0
          ? options.limit
          : undefined,
    select: { id: true },
  });
}

async function loadOrderSnapshot(client, orderId) {
  const order = await client.salesOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true,
      tradeOrderId: true,
      subOrderNo: true,
      supplierSequence: true,
      subOrderStatus: true,
      customerId: true,
      ownerId: true,
      supplierId: true,
      reviewStatus: true,
      paymentScheme: true,
      paymentMode: true,
      listAmount: true,
      dealAmount: true,
      goodsAmount: true,
      discountAmount: true,
      finalAmount: true,
      depositAmount: true,
      collectedAmount: true,
      paidAmount: true,
      remainingAmount: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
      discountReason: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
      receiverAddressSnapshot: true,
      reviewerId: true,
      reviewedAt: true,
      rejectReason: true,
      remark: true,
      createdById: true,
      updatedById: true,
      createdAt: true,
      updatedAt: true,
      supplier: { select: { id: true, name: true } },
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
          customerId: true,
          paymentScheme: true,
          listAmount: true,
          dealAmount: true,
          goodsAmount: true,
          discountAmount: true,
          finalAmount: true,
          codAmount: true,
          insuranceRequired: true,
          insuranceAmount: true,
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          items: {
            orderBy: [{ lineNo: "asc" }, { id: "asc" }],
            select: {
              id: true,
              lineNo: true,
              itemType: true,
              itemSourceType: true,
              productId: true,
              skuId: true,
              bundleId: true,
              titleSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              specSnapshot: true,
              unitSnapshot: true,
              listUnitPriceSnapshot: true,
              dealUnitPriceSnapshot: true,
              qty: true,
              subtotal: true,
              discountAmount: true,
              remark: true,
            },
          },
          components: {
            orderBy: [{ tradeOrderItemId: "asc" }, { componentSeq: "asc" }],
            select: {
              id: true,
              tradeOrderItemId: true,
              componentSeq: true,
              componentType: true,
              componentSourceType: true,
              supplierId: true,
              productId: true,
              skuId: true,
              supplierNameSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              specSnapshot: true,
              unitSnapshot: true,
              exportDisplayNameSnapshot: true,
              qty: true,
              allocatedListUnitPriceSnapshot: true,
              allocatedDealUnitPriceSnapshot: true,
              allocatedSubtotal: true,
              allocatedDiscountAmount: true,
            },
          },
        },
      },
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          tradeOrderId: true,
          tradeOrderItemId: true,
          tradeOrderItemComponentId: true,
          lineNo: true,
          itemTypeSnapshot: true,
          titleSnapshot: true,
          exportDisplayNameSnapshot: true,
          productId: true,
          skuId: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          unitSnapshot: true,
          listPriceSnapshot: true,
          dealPriceSnapshot: true,
          qty: true,
          subtotal: true,
          discountAmount: true,
          createdAt: true,
        },
      },
      giftItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, giftName: true, qty: true, remark: true, createdAt: true },
      },
      shippingTask: {
        select: {
          id: true,
          tradeOrderId: true,
          salesOrderId: true,
          giftRecordId: true,
          shippingStatus: true,
          supplierId: true,
        },
      },
    },
  });

  if (!order) return null;

  const shippingTaskId = order.shippingTask?.id ?? null;
  const paymentPlans = await client.paymentPlan.findMany({
    where: {
      OR: [
        { salesOrderId: order.id },
        ...(shippingTaskId ? [{ shippingTaskId }] : []),
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      sourceType: true,
      tradeOrderId: true,
      salesOrderId: true,
      giftRecordId: true,
      shippingTaskId: true,
    },
  });
  const paymentPlanIds = paymentPlans.map((plan) => plan.id);

  const buildOr = (extra = []) => ({
    OR: [
      { salesOrderId: order.id },
      ...(paymentPlanIds.length > 0 ? [{ paymentPlanId: { in: paymentPlanIds } }] : []),
      ...(shippingTaskId ? [{ shippingTaskId }] : []),
      ...extra,
    ],
  });

  const [paymentRecords, collectionTasks, codCollectionRecords, logisticsFollowUpTasks] =
    await Promise.all([
      client.paymentRecord.findMany({
        where: buildOr(),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          paymentPlanId: true,
          tradeOrderId: true,
          salesOrderId: true,
          shippingTaskId: true,
        },
      }),
      client.collectionTask.findMany({
        where: buildOr(),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          paymentPlanId: true,
          tradeOrderId: true,
          salesOrderId: true,
          giftRecordId: true,
          shippingTaskId: true,
        },
      }),
      client.codCollectionRecord.findMany({
        where: buildOr(),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          paymentPlanId: true,
          tradeOrderId: true,
          salesOrderId: true,
          shippingTaskId: true,
        },
      }),
      client.logisticsFollowUpTask.findMany({
        where: {
          OR: [{ salesOrderId: order.id }, ...(shippingTaskId ? [{ shippingTaskId }] : [])],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          tradeOrderId: true,
          salesOrderId: true,
          shippingTaskId: true,
        },
      }),
    ]);

  return {
    order,
    items: order.items,
    giftItems: order.giftItems,
    tradeOrder: order.tradeOrder,
    shippingTask: order.shippingTask,
    paymentPlans,
    paymentRecords,
    collectionTasks,
    codCollectionRecords,
    logisticsFollowUpTasks,
  };
}

function buildDesiredTradeOrder(snapshot) {
  const order = snapshot.order;
  return {
    tradeNo: buildDesiredTradeNo(order.orderNo),
    customerId: order.customerId,
    ownerId: order.ownerId ?? null,
    reviewStatus: order.reviewStatus,
    tradeStatus: deriveTradeStatus(order.reviewStatus),
    paymentScheme: order.paymentScheme,
    listAmount: normalizeMoney(order.listAmount),
    dealAmount: normalizeMoney(order.dealAmount),
    goodsAmount: normalizeMoney(order.goodsAmount),
    discountAmount: normalizeMoney(order.discountAmount),
    finalAmount: normalizeMoney(order.finalAmount),
    depositAmount: normalizeMoney(order.depositAmount),
    collectedAmount: normalizeMoney(order.collectedAmount),
    paidAmount: normalizeMoney(order.paidAmount),
    remainingAmount: normalizeMoney(order.remainingAmount),
    codAmount: normalizeMoney(order.codAmount),
    insuranceRequired: Boolean(order.insuranceRequired),
    insuranceAmount: normalizeMoney(order.insuranceAmount),
    discountReason: normalizeNullableText(order.discountReason),
    receiverNameSnapshot: order.receiverNameSnapshot,
    receiverPhoneSnapshot: order.receiverPhoneSnapshot,
    receiverAddressSnapshot: order.receiverAddressSnapshot,
    reviewerId: order.reviewerId ?? null,
    reviewedAt: order.reviewedAt ?? null,
    rejectReason: normalizeNullableText(order.rejectReason),
    remark: normalizeNullableText(order.remark),
    createdById: order.createdById ?? null,
    updatedById: order.updatedById ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function buildDesiredLineSpecs(snapshot) {
  const warnings = [];
  const specs = [];
  let lineNo = 1;

  for (const item of snapshot.items) {
    const discountAmount = roundCurrency(
      Math.max(
        roundCurrency(toNumber(item.listPriceSnapshot) - toNumber(item.dealPriceSnapshot)) *
          Math.max(item.qty ?? 0, 0),
        0,
      ),
    );
    const exportName = item.productNameSnapshot;

    specs.push({
      kind: "GOODS",
      sourceId: item.id,
      lineNo,
      itemData: {
        itemType: TradeOrderItemType.SKU,
        itemSourceType: TradeOrderItemSourceType.DIRECT_SKU,
        productId: item.productId,
        skuId: item.skuId,
        titleSnapshot: item.productNameSnapshot,
        productNameSnapshot: item.productNameSnapshot,
        skuNameSnapshot: item.skuNameSnapshot,
        specSnapshot: item.specSnapshot,
        unitSnapshot: item.unitSnapshot,
        listUnitPriceSnapshot: normalizeMoney(item.listPriceSnapshot),
        dealUnitPriceSnapshot: normalizeMoney(item.dealPriceSnapshot),
        qty: item.qty,
        subtotal: normalizeMoney(item.subtotal),
        discountAmount,
        remark: null,
        createdAt: item.createdAt,
        updatedAt: snapshot.order.updatedAt,
      },
      componentData: {
        componentType: TradeOrderComponentType.GOODS,
        componentSourceType: TradeOrderItemComponentSourceType.DIRECT_SKU,
        supplierId: snapshot.order.supplierId,
        productId: item.productId,
        skuId: item.skuId,
        supplierNameSnapshot: snapshot.order.supplier?.name ?? snapshot.order.supplierId,
        productNameSnapshot: item.productNameSnapshot,
        skuNameSnapshot: item.skuNameSnapshot,
        specSnapshot: item.specSnapshot,
        unitSnapshot: item.unitSnapshot,
        exportDisplayNameSnapshot: exportName,
        qty: item.qty,
        allocatedListUnitPriceSnapshot: normalizeMoney(item.listPriceSnapshot),
        allocatedDealUnitPriceSnapshot: normalizeMoney(item.dealPriceSnapshot),
        allocatedSubtotal: normalizeMoney(item.subtotal),
        allocatedDiscountAmount: discountAmount,
        createdAt: item.createdAt,
        updatedAt: snapshot.order.updatedAt,
      },
      anchors: {
        itemTypeSnapshot: TradeOrderItemType.SKU,
        titleSnapshot: item.productNameSnapshot,
        exportDisplayNameSnapshot: exportName,
      },
    });
    lineNo += 1;
  }

  for (const gift of snapshot.giftItems) {
    const name = trimOrEmpty(gift.giftName) || makeGiftFallbackName();
    if (!trimOrEmpty(gift.giftName)) {
      warnings.push(
        createWarning({
          code: WARNING_GIFT_NAME_EMPTY,
          phase: "PRECHECK",
          salesOrderId: snapshot.order.id,
          entityType: "SalesOrderGiftItem",
          entityId: gift.id,
          message: `赠品行 ${gift.id} 缺少 giftName，已回退为 ${name}。`,
        }),
      );
    }
    warnings.push(
      createWarning({
        code: WARNING_GIFT_PRODUCT_SNAPSHOT_MISSING,
        phase: "PRECHECK",
        salesOrderId: snapshot.order.id,
        entityType: "SalesOrderGiftItem",
        entityId: gift.id,
        message: `历史赠品行 ${gift.id} 按自由文本赠品兼容回填。`,
      }),
    );
    specs.push({
      kind: "GIFT",
      sourceId: gift.id,
      lineNo,
      itemData: {
        itemType: TradeOrderItemType.GIFT,
        itemSourceType: TradeOrderItemSourceType.MANUAL_GIFT,
        productId: null,
        skuId: null,
        titleSnapshot: name,
        productNameSnapshot: null,
        skuNameSnapshot: null,
        specSnapshot: null,
        unitSnapshot: null,
        listUnitPriceSnapshot: 0,
        dealUnitPriceSnapshot: 0,
        qty: gift.qty,
        subtotal: 0,
        discountAmount: 0,
        remark: normalizeNullableText(gift.remark),
        createdAt: gift.createdAt,
        updatedAt: snapshot.order.updatedAt,
      },
      componentData: {
        componentType: TradeOrderComponentType.GIFT,
        componentSourceType: TradeOrderItemComponentSourceType.GIFT_COMPONENT,
        supplierId: snapshot.order.supplierId,
        productId: null,
        skuId: null,
        supplierNameSnapshot: snapshot.order.supplier?.name ?? snapshot.order.supplierId,
        productNameSnapshot: name,
        skuNameSnapshot: null,
        specSnapshot: null,
        unitSnapshot: null,
        exportDisplayNameSnapshot: name,
        qty: gift.qty,
        allocatedListUnitPriceSnapshot: 0,
        allocatedDealUnitPriceSnapshot: 0,
        allocatedSubtotal: 0,
        allocatedDiscountAmount: 0,
        createdAt: gift.createdAt,
        updatedAt: snapshot.order.updatedAt,
      },
    });
    lineNo += 1;
  }

  return { specs, warnings };
}

function sameTradeOrder(existing, expected) {
  return (
    existing.tradeNo === expected.tradeNo &&
    existing.customerId === expected.customerId &&
    normalizeMoney(existing.listAmount) === expected.listAmount &&
    normalizeMoney(existing.dealAmount) === expected.dealAmount &&
    normalizeMoney(existing.goodsAmount) === expected.goodsAmount &&
    normalizeMoney(existing.discountAmount) === expected.discountAmount &&
    normalizeMoney(existing.finalAmount) === expected.finalAmount &&
    normalizeMoney(existing.codAmount) === expected.codAmount &&
    normalizeMoney(existing.insuranceAmount) === expected.insuranceAmount &&
    Boolean(existing.insuranceRequired) === Boolean(expected.insuranceRequired) &&
    existing.receiverNameSnapshot === expected.receiverNameSnapshot &&
    existing.receiverPhoneSnapshot === expected.receiverPhoneSnapshot &&
    existing.receiverAddressSnapshot === expected.receiverAddressSnapshot
  );
}

function sameTradeOrderItem(existing, spec) {
  return (
    existing.lineNo === spec.lineNo &&
    existing.itemType === spec.itemData.itemType &&
    existing.itemSourceType === spec.itemData.itemSourceType &&
    (existing.productId ?? null) === (spec.itemData.productId ?? null) &&
    (existing.skuId ?? null) === (spec.itemData.skuId ?? null) &&
    existing.titleSnapshot === spec.itemData.titleSnapshot &&
    (existing.productNameSnapshot ?? null) === (spec.itemData.productNameSnapshot ?? null) &&
    (existing.skuNameSnapshot ?? null) === (spec.itemData.skuNameSnapshot ?? null) &&
    (existing.specSnapshot ?? null) === (spec.itemData.specSnapshot ?? null) &&
    (existing.unitSnapshot ?? null) === (spec.itemData.unitSnapshot ?? null) &&
    normalizeMoney(existing.listUnitPriceSnapshot) === spec.itemData.listUnitPriceSnapshot &&
    normalizeMoney(existing.dealUnitPriceSnapshot) === spec.itemData.dealUnitPriceSnapshot &&
    existing.qty === spec.itemData.qty &&
    normalizeMoney(existing.subtotal) === spec.itemData.subtotal &&
    normalizeMoney(existing.discountAmount) === spec.itemData.discountAmount
  );
}

function sameComponent(existing, spec) {
  return (
    existing.componentSeq === 1 &&
    existing.componentType === spec.componentData.componentType &&
    existing.componentSourceType === spec.componentData.componentSourceType &&
    existing.supplierId === spec.componentData.supplierId &&
    (existing.productId ?? null) === (spec.componentData.productId ?? null) &&
    (existing.skuId ?? null) === (spec.componentData.skuId ?? null) &&
    existing.productNameSnapshot === spec.componentData.productNameSnapshot &&
    existing.exportDisplayNameSnapshot === spec.componentData.exportDisplayNameSnapshot &&
    existing.qty === spec.componentData.qty &&
    normalizeMoney(existing.allocatedSubtotal) === spec.componentData.allocatedSubtotal
  );
}

function analyzeSnapshot(snapshot, options) {
  const warnings = [];
  const errors = [];
  const desiredTradeOrder = buildDesiredTradeOrder(snapshot);
  const desiredSubOrderNo = buildDesiredSubOrderNo(desiredTradeOrder.tradeNo);
  const { specs, warnings: specWarnings } = buildDesiredLineSpecs(snapshot);
  warnings.push(...specWarnings);

  if (!snapshot.order.customerId) {
    errors.push(
      serializeError(
        new BackfillOrderError({
          code: ERROR_MISSING_CUSTOMER_ID,
          phase: "PRECHECK",
          message: `订单 ${snapshot.order.orderNo} 缺少 customerId。`,
          salesOrderId: snapshot.order.id,
        }),
      ),
    );
  }
  if (!snapshot.order.supplierId) {
    errors.push(
      serializeError(
        new BackfillOrderError({
          code: ERROR_MISSING_SUPPLIER_ID,
          phase: "PRECHECK",
          message: `订单 ${snapshot.order.orderNo} 缺少 supplierId。`,
          salesOrderId: snapshot.order.id,
        }),
      ),
    );
  }
  if (specs.length === 0) {
    errors.push(
      serializeError(
        new BackfillOrderError({
          code: ERROR_NO_ORDER_LINES,
          phase: "PRECHECK",
          message: `订单 ${snapshot.order.orderNo} 没有任何商品行或赠品行。`,
          salesOrderId: snapshot.order.id,
        }),
      ),
    );
  }

  const itemByLine = new Map((snapshot.tradeOrder?.items ?? []).map((item) => [item.lineNo, item]));
  const componentByItem = new Map();
  for (const component of snapshot.tradeOrder?.components ?? []) {
    componentByItem.set(component.tradeOrderItemId, component);
  }

  let fullBackfill =
    Boolean(snapshot.order.tradeOrderId) &&
    Boolean(snapshot.tradeOrder) &&
    sameTradeOrder(snapshot.tradeOrder, desiredTradeOrder) &&
    specs.length === (snapshot.tradeOrder?.items.length ?? 0) &&
    specs.length === (snapshot.tradeOrder?.components.length ?? 0);

  for (const spec of specs) {
    const existingItem = itemByLine.get(spec.lineNo);
    const existingComponent = existingItem
      ? componentByItem.get(existingItem.id) ?? null
      : null;

    if (!existingItem || !existingComponent) {
      fullBackfill = false;
      continue;
    }
    if (!sameTradeOrderItem(existingItem, spec) || !sameComponent(existingComponent, spec)) {
      errors.push(
        serializeError(
          new BackfillOrderError({
            code: ERROR_REPAIR_NOT_ALLOWED_CONFLICTING_SNAPSHOT,
            phase: "PRECHECK",
            message: `订单 ${snapshot.order.orderNo} 第 ${spec.lineNo} 行已存在冲突的回填快照。`,
            salesOrderId: snapshot.order.id,
            entityType: "TradeOrderItem",
            entityId: existingItem.id,
          }),
        ),
      );
    }
  }

  const goodsAnchored = snapshot.items.every((item) => {
    const existingItem = item.lineNo ? itemByLine.get(item.lineNo) : null;
    const existingComponent = existingItem
      ? componentByItem.get(existingItem.id) ?? null
      : null;
    return (
      Boolean(item.tradeOrderId) &&
      Boolean(item.tradeOrderItemId) &&
      Boolean(item.tradeOrderItemComponentId) &&
      Boolean(existingItem) &&
      Boolean(existingComponent)
    );
  });
  const descendantsAnchored =
    (!snapshot.shippingTask || snapshot.shippingTask.giftRecordId
      ? true
      : Boolean(snapshot.shippingTask.tradeOrderId)) &&
    snapshot.paymentPlans.every((plan) =>
      plan.giftRecordId && !plan.salesOrderId ? true : Boolean(plan.tradeOrderId),
    ) &&
    snapshot.paymentRecords.every((record) => Boolean(record.tradeOrderId)) &&
    snapshot.collectionTasks.every((task) =>
      task.giftRecordId && !task.salesOrderId ? true : Boolean(task.tradeOrderId),
    ) &&
    snapshot.codCollectionRecords.every((record) => Boolean(record.tradeOrderId)) &&
    snapshot.logisticsFollowUpTasks.every((task) => Boolean(task.tradeOrderId));

  fullBackfill = fullBackfill && goodsAnchored && descendantsAnchored && errors.length === 0;
  const partialBackfill =
    !fullBackfill &&
    (Boolean(snapshot.order.tradeOrderId) ||
      snapshot.items.some((item) => item.tradeOrderItemId || item.tradeOrderItemComponentId));

  if (partialBackfill) {
    warnings.push(
      createWarning({
        code: WARNING_PARTIAL_BACKFILL_DETECTED,
        phase: "PRECHECK",
        salesOrderId: snapshot.order.id,
        entityType: "SalesOrder",
        entityId: snapshot.order.id,
        message: `订单 ${snapshot.order.orderNo} 已检测到部分回填痕迹。`,
      }),
    );
  }

  return {
    desiredTradeOrder,
    desiredSubOrderNo,
    desiredSpecs: specs,
    warnings,
    errors,
    fullBackfill,
    partialBackfill,
    skipReasonCode: fullBackfill
      ? SKIP_REASON_ALREADY_BACKFILLED
      : partialBackfill && !options.repairPartial
        ? SKIP_REASON_PARTIAL_REQUIRES_REPAIR
        : null,
    mode: partialBackfill ? "REPAIR" : "NEW",
  };
}

function ensureCompatibleAnchor(current, expected, config) {
  if (current == null || current === expected) return;
  throw new BackfillOrderError({
    code: config.code ?? ERROR_REPAIR_NOT_ALLOWED_CONFLICTING_SNAPSHOT,
    phase: config.phase,
    message: config.message,
    salesOrderId: config.salesOrderId,
    entityType: config.entityType,
    entityId: config.entityId,
  });
}

function newOrderResult(snapshot, mode) {
  return {
    salesOrderId: snapshot.order.id,
    orderNo: snapshot.order.orderNo,
    tradeOrderId: null,
    tradeNo: null,
    subOrderNo: null,
    mode,
    status: "PENDING",
    created: { tradeOrder: false, tradeOrderItems: 0, tradeOrderItemComponents: 0, giftItems: 0 },
    reused: { tradeOrder: false, tradeOrderItems: 0, tradeOrderItemComponents: 0 },
    updated: {
      salesOrderAnchored: false,
      salesOrderItemsAnchored: 0,
      shippingTasksAnchored: 0,
      paymentPlansAnchored: 0,
      paymentRecordsAnchored: 0,
      collectionTasksAnchored: 0,
      codCollectionRecordsAnchored: 0,
      logisticsFollowUpTasksAnchored: 0,
    },
    warnings: [],
  };
}

async function resolveOrCreateTradeOrder(tx, snapshot, plan, orderResult) {
  const expected = plan.desiredTradeOrder;
  if (snapshot.order.tradeOrderId) {
    if (!snapshot.tradeOrder || !sameTradeOrder(snapshot.tradeOrder, expected)) {
      throw new BackfillOrderError({
        code: ERROR_INVALID_EXISTING_TRADE_ORDER_ID,
        phase: "PARENT",
        message: `订单 ${snapshot.order.orderNo} 已存在无效或冲突的 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "SalesOrder",
        entityId: snapshot.order.id,
      });
    }
    orderResult.reused.tradeOrder = true;
    return snapshot.tradeOrder;
  }

  const existing = await tx.tradeOrder.findUnique({
    where: { tradeNo: expected.tradeNo },
    select: {
      id: true,
      tradeNo: true,
      customerId: true,
      paymentScheme: true,
      listAmount: true,
      dealAmount: true,
      goodsAmount: true,
      discountAmount: true,
      finalAmount: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
      receiverAddressSnapshot: true,
    },
  });

  if (existing) {
    if (!sameTradeOrder(existing, expected)) {
      throw new BackfillOrderError({
        code: ERROR_TRADE_NO_CONFLICT,
        phase: "PARENT",
        message: `订单 ${snapshot.order.orderNo} 生成的 tradeNo ${expected.tradeNo} 已冲突。`,
        salesOrderId: snapshot.order.id,
        entityType: "TradeOrder",
        entityId: existing.id,
      });
    }
    orderResult.reused.tradeOrder = true;
    return existing;
  }

  const created = await tx.tradeOrder.create({ data: expected });
  orderResult.created.tradeOrder = true;
  return created;
}

async function ensureTradeOrderLine(tx, snapshot, tradeOrderId, spec, orderResult) {
  const existingItem =
    snapshot.tradeOrder?.items.find((item) => item.lineNo === spec.lineNo) ?? null;
  const existingComponent = existingItem
    ? snapshot.tradeOrder?.components.find((component) => component.tradeOrderItemId === existingItem.id)
    : null;

  let tradeOrderItem = existingItem;
  if (!tradeOrderItem) {
    tradeOrderItem = await tx.tradeOrderItem.create({
      data: {
        tradeOrderId,
        lineNo: spec.lineNo,
        itemType: spec.itemData.itemType,
        itemSourceType: spec.itemData.itemSourceType,
        productId: spec.itemData.productId,
        skuId: spec.itemData.skuId,
        titleSnapshot: spec.itemData.titleSnapshot,
        productNameSnapshot: spec.itemData.productNameSnapshot,
        skuNameSnapshot: spec.itemData.skuNameSnapshot,
        specSnapshot: spec.itemData.specSnapshot,
        unitSnapshot: spec.itemData.unitSnapshot,
        listUnitPriceSnapshot: spec.itemData.listUnitPriceSnapshot,
        dealUnitPriceSnapshot: spec.itemData.dealUnitPriceSnapshot,
        qty: spec.itemData.qty,
        subtotal: spec.itemData.subtotal,
        discountAmount: spec.itemData.discountAmount,
        remark: spec.itemData.remark,
        createdAt: spec.itemData.createdAt,
        updatedAt: spec.itemData.updatedAt,
      },
    });
    orderResult.created.tradeOrderItems += 1;
    if (spec.kind === "GIFT") orderResult.created.giftItems += 1;
  } else if (!sameTradeOrderItem(tradeOrderItem, spec)) {
    throw new BackfillOrderError({
      code: ERROR_REPAIR_NOT_ALLOWED_CONFLICTING_SNAPSHOT,
      phase: "ITEM",
      message: `订单 ${snapshot.order.orderNo} 第 ${spec.lineNo} 行 TradeOrderItem 快照冲突。`,
      salesOrderId: snapshot.order.id,
      entityType: "TradeOrderItem",
      entityId: tradeOrderItem.id,
    });
  } else {
    orderResult.reused.tradeOrderItems += 1;
  }

  let tradeOrderItemComponent = existingComponent;
  if (!tradeOrderItemComponent) {
    tradeOrderItemComponent = await tx.tradeOrderItemComponent.create({
      data: {
        tradeOrderId,
        tradeOrderItemId: tradeOrderItem.id,
        componentSeq: 1,
        componentType: spec.componentData.componentType,
        componentSourceType: spec.componentData.componentSourceType,
        supplierId: spec.componentData.supplierId,
        productId: spec.componentData.productId,
        skuId: spec.componentData.skuId,
        supplierNameSnapshot: spec.componentData.supplierNameSnapshot,
        productNameSnapshot: spec.componentData.productNameSnapshot,
        skuNameSnapshot: spec.componentData.skuNameSnapshot,
        specSnapshot: spec.componentData.specSnapshot,
        unitSnapshot: spec.componentData.unitSnapshot,
        exportDisplayNameSnapshot: spec.componentData.exportDisplayNameSnapshot,
        qty: spec.componentData.qty,
        allocatedListUnitPriceSnapshot: spec.componentData.allocatedListUnitPriceSnapshot,
        allocatedDealUnitPriceSnapshot: spec.componentData.allocatedDealUnitPriceSnapshot,
        allocatedSubtotal: spec.componentData.allocatedSubtotal,
        allocatedDiscountAmount: spec.componentData.allocatedDiscountAmount,
        createdAt: spec.componentData.createdAt,
        updatedAt: spec.componentData.updatedAt,
      },
    });
    orderResult.created.tradeOrderItemComponents += 1;
  } else if (!sameComponent(tradeOrderItemComponent, spec)) {
    throw new BackfillOrderError({
      code: ERROR_DUPLICATE_COMPONENT_MAPPING,
      phase: "COMPONENT",
      message: `订单 ${snapshot.order.orderNo} 第 ${spec.lineNo} 行 TradeOrderItemComponent 快照冲突。`,
      salesOrderId: snapshot.order.id,
      entityType: "TradeOrderItemComponent",
      entityId: tradeOrderItemComponent.id,
    });
  } else {
    orderResult.reused.tradeOrderItemComponents += 1;
  }

  return { tradeOrderItem, tradeOrderItemComponent };
}

async function anchorSalesOrder(tx, snapshot, tradeOrderId, desiredSubOrderNo, orderResult) {
  const patch = {};
  if (!snapshot.order.tradeOrderId) patch.tradeOrderId = tradeOrderId;
  else ensureCompatibleAnchor(snapshot.order.tradeOrderId, tradeOrderId, {
    code: ERROR_DUPLICATE_TRADE_ORDER_MAPPING,
    phase: "ANCHOR",
    message: `订单 ${snapshot.order.orderNo} 已绑定其他 tradeOrderId。`,
    salesOrderId: snapshot.order.id,
    entityType: "SalesOrder",
    entityId: snapshot.order.id,
  });
  if (!snapshot.order.subOrderNo) patch.subOrderNo = desiredSubOrderNo;
  else ensureCompatibleAnchor(snapshot.order.subOrderNo, desiredSubOrderNo, {
    code: ERROR_SUB_ORDER_NO_CONFLICT,
    phase: "ANCHOR",
    message: `订单 ${snapshot.order.orderNo} 的 subOrderNo 冲突。`,
    salesOrderId: snapshot.order.id,
    entityType: "SalesOrder",
    entityId: snapshot.order.id,
  });
  if (!snapshot.order.supplierSequence) patch.supplierSequence = 1;
  if (!snapshot.order.subOrderStatus) patch.subOrderStatus = deriveSubOrderStatus(snapshot.order.reviewStatus);
  if (Object.keys(patch).length > 0) {
    await tx.salesOrder.update({ where: { id: snapshot.order.id }, data: patch });
    orderResult.updated.salesOrderAnchored = true;
  }
}

async function anchorSalesOrderItem(
  tx,
  snapshot,
  salesOrderItem,
  tradeOrderId,
  tradeOrderItem,
  tradeOrderItemComponent,
  spec,
  orderResult,
) {
  const patch = {};
  if (!salesOrderItem.tradeOrderId) patch.tradeOrderId = tradeOrderId;
  else ensureCompatibleAnchor(salesOrderItem.tradeOrderId, tradeOrderId, {
    phase: "ANCHOR",
    message: `SalesOrderItem ${salesOrderItem.id} 已绑定其他 tradeOrderId。`,
    salesOrderId: snapshot.order.id,
    entityType: "SalesOrderItem",
    entityId: salesOrderItem.id,
  });
  if (!salesOrderItem.tradeOrderItemId) patch.tradeOrderItemId = tradeOrderItem.id;
  else ensureCompatibleAnchor(salesOrderItem.tradeOrderItemId, tradeOrderItem.id, {
    phase: "ANCHOR",
    message: `SalesOrderItem ${salesOrderItem.id} 已绑定其他 TradeOrderItem。`,
    salesOrderId: snapshot.order.id,
    entityType: "SalesOrderItem",
    entityId: salesOrderItem.id,
  });
  if (!salesOrderItem.tradeOrderItemComponentId) {
    patch.tradeOrderItemComponentId = tradeOrderItemComponent.id;
  } else {
    ensureCompatibleAnchor(salesOrderItem.tradeOrderItemComponentId, tradeOrderItemComponent.id, {
      code: ERROR_INVALID_EXISTING_COMPONENT_ID,
      phase: "ANCHOR",
      message: `SalesOrderItem ${salesOrderItem.id} 已绑定其他组件。`,
      salesOrderId: snapshot.order.id,
      entityType: "SalesOrderItem",
      entityId: salesOrderItem.id,
    });
  }
  if (!salesOrderItem.lineNo) patch.lineNo = spec.lineNo;
  if (!salesOrderItem.itemTypeSnapshot) patch.itemTypeSnapshot = spec.anchors.itemTypeSnapshot;
  if (!salesOrderItem.titleSnapshot) patch.titleSnapshot = spec.anchors.titleSnapshot;
  if (!salesOrderItem.exportDisplayNameSnapshot) {
    patch.exportDisplayNameSnapshot = spec.anchors.exportDisplayNameSnapshot;
  }
  if (Object.keys(patch).length > 0) {
    await tx.salesOrderItem.update({ where: { id: salesOrderItem.id }, data: patch });
    orderResult.updated.salesOrderItemsAnchored += 1;
  }
}

async function anchorDescendants(tx, snapshot, tradeOrderId, orderResult, warnings) {
  const shippingTaskId = snapshot.shippingTask?.id ?? null;
  const paymentPlanIds = new Set(snapshot.paymentPlans.map((plan) => plan.id));

  if (snapshot.shippingTask) {
    if (snapshot.shippingTask.tradeOrderId && snapshot.shippingTask.tradeOrderId !== tradeOrderId) {
      throw new BackfillOrderError({
        code: ERROR_DUPLICATE_TRADE_ORDER_MAPPING,
        phase: "DESCENDANT",
        message: `ShippingTask ${snapshot.shippingTask.id} 已挂到其他 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "ShippingTask",
        entityId: snapshot.shippingTask.id,
      });
    }
    if (!snapshot.shippingTask.tradeOrderId && snapshot.shippingTask.salesOrderId === snapshot.order.id) {
      await tx.shippingTask.update({
        where: { id: snapshot.shippingTask.id },
        data: { tradeOrderId },
      });
      orderResult.updated.shippingTasksAnchored += 1;
    } else if (snapshot.shippingTask.giftRecordId) {
      warnings.push(
        createWarning({
          code: WARNING_SHIPPING_TASK_SKIPPED_GIFT_RECORD_ONLY,
          phase: "DESCENDANT",
          salesOrderId: snapshot.order.id,
          entityType: "ShippingTask",
          entityId: snapshot.shippingTask.id,
          message: `ShippingTask ${snapshot.shippingTask.id} 仅走 giftRecord 兼容链，未回填 tradeOrderId。`,
        }),
      );
    }
  }

  for (const plan of snapshot.paymentPlans) {
    if (plan.tradeOrderId && plan.tradeOrderId !== tradeOrderId) {
      throw new BackfillOrderError({
        code: ERROR_DUPLICATE_TRADE_ORDER_MAPPING,
        phase: "DESCENDANT",
        message: `PaymentPlan ${plan.id} 已挂到其他 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "PaymentPlan",
        entityId: plan.id,
      });
    }
    if (plan.tradeOrderId) continue;
    if (plan.salesOrderId === snapshot.order.id || (shippingTaskId && plan.shippingTaskId === shippingTaskId)) {
      await tx.paymentPlan.update({ where: { id: plan.id }, data: { tradeOrderId } });
      orderResult.updated.paymentPlansAnchored += 1;
    } else if (plan.giftRecordId && !plan.salesOrderId) {
      warnings.push(
        createWarning({
          code: WARNING_PAYMENT_PLAN_SKIPPED_GIFT_RECORD_ONLY,
          phase: "DESCENDANT",
          salesOrderId: snapshot.order.id,
          entityType: "PaymentPlan",
          entityId: plan.id,
          message: `PaymentPlan ${plan.id} 仅走 giftRecord 兼容链，未回填 tradeOrderId。`,
        }),
      );
    }
  }

  for (const record of snapshot.paymentRecords) {
    if (record.tradeOrderId && record.tradeOrderId !== tradeOrderId) {
      throw new BackfillOrderError({
        code: ERROR_DUPLICATE_TRADE_ORDER_MAPPING,
        phase: "DESCENDANT",
        message: `PaymentRecord ${record.id} 已挂到其他 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "PaymentRecord",
        entityId: record.id,
      });
    }
    if (record.tradeOrderId) continue;
    const canResolve =
      paymentPlanIds.has(record.paymentPlanId) ||
      record.salesOrderId === snapshot.order.id ||
      (shippingTaskId && record.shippingTaskId === shippingTaskId);
    if (!canResolve) {
      throw new BackfillOrderError({
        code: ERROR_PAYMENT_RECORD_CANNOT_RESOLVE_TRADE_ORDER,
        phase: "DESCENDANT",
        message: `PaymentRecord ${record.id} 无法解析 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "PaymentRecord",
        entityId: record.id,
      });
    }
    await tx.paymentRecord.update({ where: { id: record.id }, data: { tradeOrderId } });
    orderResult.updated.paymentRecordsAnchored += 1;
  }

  for (const task of snapshot.collectionTasks) {
    if (task.tradeOrderId && task.tradeOrderId !== tradeOrderId) {
      throw new BackfillOrderError({
        code: ERROR_DUPLICATE_TRADE_ORDER_MAPPING,
        phase: "DESCENDANT",
        message: `CollectionTask ${task.id} 已挂到其他 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "CollectionTask",
        entityId: task.id,
      });
    }
    if (task.tradeOrderId) continue;
    const canResolve =
      paymentPlanIds.has(task.paymentPlanId) ||
      task.salesOrderId === snapshot.order.id ||
      (shippingTaskId && task.shippingTaskId === shippingTaskId);
    if (!canResolve && !(task.giftRecordId && !task.salesOrderId)) {
      throw new BackfillOrderError({
        code: ERROR_COLLECTION_TASK_CANNOT_RESOLVE_TRADE_ORDER,
        phase: "DESCENDANT",
        message: `CollectionTask ${task.id} 无法解析 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "CollectionTask",
        entityId: task.id,
      });
    }
    if (canResolve) {
      await tx.collectionTask.update({ where: { id: task.id }, data: { tradeOrderId } });
      orderResult.updated.collectionTasksAnchored += 1;
    }
  }

  for (const record of snapshot.codCollectionRecords) {
    if (record.tradeOrderId && record.tradeOrderId !== tradeOrderId) {
      throw new BackfillOrderError({
        code: ERROR_DUPLICATE_TRADE_ORDER_MAPPING,
        phase: "DESCENDANT",
        message: `CodCollectionRecord ${record.id} 已挂到其他 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "CodCollectionRecord",
        entityId: record.id,
      });
    }
    if (record.tradeOrderId) continue;
    const canResolve =
      paymentPlanIds.has(record.paymentPlanId) ||
      record.salesOrderId === snapshot.order.id ||
      (shippingTaskId && record.shippingTaskId === shippingTaskId);
    if (!canResolve) {
      throw new BackfillOrderError({
        code: ERROR_COD_RECORD_CANNOT_RESOLVE_TRADE_ORDER,
        phase: "DESCENDANT",
        message: `CodCollectionRecord ${record.id} 无法解析 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "CodCollectionRecord",
        entityId: record.id,
      });
    }
    await tx.codCollectionRecord.update({ where: { id: record.id }, data: { tradeOrderId } });
    orderResult.updated.codCollectionRecordsAnchored += 1;
  }

  for (const task of snapshot.logisticsFollowUpTasks) {
    if (task.tradeOrderId && task.tradeOrderId !== tradeOrderId) {
      throw new BackfillOrderError({
        code: ERROR_DUPLICATE_TRADE_ORDER_MAPPING,
        phase: "DESCENDANT",
        message: `LogisticsFollowUpTask ${task.id} 已挂到其他 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "LogisticsFollowUpTask",
        entityId: task.id,
      });
    }
    if (task.tradeOrderId) continue;
    const canResolve =
      task.salesOrderId === snapshot.order.id ||
      (shippingTaskId && task.shippingTaskId === shippingTaskId);
    if (!canResolve) {
      throw new BackfillOrderError({
        code: ERROR_LOGISTICS_TASK_CANNOT_RESOLVE_TRADE_ORDER,
        phase: "DESCENDANT",
        message: `LogisticsFollowUpTask ${task.id} 无法解析 tradeOrderId。`,
        salesOrderId: snapshot.order.id,
        entityType: "LogisticsFollowUpTask",
        entityId: task.id,
      });
    }
    await tx.logisticsFollowUpTask.update({ where: { id: task.id }, data: { tradeOrderId } });
    orderResult.updated.logisticsFollowUpTasksAnchored += 1;
  }
}

async function inspectOneOrder(orderId, options) {
  const snapshot = await loadOrderSnapshot(prisma, orderId);
  if (!snapshot) {
    const error = serializeError(
      new BackfillOrderError({
        code: ERROR_UNKNOWN,
        phase: "PRECHECK",
        message: `SalesOrder ${orderId} 不存在。`,
        salesOrderId: orderId,
      }),
    );
    return { type: "failed", errors: [error], warnings: [], snapshot: null };
  }
  const plan = analyzeSnapshot(snapshot, options);
  if (plan.errors.length > 0) return { type: "failed", errors: plan.errors, warnings: plan.warnings, snapshot, plan };
  if (plan.skipReasonCode) return { type: "skipped", reasonCode: plan.skipReasonCode, warnings: plan.warnings, snapshot, plan };
  return { type: "ready", warnings: plan.warnings, snapshot, plan };
}

async function processOneOrder(orderId, options) {
  const run = async (tx) => {
    const snapshot = await loadOrderSnapshot(tx, orderId);
    if (!snapshot) {
      throw new BackfillOrderError({
        code: ERROR_UNKNOWN,
        phase: "PRECHECK",
        message: `SalesOrder ${orderId} 不存在。`,
        salesOrderId: orderId,
      });
    }
    const plan = analyzeSnapshot(snapshot, options);
    const orderResult = newOrderResult(snapshot, plan.mode);
    orderResult.warnings.push(...plan.warnings.map((warning) => warning.code));

    if (plan.errors.length > 0) {
      throw new BackfillOrderError({
        code: plan.errors[0].code,
        phase: plan.errors[0].phase,
        message: plan.errors[0].message,
        salesOrderId: snapshot.order.id,
        entityType: plan.errors[0].entityType,
        entityId: plan.errors[0].entityId,
      });
    }
    if (plan.skipReasonCode) {
      orderResult.status = "SKIPPED";
      return { type: "skipped", reasonCode: plan.skipReasonCode, orderResult, warnings: plan.warnings };
    }

    const tradeOrder = await resolveOrCreateTradeOrder(tx, snapshot, plan, orderResult);
    orderResult.tradeOrderId = tradeOrder.id;
    orderResult.tradeNo = tradeOrder.tradeNo;
    orderResult.subOrderNo = plan.desiredSubOrderNo;
    if (!snapshot.tradeOrder || snapshot.tradeOrder.id !== tradeOrder.id) {
      snapshot.tradeOrder = await tx.tradeOrder.findUnique({
        where: { id: tradeOrder.id },
        select: {
          id: true,
          tradeNo: true,
          customerId: true,
          paymentScheme: true,
          listAmount: true,
          dealAmount: true,
          goodsAmount: true,
          discountAmount: true,
          finalAmount: true,
          codAmount: true,
          insuranceRequired: true,
          insuranceAmount: true,
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          items: {
            orderBy: [{ lineNo: "asc" }, { id: "asc" }],
            select: {
              id: true,
              lineNo: true,
              itemType: true,
              itemSourceType: true,
              productId: true,
              skuId: true,
              bundleId: true,
              titleSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              specSnapshot: true,
              unitSnapshot: true,
              listUnitPriceSnapshot: true,
              dealUnitPriceSnapshot: true,
              qty: true,
              subtotal: true,
              discountAmount: true,
              remark: true,
            },
          },
          components: {
            orderBy: [{ tradeOrderItemId: "asc" }, { componentSeq: "asc" }],
            select: {
              id: true,
              tradeOrderItemId: true,
              componentSeq: true,
              componentType: true,
              componentSourceType: true,
              supplierId: true,
              productId: true,
              skuId: true,
              supplierNameSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              specSnapshot: true,
              unitSnapshot: true,
              exportDisplayNameSnapshot: true,
              qty: true,
              allocatedListUnitPriceSnapshot: true,
              allocatedDealUnitPriceSnapshot: true,
              allocatedSubtotal: true,
              allocatedDiscountAmount: true,
            },
          },
        },
      });
    }
    await anchorSalesOrder(tx, snapshot, tradeOrder.id, plan.desiredSubOrderNo, orderResult);

    for (const spec of plan.desiredSpecs) {
      const ensured = await ensureTradeOrderLine(tx, snapshot, tradeOrder.id, spec, orderResult);
      if (spec.kind === "GOODS") {
        const salesOrderItem = snapshot.items.find((item) => item.id === spec.sourceId);
        if (!salesOrderItem) {
          throw new BackfillOrderError({
            code: ERROR_BROKEN_SALES_ORDER_ITEM_LINK,
            phase: "ANCHOR",
            message: `订单 ${snapshot.order.orderNo} 无法找到 SalesOrderItem ${spec.sourceId}。`,
            salesOrderId: snapshot.order.id,
            entityType: "SalesOrderItem",
            entityId: spec.sourceId,
          });
        }
        await anchorSalesOrderItem(
          tx,
          snapshot,
          salesOrderItem,
          tradeOrder.id,
          ensured.tradeOrderItem,
          ensured.tradeOrderItemComponent,
          spec,
          orderResult,
        );
      }
    }

    const descendantWarnings = [];
    await anchorDescendants(tx, snapshot, tradeOrder.id, orderResult, descendantWarnings);
    orderResult.warnings.push(...descendantWarnings.map((warning) => warning.code));

    if (options.mode === MODE_APPLY) {
      await tx.operationLog.create({
        data: {
          actorId: options.fallbackUserId || null,
          module: OperationModule.SALES_ORDER,
          action: "sales_order.phase2_trade_order_backfilled",
          targetType: OperationTargetType.SALES_ORDER,
          targetId: snapshot.order.id,
          description: `将历史订单 ${snapshot.order.orderNo} 回填为 TradeOrder ${tradeOrder.tradeNo}`,
          afterData: {
            tradeOrderId: tradeOrder.id,
            tradeNo: tradeOrder.tradeNo,
            subOrderNo: plan.desiredSubOrderNo,
            repaired: plan.mode === "REPAIR",
            createdTradeOrder: orderResult.created.tradeOrder,
            createdTradeOrderItems: orderResult.created.tradeOrderItems,
            createdTradeOrderItemComponents: orderResult.created.tradeOrderItemComponents,
          },
        },
      });
    }

    orderResult.status = options.mode === MODE_DRY_RUN ? "DRY_RUN" : "APPLIED";
    const payload = { type: "processed", orderResult, warnings: [...plan.warnings, ...descendantWarnings] };
    if (options.mode === MODE_DRY_RUN) throw new DryRunRollbackError(payload);
    return payload;
  };

  try {
    return await prisma.$transaction(run);
  } catch (error) {
    if (error instanceof DryRunRollbackError) return error.result;
    throw error;
  }
}

function mergeCounters(report, orderResult) {
  report.counters.tradeOrdersCreated += orderResult.created.tradeOrder ? 1 : 0;
  report.counters.tradeOrdersReused += orderResult.reused.tradeOrder ? 1 : 0;
  report.counters.tradeOrderItemsCreated += orderResult.created.tradeOrderItems;
  report.counters.tradeOrderItemComponentsCreated += orderResult.created.tradeOrderItemComponents;
  report.counters.salesOrdersAnchored += orderResult.updated.salesOrderAnchored ? 1 : 0;
  report.counters.salesOrderItemsAnchored += orderResult.updated.salesOrderItemsAnchored;
  report.counters.giftItemsConverted += orderResult.created.giftItems;
  report.counters.shippingTasksAnchored += orderResult.updated.shippingTasksAnchored;
  report.counters.paymentPlansAnchored += orderResult.updated.paymentPlansAnchored;
  report.counters.paymentRecordsAnchored += orderResult.updated.paymentRecordsAnchored;
  report.counters.collectionTasksAnchored += orderResult.updated.collectionTasksAnchored;
  report.counters.codCollectionRecordsAnchored += orderResult.updated.codCollectionRecordsAnchored;
  report.counters.logisticsFollowUpTasksAnchored += orderResult.updated.logisticsFollowUpTasksAnchored;
}

async function writeReport(report, filePath) {
  if (!filePath) return;
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function printConsoleSummary(report, options) {
  console.log(`模式: ${report.meta.mode}`);
  console.log(`扫描订单: ${report.summary.scannedOrders}`);
  console.log(`可执行订单: ${report.summary.eligibleOrders}`);
  console.log(`已处理订单: ${report.summary.processedOrders}`);
  console.log(`跳过订单: ${report.summary.skippedOrders}`);
  console.log(`修复订单: ${report.summary.repairedOrders}`);
  console.log(`警告订单: ${report.summary.warningOrders}`);
  console.log(`失败订单: ${report.summary.failedOrders}`);
  console.log(`PaymentPlan 锚定: ${report.counters.paymentPlansAnchored}`);
  console.log(`PaymentRecord 锚定: ${report.counters.paymentRecordsAnchored}`);
  console.log(`CollectionTask 锚定: ${report.counters.collectionTasksAnchored}`);
  if (!options.verbose) return;
  for (const candidate of report.candidateOrders) {
    console.log(`[READY] ${candidate.orderNo} -> ${candidate.tradeNo} (${candidate.mode})`);
  }
  for (const order of report.processedOrders) {
    console.log(`[DONE] ${order.orderNo} -> ${order.tradeNo} (${order.status})`);
  }
  for (const skipped of report.skippedOrders) {
    console.log(`[SKIP] ${skipped.orderNo} (${skipped.reasonCode})`);
  }
  for (const warning of report.warnings) console.log(`[WARN] ${warning.code} ${warning.message}`);
  for (const error of report.errors) console.log(`[ERROR] ${error.code} ${error.message}`);
}

async function main() {
  const options = parseArgs(process.argv);
  const report = createReport(options);

  try {
    const candidates = await listCandidateOrderIds(options);
    report.summary.scannedOrders = candidates.length;
    for (const candidate of candidates) {
      if (options.mode === MODE_REPORT_ONLY) {
        try {
          const inspected = await inspectOneOrder(candidate.id, options);
          if (inspected.type === "ready") {
            report.summary.eligibleOrders += 1;
            report.candidateOrders.push({
              salesOrderId: inspected.snapshot.order.id,
              orderNo: inspected.snapshot.order.orderNo,
              tradeNo: inspected.plan.desiredTradeOrder.tradeNo,
              subOrderNo: inspected.plan.desiredSubOrderNo,
              mode: inspected.plan.mode,
              expectedLineCount: inspected.plan.desiredSpecs.length,
              expectedGiftLineCount: inspected.plan.desiredSpecs.filter((spec) => spec.kind === "GIFT").length,
              status: "READY",
              warnings: inspected.plan.warnings.map((warning) => warning.code),
            });
            pushWarnings(report, inspected.plan.warnings, inspected.plan.warnings.length > 0 ? {
              salesOrderId: inspected.snapshot.order.id,
              orderNo: inspected.snapshot.order.orderNo,
              warningCodes: inspected.plan.warnings.map((warning) => warning.code),
            } : null);
          } else if (inspected.type === "skipped") {
            report.skippedOrders.push({
              salesOrderId: inspected.snapshot.order.id,
              orderNo: inspected.snapshot.order.orderNo,
              reasonCode: inspected.reasonCode,
              message: inspected.reasonCode === SKIP_REASON_ALREADY_BACKFILLED ? "订单已完整回填。" : "订单检测到部分回填，需使用 --repair-partial。",
            });
            pushWarnings(report, inspected.warnings, inspected.warnings.length > 0 ? {
              salesOrderId: inspected.snapshot.order.id,
              orderNo: inspected.snapshot.order.orderNo,
              warningCodes: inspected.warnings.map((warning) => warning.code),
            } : null);
          } else {
            const error = inspected.errors[0];
            pushError(report, error, {
              salesOrderId: error.salesOrderId,
              orderNo: inspected.snapshot?.order.orderNo ?? candidate.id,
              phase: error.phase,
              errorCode: error.code,
              message: error.message,
              retryable: error.retryable,
            });
            if (options.strict) throw new Error(error.message);
          }
        } catch (error) {
          const serialized = serializeError(error);
          pushError(report, serialized, {
            salesOrderId: serialized.salesOrderId,
            orderNo: candidate.id,
            phase: serialized.phase,
            errorCode: serialized.code,
            message: serialized.message,
            retryable: serialized.retryable,
          });
          if (options.strict) throw error;
        }
        continue;
      }

      try {
        const result = await processOneOrder(candidate.id, options);
        if (result.type === "skipped") {
          report.skippedOrders.push({
            salesOrderId: result.orderResult.salesOrderId,
            orderNo: result.orderResult.orderNo,
            reasonCode: result.reasonCode,
            message: result.reasonCode === SKIP_REASON_ALREADY_BACKFILLED ? "订单已完整回填。" : "订单检测到部分回填，需使用 --repair-partial。",
          });
          pushWarnings(report, result.warnings, result.warnings.length > 0 ? {
            salesOrderId: result.orderResult.salesOrderId,
            orderNo: result.orderResult.orderNo,
            warningCodes: result.warnings.map((warning) => warning.code),
          } : null);
          continue;
        }

        report.summary.eligibleOrders += 1;
        report.processedOrders.push(result.orderResult);
        if (result.orderResult.mode === "REPAIR") {
          report.repairedOrders.push({
            salesOrderId: result.orderResult.salesOrderId,
            orderNo: result.orderResult.orderNo,
            repairActions: ["REPAIR_PARTIAL_BACKFILL"],
          });
        }
        pushWarnings(report, result.warnings, result.warnings.length > 0 ? {
          salesOrderId: result.orderResult.salesOrderId,
          orderNo: result.orderResult.orderNo,
          warningCodes: result.warnings.map((warning) => warning.code),
        } : null);
        mergeCounters(report, result.orderResult);
      } catch (error) {
        const serialized = serializeError(error);
        pushError(report, serialized, {
          salesOrderId: serialized.salesOrderId,
          orderNo: candidate.id,
          phase: serialized.phase,
          errorCode: serialized.code,
          message: serialized.message,
          retryable: serialized.retryable,
        });
        if (options.strict) throw error;
      }
    }
  } finally {
    finalizeReport(report);
    printConsoleSummary(report, options);
    await writeReport(report, options.reportFile);
  }
}

main()
  .catch((error) => {
    console.error("Phase 2 trade-order 回填脚本执行失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
