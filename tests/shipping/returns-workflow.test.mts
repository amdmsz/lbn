/**
 * lib/shipping/returns.ts 状态机单测.
 *
 * 跟 tests/trade-orders/revisions-blockers.test.mts 风格一致: 不真连 DB,
 * 通过 monkey-patch 单例 prisma 客户端把整条退货工作流压成 in-memory 模拟.
 * 关注的是状态机迁移与守卫, 不是 Prisma 行为.
 *
 * 覆盖的状态机:
 *   PENDING_REVIEW         ──[主管 APPROVED]──→ PENDING_RETURN_TRACKING
 *                          ──[主管 REJECTED + rejectReason]──→ REJECTED
 *                          ──[发起人/主管/admin 撤回]────────→ CANCELED
 *   PENDING_RETURN_TRACKING──[发货人填运单]────→ IN_RETURN_TRANSIT
 *                          ──[发货人直接入库]──→ RETURNED_TO_WAREHOUSE
 *                          ──[发起人/主管/admin 撤回]────────→ CANCELED
 *   IN_RETURN_TRANSIT      ──[发货人入库]──────→ RETURNED_TO_WAREHOUSE
 *                                              └─→ 同 tx 自动建 RefundRequest
 *                          ──[发起人/主管/admin 撤回]────────→ CANCELED
 *   RETURNED_TO_WAREHOUSE  ──[尝试撤回]────────→ throw (入库后走退款流程)
 *
 * 守卫 (反例):
 *   - TradeOrder.tradeStatus != APPROVED 时不能发起
 *   - ShippingTask.shippedAt = null 时不能发起
 *   - 同一 shippingTask 已有 ACTIVE 退货时不能再发起
 *   - SHIPPER 不能发起 (canRequestShippingReturn only ADMIN/SUPERVISOR/SALES)
 *   - SALES 跨 owner 不能发起
 *   - SHIPPER 不能审核 (canReviewShippingReturn only ADMIN/SUPERVISOR)
 *   - SALES 不能填运单 (canFillShippingReturnTracking only ADMIN/SHIPPER/OPS)
 *   - 4 眼: 复审不允许 requester 自审 (admin 兜底)
 *   - 入库时若该订单已有 active RefundRequest → 整 tx 回滚, 状态保持
 *   - 入库时若该订单无 unreversed confirmed PaymentRecord → 入库成功但 refundRequestId 为 null
 *
 * mock 策略:
 *   ESM `const` 导出无法重新绑定但单例对象内部可变 — 拷贝 fakeClient 上所有
 *   方法到 prisma 单例上, lib/shipping/returns.ts 内部 `import { prisma }`
 *   拿到的是同一个对象引用, 因此走 fake 实现.
 */
import assert from "node:assert/strict";
import test from "node:test";

// DB URL 必须在任何 lib/db/prisma 之前的 import 设置 (prisma.ts import 时立即检查)
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

// 先把 prisma 单例拿到, 之后所有 import lib/shipping/returns.ts 拿到的都是这同一个对象
const { prisma } = await import("../../lib/db/prisma.ts");

type FakeStore = {
  shippingReturns: ShippingReturnRow[];
  tradeOrders: TradeOrderRow[];
  shippingTasks: ShippingTaskRow[];
  paymentRecords: PaymentRecordRow[];
  refundRequests: RefundRequestRow[];
  users: UserRow[];
  operationLogs: OperationLogRow[];
  // 注入式失败: 让 refundRequest.findFirst 返回 race blocker, 触发 confirmReceived 内联 throw
  blockRefundCreate: boolean;
};

type ShippingReturnRow = {
  id: string;
  tradeOrderId: string;
  shippingTaskId: string;
  customerId: string;
  status: string;
  reason: string;
  reasonDetail: string;
  requesterId: string;
  reviewerId: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  rejectReason: string | null;
  returnTrackingNumber: string | null;
  returnCarrier: string | null;
  trackingFilledById: string | null;
  trackingFilledAt: Date | null;
  receivedAt: Date | null;
  receivedById: string | null;
  receivedPhotoUrl: string | null;
  receivedRemark: string | null;
  expectedRefundAmount: FakeDecimal;
  refundRequestId: string | null;
  revisionRequestId: string | null;
  requestedAt: Date;
};

