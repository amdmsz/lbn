/**
 * lib/customers/force-delete.ts SUPERVISOR scope hardening 单测.
 *
 * 风格跟 tests/shipping/returns-workflow.test.mts 一致 — 不真连 DB. 这里只关
 * 心 assertSupervisorCanForceDeleteCustomer 这个纯函数的边界, 重点测之前
 * audit 暴露的 publicPoolTeamId 越权:
 *
 *   - 主管 A release 客户进自己团队公海 (publicPoolTeamId → A), 但 lastOwner
 *     在团队 B → 必须拒绝, 不能因为 publicPoolTeamId 就放行
 *   - SYSTEM OWNER_LEFT_TEAM 把 publicPoolTeamId 写成 null → 主管不能清, 只
 *     有 ADMIN 能清 (走 buildScopedCustomerWhere 守卫)
 *   - 私有客户必须 owner 在主管团队
 *   - 主管账号没有 teamId 时一律拒绝
 */
import assert from "node:assert/strict";
import test from "node:test";

// 必须在任何 lib/db/prisma 之前的 import 设置, prisma.ts import 时立即检查
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { assertSupervisorCanForceDeleteCustomer } = await import(
  "../../lib/customers/force-delete.ts"
);

type CustomerStub = Parameters<typeof assertSupervisorCanForceDeleteCustomer>[1];
type ActorStub = Parameters<typeof assertSupervisorCanForceDeleteCustomer>[0];

function makeActor(overrides: Partial<ActorStub> = {}): ActorStub {
  return {
    id: "user_sup_a",
    name: "Sup A",
    username: "sup_a",
    role: "SUPERVISOR",
    teamId: "team_a",
    ...overrides,
  } as ActorStub;
}

function makeCustomer(overrides: Partial<CustomerStub> = {}): CustomerStub {
  const base = {
    id: "cust_1",
    name: "客户一",
    phone: "13800000000",
    wechatId: null,
    province: null,
    city: null,
    district: null,
    address: null,
    status: "ACTIVE",
    level: "B",
    ownershipMode: "PUBLIC",
    ownerId: null,
    lastOwnerId: null,
    publicPoolTeamId: null,
    publicPoolEnteredAt: null,
    publicPoolReason: null,
    claimLockedUntil: null,
    lastEffectiveFollowUpAt: null,
    remark: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: null,
    lastOwner: null,
    publicPoolTeam: null,
  };
  return { ...base, ...overrides } as CustomerStub;
}

test("ADMIN / SALES 角色不会走 SUPERVISOR 校验, 直接放行", () => {
  // assert: 非 SUPERVISOR 早返回, 不抛
  assertSupervisorCanForceDeleteCustomer(
    makeActor({ role: "ADMIN", teamId: null }),
    makeCustomer(),
  );
  assertSupervisorCanForceDeleteCustomer(
    makeActor({ role: "SALES", teamId: "team_other" }),
    makeCustomer(),
  );
});

test("SUPERVISOR 没有 teamId → 一律拒绝, 不允许越权清理悬空公海客户", () => {
  assert.throws(
    () =>
      assertSupervisorCanForceDeleteCustomer(
        makeActor({ teamId: null }),
        makeCustomer({ publicPoolTeamId: null }),
      ),
    /未绑定团队/,
  );
});

test("私有客户 (有 ownerId): owner.teamId 必须等于 actor.teamId", () => {
  // ok: 同团队 owner
  assertSupervisorCanForceDeleteCustomer(
    makeActor({ teamId: "team_a" }),
    makeCustomer({
      ownerId: "user_sales_a",
      owner: {
        id: "user_sales_a",
        name: "Sales A",
        username: "sales_a",
        teamId: "team_a",
      } as CustomerStub["owner"],
    }),
  );

  // reject: 跨团队 owner
  assert.throws(
    () =>
      assertSupervisorCanForceDeleteCustomer(
        makeActor({ teamId: "team_a" }),
        makeCustomer({
          ownerId: "user_sales_b",
          owner: {
            id: "user_sales_b",
            name: "Sales B",
            username: "sales_b",
            teamId: "team_b",
          } as CustomerStub["owner"],
        }),
      ),
    /不在你的可管理范围/,
  );
});

