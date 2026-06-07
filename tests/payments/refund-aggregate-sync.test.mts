/**
 * lib/payments/mutations.ts syncPaymentPlanAggregateState 退款冲账聚合测试.
 *
 * 修的 finding (payment / critical / data_integrity):
 *   syncPaymentPlanAggregateState 聚合 submittedAmount / confirmedAmount 时不
 *   过滤 isReversed=true 的 PaymentRecord, 导致退款 PAID_OUT 后 plan
 *   remainingAmount 偏低甚至为 0, CollectionTask 不会因为退款而重开.
 *
 * 覆盖点:
 *   1. 仅 isReversed=false 的 CONFIRMED + SUBMITTED 计入聚合 (正向)
 *   2. isReversed=true 的 CONFIRMED 记录被排除 (修复点)
 *   3. 全部记录被 reverse 后, remainingAmount 回到 plannedAmount (修复点)
 *   4. CANCELED 状态短路, 不重算 (回归保护)
 *   5. plan 找不到时返回 null (回归保护)
 *
 * 不真连 DB — 通过 in-memory tx stub 把 paymentPlan.findUnique /
 * paymentRecord.findMany / paymentPlan.update 压成对象数组操作.
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { syncPaymentPlanAggregateState } = await import(
  "../../lib/payments/mutations.ts"
);

import prismaClientModule from "@prisma/client";
const { Prisma, PaymentPlanStatus, PaymentRecordStatus } = prismaClientModule;

type PlanRow = {
  id: string;
  plannedAmount: InstanceType<typeof Prisma.Decimal>;
  status: (typeof PaymentPlanStatus)[keyof typeof PaymentPlanStatus];
  submittedAmount?: number;
  confirmedAmount?: number;
  remainingAmount?: number;
};

type RecordRow = {
  paymentPlanId: string;
  amount: InstanceType<typeof Prisma.Decimal>;
  status: (typeof PaymentRecordStatus)[keyof typeof PaymentRecordStatus];
  isReversed: boolean;
};

type FakeStore = {
  plans: PlanRow[];
  records: RecordRow[];
  updates: Array<{ id: string; data: Record<string, unknown> }>;
};

function makeStore(): FakeStore {
  return { plans: [], records: [], updates: [] };
}

// stub tx 形状只覆盖 syncPaymentPlanAggregateState 真正访问的两张表三个方法
function makeStubTx(store: FakeStore) {
  return {
    paymentPlan: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => {
        const row = store.plans.find((p) => p.id === where.id);
        if (!row) return null;
        if (!select) return row;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) {
            out[key] = (row as unknown as Record<string, unknown>)[key];
          }
        }
        return out;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        store.updates.push({ id: where.id, data });
        const row = store.plans.find((p) => p.id === where.id);
        if (row) {
          Object.assign(row, data);
        }
        return row ?? {};
      },
    },
    paymentRecord: {
      findMany: async ({
        where,
        select,
      }: {
        where: { paymentPlanId: string };
        select?: Record<string, boolean>;
      }) => {
        const rows = store.records.filter(
          (r) => r.paymentPlanId === where.paymentPlanId,
        );
        if (!select) return rows;
        return rows.map((r) => {
          const out: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) {
              out[key] = (r as unknown as Record<string, unknown>)[key];
            }
          }
          return out;
        });
      },
    },
  };
}

test("syncPaymentPlanAggregateState: 排除 isReversed=true 的 CONFIRMED 记录 (修复主线)", async () => {
  const store = makeStore();
  store.plans.push({
    id: "plan_1",
    plannedAmount: new Prisma.Decimal("1000.00"),
    status: PaymentPlanStatus.PENDING,
  });
  // 3 笔 CONFIRMED, 其中第 1 和第 3 被退款冲账标 isReversed=true
  store.records.push(
    {
      paymentPlanId: "plan_1",
      amount: new Prisma.Decimal("400.00"),
      status: PaymentRecordStatus.CONFIRMED,
      isReversed: true,
    },
    {
      paymentPlanId: "plan_1",
      amount: new Prisma.Decimal("300.00"),
      status: PaymentRecordStatus.CONFIRMED,
      isReversed: false,
    },
    {
      paymentPlanId: "plan_1",
      amount: new Prisma.Decimal("200.00"),
      status: PaymentRecordStatus.CONFIRMED,
      isReversed: true,
    },
  );

  const tx = makeStubTx(store);
  const progress = await syncPaymentPlanAggregateState(
    tx as unknown as Parameters<typeof syncPaymentPlanAggregateState>[0],
    "plan_1",
  );

  assert.ok(progress, "progress should not be null");
  // 修前: 会计算 400+300+200=900, remainingAmount=100
  // 修后: 只算未冲账的 300, remainingAmount=700
  assert.equal(progress.confirmedAmount, 300, "confirmed 应只计入未冲账的 300");
  assert.equal(progress.submittedAmount, 300, "submitted 同样剔除冲账");
  assert.equal(
    progress.remainingAmount,
    700,
    "remaining = planned 1000 - confirmed 300 = 700, 退款回来体现真相",
  );
  assert.equal(store.updates.length, 1, "应写回 PaymentPlan 一次");
});

test("syncPaymentPlanAggregateState: 全部 isReversed=true 时 remaining 回到 planned (退款全额场景)", async () => {
  const store = makeStore();
  store.plans.push({
    id: "plan_full_reverse",
    plannedAmount: new Prisma.Decimal("888.88"),
    status: PaymentPlanStatus.PENDING,
  });
  store.records.push({
    paymentPlanId: "plan_full_reverse",
    amount: new Prisma.Decimal("888.88"),
    status: PaymentRecordStatus.CONFIRMED,
    isReversed: true,
  });

  const tx = makeStubTx(store);
  const progress = await syncPaymentPlanAggregateState(
    tx as unknown as Parameters<typeof syncPaymentPlanAggregateState>[0],
    "plan_full_reverse",
  );

  assert.ok(progress);
  assert.equal(progress.confirmedAmount, 0);
  assert.equal(progress.submittedAmount, 0);
  assert.equal(
    progress.remainingAmount,
    888.88,
    "全额退款后 remainingAmount 应等于 plannedAmount, CollectionTask 才能重开",
  );
});

test("syncPaymentPlanAggregateState: SUBMITTED 但 isReversed=true 也被排除", async () => {
  const store = makeStore();
  store.plans.push({
    id: "plan_submitted_reverse",
    plannedAmount: new Prisma.Decimal("500"),
    status: PaymentPlanStatus.PENDING,
  });
  store.records.push(
    {
      paymentPlanId: "plan_submitted_reverse",
      amount: new Prisma.Decimal("200"),
      status: PaymentRecordStatus.SUBMITTED,
      isReversed: false,
    },
    {
      paymentPlanId: "plan_submitted_reverse",
      amount: new Prisma.Decimal("300"),
      status: PaymentRecordStatus.SUBMITTED,
      isReversed: true,
    },
  );

  const tx = makeStubTx(store);
  const progress = await syncPaymentPlanAggregateState(
    tx as unknown as Parameters<typeof syncPaymentPlanAggregateState>[0],
    "plan_submitted_reverse",
  );

  assert.ok(progress);
  assert.equal(
    progress.submittedAmount,
    200,
    "submitted 也按 isReversed 过滤, 仅 200 计入",
  );
  assert.equal(progress.confirmedAmount, 0);
});

test("syncPaymentPlanAggregateState: CANCELED plan 直接短路", async () => {
  const store = makeStore();
  store.plans.push({
    id: "plan_canceled",
    plannedAmount: new Prisma.Decimal("999"),
    status: PaymentPlanStatus.CANCELED,
  });
  store.records.push({
    paymentPlanId: "plan_canceled",
    amount: new Prisma.Decimal("999"),
    status: PaymentRecordStatus.CONFIRMED,
    isReversed: false,
  });

  const tx = makeStubTx(store);
  const progress = await syncPaymentPlanAggregateState(
    tx as unknown as Parameters<typeof syncPaymentPlanAggregateState>[0],
    "plan_canceled",
  );

  assert.ok(progress);
  assert.equal(progress.status, PaymentPlanStatus.CANCELED);
  assert.equal(progress.submittedAmount, 0);
  assert.equal(progress.confirmedAmount, 0);
  assert.equal(progress.remainingAmount, 0);
  // CANCELED 短路, 不应触发 plan.update
  assert.equal(store.updates.length, 0, "CANCELED 不写回 plan");
});

test("syncPaymentPlanAggregateState: plan 不存在返回 null", async () => {
  const store = makeStore();
  const tx = makeStubTx(store);
  const result = await syncPaymentPlanAggregateState(
    tx as unknown as Parameters<typeof syncPaymentPlanAggregateState>[0],
    "missing_plan",
  );
  assert.equal(result, null);
});
