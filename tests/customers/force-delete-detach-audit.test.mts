/**
 * lib/customers/force-delete.ts detach 审计单测.
 *
 * 跟 tests/shipping/returns-workflow.test.mts 风格一致: 不真连 DB,
 * 通过 monkey-patch prisma 单例把 executeForceDeleteCleanupTx 的 detach 链路
 * 压成 in-memory 模拟. 关注的是 audit 写入完整性, 不是 Prisma 行为.
 *
 * 覆盖问题 (finding lib/customers/force-delete.ts:587, audit_gap, high):
 *   1) Lead.ownerId 必须被清零, 避免 SALES /leads 视图继续看到孤儿 lead.
 *   2) 每条被 detach 的 lead 必须落 OperationLog
 *      action="lead.customer_detached_by_force_delete" (LEAD module/target).
 *   3) 每条被 detach 的 LeadAssignment 必须落 OperationLog
 *      action="lead_assignment.customer_detached_by_force_delete"
 *      (LEAD module, LEAD_ASSIGNMENT target).
 *   4) 每条 detach 的 CustomerHistoryArchive 必须落 OperationLog
 *      action="customer_history_archive.source_customer_hard_deleted"
 *      并在 afterData 写明 sourceCustomerHardDeletedAt.
 */
import assert from "node:assert/strict";
import test from "node:test";

// DB URL 必须在任何 lib/db/prisma 之前的 import 设置
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

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

type LeadMergeLogRow = {
  id: string;
  customerId: string | null;
};

type CustomerHistoryArchiveRow = {
  id: string;
  sourceCustomerId: string;
  targetCustomerId: string | null;
  sourceBatchId: string | null;
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
  leadMergeLogs: LeadMergeLogRow[];
  historyArchives: CustomerHistoryArchiveRow[];
  users: UserRow[];
  operationLogs: OperationLogRow[];
};

let store: FakeStore;

function resetStore(): void {
  store = {
    customers: [],
    leads: [],
    leadAssignments: [],
    leadMergeLogs: [],
    historyArchives: [],
    users: [],
    operationLogs: [],
  };
}

function installPrismaStub(): void {
  // 工具: where.in 数组匹配
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
        const u = store.users.find((x) => x.id === where.id);
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
          store.customers
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
        const idx = store.customers.findIndex((c) => c.id === where.id);
        if (idx >= 0) store.customers.splice(idx, 1);
        return { id: where.id };
      },
    },

    // === detach 路径 ===
    lead: {
      findMany: async ({
        where,
      }: {
        where: { customerId?: string | null };
      }) => {
        return store.leads.filter((l) => l.customerId === where.customerId);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { customerId?: string | null };
        data: { customerId: null; ownerId?: null };
      }) => {
        const matched = store.leads.filter(
          (l) => l.customerId === where.customerId,
        );
        for (const l of matched) {
          l.customerId = null;
          if ("ownerId" in data) l.ownerId = null;
        }
        return { count: matched.length };
      },
    },

    leadAssignment: {
      findMany: async ({
        where,
      }: {
        where: { leadId?: { in?: string[] } };
      }) => {
        return store.leadAssignments.filter((a) =>
          matchIn(a.leadId, where.leadId),
        );
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
        const matched = store.leadMergeLogs.filter(
          (m) => m.customerId === where.customerId,
        );
        for (const m of matched) m.customerId = data.customerId;
        return { count: matched.length };
      },
    },

    customerHistoryArchive: {
      findMany: async ({
        where,
      }: {
        where: { targetCustomerId?: string };
      }) => {
        return store.historyArchives.filter(
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
        const matched = store.historyArchives.filter(
          (h) => h.targetCustomerId === where.targetCustomerId,
        );
        for (const h of matched) h.targetCustomerId = data.targetCustomerId;
        return { count: matched.length };
      },
    },

    recycleBinEntry: {
      updateMany: async () => ({ count: 0 }),
    },

    importedCustomerDeletionRequest: {
      updateMany: async () => ({ count: 0 }),
    },

    operationLog: {
      create: async ({ data }: { data: OperationLogRow }) => {
        store.operationLogs.push(data);
        return { id: `op_${store.operationLogs.length}` };
      },
      createMany: async ({ data }: { data: OperationLogRow[] }) => {
        for (const row of data) store.operationLogs.push(row);
        return { count: data.length };
      },
    },

    // === collectForceDeleteDependenciesTx — 全空 ===
    tradeOrder: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    salesOrder: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    order: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    giftRecord: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    shippingTask: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    paymentPlan: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    paymentRecord: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    collectionTask: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    logisticsFollowUpTask: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    codCollectionRecord: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    callRecord: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    liveInvitation: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    tradeOrderItem: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    tradeOrderItemComponent: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    callRecording: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    outboundCallSession: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    liveAudienceRecord: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    shippingExportLine: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    tradeOrderRevisionRequest: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    callActionEvent: { deleteMany: async () => ({ count: 0 }) },
    callAiAnalysis: { deleteMany: async () => ({ count: 0 }) },
    callQualityReview: { deleteMany: async () => ({ count: 0 }) },
    callRecordingUpload: { deleteMany: async () => ({ count: 0 }) },
    salesOrderGiftItem: { deleteMany: async () => ({ count: 0 }) },
    salesOrderItem: { deleteMany: async () => ({ count: 0 }) },
    followUpTask: { deleteMany: async () => ({ count: 0 }) },
    wechatRecord: { deleteMany: async () => ({ count: 0 }) },
    customerTag: { deleteMany: async () => ({ count: 0 }) },
    customerOwnershipEvent: { deleteMany: async () => ({ count: 0 }) },
  };

  Object.assign(prisma as unknown as Record<string, unknown>, fakeClient);
}