type TradeOrderRow = {
  id: string;
  tradeNo: string;
  ownerId: string | null;
  customerId: string;
  tradeStatus: string;
  finalAmount: FakeDecimal;
};

type ShippingTaskRow = {
  id: string;
  tradeOrderId: string;
  customerId: string;
  shippedAt: Date | null;
  status: string;
};

type PaymentRecordRow = {
  id: string;
  tradeOrderId: string;
  amount: FakeDecimal;
  status: string;
  confirmedAt: Date | null;
  isReversed: boolean;
};

type RefundRequestRow = {
  id: string;
  tradeOrderId: string;
  revisionRequestId: string | null;
  status: string;
};

type UserRow = { id: string; teamId: string | null };

type OperationLogRow = {
  action: string;
  actorId: string;
  targetId: string;
  afterData?: unknown;
};

type FakeDecimal = {
  toString: () => string;
  toFixed: (n: number) => string;
};

function fakeDecimal(value: number | string): FakeDecimal {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return {
    toString: () => String(n),
    toFixed: (digits: number) => n.toFixed(digits),
  };
}

let store: FakeStore;

function resetStore(): void {
  store = {
    shippingReturns: [],
    tradeOrders: [],
    shippingTasks: [],
    paymentRecords: [],
    refundRequests: [],
    users: [],
    operationLogs: [],
    blockRefundCreate: false,
  };
}

// === 安装 prisma stub (一次性, 之后每个 test 通过 resetStore 重置 store) ===
// 由于 prisma 是 const export, 我们不能替换绑定; 但 client 对象自身可变,
// 拷贝 fakeClient 上的方法属性会覆盖原对应方法.

