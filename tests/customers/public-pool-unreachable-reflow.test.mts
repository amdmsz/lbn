/**
 * 未接通回流 + 24h 指派冷却 — 公海规则回归.
 *
 * 跟 tests/customers/public-pool-claim-lock.test.mts 同款 in-memory prisma stub.
 *
 * 覆盖场景:
 *   - SUPERVISOR 以 UNREACHABLE_RECYCLE 释放客户时, 可绕过 claim-lock
 *     (昨天刚指派的未接通客户当天就能回流公海)
 *   - 同一客户用 MANUAL_RELEASE 释放仍被 claim-lock 拦截 (原规则不放宽)
 *   - SALES 在 24h 冷却期内拨打过的公海客户不能自助认领
 *   - 拨打时间超过 24h 后认领恢复正常
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { prisma } = await import("../../lib/db/prisma.ts");

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  ownerId: string | null;
  ownershipMode: string;
  lastOwnerId: string | null;
  publicPoolEnteredAt: Date | null;
  publicPoolReason: string | null;
  claimLockedUntil: Date | null;
  lastEffectiveFollowUpAt: Date | null;
  publicPoolTeamId: string | null;
  owner: { id: string; name: string; username: string; teamId: string | null } | null;
  lastOwner: { id: string; name: string; username: string; teamId: string | null } | null;
};

type CallRecordRow = {
  customerId: string;
  salesId: string;
  callTime: Date;
};

type FakeStore = {
  customers: CustomerRow[];
  callRecords: CallRecordRow[];
  ownershipEvents: Array<{ customerId: string; reason: string; toOwnerId: string | null }>;
  operationLogs: Array<{ action: string; targetId: string }>;
  teamSettings: Array<Record<string, unknown> & { teamId: string }>;
};

let store: FakeStore;

function resetStore(): void {
  store = {
    customers: [],
    callRecords: [],
    ownershipEvents: [],
    operationLogs: [],
    teamSettings: [],
  };
}

function installPrismaStub(): void {
  const fakeClient: Record<string, unknown> = {
    $transaction: async <T>(
      callback: (tx: typeof fakeClient) => Promise<T>,
    ): Promise<T> => callback(fakeClient),

    // getOwnershipCustomerTx 的 SELECT ... FOR UPDATE 行锁 — in-memory 模拟无并发, 直接放行
    $queryRaw: async () => [],

    recycleBinEntry: {
      findFirst: async () => null,
    },

    customer: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.customers.find((c) => c.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.customers.find((c) => c.id === where.id);
        if (!row) throw new Error(`customer ${where.id} not in store`);
        Object.assign(row, data);
        return row;
      },
    },

    callRecord: {
      findFirst: async ({
        where,
      }: {
        where: { customerId: string; salesId: string; callTime: { gte: Date } };
      }) =>
        store.callRecords.find(
          (r) =>
            r.customerId === where.customerId &&
            r.salesId === where.salesId &&
            r.callTime.getTime() >= where.callTime.gte.getTime(),
        ) ?? null,
    },

    teamPublicPoolSetting: {
      findUnique: async ({ where }: { where: { teamId: string } }) =>
        store.teamSettings.find((s) => s.teamId === where.teamId) ?? null,
    },

    customerOwnershipEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.ownershipEvents.push({
          customerId: data.customerId as string,
          reason: data.reason as string,
          toOwnerId: (data.toOwnerId as string | null) ?? null,
        });
        return { id: `evt_${store.ownershipEvents.length}` };
      },
      findFirst: async () => null,
    },

    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.operationLogs.push({
          action: data.action as string,
          targetId: data.targetId as string,
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

const { claimPublicPoolCustomerTx, releaseCustomerToPublicPoolTx } = await import(
  "../../lib/customers/ownership.ts"
);
const { PublicPoolReason } = await import("@prisma/client");

const TEAM_ID = "team_1";
const SALES = {
  id: "user_sales",
  role: "SALES" as const,
  name: "销售",
  username: "sales",
  teamId: TEAM_ID,
};
const SUPERVISOR = {
  id: "user_sup",
  role: "SUPERVISOR" as const,
  name: "主管",
  username: "sup",
  teamId: TEAM_ID,
};

function seedTeamSetting(): void {
  store.teamSettings.push({
    teamId: TEAM_ID,
    autoAssignEnabled: false,
    autoAssignStrategy: "NONE",
    autoAssignBatchSize: 10,
    maxActiveCustomersPerSales: null,
    roundRobinCursorUserId: null,
    strongEffectProtectionDays: 7,
    mediumEffectProtectionDays: 3,
    weakEffectResetsClock: false,
    negativeRequiresSupervisorReview: false,
    salesCanClaim: true,
    salesCanRelease: false,
    batchAssignEnabled: true,
    batchRecycleEnabled: true,
  });
}

function seedOwnedLockedCustomer(): void {
  store.customers.push({
    id: "cust_owned",
    name: "昨天刚指派的未接通客户",
    phone: "13800000001",
    ownerId: SALES.id,
    ownershipMode: "PRIVATE",
    lastOwnerId: SALES.id,
    publicPoolEnteredAt: null,
    publicPoolReason: null,
    // 指派自带 2 天 claim-lock, 还剩 1 天
    claimLockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: TEAM_ID,
    owner: { id: SALES.id, name: "销售", username: "sales", teamId: TEAM_ID },
    lastOwner: { id: SALES.id, name: "销售", username: "sales", teamId: TEAM_ID },
  });
}

function seedPublicCustomer(): void {
  store.customers.push({
    id: "cust_public",
    name: "未接通池客户",
    phone: "13800000002",
    ownerId: null,
    ownershipMode: "PUBLIC",
    lastOwnerId: null,
    publicPoolEnteredAt: new Date("2026-06-11T00:00:00Z"),
    publicPoolReason: "UNREACHABLE_RECYCLE",
    claimLockedUntil: null,
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: TEAM_ID,
    owner: null,
    lastOwner: null,
  });
}

test("SUPERVISOR 未接通回流可绕过 claim-lock 释放客户", async () => {
  resetStore();
  seedTeamSetting();
  seedOwnedLockedCustomer();

  const transition = await prisma.$transaction((tx) =>
    releaseCustomerToPublicPoolTx(tx, {
      actor: SUPERVISOR,
      customerId: "cust_owned",
      reason: PublicPoolReason.UNREACHABLE_RECYCLE,
    }),
  );

  assert.notEqual(transition, null);
  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, null);
  assert.equal(customer.ownershipMode, "PUBLIC");
  assert.equal(customer.publicPoolReason, "UNREACHABLE_RECYCLE");
  assert.equal(store.ownershipEvents.length, 1);
  assert.equal(store.ownershipEvents[0]!.reason, "UNREACHABLE_RECYCLE");
});

test("反例: SUPERVISOR 用 MANUAL_RELEASE 释放仍被 claim-lock 拦截", async () => {
  resetStore();
  seedTeamSetting();
  seedOwnedLockedCustomer();

  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        releaseCustomerToPublicPoolTx(tx, {
          actor: SUPERVISOR,
          customerId: "cust_owned",
          reason: PublicPoolReason.MANUAL_RELEASE,
        }),
      ),
    /claim protection/i,
    "非未接通回流原因不放宽保护期",
  );

  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, SALES.id);
  assert.equal(customer.ownershipMode, "PRIVATE");
});

test("反例: SALES 在 24h 冷却期内拨打过的公海客户不能认领", async () => {
  resetStore();
  seedTeamSetting();
  seedPublicCustomer();
  // 3 小时前打过 (未接通) — 冷却期内
  store.callRecords.push({
    customerId: "cust_public",
    salesId: SALES.id,
    callTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
  });

  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        claimPublicPoolCustomerTx(tx, {
          actor: SALES,
          customerId: "cust_public",
        }),
      ),
    /冷却期内不能认领/,
    "24h 内拨打过的客户禁止认领回本人",
  );

  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, null);
  assert.equal(customer.ownershipMode, "PUBLIC");
});

test("拨打超过 24h 后 SALES 认领恢复正常", async () => {
  resetStore();
  seedTeamSetting();
  seedPublicCustomer();
  // 26 小时前打过 — 冷却已过
  store.callRecords.push({
    customerId: "cust_public",
    salesId: SALES.id,
    callTime: new Date(Date.now() - 26 * 60 * 60 * 1000),
  });

  const transition = await prisma.$transaction((tx) =>
    claimPublicPoolCustomerTx(tx, {
      actor: SALES,
      customerId: "cust_public",
    }),
  );

  assert.notEqual(transition, null);
  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, SALES.id);
  assert.equal(customer.ownershipMode, "PRIVATE");
});