test("公海客户 lastOwner 在主管团队 → 允许 (无论 publicPoolTeamId 当前归属)", () => {
  // 关键场景: lastOwner.teamId === actor.teamId, publicPoolTeamId 可能是
  // 任意值 (被 SYSTEM 回收时写成 null, 或别的主管 release 时被覆盖).
  // 既然历史归属属于这个团队, 主管就能清.
  assertSupervisorCanForceDeleteCustomer(
    makeActor({ teamId: "team_a" }),
    makeCustomer({
      ownerId: null,
      lastOwnerId: "user_sales_a",
      lastOwner: {
        id: "user_sales_a",
        name: "Sales A",
        username: "sales_a",
        teamId: "team_a",
      } as CustomerStub["lastOwner"],
      publicPoolTeamId: null,
    }),
  );

  // 即使 publicPoolTeamId 是别的团队 (主管 B 把客户拉过去过), 只要 lastOwner
  // 还属于主管 A 团队, 主管 A 也应能清. 这里是 lastOwner 真相, 不靠
  // publicPoolTeamId.
  assertSupervisorCanForceDeleteCustomer(
    makeActor({ teamId: "team_a" }),
    makeCustomer({
      ownerId: null,
      lastOwnerId: "user_sales_a",
      lastOwner: {
        id: "user_sales_a",
        name: "Sales A",
        username: "sales_a",
        teamId: "team_a",
      } as CustomerStub["lastOwner"],
      publicPoolTeamId: "team_b",
    }),
  );
});

test("攻击场景: 主管 A 把团队 B 历史归属客户 release 到自己公海后想立刻硬删 → 拒", () => {
  // 这是 audit finding 描述的核心攻击:
  //   1. 客户的 lastOwner 在团队 B
  //   2. 主管 A 调用 releaseCustomerToPublicPoolTx, publicPoolTeamId 写成
  //      团队 A (fallback 链命中 actor.teamId)
  //   3. 主管 A 立刻 force-delete
  // 修复前: buildScopedCustomerWhere 仅看 publicPoolTeamId 就放行.
  // 修复后: 这里的 assertSupervisorCanForceDeleteCustomer 看到 lastOwner.
  //         teamId === team_b !== actor.teamId, 直接拒.
  assert.throws(
    () =>
      assertSupervisorCanForceDeleteCustomer(
        makeActor({ teamId: "team_a" }),
        makeCustomer({
          ownerId: null,
          lastOwnerId: "user_sales_b",
          lastOwner: {
            id: "user_sales_b",
            name: "Sales B",
            username: "sales_b",
            teamId: "team_b",
          } as CustomerStub["lastOwner"],
          publicPoolTeamId: "team_a",
        }),
      ),
    /历史归属不在你的团队范围/,
  );
});

test("从未被 owner 持有过的公海客户: publicPoolTeamId 严格等于主管团队才放行", () => {
  // 没有 lastOwner, publicPoolTeamId 是唯一锚, 严格匹配才放行
  assertSupervisorCanForceDeleteCustomer(
    makeActor({ teamId: "team_a" }),
    makeCustomer({
      ownerId: null,
      lastOwnerId: null,
      lastOwner: null,
      publicPoolTeamId: "team_a",
    }),
  );

  // 不匹配 → 拒
  assert.throws(
    () =>
      assertSupervisorCanForceDeleteCustomer(
        makeActor({ teamId: "team_a" }),
        makeCustomer({
          ownerId: null,
          lastOwnerId: null,
          lastOwner: null,
          publicPoolTeamId: "team_b",
        }),
      ),
    /历史归属不在你的团队范围/,
  );
});

test("攻击场景: SYSTEM OWNER_LEFT_TEAM 把 publicPoolTeamId 写成 null → 主管不能清", () => {
  // SYSTEM actor.teamId 默认 null, fallback 链命中后 publicPoolTeamId 被写
  // 成 null. 没有 lastOwner / publicPoolTeamId 锚, 主管不能强删 — 只能让
  // ADMIN 清.
  assert.throws(
    () =>
      assertSupervisorCanForceDeleteCustomer(
        makeActor({ teamId: "team_a" }),
        makeCustomer({
          ownerId: null,
          lastOwnerId: null,
          lastOwner: null,
          publicPoolTeamId: null,
        }),
      ),
    /历史归属不在你的团队范围/,
  );
});