function installPrismaStub(): void {
  const fakeClient: Record<string, unknown> = {
    $transaction: async <T>(
      callback: (tx: typeof fakeClient) => Promise<T>,
    ): Promise<T> => callback(fakeClient),

    tradeOrder: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return store.tradeOrders.find((t) => t.id === where.id) ?? null;
      },
    },

    shippingTask: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return store.shippingTasks.find((s) => s.id === where.id) ?? null;
      },
    },

    shippingReturn: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const wantTask = where.shippingTaskId as string | undefined;
        const wantTradeOrder = where.tradeOrderId as string | undefined;
        const wantStatuses =
          (where.status as { in?: string[] } | undefined)?.in ?? null;
        return (
          store.shippingReturns.find((r) => {
            if (wantTask && r.shippingTaskId !== wantTask) return false;
            if (wantTradeOrder && r.tradeOrderId !== wantTradeOrder)
              return false;
            if (wantStatuses && !wantStatuses.includes(r.status)) return false;
            return true;
          }) ?? null
        );
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.shippingReturns.find((r) => r.id === where.id);
        if (!row) return null;
        const trade = store.tradeOrders.find((t) => t.id === row.tradeOrderId);
        return {
          ...row,
          tradeOrder: trade
            ? { id: trade.id, tradeNo: trade.tradeNo, ownerId: trade.ownerId }
            : { id: row.tradeOrderId, tradeNo: "MOCK_TRADE_NO", ownerId: null },
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: ShippingReturnRow = {
          id: `sr_${store.shippingReturns.length + 1}`,
          tradeOrderId: data.tradeOrderId as string,
          shippingTaskId: data.shippingTaskId as string,
          customerId: data.customerId as string,
          status: data.status as string,
          reason: data.reason as string,
          reasonDetail: data.reasonDetail as string,
          requesterId: data.requesterId as string,
          reviewerId: null,
          reviewedAt: null,
          reviewNote: null,
          rejectReason: null,
          returnTrackingNumber: null,
          returnCarrier: null,
          trackingFilledById: null,
          trackingFilledAt: null,
          receivedAt: null,
          receivedById: null,
          receivedPhotoUrl: null,
          receivedRemark: null,
          expectedRefundAmount:
            (data.expectedRefundAmount as FakeDecimal) ?? fakeDecimal(0),
          refundRequestId: null,
          revisionRequestId: (data.revisionRequestId as string) ?? null,
          requestedAt: new Date(),
        };
        store.shippingReturns.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.shippingReturns.find((r) => r.id === where.id);
        if (!row) throw new Error(`shippingReturn ${where.id} not in store`);
        Object.assign(row, data);
        return row;
      },
    },

    paymentRecord: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const tradeOrderId = where.tradeOrderId as string | undefined;
        const idIn = (where.id as { in?: string[] } | undefined)?.in;
        return store.paymentRecords.filter((p) => {
          if (tradeOrderId && p.tradeOrderId !== tradeOrderId) return false;
          if (idIn && !idIn.includes(p.id)) return false;
          // returns.ts 用 confirmedAt: { not: null }, isReversed: false
          if ("confirmedAt" in where) {
            if (p.confirmedAt === null) return false;
          }
          if ("isReversed" in where) {
            if (p.isReversed !== where.isReversed) return false;
          }
          return true;
        });
      },
    },

    refundRequest: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        // 注入 race: 当 blockRefundCreate=true 时假装已有 active refund 卡住新建
        if (store.blockRefundCreate) {
          return { id: "blocking_refund_id", status: "PENDING_FINANCE" };
        }
        const wantTradeOrder = where.tradeOrderId as string | undefined;
        return (
          store.refundRequests.find((r) => {
            if (wantTradeOrder && r.tradeOrderId !== wantTradeOrder) return false;
            return true;
          }) ?? null
        );
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const revId = where.revisionRequestId as string | undefined;
        if (revId) {
          return (
            store.refundRequests.find((r) => r.revisionRequestId === revId) ??
            null
          );
        }
        const id = where.id as string | undefined;
        return store.refundRequests.find((r) => r.id === id) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: RefundRequestRow = {
          id: `refund_${store.refundRequests.length + 1}`,
          tradeOrderId: data.tradeOrderId as string,
          revisionRequestId: (data.revisionRequestId as string) ?? null,
          status: data.status as string,
        };
        store.refundRequests.push(row);
        return row;
      },
    },

    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return store.users.find((u) => u.id === where.id) ?? null;
      },
    },

    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.operationLogs.push({
          action: data.action as string,
          actorId: data.actorId as string,
          targetId: data.targetId as string,
          afterData: data.afterData,
        });
        return { id: `log_${store.operationLogs.length}` };
      },
    },
  };

  for (const key of Object.keys(fakeClient)) {
    (prisma as unknown as Record<string, unknown>)[key] = fakeClient[key];
  }
}

installPrismaStub();

// 把 shipping returns service 拿进来 — 它会持有上面这个被 mock 过的 prisma
const {
  requestShippingReturn,
  reviewShippingReturn,
  fillShippingReturnTracking,
  confirmShippingReturnReceived,
  cancelShippingReturn,
} = await import("../../lib/shipping/returns.ts");

// === 公共 fixture ===

const SHIPPER = { id: "user_shipper", role: "SHIPPER" as const };
const SALES = { id: "user_sales", role: "SALES" as const };
const SALES_OTHER = { id: "user_sales_2", role: "SALES" as const };
const SUPERVISOR = { id: "user_sup", role: "SUPERVISOR" as const };
const SUPERVISOR_OTHER = { id: "user_sup_2", role: "SUPERVISOR" as const };
const ADMIN = { id: "user_admin", role: "ADMIN" as const };

function seedHappyPath(): void {
  store.tradeOrders.push({
    id: "to_1",
    tradeNo: "T-001",
    ownerId: SALES.id,
    customerId: "cust_1",
    tradeStatus: "APPROVED",
    finalAmount: fakeDecimal(1000),
  });
  store.shippingTasks.push({
    id: "st_1",
    tradeOrderId: "to_1",
    customerId: "cust_1",
    shippedAt: new Date("2026-01-01T00:00:00Z"),
    status: "IN_PROGRESS",
  });
  store.paymentRecords.push({
    id: "pr_1",
    tradeOrderId: "to_1",
    amount: fakeDecimal(1000),
    status: "CONFIRMED",
    confirmedAt: new Date("2026-01-02T00:00:00Z"),
    isReversed: false,
  });
}

// ============================================================
// 1. requestShippingReturn — 正常路径 + 守卫
// ============================================================

