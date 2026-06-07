/**
 * lib/customers/ownership.ts — getOwnershipCustomerTx 行锁回归单测.
 *
 * 背景:
 *   assignCustomerToSalesTx / claimPublicPoolCustomerTx / releaseCustomerToPublicPoolTx /
 *   recycleCustomerToPublicPoolTx 共用 getOwnershipCustomerTx 读取目标客户.
 *   早期实现里这层读用的是 tx.customer.findUnique(无 InnoDB 行锁), 两个并发
 *   主管 + 销售可以同时通过 isPublicPoolCustomer / isProtectedCustomer 守卫,
 *   然后双双写入归属字段 + CustomerOwnershipEvent + OperationLog, 造成审计链
 *   出现互相矛盾的 before 快照, customer.ownerId 与归属事件链对不上.
 *
 *   修复: getOwnershipCustomerTx 在 findUnique 之前显式发起
 *   `SELECT id FROM customer WHERE id = ? FOR UPDATE`, 让第二个事务在第一个
 *   事务提交前阻塞, 提交后再读到最新 ownerId / claimLockedUntil, 守卫复算就
 *   会按事实拒绝抢占.
 *
 * 本测试不真连数据库, 跟 tests/shipping/returns-workflow.test.mts 同套
 * monkey-patch 单例 prisma 的策略. 我们关注的是:
 *   1. 进入 ownership tx 时 FOR UPDATE 必须发出, 而且必须发生在 findUnique
 *      之前 — 这是行锁能起作用的前提.
 *   2. 当上一笔归属变更已经提交 (在我们的 fake 里就是 store 已经被改写),
 *      下一笔 claim/assign 在 findUnique 时读到的是新值, 因此守卫会拒绝
 *      抢占而不是悄悄覆盖.
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
  ownershipMode: "PRIVATE" | "PUBLIC" | "LOCKED";
  lastOwnerId: string | null;
  publicPoolEnteredAt: Date | null;
  publicPoolReason: string | null;
  claimLockedUntil: Date | null;
  lastEffectiveFollowUpAt: Date | null;
  publicPoolTeamId: string | null;
  owner: { id: string; name: string; username: string; teamId: string | null } | null;
  lastOwner: { id: string; name: string; username: string; teamId: string | null } | null;
};

type ForUpdateCall = { customerId: string; atOpIndex: number };

type FakeStore = {
  customer: CustomerRow | null;
  forUpdateCalls: ForUpdateCall[];
  findUniqueCalls: number;
  ops: string[]; // 操作时序记录, 验证 FOR UPDATE 一定先于 findUnique
  ownershipEvents: Array<{ customerId: string; toOwnerId: string | null }>;
  operationLogs: Array<{ action: string; targetId: string }>;
};

let store: FakeStore;

function resetStore(): void {
  store = {
    customer: null,
    forUpdateCalls: [],
    findUniqueCalls: 0,
    ops: [],
    ownershipEvents: [],
    operationLogs: [],
  };
}

function installPrismaStub(): void {
  const fakeClient: Record<string, unknown> = {
    $transaction: async <T>(
      callback: (tx: typeof fakeClient) => Promise<T>,
    ): Promise<T> => callback(fakeClient),

    $queryRaw: async (
      stringsOrTemplate: TemplateStringsArray | string,
      ...values: unknown[]
    ) => {
      // ownership.ts 里只有一处 $queryRaw: SELECT ... FOR UPDATE
      const text =
        typeof stringsOrTemplate === "string"
          ? stringsOrTemplate
          : Array.from(stringsOrTemplate).join("?");
      assert.ok(
        /FOR\s+UPDATE/i.test(text),
        `预期 $queryRaw 是 FOR UPDATE 锁请求, 实际收到: ${text}`,
      );
      assert.ok(
        /WHERE\s+id\s*=/i.test(text),
        "FOR UPDATE 必须带 WHERE id = ? 才能只锁目标行",
      );
      const customerId = values[0] as string;
      store.forUpdateCalls.push({
        customerId,
        atOpIndex: store.ops.length,
      });
      store.ops.push("for_update:" + customerId);
      return [{ id: customerId }];
    },

    recycleBinEntry: {
      findFirst: async () => null, // 不在回收站
    },

    customer: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        store.findUniqueCalls += 1;
        store.ops.push("find_unique:" + where.id);
        if (!store.customer || store.customer.id !== where.id) return null;
        // 返回浅拷贝, 避免 service 内拿到的引用被后续 update 反向污染
        return { ...store.customer };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<CustomerRow>;
      }) => {
        if (!store.customer || store.customer.id !== where.id) {
          throw new Error("update target missing");
        }
        Object.assign(store.customer, data);
        store.ops.push("update:" + where.id);
        return { ...store.customer };
      },
    },

    customerOwnershipEvent: {
      findFirst: async () => null,
      create: async ({
        data,
      }: {
        data: { customerId: string; toOwnerId: string | null };
      }) => {
        store.ownershipEvents.push({
          customerId: data.customerId,
          toOwnerId: data.toOwnerId,
        });
        return { id: `evt_${store.ownershipEvents.length}` };
      },
    },

    operationLog: {
      create: async ({
        data,
      }: {
        data: { action: string; targetId: string };
      }) => {
        store.operationLogs.push({
          action: data.action,
          targetId: data.targetId,
        });
        return { id: `log_${store.operationLogs.length}` };
      },
    },

    teamPublicPoolSetting: {
      findUnique: async () => null, // 走默认配置 (salesCanClaim/batchAssignEnabled = true)
    },
  };

  for (const key of Object.keys(fakeClient)) {
    (prisma as unknown as Record<string, unknown>)[key] = fakeClient[key];
  }
}

installPrismaStub();

const { assignCustomerToSalesTx, claimPublicPoolCustomerTx } = await import(
  "../../lib/customers/ownership.ts"
);

// === fixtures ===

const TEAM_A = "team_a";
const SALES_A1 = {
  id: "sales_a1",
  role: "SALES" as const,
  name: "Sales A1",
  username: "sales_a1",
  teamId: TEAM_A,
};
const SALES_A2 = {
  id: "sales_a2",
  role: "SALES" as const,
  name: "Sales A2",
  username: "sales_a2",
  teamId: TEAM_A,
};
const SUPERVISOR_A = {
  id: "sup_a",
  role: "SUPERVISOR" as const,
  name: "Supervisor A",
  username: "sup_a",
  teamId: TEAM_A,
};

const TARGET_SALES_A2 = {
  id: SALES_A2.id,
  name: SALES_A2.name,
  username: SALES_A2.username,
  teamId: SALES_A2.teamId,
};
const TARGET_SALES_A1 = {
  id: SALES_A1.id,
  name: SALES_A1.name,
  username: SALES_A1.username,
  teamId: SALES_A1.teamId,
};

function seedPoolCustomer(): void {
  store.customer = {
    id: "cust_1",
    name: "公海客户 A",
    phone: "13800000000",
    ownerId: null,
    ownershipMode: "PUBLIC",
    lastOwnerId: null,
    publicPoolEnteredAt: new Date("2026-01-01T00:00:00Z"),
    publicPoolReason: "MANUAL_RELEASE",
    claimLockedUntil: null,
    lastEffectiveFollowUpAt: null,
    publicPoolTeamId: TEAM_A,
    owner: null,
    lastOwner: null,
  };
}

// ============================================================
// 1. claim 路径: 进入 tx 立刻 SELECT ... FOR UPDATE
// ============================================================

test("claimPublicPoolCustomerTx 进入 tx 后必须先发 SELECT ... FOR UPDATE 才能 findUnique", async () => {
  resetStore();
  seedPoolCustomer();

  await prisma.$transaction((tx) =>
    claimPublicPoolCustomerTx(tx, {
      actor: SALES_A1,
      customerId: "cust_1",
    }),
  );

  assert.equal(
    store.forUpdateCalls.length,
    1,
    "应有且仅有一次 FOR UPDATE",
  );
  assert.equal(store.forUpdateCalls[0]!.customerId, "cust_1");
  // FOR UPDATE 必须出现在第一次 findUnique 之前
  const firstForUpdate = store.ops.indexOf("for_update:cust_1");
  const firstFindUnique = store.ops.indexOf("find_unique:cust_1");
  assert.ok(firstForUpdate >= 0, "ops 时序应记录 for_update");
  assert.ok(firstFindUnique >= 0, "ops 时序应记录 find_unique");
  assert.ok(
    firstForUpdate < firstFindUnique,
    `FOR UPDATE 必须先于 findUnique, 实际顺序: ${store.ops.join(" | ")}`,
  );
  // claim 成功 → ownerId 变更 + event + log
  assert.equal(store.customer!.ownerId, SALES_A1.id);
  assert.equal(store.ownershipEvents.length, 1);
  assert.equal(
    store.operationLogs[0]!.action,
    "customer.public_pool.claimed",
  );
});

// ============================================================
// 2. assign 路径: 进入 tx 同样先发 FOR UPDATE
// ============================================================

test("assignCustomerToSalesTx 也走同一锁路径", async () => {
  resetStore();
  seedPoolCustomer();

  await prisma.$transaction((tx) =>
    assignCustomerToSalesTx(tx, {
      actor: SUPERVISOR_A,
      targetSales: TARGET_SALES_A2,
      customerId: "cust_1",
      reason: "SUPERVISOR_ASSIGN",
    }),
  );

  assert.equal(store.forUpdateCalls.length, 1);
  assert.equal(store.forUpdateCalls[0]!.customerId, "cust_1");
  assert.ok(
    store.ops.indexOf("for_update:cust_1") <
      store.ops.indexOf("find_unique:cust_1"),
  );
  assert.equal(store.customer!.ownerId, SALES_A2.id);
});

// ============================================================
// 3. 串行回归: 主管先 assign 给 SALES_A2, 紧跟着 SALES_A1 来 claim
//   行锁释放后 SALES_A1 的 tx 进入时, findUnique 应读到新 ownerId, 守卫拒绝
//   抢占, 不再多写一份矛盾的 OperationLog / CustomerOwnershipEvent.
// ============================================================

test("先 assign 再 claim — 第二笔在锁释放后看到新 owner, 守卫拒绝 (无矛盾审计)", async () => {
  resetStore();
  seedPoolCustomer();

  // 主管 tx 先成功
  await prisma.$transaction((tx) =>
    assignCustomerToSalesTx(tx, {
      actor: SUPERVISOR_A,
      targetSales: TARGET_SALES_A2,
      customerId: "cust_1",
      reason: "SUPERVISOR_ASSIGN",
    }),
  );
  assert.equal(store.customer!.ownerId, SALES_A2.id);
  assert.equal(store.ownershipEvents.length, 1);
  assert.equal(store.operationLogs.length, 1);

  // 销售 A1 紧接着尝试 claim 同一客户 — 此时 store.customer.ownerId 已经是
  // A2 (相当于第一个 tx 已提交, 锁已释放). claimPublicPoolCustomerTx 的
  // isPublicPoolCustomer 守卫看到 ownerId 非空 + ownershipMode = PRIVATE
  // 应拒绝.
  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        claimPublicPoolCustomerTx(tx, {
          actor: SALES_A1,
          customerId: "cust_1",
        }),
      ),
    /not in the public pool/i,
  );

  // 关键回归: 第二笔 tx 即便被拒, 也仍然先发了 FOR UPDATE — 保证下一次
  // 真实场景下 SELECT 阶段也走行锁路径; 但不应该多写 OperationLog /
  // CustomerOwnershipEvent (审计链与库表真相必须一致).
  assert.equal(
    store.forUpdateCalls.length,
    2,
    "两笔 tx 都应发起 FOR UPDATE",
  );
  assert.equal(store.ownershipEvents.length, 1, "失败的 claim 不应再写事件");
  assert.equal(store.operationLogs.length, 1, "失败的 claim 不应再写操作日志");
  assert.equal(store.customer!.ownerId, SALES_A2.id, "ownerId 仍是 A2");
});

// ============================================================
// 4. 自助回收 + 自助 claim 互相走锁路径 — 反向方向的回归
// ============================================================

test("两个销售争抢同一公海客户 — 第二个看到 ownerId 已变更后必须失败", async () => {
  resetStore();
  seedPoolCustomer();

  // SALES_A1 先 claim 成功
  await prisma.$transaction((tx) =>
    claimPublicPoolCustomerTx(tx, {
      actor: SALES_A1,
      customerId: "cust_1",
    }),
  );
  assert.equal(store.customer!.ownerId, SALES_A1.id);

  // SALES_A2 再 claim — 同一客户已经被 A1 拿走, 不再属于公海, 必须 throw
  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        claimPublicPoolCustomerTx(tx, {
          actor: SALES_A2,
          customerId: "cust_1",
        }),
      ),
    /not in the public pool/i,
  );

  // 两笔 tx 都触发了 FOR UPDATE — 行锁路径生效
  assert.equal(store.forUpdateCalls.length, 2);
  // 但只有 1 条成功的归属事件 + 操作日志
  assert.equal(store.ownershipEvents.length, 1);
  assert.equal(store.operationLogs.length, 1);
  assert.equal(store.customer!.ownerId, SALES_A1.id);

  // 留下静默引用避免 lint 报未使用 (TARGET_SALES_A1 在本测试场景里我们不直接
  // 走 assign 路径, 但保留 fixture 给后续扩展用)
  void TARGET_SALES_A1;
});
