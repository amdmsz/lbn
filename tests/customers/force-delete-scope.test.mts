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