/* ============================================================================
 * purgeAttachedLeads 行为单测.
 *
 * 跟 force-delete-detach-audit.test.mts 风格一致 — 不真连 DB, monkey-patch
 * prisma 单例把 executeForceDeleteCleanupTx 的 Lead 链路压成 in-memory 模拟.
 * 只关心 purgeAttachedLeads 分支:
 *
 *   - true  → Lead 行实际不存在 (purgedLeadCount > 0, leads 表空), 同时
 *     LeadAssignment / LeadTag / LeadCustomerMergeLog 也按 FK 顺序级联删
 *   - false → Lead 行仍存在但 customerId/ownerId 置 null (detach 兼容模式)
 * ========================================================================== */

const { prisma } = await import("../../lib/db/prisma.ts");
const { forceHardDeleteCustomer } = await import(
  "../../lib/customers/force-delete.ts"
);

type LeadRow = {
  id: string;
  customerId: string | null;
  ownerId: string | null;
  status: string;
  phone: string;
};

type LeadAssignmentRow = {
  id: string;
  leadId: string;
  toUserId: string;
  fromUserId: string | null;
};

type LeadTagRow = { id: string; leadId: string; tagId: string };

type LeadMergeLogRow = {
  id: string;
  leadId: string | null;
  customerId: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  ownerId: string | null;
  ownerTeamId: string | null;
};

type UserRow = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
  roleCode: string;
};

type OperationLogRow = {
  module: string;
  action: string;
  actorId: string;
  targetType: string;
  targetId: string;
  description: string;
  beforeData?: unknown;
  afterData?: unknown;
};

type FakeStore = {
  customers: CustomerRow[];
  leads: LeadRow[];
  leadAssignments: LeadAssignmentRow[];
  leadTags: LeadTagRow[];
  leadMergeLogs: LeadMergeLogRow[];
  followUpTasks: { id: string; leadId: string | null; customerId: string | null }[];
  callRecords: { id: string; leadId: string | null; customerId: string | null }[];
  wechatRecords: { id: string; leadId: string | null; customerId: string | null }[];
  liveInvitations: { id: string; leadId: string | null; customerId: string | null }[];
  orders: { id: string; leadId: string | null; customerId: string | null }[];
  giftRecords: { id: string; leadId: string | null; customerId: string | null }[];
  historyArchives: { id: string; targetCustomerId: string | null; sourceCustomerId: string; sourceBatchId: string | null }[];
  users: UserRow[];
  operationLogs: OperationLogRow[];
};

let purgeStore: FakeStore;

function resetPurgeStore(): void {
  purgeStore = {
    customers: [],
    leads: [],
    leadAssignments: [],
    leadTags: [],
    leadMergeLogs: [],
    followUpTasks: [],
    callRecords: [],
    wechatRecords: [],
    liveInvitations: [],
    orders: [],
    giftRecords: [],
    historyArchives: [],
    users: [],
    operationLogs: [],
  };
}