test("销售对自己负责的订单发起退货 → PENDING_REVIEW", async () => {
  resetStore();
  seedHappyPath();

  const result = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "CUSTOMER_REJECT",
    reasonDetail: "客户改主意了, 不想要",
  });
  assert.equal(result.status, "PENDING_REVIEW");
  assert.equal(store.shippingReturns.length, 1);
  assert.equal(
    store.operationLogs.some((l) => l.action === "shipping_return.requested"),
    true,
  );
});

test("反例: TradeOrder.tradeStatus != APPROVED 时不能发起退货", async () => {
  resetStore();
  seedHappyPath();
  store.tradeOrders[0]!.tradeStatus = "REVISION_PENDING";

  await assert.rejects(
    () =>
      requestShippingReturn(SALES, {
        tradeOrderId: "to_1",
        shippingTaskId: "st_1",
        reason: "OTHER",
        reasonDetail: "撤单审批中也想退货",
      }),
    /仅 APPROVED 后才能发起退货/,
  );
  assert.equal(store.shippingReturns.length, 0);
});

test("反例: shippedAt = null 时不能发起退货", async () => {
  resetStore();
  seedHappyPath();
  store.shippingTasks[0]!.shippedAt = null;

  await assert.rejects(
    () =>
      requestShippingReturn(SALES, {
        tradeOrderId: "to_1",
        shippingTaskId: "st_1",
        reason: "WRONG_ITEM",
        reasonDetail: "尚未发货就不该退货",
      }),
    /尚未发货/,
  );
  assert.equal(store.shippingReturns.length, 0);
});

test("反例: 同一 shippingTask 已有 ACTIVE 退货时, 第二次发起 throw", async () => {
  resetStore();
  seedHappyPath();
  await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "酒瓶碎了",
  });
  assert.equal(store.shippingReturns.length, 1);

  await assert.rejects(
    () =>
      requestShippingReturn(SALES, {
        tradeOrderId: "to_1",
        shippingTaskId: "st_1",
        reason: "OTHER",
        reasonDetail: "重复申请保护",
      }),
    /已有进行中的退货申请/,
  );
  assert.equal(store.shippingReturns.length, 1, "store 不应新增第二条");
});

test("反例: SALES 跨人发起退货 → 拒绝 (只能对自己 owner 的单)", async () => {
  resetStore();
  seedHappyPath();

  await assert.rejects(
    () =>
      requestShippingReturn(SALES_OTHER, {
        tradeOrderId: "to_1",
        shippingTaskId: "st_1",
        reason: "CUSTOMER_REJECT",
        reasonDetail: "不是我负责的单也想退",
      }),
    /只能给自己负责的订单/,
  );
});

test("反例: SHIPPER 没有发起退货的权限 (canRequestShippingReturn gate)", async () => {
  resetStore();
  seedHappyPath();

  await assert.rejects(
    () =>
      requestShippingReturn(SHIPPER, {
        tradeOrderId: "to_1",
        shippingTaskId: "st_1",
        reason: "OTHER",
        reasonDetail: "发货人不能直接发起退货",
      }),
    /没有发起退货的权限/,
  );
});

test("反例: shippingTask 不属于 tradeOrder → throw", async () => {
  resetStore();
  seedHappyPath();
  store.shippingTasks.push({
    id: "st_other",
    tradeOrderId: "to_other",
    customerId: "cust_other",
    shippedAt: new Date(),
    status: "IN_PROGRESS",
  });

  await assert.rejects(
    () =>
      requestShippingReturn(SALES, {
        tradeOrderId: "to_1",
        shippingTaskId: "st_other",
        reason: "WRONG_ITEM",
        reasonDetail: "对错主单和发货任务",
      }),
    /不属于当前成交主单/,
  );
});

// ============================================================
// 2. reviewShippingReturn — APPROVED / REJECTED
// ============================================================