installPrismaStub();

function seedHappyPath() {
  store.users.push({
    id: "u-admin",
    name: "Admin",
    username: "admin",
    teamId: "team-1",
    roleCode: "ADMIN",
  });
  store.customers.push({
    id: "cust-1",
    name: "客户甲",
    phone: "13800138000",
    ownerId: "u-sales-1",
    ownerTeamId: "team-1",
  });
  store.leads.push(
    {
      id: "lead-1",
      customerId: "cust-1",
      ownerId: "u-sales-1",
      status: "FOLLOWING",
      phone: "13800138000",
    },
    {
      id: "lead-2",
      customerId: "cust-1",
      ownerId: "u-sales-2",
      status: "WECHAT_ADDED",
      phone: "13800138000",
    },
  );
  store.leadAssignments.push(
    {
      id: "la-1",
      leadId: "lead-1",
      toUserId: "u-sales-1",
      fromUserId: null,
    },
    {
      id: "la-2",
      leadId: "lead-2",
      toUserId: "u-sales-2",
      fromUserId: "u-sales-1",
    },
  );
  store.leadMergeLogs.push({ id: "ml-1", customerId: "cust-1" });
  store.historyArchives.push({
    id: "ha-1",
    sourceCustomerId: "cust-1",
    targetCustomerId: "cust-1",
    sourceBatchId: "batch-1",
  });
}

test("强删客户: detach 的 Lead 必须清 ownerId 并落 OperationLog", async () => {
  resetStore();
  seedHappyPath();

  await forceHardDeleteCustomer(
    { id: "u-admin", role: "ADMIN" as const },
    {
      customerId: "cust-1",
      confirmation: "永久删除",
      confirmationMode: "batch_phrase",
      reason: "压测/测试",
    },
  );

  // (1) Lead.ownerId 全清零
  for (const l of store.leads.filter((row) => row.id.startsWith("lead-"))) {
    assert.equal(l.ownerId, null, `lead ${l.id} ownerId should be null`);
    assert.equal(l.customerId, null, `lead ${l.id} customerId should be null`);
  }

  // (2) 每条 lead 一条 OperationLog
  const leadLogs = store.operationLogs.filter(
    (log) => log.action === "lead.customer_detached_by_force_delete",
  );
  assert.equal(leadLogs.length, 2, "每条被 detach 的 lead 必须落 OperationLog");
  for (const log of leadLogs) {
    assert.equal(log.module, "LEAD");
    assert.equal(log.targetType, "LEAD");
    assert.equal(log.actorId, "u-admin");
    const after = log.afterData as Record<string, unknown>;
    assert.equal(after.customerId, null);
    assert.equal(after.ownerId, null);
    assert.equal(after.reason, "压测/测试");
  }
  assert.deepEqual(
    new Set(leadLogs.map((l) => l.targetId)),
    new Set(["lead-1", "lead-2"]),
  );
});