function installPurgePrismaStub(): void {
  const matchIn = (
    actual: string | null,
    spec: { in?: string[] } | undefined,
  ): boolean => (spec?.in ? actual !== null && spec.in.includes(actual) : true);

  const fakeClient: Record<string, unknown> = {
    $transaction: async <T,>(
      callback: (tx: typeof fakeClient) => Promise<T>,
    ): Promise<T> => callback(fakeClient),

    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = purgeStore.users.find((x) => x.id === where.id);
        if (!u) return null;
        return {
          id: u.id,
          name: u.name,
          username: u.username,
          teamId: u.teamId,
          role: { code: u.roleCode },
        };
      },
    },

    customer: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const id = where.id as string | undefined;
        return (
          purgeStore.customers
            .filter((c) => (id ? c.id === id : true))
            .map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
              wechatId: null,
              province: null,
              city: null,
              district: null,
              address: null,
              status: "ACTIVE",
              level: "NEW",
              ownershipMode: "PRIVATE",
              ownerId: c.ownerId,
              lastOwnerId: null,
              publicPoolTeamId: null,
              publicPoolEnteredAt: null,
              publicPoolReason: null,
              claimLockedUntil: null,
              lastEffectiveFollowUpAt: null,
              remark: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              owner: c.ownerId
                ? {
                    id: c.ownerId,
                    name: "owner",
                    username: "owner",
                    teamId: c.ownerTeamId,
                  }
                : null,
              lastOwner: null,
              publicPoolTeam: null,
            }))[0] ?? null
        );
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = purgeStore.customers.findIndex((c) => c.id === where.id);
        if (idx >= 0) purgeStore.customers.splice(idx, 1);
        return { id: where.id };
      },
    },

    lead: {
      findMany: async ({
        where,
      }: {
        where: { customerId?: string | null };
      }) => {
        return purgeStore.leads.filter((l) => l.customerId === where.customerId);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { customerId?: string | null };
        data: { customerId: null; ownerId?: null };
      }) => {
        const matched = purgeStore.leads.filter(
          (l) => l.customerId === where.customerId,
        );
        for (const l of matched) {
          l.customerId = null;
          if ("ownerId" in data) l.ownerId = null;
        }
        return { count: matched.length };
      },
      deleteMany: async ({ where }: { where: { id?: { in?: string[] } } }) => {
        const ids = where.id?.in ?? [];
        const before = purgeStore.leads.length;
        purgeStore.leads = purgeStore.leads.filter((l) => !ids.includes(l.id));
        return { count: before - purgeStore.leads.length };
      },
    },

    leadAssignment: {
      findMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        return purgeStore.leadAssignments.filter((a) =>
          matchIn(a.leadId, where.leadId),
        );
      },
      deleteMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const before = purgeStore.leadAssignments.length;
        purgeStore.leadAssignments = purgeStore.leadAssignments.filter(
          (a) => !matchIn(a.leadId, where.leadId),
        );
        return { count: before - purgeStore.leadAssignments.length };
      },
    },

    leadTag: {
      deleteMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const before = purgeStore.leadTags.length;
        purgeStore.leadTags = purgeStore.leadTags.filter(
          (t) => !matchIn(t.leadId, where.leadId),
        );
        return { count: before - purgeStore.leadTags.length };
      },
    },

    leadCustomerMergeLog: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { customerId?: string };
        data: { customerId: null };
      }) => {
        const matched = purgeStore.leadMergeLogs.filter(
          (m) => m.customerId === where.customerId,
        );
        for (const m of matched) m.customerId = data.customerId;
        return { count: matched.length };
      },
      deleteMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const before = purgeStore.leadMergeLogs.length;
        purgeStore.leadMergeLogs = purgeStore.leadMergeLogs.filter(
          (m) => !matchIn(m.leadId, where.leadId),
        );
        return { count: before - purgeStore.leadMergeLogs.length };
      },
    },

    customerHistoryArchive: {
      findMany: async ({
        where,
      }: {
        where: { targetCustomerId?: string };
      }) => {
        return purgeStore.historyArchives.filter(
          (h) => h.targetCustomerId === where.targetCustomerId,
        );
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { targetCustomerId?: string };
        data: { targetCustomerId: null };
      }) => {
        const matched = purgeStore.historyArchives.filter(
          (h) => h.targetCustomerId === where.targetCustomerId,
        );
        for (const h of matched) h.targetCustomerId = data.targetCustomerId;
        return { count: matched.length };
      },
    },

    followUpTask: {
      updateMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const matched = purgeStore.followUpTasks.filter((r) =>
          matchIn(r.leadId, where.leadId),
        );
        for (const r of matched) r.leadId = null;
        return { count: matched.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    callRecord: {
      findMany: async () => [],
      updateMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const matched = purgeStore.callRecords.filter((r) =>
          matchIn(r.leadId, where.leadId),
        );
        for (const r of matched) r.leadId = null;
        return { count: matched.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    wechatRecord: {
      updateMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const matched = purgeStore.wechatRecords.filter((r) =>
          matchIn(r.leadId, where.leadId),
        );
        for (const r of matched) r.leadId = null;
        return { count: matched.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    liveInvitation: {
      findMany: async () => [],
      updateMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const matched = purgeStore.liveInvitations.filter((r) =>
          matchIn(r.leadId, where.leadId),
        );
        for (const r of matched) r.leadId = null;
        return { count: matched.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    order: {
      findMany: async () => [],
      updateMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const matched = purgeStore.orders.filter((r) =>
          matchIn(r.leadId, where.leadId),
        );
        for (const r of matched) r.leadId = null;
        return { count: matched.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    giftRecord: {
      findMany: async () => [],
      updateMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        const matched = purgeStore.giftRecords.filter((r) =>
          matchIn(r.leadId, where.leadId),
        );
        for (const r of matched) r.leadId = null;
        return { count: matched.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },

    recycleBinEntry: {
      updateMany: async () => ({ count: 0 }),
    },

    importedCustomerDeletionRequest: {
      updateMany: async () => ({ count: 0 }),
    },

    operationLog: {
      create: async ({ data }: { data: OperationLogRow }) => {
        purgeStore.operationLogs.push(data);
        return { id: `op_${purgeStore.operationLogs.length}` };
      },
      createMany: async ({ data }: { data: OperationLogRow[] }) => {
        for (const row of data) purgeStore.operationLogs.push(row);
        return { count: data.length };
      },
    },

    // collectForceDeleteDependenciesTx 全空
    tradeOrder: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    salesOrder: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    shippingTask: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    paymentPlan: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    paymentRecord: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    collectionTask: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    logisticsFollowUpTask: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    codCollectionRecord: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    tradeOrderItem: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    tradeOrderItemComponent: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    callRecording: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    outboundCallSession: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    liveAudienceRecord: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    shippingExportLine: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    tradeOrderRevisionRequest: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    callActionEvent: { deleteMany: async () => ({ count: 0 }) },
    callAiAnalysis: { deleteMany: async () => ({ count: 0 }) },
    callQualityReview: { deleteMany: async () => ({ count: 0 }) },
    callRecordingUpload: { deleteMany: async () => ({ count: 0 }) },
    salesOrderGiftItem: { deleteMany: async () => ({ count: 0 }) },
    salesOrderItem: { deleteMany: async () => ({ count: 0 }) },
    customerTag: { deleteMany: async () => ({ count: 0 }) },
    customerOwnershipEvent: { deleteMany: async () => ({ count: 0 }) },
  };

  Object.assign(prisma as unknown as Record<string, unknown>, fakeClient);
}

installPurgePrismaStub();

function seedPurgeHappyPath() {
  purgeStore.users.push({
    id: "u-admin-purge",
    name: "Admin",
    username: "admin",
    teamId: "team-purge",
    roleCode: "ADMIN",
  });
  purgeStore.customers.push({
    id: "cust-purge-1",
    name: "客户甲",
    phone: "13800138001",
    ownerId: "u-sales-purge",
    ownerTeamId: "team-purge",
  });
  purgeStore.leads.push(
    {
      id: "lead-p-1",
      customerId: "cust-purge-1",
      ownerId: "u-sales-purge",
      status: "FOLLOWING",
      phone: "13800138001",
    },
    {
      id: "lead-p-2",
      customerId: "cust-purge-1",
      ownerId: "u-sales-purge",
      status: "WECHAT_ADDED",
      phone: "13800138001",
    },
  );
  purgeStore.leadAssignments.push(
    { id: "la-p-1", leadId: "lead-p-1", toUserId: "u-sales-purge", fromUserId: null },
    { id: "la-p-2", leadId: "lead-p-2", toUserId: "u-sales-purge", fromUserId: null },
  );
  purgeStore.leadTags.push(
    { id: "lt-p-1", leadId: "lead-p-1", tagId: "tag-1" },
    { id: "lt-p-2", leadId: "lead-p-2", tagId: "tag-2" },
  );
  purgeStore.leadMergeLogs.push(
    { id: "ml-p-1", leadId: "lead-p-1", customerId: "cust-purge-1" },
    { id: "ml-p-2", leadId: "lead-p-2", customerId: "cust-purge-1" },
  );
  purgeStore.historyArchives.push({
    id: "ha-p-1",
    sourceCustomerId: "cust-purge-1",
    targetCustomerId: "cust-purge-1",
    sourceBatchId: "batch-p-1",
  });
}

test("purgeAttachedLeads=true → Lead 行实际不存在 + LeadAssignment/LeadTag/MergeLog 级联删", async () => {
  resetPurgeStore();
  seedPurgeHappyPath();

  const result = await forceHardDeleteCustomer(
    { id: "u-admin-purge", role: "ADMIN" as const },
    {
      customerId: "cust-purge-1",
      confirmation: "永久删除",
      confirmationMode: "batch_phrase",
      reason: "重新导入此 phone 测试",
      purgeAttachedLeads: true,
    },
  );

  // Lead 表已空
  assert.equal(purgeStore.leads.length, 0, "purge=true 后 leads 表应该为空");
  // LeadAssignment 已物理删
  assert.equal(
    purgeStore.leadAssignments.length,
    0,
    "purge=true 后 LeadAssignment 也按 FK 顺序级联删除",
  );
  // LeadTag 已物理删
  assert.equal(
    purgeStore.leadTags.length,
    0,
    "purge=true 后 LeadTag 必须先删 (leadId NOT NULL)",
  );
  // LeadCustomerMergeLog 已物理删
  assert.equal(
    purgeStore.leadMergeLogs.length,
    0,
    "purge=true 后 LeadCustomerMergeLog 也物理删 (替代 SetNull)",
  );

  // 返回值带 purgedLeadCount
  assert.equal(result.purgedLeadCount, 2, "purgedLeadCount 应该等于实际清理的 Lead 行数");
  assert.equal(
    result.deletedCounts.purgedLeads,
    2,
    "deletedCounts.purgedLeads 也写入了实际清理数",
  );

  // OperationLog 使用新 action 名
  const purgeLogs = purgeStore.operationLogs.filter(
    (log) => log.action === "lead.purged_by_force_delete",
  );
  assert.equal(
    purgeLogs.length,
    2,
    "每条被 purge 的 lead 必须落 lead.purged_by_force_delete 审计日志",
  );
  // 旧 detach action 不应再生成
  const detachLogs = purgeStore.operationLogs.filter(
    (log) => log.action === "lead.customer_detached_by_force_delete",
  );
  assert.equal(detachLogs.length, 0, "purge 路径不再写 detach 审计");
});

test("purgeAttachedLeads=false (默认) → Lead 行仍存在但 customerId/ownerId 置 null", async () => {
  resetPurgeStore();
  seedPurgeHappyPath();

  const result = await forceHardDeleteCustomer(
    { id: "u-admin-purge", role: "ADMIN" as const },
    {
      customerId: "cust-purge-1",
      confirmation: "永久删除",
      confirmationMode: "batch_phrase",
      reason: "兼容 detach 路径",
      // purgeAttachedLeads 未传, 应该走默认 detach 路径
    },
  );

  // Lead 行还在表里 (detach 模式)
  assert.equal(purgeStore.leads.length, 2, "detach 路径下 leads 行不应消失");
  for (const lead of purgeStore.leads) {
    assert.equal(lead.customerId, null, `lead ${lead.id} customerId 应被置空`);
    assert.equal(lead.ownerId, null, `lead ${lead.id} ownerId 应被置空`);
  }

  // LeadAssignment 仍在 (detach 路径不删)
  assert.equal(
    purgeStore.leadAssignments.length,
    2,
    "detach 路径下 LeadAssignment 保留作为历史审计",
  );
  // LeadTag 仍在
  assert.equal(purgeStore.leadTags.length, 2, "detach 路径下 LeadTag 不动");

  // purgedLeadCount = 0
  assert.equal(result.purgedLeadCount, 0, "detach 路径下 purgedLeadCount 必须是 0");

  // OperationLog 使用旧 detach action
  const detachLogs = purgeStore.operationLogs.filter(
    (log) => log.action === "lead.customer_detached_by_force_delete",
  );
  assert.equal(detachLogs.length, 2, "detach 路径下保留原 action 名");
  const purgeLogs = purgeStore.operationLogs.filter(
    (log) => log.action === "lead.purged_by_force_delete",
  );
  assert.equal(purgeLogs.length, 0, "detach 路径下不写 purge 审计");
});