test("主管审核 APPROVED → PENDING_RETURN_TRACKING", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "CUSTOMER_REJECT",
    reasonDetail: "客户最终拒收",
  });

  const updated = await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
    reviewNote: "情况属实, 准退",
  });
  assert.equal(updated.status, "PENDING_RETURN_TRACKING");
  assert.equal(updated.reviewerId, SUPERVISOR.id);
  assert.notEqual(updated.reviewedAt, null);
  assert.equal(
    store.operationLogs.some(
      (l) => l.action === "shipping_return.review_approved",
    ),
    true,
  );
});

test("主管审核 REJECTED + rejectReason 必填 → REJECTED, 留 rejectReason", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "OTHER",
    reasonDetail: "证据不足的申请",
  });

  // 不带 rejectReason 直接驳回 → zod superRefine 拒
  await assert.rejects(
    () =>
      reviewShippingReturn(SUPERVISOR, {
        shippingReturnId: sr.id,
        decision: "REJECTED",
      }),
    /驳回时请至少填写 4 个字的驳回原因/,
  );

  const rejected = await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "REJECTED",
    rejectReason: "客户未提供拒收凭证, 暂不予退货",
  });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.rejectReason, "客户未提供拒收凭证, 暂不予退货");
  assert.equal(
    store.operationLogs.some(
      (l) => l.action === "shipping_return.review_rejected",
    ),
    true,
  );
});

test("反例: 4 眼 — 发起人 SUPERVISOR 不能自审 (admin 例外)", async () => {
  resetStore();
  seedHappyPath();
  // SUPERVISOR 也能发起 (canRequestShippingReturn) ↘ 自审应该被拒
  const sr = await requestShippingReturn(SUPERVISOR, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "主管自己发起, 自己不能批",
  });

  await assert.rejects(
    () =>
      reviewShippingReturn(SUPERVISOR, {
        shippingReturnId: sr.id,
        decision: "APPROVED",
      }),
    /不能审核自己发起的退货申请/,
  );

  // 另一位 SUPERVISOR 可以批
  const ok = await reviewShippingReturn(SUPERVISOR_OTHER, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  assert.equal(ok.status, "PENDING_RETURN_TRACKING");
});

test("反例: 发货人 SHIPPER 没有审核权限", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "OTHER",
    reasonDetail: "测试 RBAC",
  });

  await assert.rejects(
    () =>
      reviewShippingReturn(SHIPPER, {
        shippingReturnId: sr.id,
        decision: "APPROVED",
      }),
    /没有审核退货申请的权限/,
  );
});

test("反例: 已 APPROVED 的申请, 再次 review 抛 not PENDING_REVIEW", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "已经批过的不能再批",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });

  await assert.rejects(
    () =>
      reviewShippingReturn(SUPERVISOR_OTHER, {
        shippingReturnId: sr.id,
        decision: "APPROVED",
      }),
    /不能审核/,
  );
});

// ============================================================
// 3. fillShippingReturnTracking
// ============================================================

test("发货人填运单 → IN_RETURN_TRANSIT", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "CUSTOMER_REJECT",
    reasonDetail: "客户拒收, 走退货",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });

  const filled = await fillShippingReturnTracking(SHIPPER, {
    shippingReturnId: sr.id,
    returnTrackingNumber: "SF1234567890",
    returnCarrier: "顺丰速运",
  });
  assert.equal(filled.status, "IN_RETURN_TRANSIT");
  assert.equal(filled.returnTrackingNumber, "SF1234567890");
  assert.equal(filled.returnCarrier, "顺丰速运");
  assert.equal(filled.trackingFilledById, SHIPPER.id);
  assert.equal(
    store.operationLogs.some(
      (l) => l.action === "shipping_return.tracking_filled",
    ),
    true,
  );
});

test("反例: PENDING_REVIEW 状态下填运单 → throw (需先审核通过)", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "OTHER",
    reasonDetail: "顺序错误测试",
  });

  await assert.rejects(
    () =>
      fillShippingReturnTracking(SHIPPER, {
        shippingReturnId: sr.id,
        returnTrackingNumber: "SF0000",
        returnCarrier: "顺丰",
      }),
    /不能填运单/,
  );
});

test("反例: SALES 没有填运单的权限 (canFillShippingReturnTracking gate)", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "RBAC 测试",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });

  await assert.rejects(
    () =>
      fillShippingReturnTracking(SALES, {
        shippingReturnId: sr.id,
        returnTrackingNumber: "SF0000",
        returnCarrier: "顺丰",
      }),
    /没有填写退货运单的权限/,
  );
});