test("强删客户: LeadAssignment 必须各落一条 detach OperationLog", async () => {
  resetStore();
  seedHappyPath();

  await forceHardDeleteCustomer(
    { id: "u-admin", role: "ADMIN" as const },
    {
      customerId: "cust-1",
      confirmation: "永久删除",
      confirmationMode: "batch_phrase",
      reason: "审计回放",
    },
  );

  const laLogs = store.operationLogs.filter(
    (log) => log.action === "lead_assignment.customer_detached_by_force_delete",
  );
  assert.equal(laLogs.length, 2, "每条 LeadAssignment 必须有 OperationLog");
  for (const log of laLogs) {
    assert.equal(log.module, "LEAD");
    assert.equal(log.targetType, "LEAD_ASSIGNMENT");
  }
  assert.deepEqual(
    new Set(laLogs.map((l) => l.targetId)),
    new Set(["la-1", "la-2"]),
  );
});

test("强删客户: CustomerHistoryArchive 悬挂时必须落 sourceCustomerHardDeletedAt 审计", async () => {
  resetStore();
  seedHappyPath();

  await forceHardDeleteCustomer(
    { id: "u-admin", role: "ADMIN" as const },
    {
      customerId: "cust-1",
      confirmation: "永久删除",
      confirmationMode: "batch_phrase",
      reason: "归档审计",
    },
  );

  // targetCustomerId 已被置 null
  const ha = store.historyArchives.find((h) => h.id === "ha-1");
  assert.ok(ha, "history archive must still exist");
  assert.equal(ha!.targetCustomerId, null);
  assert.equal(
    ha!.sourceCustomerId,
    "cust-1",
    "sourceCustomerId 不变, 由 OperationLog 标记 hard deleted",
  );

  const haLog = store.operationLogs.find(
    (log) =>
      log.action === "customer_history_archive.source_customer_hard_deleted",
  );
  assert.ok(haLog, "missing CustomerHistoryArchive detach audit log");
  assert.equal(haLog!.module, "CUSTOMER");
  assert.equal(haLog!.targetType, "CUSTOMER");
  assert.equal(haLog!.targetId, "cust-1");
  const after = haLog!.afterData as Record<string, unknown>;
  assert.equal(after.archiveId, "ha-1");
  assert.equal(after.targetCustomerId, null);
  assert.equal(typeof after.sourceCustomerHardDeletedAt, "string");
});

test("强删客户: 没有 lead/历史关联时也不应抛错且不写多余审计", async () => {
  resetStore();
  store.users.push({
    id: "u-admin",
    name: "Admin",
    username: "admin",
    teamId: "team-1",
    roleCode: "ADMIN",
  });
  store.customers.push({
    id: "cust-empty",
    name: "客户乙",
    phone: "13900000000",
    ownerId: null,
    ownerTeamId: null,
  });

  await forceHardDeleteCustomer(
    { id: "u-admin", role: "ADMIN" as const },
    {
      customerId: "cust-empty",
      confirmation: "永久删除",
      confirmationMode: "batch_phrase",
      reason: "无关联客户清理",
    },
  );

  const detachLogs = store.operationLogs.filter(
    (log) =>
      log.action === "lead.customer_detached_by_force_delete" ||
      log.action === "lead_assignment.customer_detached_by_force_delete" ||
      log.action ===
        "customer_history_archive.source_customer_hard_deleted",
  );
  assert.equal(
    detachLogs.length,
    0,
    "无任何关联时不应生成 detach 审计 OperationLog",
  );
});
