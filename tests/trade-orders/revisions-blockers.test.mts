/**
 * checkRevisionBlockers 单测.
 *
 * 该函数在 revisions.ts 是发起 / 复审撤单的第一道闸 (race-safe). 必须守住
 * 4 + 1 种 blocker 互不漏判:
 *   ALREADY_SHIPPED      — 至少 1 张 ShippingTask 已出库
 *   PAYMENT_CONFIRMED    — 至少 1 条 PaymentRecord 已被财务确认
 *   COD_COLLECTED        — 至少 1 条 CodCollectionRecord 已代收落地
 *   STATUS_NOT_APPROVED  — 主单未审批通过 / 已回收 / 已 CANCELED
 *   REVISION_IN_FLIGHT   — 主单已经在 REVISION_PENDING 状态
 *
 * 设计:
 *   实参 db 是 Prisma.TransactionClient | typeof prisma 的子集. 单测用 in-memory
 *   mock client (只实现 findUnique / count 4 个方法) 避开真实 DB.
 */
import assert from "node:assert/strict";
import test from "node:test";

// 单测必须在 import revisions.ts 前设置 DATABASE_URL (lib/db/prisma.ts 在
// import 时即检查 + throw). 用一个虚假 URL 避免触发 — 单测用 mock client
// 不会真跑 query.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { checkRevisionBlockers } = await import("../../lib/trade-orders/revisions.ts");

type TradeOrderRow = { id: string; tradeStatus: string };
type FakeStore = {
  tradeOrders: TradeOrderRow[];
  shippedShippingTaskCount: number;
  confirmedPaymentRecordCount: number;
  collectedCodCount: number;
};

function buildFakeDb(store: FakeStore) {
  return {
    tradeOrder: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        const row = store.tradeOrders.find((r) => r.id === id);
        return row ? { tradeStatus: row.tradeStatus } : null;
      },
    },
    shippingTask: {
      count: async () => store.shippedShippingTaskCount,
    },
    paymentRecord: {
      count: async () => store.confirmedPaymentRecordCount,
    },
    codCollectionRecord: {
      count: async () => store.collectedCodCount,
    },
  };
}

// ============================================================
// 单个 blocker
// ============================================================

test("APPROVED 无下游 → 不阻断, 可以发起撤单", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_1", tradeStatus: "APPROVED" }],
    shippedShippingTaskCount: 0,
    confirmedPaymentRecordCount: 0,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
});

test("不存在的主单 → STATUS_NOT_APPROVED, 不再检查 ship/pay/cod", async () => {
  const db = buildFakeDb({
    tradeOrders: [],
    shippedShippingTaskCount: 0,
    confirmedPaymentRecordCount: 0,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_missing");
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 1);
  assert.equal(result.blockers[0]!.code, "STATUS_NOT_APPROVED");
  assert.match(result.blockers[0]!.message, /不存在|回收/);
});

test("DRAFT / PENDING_REVIEW 等非 APPROVED 状态 → STATUS_NOT_APPROVED", async () => {
  for (const status of ["DRAFT", "PENDING_REVIEW", "REJECTED", "CANCELED"]) {
    const db = buildFakeDb({
      tradeOrders: [{ id: "to_x", tradeStatus: status }],
      shippedShippingTaskCount: 0,
      confirmedPaymentRecordCount: 0,
      collectedCodCount: 0,
    });

    const result = await checkRevisionBlockers(db as never, "to_x");
    assert.equal(result.ok, false, `status=${status} 期望阻断`);
    const codes = result.blockers.map((b: { code: string }) => b.code);
    assert.ok(codes.includes("STATUS_NOT_APPROVED"), `status=${status} 缺 STATUS_NOT_APPROVED`);
  }
});

test("REVISION_PENDING → REVISION_IN_FLIGHT (区别于其它非 APPROVED)", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_p", tradeStatus: "REVISION_PENDING" }],
    shippedShippingTaskCount: 0,
    confirmedPaymentRecordCount: 0,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_p");
  assert.equal(result.ok, false);
  const codes = result.blockers.map((b: { code: string }) => b.code);
  assert.deepEqual(codes, ["REVISION_IN_FLIGHT"]);
  // 不应该再叠加 STATUS_NOT_APPROVED — 否则前端 UI 会出现矛盾错误信息
  assert.equal(codes.includes("STATUS_NOT_APPROVED"), false);
});