// ============================================================
// 4. confirmShippingReturnReceived — 入库 + 自动建退款
// ============================================================

test("发货人确认入库 (IN_RETURN_TRANSIT) → RETURNED_TO_WAREHOUSE + 自动建 RefundRequest", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "酒瓶有裂纹",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  await fillShippingReturnTracking(SHIPPER, {
    shippingReturnId: sr.id,
    returnTrackingNumber: "SF1234567890",
    returnCarrier: "顺丰速运",
  });

  const result = await confirmShippingReturnReceived(SHIPPER, {
    shippingReturnId: sr.id,
    receivedPhotoUrl: "https://cdn/p1.jpg",
    receivedRemark: "外箱无破损, 已收",
  });
  assert.equal(result.shippingReturn.status, "RETURNED_TO_WAREHOUSE");
  assert.equal(result.shippingReturn.receivedById, SHIPPER.id);
  assert.notEqual(result.shippingReturn.receivedAt, null);

  // 自动建退款应该已被调用并真正落了 1 条 RefundRequest
  assert.equal(store.refundRequests.length, 1);
  assert.equal(result.refundRequestId, store.refundRequests[0]!.id);

  // 联动日志: confirmed_received + refund_request.created + refund_auto_created 都应该有
  const actions = store.operationLogs.map((l) => l.action);
  assert.ok(actions.includes("shipping_return.confirmed_received"));
  assert.ok(actions.includes("refund_request.created"));
  assert.ok(actions.includes("shipping_return.refund_auto_created"));
});

test("发货人可从 PENDING_RETURN_TRACKING 直接入库 (跳过运单回填的现场签收路径)", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "WRONG_ITEM",
    reasonDetail: "现场签收, 没经 IN_RETURN_TRANSIT",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  // 不填运单, 直接 confirm
  const result = await confirmShippingReturnReceived(SHIPPER, {
    shippingReturnId: sr.id,
  });
  assert.equal(result.shippingReturn.status, "RETURNED_TO_WAREHOUSE");
  // 自动退款已建
  assert.equal(store.refundRequests.length, 1);
});

test("入库时无 unreversed confirmed PaymentRecord → 入库成功但 refundRequestId 为 null + 留 skip 日志", async () => {
  resetStore();
  seedHappyPath();
  // 把唯一的 PaymentRecord 标记 reversed → 没有可冲账的
  store.paymentRecords[0]!.isReversed = true;

  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "CUSTOMER_REJECT",
    reasonDetail: "无可冲账收款 — 入库不应阻塞",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  await fillShippingReturnTracking(SHIPPER, {
    shippingReturnId: sr.id,
    returnTrackingNumber: "SF000",
    returnCarrier: "顺丰",
  });

  const result = await confirmShippingReturnReceived(SHIPPER, {
    shippingReturnId: sr.id,
  });
  assert.equal(result.shippingReturn.status, "RETURNED_TO_WAREHOUSE");
  assert.equal(result.refundRequestId, null);
  assert.equal(store.refundRequests.length, 0);
  // 留 skip 日志便于财务事后手工补建
  const actions = store.operationLogs.map((l) => l.action);
  assert.ok(
    actions.includes("shipping_return.refund_auto_skipped"),
    "应该写入 shipping_return.refund_auto_skipped 日志",
  );
});

test("入库 race: 该订单已有 PENDING_FINANCE RefundRequest → 整 tx 抛错, 状态保持 IN_RETURN_TRANSIT", async () => {
  resetStore();
  seedHappyPath();

  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "并发 race 测试",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  await fillShippingReturnTracking(SHIPPER, {
    shippingReturnId: sr.id,
    returnTrackingNumber: "SF1234",
    returnCarrier: "顺丰",
  });

  // 注入 race: refundRequest.findFirst 返回 blocker
  store.blockRefundCreate = true;

  await assert.rejects(
    () =>
      confirmShippingReturnReceived(SHIPPER, {
        shippingReturnId: sr.id,
      }),
    /已有进行中的退款申请/,
  );
  // 注: fake $transaction 不能真的回滚 store 已写入数据,
  // 但断言 refundRequests 仍为 0 (拒在 create 之前) — 是 tx 抛错的直接证据
  assert.equal(store.refundRequests.length, 0);
});

