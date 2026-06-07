/**
 * lib/payments/refunds.ts recordRefundPayout 并发/重放兜底单测.
 *
 * 背景:
 *   PAID_OUT 时给每个 source PaymentRecord 建一条 ReversePaymentRecord. 如果出账
 *   接口因网络/服务端 retry 被重放, 或两次并发出账都穿过 isReversed 检查, 没有 DB
 *   兜底就会双倍冲账, 审计金额错乱.
 *
 *   修复:
 *     - schema.prisma 给 ReversePaymentRecord.sourcePaymentRecordId 加 @unique
 *     - lib/payments/refunds.ts 在 $transaction 内对 source PaymentRecord 行加
 *       FOR UPDATE 锁, 并把 Prisma P2002 翻译成业务可读 error
 *
 * 本单测验证:
 *   1) 首次出账成功, 写一条 ReversePaymentRecord
 *   2) 第二次 create 命中模拟 P2002 (DB 唯一索引兜底), 翻成
 *      "已被冲账过 (并发或重放), 本次出账已拒绝"
 *
 * 跟 tests/shipping/returns-workflow.test.mts 的 mock 思路一致 — 替换 prisma 单例
 * 上的方法, 不真连 DB.
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { prisma } = await import("../../lib/db/prisma.ts");
const { Prisma } = await import("@prisma/client");

type ReverseRow = {
  id: string;
  refundRequestId: string;
  sourcePaymentRecordId: string;
};

type Store = {
  refundRequest: {
    id: string;
    status: string;
    tradeOrderId: string;
    approvedAmount: { toString: () => string };
    sourcePaymentRecordIds: string[];
  };
  paymentRecords: Array<{
    id: string;
    amount: { toString: () => string };
    isReversed: boolean;
  }>;
  reverseRecords: ReverseRow[];
  // 当 true: 模拟"另一个并发事务/重放已抢先 commit", create 抛 P2002
  simulateUniqueViolation: boolean;
  operationLogs: Array<{ action: string }>;
};

let store: Store;

function resetStore(): void {
  store = {
    refundRequest: {
      id: "refund_1",
      status: "APPROVED_FINANCE",
      tradeOrderId: "trade_1",
      approvedAmount: { toString: () => "100.00" },
      sourcePaymentRecordIds: ["pr_1"],
    },
    paymentRecords: [
      {
        id: "pr_1",
        amount: { toString: () => "100.00" },
        isReversed: false,
      },
    ],
    reverseRecords: [],
    simulateUniqueViolation: false,
    operationLogs: [],
  };
}

function installPrismaStub(): void {
  const fakeClient: Record<string, unknown> = {
    $transaction: async <T>(
      callback: (tx: typeof fakeClient) => Promise<T>,
    ): Promise<T> => callback(fakeClient),

    $queryRaw: async () => {
      // 模拟 FOR UPDATE 行锁查询 — 不需要真返回数据
      return store.paymentRecords.map((p) => ({ id: p.id }));
    },

    refundRequest: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (store.refundRequest.id !== where.id) return null;
        return { ...store.refundRequest };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        if (store.refundRequest.id !== where.id) {
          throw new Error("refund not found");
        }
        Object.assign(store.refundRequest, data);
        return { ...store.refundRequest };
      },
    },

    paymentRecord: {
      findMany: async () => store.paymentRecords.map((p) => ({ ...p })),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        for (const p of store.paymentRecords) {
          Object.assign(p, data);
        }
        return { count: store.paymentRecords.length };
      },
    },

    reversePaymentRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (store.simulateUniqueViolation) {
          // 模拟 DB 唯一索引兜底 — Prisma 会抛 PrismaClientKnownRequestError P2002
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`sourcePaymentRecordId`)",
            {
              code: "P2002",
              clientVersion: "test",
              meta: { target: ["sourcePaymentRecordId"] },
            },
          );
        }
        const row: ReverseRow = {
          id: `rpr_${store.reverseRecords.length + 1}`,
          refundRequestId: data.refundRequestId as string,
          sourcePaymentRecordId: data.sourcePaymentRecordId as string,
        };
        store.reverseRecords.push(row);
        return row;
      },
    },

    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.operationLogs.push({ action: data.action as string });
        return { id: `log_${store.operationLogs.length}` };
      },
    },
  };

  for (const key of Object.keys(fakeClient)) {
    (prisma as unknown as Record<string, unknown>)[key] = fakeClient[key];
  }
}

installPrismaStub();

const { recordRefundPayout } = await import("../../lib/payments/refunds.ts");

const FINANCE_ACTOR = { id: "finance_1", role: "FINANCE" as const };

test("首次出账成功 — 1 条 ReversePaymentRecord + status -> PAID_OUT", async () => {
  resetStore();
  installPrismaStub();

  const result = await recordRefundPayout(FINANCE_ACTOR, {
    refundRequestId: "refund_1",
    payoutMethod: "BANK_TRANSFER",
  });

  assert.equal(result.reverseRecords.length, 1);
  assert.equal(result.reverseRecords[0]?.sourcePaymentRecordId, "pr_1");
  assert.equal(store.reverseRecords.length, 1);
  assert.equal(store.refundRequest.status, "PAID_OUT");
  assert.equal(store.paymentRecords[0]?.isReversed, true);
  assert.ok(
    store.operationLogs.some((l) => l.action === "refund_request.paid_out"),
    "应写 refund_request.paid_out 审计日志",
  );
});

test("并发/重放第二次 create 命中 DB 唯一索引 — 翻成业务可读 error, 不写双倍记录", async () => {
  resetStore();
  installPrismaStub();
  // 模拟"另一笔并发事务已经先一步 INSERT 同一 sourcePaymentRecordId 的 reverse row"
  store.simulateUniqueViolation = true;

  await assert.rejects(
    recordRefundPayout(FINANCE_ACTOR, {
      refundRequestId: "refund_1",
      payoutMethod: "BANK_TRANSFER",
    }),
    /已被冲账过 \(并发或重放\)/,
  );

  // 关键审计验证: 没有写第二条 reverse row, 也没把 refund 翻成 PAID_OUT
  assert.equal(store.reverseRecords.length, 0);
  assert.equal(store.refundRequest.status, "APPROVED_FINANCE");
});
