/**
 * lib/customers/ownership.ts - recycleCustomerToPublicPoolTx 团队回退链单测.
 *
 * 跟 tests/shipping/returns-workflow.test.mts 同款 monkey-patch prisma 单例策略:
 * fakeClient 提供必要的 tx 方法, lib/customers/ownership.ts 内部 `import { prisma }`
 * 拿到的是同一个对象引用, 因此走 fake 实现.
 *
 * 验证目标:
 *   1. 正常 SYSTEM cron sweep — customer 有 owner.teamId, 回收后 publicPoolTeamId
 *      正确写为 owner.teamId.
 *   2. SYSTEM cron sweep + 历史 ownership event 兜底 — publicPoolTeamId / owner / lastOwner 全 null,
 *      但 customerOwnershipEvent 历史有 teamId, 回退到该 teamId.
 *   3. 极端孤儿场景 — 全部为 null + actor.teamId 也 null + 历史无 teamId 事件,
 *      旧实现会写入 publicPoolTeamId=null 制造孤儿; 新实现必须 throw,
 *      避免客户进入 "team-less 公海" 状态 (SUPERVISOR/SALES 不可见 + auto-assign 跳过).
 *
 * 业务背景: SYSTEM 全局 cron sweep 没有 teamId, 客户原 owner 已被硬删, publicPoolTeamId 历史缺失
 * 时, 必须保留 OperationLog 审计链, 且不能让客户失去团队归属.
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
  ownerTeamId: string | null;
  ownerName: string;
  ownerUsername: string;
  lastOwnerTeamId: string | null;
  lastOwnerName: string | null;
  lastOwnerUsername: string | null;
};

type CustomerOwnershipEventRow = {
  id: string;
  customerId: string;
  teamId: string | null;
  createdAt: Date;
};

type OperationLogRow = {
  action: string;
  actorId: string | null;
  targetId: string;
};

type FakeStore = {
  customers: CustomerRow[];
  events: CustomerOwnershipEventRow[];
  operationLogs: OperationLogRow[];
  recycleBinEntries: Array<{ targetType: string; targetId: string; status: string }>;
};

let store: FakeStore;

function resetStore(): void {
  store = {
    customers: [],
    events: [],
    operationLogs: [],
    recycleBinEntries: [],
  };
}

function shapeCustomerRecord(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    ownerId: row.ownerId,
    ownershipMode: row.ownershipMode,
    lastOwnerId: row.lastOwnerId,
    publicPoolEnteredAt: row.publicPoolEnteredAt,
    publicPoolReason: row.publicPoolReason,
    claimLockedUntil: row.claimLockedUntil,
    lastEffectiveFollowUpAt: row.lastEffectiveFollowUpAt,
    publicPoolTeamId: row.publicPoolTeamId,
    owner: row.ownerId
      ? {
          id: row.ownerId,
          name: row.ownerName,
          username: row.ownerUsername,
          teamId: row.ownerTeamId,
        }
      : null,
    lastOwner: row.lastOwnerId
      ? {
          id: row.lastOwnerId,
          name: row.lastOwnerName ?? "",
          username: row.lastOwnerUsername ?? "",
          teamId: row.lastOwnerTeamId,
        }
      : null,
  };
}

function installPrismaStub(): void {
  const fakeClient: Record<string, unknown> = {
    $transaction: async <T>(
      callback: (tx: typeof fakeClient) => Promise<T>,
    ): Promise<T> => callback(fakeClient),

    customer: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.customers.find((c) => c.id === where.id);
        return row ? shapeCustomerRecord(row) : null;
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
        if ("ownerId" in data) row.ownerId = data.ownerId as string | null;
        if ("ownershipMode" in data)
          row.ownershipMode = data.ownershipMode as string;
        if ("lastOwnerId" in data)
          row.lastOwnerId = data.lastOwnerId as string | null;
        if ("publicPoolEnteredAt" in data)
          row.publicPoolEnteredAt = data.publicPoolEnteredAt as Date | null;
        if ("publicPoolReason" in data)
          row.publicPoolReason = data.publicPoolReason as string | null;
        if ("claimLockedUntil" in data)
          row.claimLockedUntil = data.claimLockedUntil as Date | null;
        if ("publicPoolTeamId" in data)
          row.publicPoolTeamId = data.publicPoolTeamId as string | null;
        return shapeCustomerRecord(row);
      },
    },

    customerOwnershipEvent: {
      findFirst: async ({
        where,
      }: {
        where: Record<string, unknown>;
      }) => {
        const customerId = where.customerId as string | undefined;
        const teamIdFilter = where.teamId as { not?: null } | undefined;
        const candidates = store.events
          .filter((event) => {
            if (customerId && event.customerId !== customerId) return false;
            if (teamIdFilter && "not" in teamIdFilter && event.teamId === null)
              return false;
            return true;
          })
          // mock 已按推入顺序保存 — 按 createdAt desc 排序
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const head = candidates[0];
        return head ? { teamId: head.teamId } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: CustomerOwnershipEventRow = {
          id: `evt_${store.events.length + 1}`,
          customerId: data.customerId as string,
          teamId: (data.teamId as string | null) ?? null,
          createdAt: new Date(),
        };
        store.events.push(row);
        return { id: row.id };
      },
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

    recycleBinEntry: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const targetType = where.targetType as string;
        const targetId = where.targetId as string;
        return (
          store.recycleBinEntries.find(
            (entry) =>
              entry.targetType === targetType && entry.targetId === targetId,
          ) ?? null
        );
      },
    },
  };

  for (const key of Object.keys(fakeClient)) {
    (prisma as unknown as Record<string, unknown>)[key] = fakeClient[key];
  }
}

installPrismaStub();

const { recycleCustomerToPublicPoolTx, createSystemOwnershipActorContext } =
  await import("../../lib/customers/ownership.ts");

// ============================================================
// 1. 正常 SYSTEM cron sweep — owner 仍有 teamId, 回收使用 owner.teamId
// ============================================================

test("SYSTEM cron sweep: customer owner 有 teamId 时, publicPoolTeamId 回退到 owner.teamId", async () => {
  resetStore();
  store.customers.push({
    id: "cust_1",
    name: "客户1",
    phone: "13800000001",
    ownerId: "user_sales_1",
    ownershipMode: "PRIVATE",
    lastOwnerId: "user_sales_1",
    publicPoolEnteredAt: null,
    publicPoolReason: null,
    claimLockedUntil: null,
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: null, // 历史缺失
    ownerTeamId: "team_a", // owner 仍有团队
    ownerName: "销售1",
    ownerUsername: "sales1",
    lastOwnerTeamId: null,
    lastOwnerName: null,
    lastOwnerUsername: null,
  });

  const actor = createSystemOwnershipActorContext(); // teamId=null
  const result = await recycleCustomerToPublicPoolTx(
    prisma as unknown as Parameters<typeof recycleCustomerToPublicPoolTx>[0],
    {
      actor,
      customerId: "cust_1",
      reason: "INACTIVE_RECYCLE" as never,
    },
  );

  assert.notEqual(result, null, "回收应成功");
  const updated = store.customers[0]!;
  assert.equal(updated.publicPoolTeamId, "team_a", "应使用 owner.teamId");
  assert.equal(updated.ownerId, null);
  assert.equal(updated.ownershipMode, "PUBLIC");
  assert.equal(updated.lastOwnerId, "user_sales_1");
  // 审计链: 必须有 OperationLog
  assert.equal(store.operationLogs.length, 1);
  assert.equal(
    store.operationLogs[0]!.action,
    "customer.public_pool.auto_recycled",
  );
  // 审计事件 teamId 不能丢失溯源
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0]!.teamId, "team_a");
});

// ============================================================
// 2. SYSTEM cron sweep — 历史 ownership event 兜底
// ============================================================

test("SYSTEM cron sweep: owner.teamId/lastOwner.teamId 全 null, 落到历史 event.teamId", async () => {
  resetStore();
  store.customers.push({
    id: "cust_2",
    name: "客户2",
    phone: "13800000002",
    ownerId: "user_sales_orphan",
    ownershipMode: "PRIVATE",
    lastOwnerId: null,
    publicPoolEnteredAt: null,
    publicPoolReason: null,
    claimLockedUntil: null,
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: null,
    // 模拟 owner 还在但已退出团队 — owner.teamId=null
    ownerTeamId: null,
    ownerName: "孤儿销售",
    ownerUsername: "orphan",
    lastOwnerTeamId: null,
    lastOwnerName: null,
    lastOwnerUsername: null,
  });
  // 注入历史 ownership event 含 teamId
  store.events.push({
    id: "seed_evt",
    customerId: "cust_2",
    teamId: "team_b",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });

  const actor = createSystemOwnershipActorContext();
  const result = await recycleCustomerToPublicPoolTx(
    prisma as unknown as Parameters<typeof recycleCustomerToPublicPoolTx>[0],
    {
      actor,
      customerId: "cust_2",
      reason: "OWNER_LEFT_TEAM" as never,
    },
  );

  assert.notEqual(result, null);
  assert.equal(
    store.customers[0]!.publicPoolTeamId,
    "team_b",
    "应使用历史 event 兜底的 team_b",
  );
});

// ============================================================
// 3. 极端孤儿: 全 null + actor.teamId null + 历史无 teamId 事件 → throw
// ============================================================

test("SYSTEM cron sweep: 全 null 时必须 throw, 避免 team-less 公海孤儿", async () => {
  resetStore();
  store.customers.push({
    id: "cust_orphan",
    name: "孤儿客户",
    phone: "13800000999",
    ownerId: "user_phantom",
    ownershipMode: "PRIVATE",
    lastOwnerId: null,
    publicPoolEnteredAt: null,
    publicPoolReason: null,
    claimLockedUntil: null,
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: null,
    ownerTeamId: null,
    ownerName: "已硬删 owner",
    ownerUsername: "phantom",
    lastOwnerTeamId: null,
    lastOwnerName: null,
    lastOwnerUsername: null,
  });
  // 故意不插任何历史 event — 完全没历史 teamId 可用

  const actor = createSystemOwnershipActorContext(); // teamId=null

  await assert.rejects(
    () =>
      recycleCustomerToPublicPoolTx(
        prisma as unknown as Parameters<typeof recycleCustomerToPublicPoolTx>[0],
        {
          actor,
          customerId: "cust_orphan",
          reason: "INACTIVE_RECYCLE" as never,
        },
      ),
    /no team scope available/,
    "应 throw 拒绝写入孤儿状态",
  );

  // 真相检查: 客户字段未被污染
  const after = store.customers[0]!;
  assert.equal(after.ownerId, "user_phantom", "ownerId 应未变");
  assert.equal(after.publicPoolTeamId, null, "publicPoolTeamId 不应写成 null");
  // 不应留下任何 update 后副作用 (event/log 都不该有)
  assert.equal(
    store.events.length,
    0,
    "throw 前不应写 customerOwnershipEvent",
  );
  assert.equal(
    store.operationLogs.length,
    0,
    "throw 前不应写 OperationLog",
  );
});

// ============================================================
// 4. actor.teamId 兜底 — SYSTEM 携带 scopeTeam 时也能继续
// ============================================================

test("SYSTEM cron sweep with scope teamId: 全 null 时落到 actor.teamId", async () => {
  resetStore();
  store.customers.push({
    id: "cust_scope",
    name: "scope 兜底客户",
    phone: "13800000100",
    ownerId: "user_phantom_2",
    ownershipMode: "PRIVATE",
    lastOwnerId: null,
    publicPoolEnteredAt: null,
    publicPoolReason: null,
    claimLockedUntil: null,
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: null,
    ownerTeamId: null,
    ownerName: "phantom2",
    ownerUsername: "phantom2",
    lastOwnerTeamId: null,
    lastOwnerName: null,
    lastOwnerUsername: null,
  });

  const actor = createSystemOwnershipActorContext("team_scope");
  const result = await recycleCustomerToPublicPoolTx(
    prisma as unknown as Parameters<typeof recycleCustomerToPublicPoolTx>[0],
    {
      actor,
      customerId: "cust_scope",
      reason: "INACTIVE_RECYCLE" as never,
    },
  );

  assert.notEqual(result, null);
  assert.equal(
    store.customers[0]!.publicPoolTeamId,
    "team_scope",
    "应落到 actor.teamId 兜底",
  );
});
