/**
 * assignCustomerToSalesTx — 公海客户 claim-lock 抢占保护回归.
 *
 * 跟 tests/shipping/returns-workflow.test.mts 风格一致: monkey-patch 单例
 * prisma 客户端,把 ownership 流程压成 in-memory 模拟.
 *
 * 覆盖的高危场景 — preview/apply 窗口竞争 + 主管手工指派偷锁:
 *   - 公海客户 claimLockedUntil > now 时,SYSTEM auto-assign 必须被拒
 *   - 同一情景下 SUPERVISOR 手动指派也必须被拒
 *   - ADMIN 兜底允许指派 (用于人工 override)
 *   - 锁过期 (claimLockedUntil <= now) 时,普通 SYSTEM/SUPERVISOR 流程恢复
 *
 * 修复 reference: lib/customers/ownership.ts 公海分支末尾增加
 *   `if (isProtectedCustomer(customer, now) && actor.role !== 'ADMIN') throw`.
 * 没有这一行,公海客户在保护期内会被主管手工指派或 auto-assign 抢走.
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { prisma } = await import("../../lib/db/prisma.ts");

type FakeStore = {
  customers: CustomerRow[];
  recycleEntries: RecycleEntryRow[];
  teamSettings: TeamSettingRow[];
  ownershipEvents: OwnershipEventRow[];
  operationLogs: OperationLogRow[];
};

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

type RecycleEntryRow = {
  id: string;
  targetType: string;
  targetId: string;
  status: string;
};

type TeamSettingRow = {
  teamId: string;
  autoAssignEnabled: boolean;
  autoAssignStrategy: string;
  autoAssignBatchSize: number;
  maxActiveCustomersPerSales: number | null;
  roundRobinCursorUserId: string | null;
  strongEffectProtectionDays: number;
  mediumEffectProtectionDays: number;
  weakEffectResetsClock: boolean;
  negativeRequiresSupervisorReview: boolean;
  salesCanClaim: boolean;
  salesCanRelease: boolean;
  batchAssignEnabled: boolean;
  batchRecycleEnabled: boolean;
};

type OwnershipEventRow = {
  customerId: string;
  reason: string;
  toOwnerId: string | null;
  teamId: string | null;
};

type OperationLogRow = {
  action: string;
  actorId: string | null;
  targetId: string;
};

let store: FakeStore;

function resetStore(): void {
  store = {
    customers: [],
    recycleEntries: [],
    teamSettings: [],
    ownershipEvents: [],
    operationLogs: [],
  };
}

function installPrismaStub(): void {
  const fakeClient: Record<string, unknown> = {
    $transaction: async <T>(
      callback: (tx: typeof fakeClient) => Promise<T>,
    ): Promise<T> => callback(fakeClient),

    recycleBinEntry: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const targetId = where.targetId as string;
        const targetType = where.targetType as string;
        return (
          store.recycleEntries.find(
            (e) => e.targetType === targetType && e.targetId === targetId,
          ) ?? null
        );
      },
    },

    customer: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return store.customers.find((c) => c.id === where.id) ?? null;
      },
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

    teamPublicPoolSetting: {
      findUnique: async ({ where }: { where: { teamId: string } }) => {
        return store.teamSettings.find((s) => s.teamId === where.teamId) ?? null;
      },
    },

    customerOwnershipEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: OwnershipEventRow = {
          customerId: data.customerId as string,
          reason: data.reason as string,
          toOwnerId: (data.toOwnerId as string | null) ?? null,
          teamId: (data.teamId as string | null) ?? null,
        };
        store.ownershipEvents.push(row);
        return { id: `evt_${store.ownershipEvents.length}` };
      },
      findFirst: async () => null,
    },

    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.operationLogs.push({
          action: data.action as string,
          actorId: (data.actorId as string | null) ?? null,
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

const { assignCustomerToSalesTx, createSystemOwnershipActorContext } =
  await import("../../lib/customers/ownership.ts");
const { CustomerOwnershipEventReason } = await import("@prisma/client");

// === 公共 fixture ===

const TEAM_ID = "team_1";
const SALES_OLD = { id: "user_sales_old", teamId: TEAM_ID };
const SALES_NEW = {
  id: "user_sales_new",
  name: "新销售",
  username: "sales_new",
  teamId: TEAM_ID,
};
const SUPERVISOR = {
  id: "user_sup",
  role: "SUPERVISOR" as const,
  name: "主管",
  username: "sup",
  teamId: TEAM_ID,
};
const ADMIN = {
  id: "user_admin",
  role: "ADMIN" as const,
  name: "管理员",
  username: "admin",
  teamId: null,
};

function seedTeamSetting(): void {
  store.teamSettings.push({
    teamId: TEAM_ID,
    autoAssignEnabled: true,
    autoAssignStrategy: "ROUND_ROBIN",
    autoAssignBatchSize: 10,
    maxActiveCustomersPerSales: null,
    roundRobinCursorUserId: null,
    strongEffectProtectionDays: 7,
    mediumEffectProtectionDays: 3,
    weakEffectResetsClock: false,
    negativeRequiresSupervisorReview: false,
    salesCanClaim: true,
    salesCanRelease: true,
    batchAssignEnabled: true,
    batchRecycleEnabled: true,
  });
}

function seedLockedPublicPoolCustomer(opts: { lockedUntil: Date | null }): void {
  store.customers.push({
    id: "cust_locked",
    name: "保护期客户",
    phone: "13800000001",
    ownerId: null,
    ownershipMode: "PUBLIC",
    lastOwnerId: SALES_OLD.id,
    publicPoolEnteredAt: new Date("2026-01-01T00:00:00Z"),
    publicPoolReason: "MANUAL_RELEASE",
    claimLockedUntil: opts.lockedUntil,
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: TEAM_ID,
    owner: null,
    lastOwner: {
      id: SALES_OLD.id,
      name: "原销售",
      username: "sales_old",
      teamId: TEAM_ID,
    },
  });
}

// ============================================================
// 锁还在 — 必须拒
// ============================================================

test("反例: SYSTEM auto-assign 在 claim-lock 保护期内不能抢公海客户", async () => {
  resetStore();
  seedTeamSetting();
  // 锁还有 1 小时才到期 — preview 之后 apply 之前被另一名 SALES claim 走重置的窗口情景
  seedLockedPublicPoolCustomer({
    lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
  });

  const systemActor = createSystemOwnershipActorContext(TEAM_ID);

  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        assignCustomerToSalesTx(tx, {
          actor: systemActor,
          targetSales: SALES_NEW,
          customerId: "cust_locked",
          reason: CustomerOwnershipEventReason.AUTO_ASSIGN,
          requireCurrentPublicPool: true,
        }),
      ),
    /claim protection/i,
    "SYSTEM 自动分配不能跨过 claim lock",
  );

  // 客户 ownership 应保持 PUBLIC,不应进入 PRIVATE
  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, null);
  assert.equal(customer.ownershipMode, "PUBLIC");
  // 不应留下 AUTO_ASSIGN 的 ownership event
  assert.equal(store.ownershipEvents.length, 0);
});

test("反例: SUPERVISOR 手工指派在 claim-lock 保护期内也不能抢公海客户", async () => {
  resetStore();
  seedTeamSetting();
  seedLockedPublicPoolCustomer({
    lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
  });

  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        assignCustomerToSalesTx(tx, {
          actor: SUPERVISOR,
          targetSales: SALES_NEW,
          customerId: "cust_locked",
          reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
        }),
      ),
    /claim protection/i,
    "主管手工指派不能跨过 claim lock",
  );

  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, null);
  assert.equal(customer.ownershipMode, "PUBLIC");
});

test("ADMIN 兜底可以在保护期内手工指派 (人工 override)", async () => {
  resetStore();
  seedTeamSetting();
  seedLockedPublicPoolCustomer({
    lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
  });

  const transition = await prisma.$transaction((tx) =>
    assignCustomerToSalesTx(tx, {
      actor: ADMIN,
      targetSales: SALES_NEW,
      customerId: "cust_locked",
      reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
    }),
  );

  assert.notEqual(transition, null);
  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, SALES_NEW.id);
  assert.equal(customer.ownershipMode, "PRIVATE");
  // 审计链应留下事件
  assert.equal(store.ownershipEvents.length, 1);
  assert.equal(store.ownershipEvents[0]!.toOwnerId, SALES_NEW.id);
});

// ============================================================
// 锁已过期 — 应正常分配
// ============================================================

test("锁过期后 SYSTEM auto-assign 可正常分配公海客户", async () => {
  resetStore();
  seedTeamSetting();
  // 锁已过期 1 小时
  seedLockedPublicPoolCustomer({
    lockedUntil: new Date(Date.now() - 60 * 60 * 1000),
  });

  const systemActor = createSystemOwnershipActorContext(TEAM_ID);
  const transition = await prisma.$transaction((tx) =>
    assignCustomerToSalesTx(tx, {
      actor: systemActor,
      targetSales: SALES_NEW,
      customerId: "cust_locked",
      reason: CustomerOwnershipEventReason.AUTO_ASSIGN,
      requireCurrentPublicPool: true,
    }),
  );

  assert.notEqual(transition, null);
  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, SALES_NEW.id);
  assert.equal(customer.ownershipMode, "PRIVATE");
});

test("无锁公海客户 SUPERVISOR 手工指派正常路径", async () => {
  resetStore();
  seedTeamSetting();
  seedLockedPublicPoolCustomer({ lockedUntil: null });

  const transition = await prisma.$transaction((tx) =>
    assignCustomerToSalesTx(tx, {
      actor: SUPERVISOR,
      targetSales: SALES_NEW,
      customerId: "cust_locked",
      reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
    }),
  );

  assert.notEqual(transition, null);
  const customer = store.customers[0]!;
  assert.equal(customer.ownerId, SALES_NEW.id);
});