test("APPROVED 但已发货 → ALREADY_SHIPPED", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_s", tradeStatus: "APPROVED" }],
    shippedShippingTaskCount: 3,
    confirmedPaymentRecordCount: 0,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_s");
  assert.equal(result.ok, false);
  const blocker = result.blockers.find((b: { code: string }) => b.code === "ALREADY_SHIPPED");
  assert.ok(blocker, "应该有 ALREADY_SHIPPED");
  assert.match(blocker.message, /3 张发货任务/);
});

test("APPROVED 但财务已确认收款 → PAYMENT_CONFIRMED", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_p", tradeStatus: "APPROVED" }],
    shippedShippingTaskCount: 0,
    confirmedPaymentRecordCount: 2,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_p");
  assert.equal(result.ok, false);
  const blocker = result.blockers.find(
    (b: { code: string }) => b.code === "PAYMENT_CONFIRMED",
  );
  assert.ok(blocker);
  assert.match(blocker.message, /2 条财务已确认/);
});

test("APPROVED 但 COD 已代收 → COD_COLLECTED", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_c", tradeStatus: "APPROVED" }],
    shippedShippingTaskCount: 0,
    confirmedPaymentRecordCount: 0,
    collectedCodCount: 1,
  });

  const result = await checkRevisionBlockers(db as never, "to_c");
  assert.equal(result.ok, false);
  const blocker = result.blockers.find(
    (b: { code: string }) => b.code === "COD_COLLECTED",
  );
  assert.ok(blocker);
  assert.match(blocker.message, /1 条 COD 代收落地/);
});

// ============================================================
// 多 blocker 组合 (审查阶段防漏判)
// ============================================================

test("APPROVED + 已发货 + 已收款 → 两个 blocker 同时返回", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_combo", tradeStatus: "APPROVED" }],
    shippedShippingTaskCount: 1,
    confirmedPaymentRecordCount: 1,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_combo");
  assert.equal(result.ok, false);
  const codes = result.blockers.map((b: { code: string }) => b.code).sort();
  assert.deepEqual(codes, ["ALREADY_SHIPPED", "PAYMENT_CONFIRMED"]);
});

test("REVISION_PENDING + 已发货 + 已收款 + COD → 全部 4 个 blocker 都返回", async () => {
  // 防止状态 race 时 (e.g. PENDING 期间下游又落了一单) 漏判
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_all", tradeStatus: "REVISION_PENDING" }],
    shippedShippingTaskCount: 2,
    confirmedPaymentRecordCount: 1,
    collectedCodCount: 3,
  });

  const result = await checkRevisionBlockers(db as never, "to_all");
  assert.equal(result.ok, false);
  const codes = result.blockers.map((b: { code: string }) => b.code).sort();
  assert.deepEqual(codes, [
    "ALREADY_SHIPPED",
    "COD_COLLECTED",
    "PAYMENT_CONFIRMED",
    "REVISION_IN_FLIGHT",
  ]);
});

test("CANCELED + 下游 0 → 只返回 STATUS_NOT_APPROVED (单一闸口)", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_canceled", tradeStatus: "CANCELED" }],
    shippedShippingTaskCount: 0,
    confirmedPaymentRecordCount: 0,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_canceled");
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.blockers.map((b: { code: string }) => b.code),
    ["STATUS_NOT_APPROVED"],
  );
});

// ============================================================
// 边界: 状态正确但下游各 = 1 (最小阻断阈值)
// ============================================================

test("APPROVED + shippedCount=1 → 阻断 (阈值 >= 1, 不是 > 1)", async () => {
  const db = buildFakeDb({
    tradeOrders: [{ id: "to_t1", tradeStatus: "APPROVED" }],
    shippedShippingTaskCount: 1,
    confirmedPaymentRecordCount: 0,
    collectedCodCount: 0,
  });

  const result = await checkRevisionBlockers(db as never, "to_t1");
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 1);
  assert.equal(result.blockers[0]!.code, "ALREADY_SHIPPED");
});