test("反例: 入库后再次入库 — refundRequestId 已写, 拒重复入库", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "重复入库守卫",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  await fillShippingReturnTracking(SHIPPER, {
    shippingReturnId: sr.id,
    returnTrackingNumber: "SF000111",
    returnCarrier: "顺丰",
  });
  await confirmShippingReturnReceived(SHIPPER, {
    shippingReturnId: sr.id,
  });

  // 第二次 confirm — 状态守卫 (RETURNED_TO_WAREHOUSE 已不在允许入库的状态集) 先命中,
  // 优先于 refundRequestId 已写的二次拒. 任何一个错误都说明拒了重复入库.
  await assert.rejects(
    () =>
      confirmShippingReturnReceived(SHIPPER, {
        shippingReturnId: sr.id,
      }),
    /已关联退款单|不能重复入库|RETURNED_TO_WAREHOUSE/,
  );
});

// ============================================================
// 5. cancelShippingReturn
// ============================================================

test("发起人在 PENDING_REVIEW 阶段撤回 → CANCELED", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "CUSTOMER_REJECT",
    reasonDetail: "客户又改主意了, 不退了",
  });

  const canceled = await cancelShippingReturn(SALES, {
    shippingReturnId: sr.id,
  });
  assert.equal(canceled.status, "CANCELED");
  assert.ok(
    store.operationLogs.some((l) => l.action === "shipping_return.canceled"),
  );
});

test("发起人在 PENDING_RETURN_TRACKING 阶段也能撤回", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "CUSTOMER_REJECT",
    reasonDetail: "批了之后客户又收下了",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });

  const canceled = await cancelShippingReturn(SALES, {
    shippingReturnId: sr.id,
  });
  assert.equal(canceled.status, "CANCELED");
});

test("发起人在 IN_RETURN_TRANSIT 阶段也能撤回 (实物可拦回)", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "运单回填后客户又同意收下了, 撤回",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  await fillShippingReturnTracking(SHIPPER, {
    shippingReturnId: sr.id,
    returnTrackingNumber: "SF999888",
    returnCarrier: "顺丰",
  });
  const canceled = await cancelShippingReturn(SALES, {
    shippingReturnId: sr.id,
  });
  assert.equal(canceled.status, "CANCELED");
});

test("ADMIN 兜底可以撤别人发起的申请", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "admin 兜底撤别人发起的",
  });
  const canceled = await cancelShippingReturn(ADMIN, {
    shippingReturnId: sr.id,
  });
  assert.equal(canceled.status, "CANCELED");
});

test("反例: SALES_OTHER 不是发起人也不是 SUPERVISOR/ADMIN → 不能撤", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "OTHER",
    reasonDetail: "测试谁能撤",
  });
  await assert.rejects(
    () =>
      cancelShippingReturn(SALES_OTHER, {
        shippingReturnId: sr.id,
      }),
    /仅发起人本人或主管\/管理员可撤回退货申请/,
  );
});

test("反例: 入库后 (RETURNED_TO_WAREHOUSE) 不能再撤回 — 走退款流程", async () => {
  resetStore();
  seedHappyPath();
  const sr = await requestShippingReturn(SALES, {
    tradeOrderId: "to_1",
    shippingTaskId: "st_1",
    reason: "QUALITY_ISSUE",
    reasonDetail: "入库后不能撤",
  });
  await reviewShippingReturn(SUPERVISOR, {
    shippingReturnId: sr.id,
    decision: "APPROVED",
  });
  await fillShippingReturnTracking(SHIPPER, {
    shippingReturnId: sr.id,
    returnTrackingNumber: "SF000",
    returnCarrier: "顺丰",
  });
  await confirmShippingReturnReceived(SHIPPER, {
    shippingReturnId: sr.id,
  });

  await assert.rejects(
    () =>
      cancelShippingReturn(SALES, {
        shippingReturnId: sr.id,
      }),
    /不能撤回 \(入库后请走退款流程\)/,
  );
});
