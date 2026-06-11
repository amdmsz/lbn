/**
 * buildCustomerCenterListFilterClauses 单测.
 *
 * Wave 9 hotfix (2026-06-09) 引入: 把 page-mode 的高级 filter SQL clauses 抽到
 * 共享 helper, cursor 模式也复用. 不依赖 DB, 纯结构断言.
 *
 * 这条单测重点验证 finding 描述的真实问题: 当 URL 同时带 cursor 和 advanced
 * filter (tagIds / productKeys / executionClasses / assignedRange / queue) 时,
 * cursor 模式以前 silently drop 这些 filter, 现在 helper 必须把它们翻译成 SQL
 * where clauses 返回, 让 cursor 翻页和 page 翻页表现一致.
 *
 * 跑法:
 *   node --test --import tsx tests/customers/cursor-advanced-filter.test.mts
 */
import assert from "node:assert/strict";
import test from "node:test";

// 必须在任何 lib/db/prisma 之前的 import 设置, prisma.ts import 时立即检查
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { buildCustomerCenterListFilterClauses } = await import(
  "../../lib/customers/queries.ts"
);

type Filters = Parameters<typeof buildCustomerCenterListFilterClauses>[0]["filters"];

function makeFilters(overrides: Partial<Filters> = {}): Filters {
  return {
    queue: "all",
    executionClasses: [],
    grades: [],
    teamId: "",
    salesId: "",
    search: "",
    productKeys: [],
    productKeyword: "",
    tagIds: [],
    assignedFrom: "",
    assignedTo: "",
    page: 1,
    pageSize: 50,
    ...overrides,
  } as Filters;
}

const todayStart = new Date("2026-06-09T00:00:00.000Z");
const todayEnd = new Date("2026-06-09T23:59:59.999Z");

test("空 filters → 返回空 clauses 数组", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters(),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 0);
});

test("tagIds 过滤 → 推到 customerTags.some.tagId in", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ tagIds: ["tag_a", "tag_b"] }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
  assert.deepEqual(clauses[0], {
    customerTags: { some: { tagId: { in: ["tag_a", "tag_b"] } } },
  });
});

test("productKeys 带 `${source}:${label}` 前缀 → 拆出 label 后 OR 匹配 leads / salesOrders", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({
      productKeys: ["interested:茅台", "purchased:五粮液"],
    }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
  assert.deepEqual(clauses[0], {
    OR: [
      { leads: { some: { interestedProduct: { in: ["茅台", "五粮液"] } } } },
      {
        salesOrders: {
          some: {
            items: { some: { productNameSnapshot: { in: ["茅台", "五粮液"] } } },
          },
        },
      },
    ],
  });
});

test("productKeyword 模糊匹配 → contains 在 leads / salesOrders 两表 OR", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ productKeyword: "茅台" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
  assert.deepEqual(clauses[0], {
    OR: [
      { leads: { some: { interestedProduct: { contains: "茅台" } } } },
      {
        salesOrders: {
          some: {
            items: { some: { productNameSnapshot: { contains: "茅台" } } },
          },
        },
      },
    ],
  });
});

test("assignedFrom + assignedTo → OwnershipEvent / LeadAssignment 时间窗口 (不再用 createdAt)", () => {
  // 2026-06-10 修复: 分配时间真相 = CustomerOwnershipEvent (PRIVATE 承接) /
  // LeadAssignment 的 createdAt, 不是 customer.createdAt — 老客户今天重分配时
  // createdAt 是旧的, 用 createdAt 会漏掉. clause 应是 OR(ownershipEvents.some,
  // leads.assignments.some) 而非 { createdAt: range }.
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({
      assignedFrom: "2026-06-01",
      assignedTo: "2026-06-09",
    }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
  const clause = clauses[0] as {
    OR?: Array<Record<string, unknown>>;
    createdAt?: unknown;
  };
  // 不应再是顶层 customer.createdAt 过滤
  assert.equal(clause.createdAt, undefined, "分配时间不应再用 customer.createdAt");
  assert.ok(Array.isArray(clause.OR), "应为 OR(ownershipEvents, leadAssignments)");
  const hasOwnershipEvent = clause.OR!.some(
    (c) => typeof c === "object" && c !== null && "ownershipEvents" in c,
  );
  const hasLeadAssignment = clause.OR!.some(
    (c) => typeof c === "object" && c !== null && "leads" in c,
  );
  assert.ok(hasOwnershipEvent, "OR 内应有 ownershipEvents.some 子句");
  assert.ok(hasLeadAssignment, "OR 内应有 leads.assignments.some 子句");
});

test("executionClasses A → tradeOrders / salesOrders APPROVED OR", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ executionClasses: ["A"] }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
  const clause = clauses[0] as { OR: unknown[] };
  // A 是单个 class, executionClasses OR 包装应该只有 1 条子句
  assert.equal(clause.OR.length, 1);
});

test("queue=new_imported → leads.some(createdAt today) 推到 SQL", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "new_imported" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
  assert.deepEqual(clauses[0], {
    leads: {
      some: {
        rolledBackAt: null,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    },
  });
});

test("多种 filter 叠加 → 每条都各自 push 一条 clause", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({
      tagIds: ["tag_a"],
      productKeyword: "茅台",
      executionClasses: ["A"],
      assignedFrom: "2026-06-01",
    }),
    todayStart,
    todayEnd,
  });
  // tagIds + productKeyword + executionClasses + assignedRange = 4 条 clauses
  assert.equal(clauses.length, 4);
});

test("regression — cursor 模式必须看到 tagIds 这条 clause (避免回退到只过滤 grade)", () => {
  // 模拟 finding 描述的真实场景: ?cursor=xxx&tagIds=abc&grades=A&executionClasses=B
  // 过去 cursor 路径只 push grades, 现在 helper 必须把 tagIds + executionClasses
  // 都翻译出来.
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({
      tagIds: ["abc"],
      grades: ["A"],
      executionClasses: ["B"],
    }),
    todayStart,
    todayEnd,
  });
  // grades + tagIds + executionClasses = 3 条
  assert.equal(clauses.length, 3);

  // 必须能找到 tagIds clause
  const hasTagClause = clauses.some(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      "customerTags" in c &&
      typeof (c as Record<string, unknown>).customerTags === "object",
  );
  assert.ok(hasTagClause, "tagIds clause 必须出现在 cursor / page 共享路径里");

  // 必须能找到 executionClasses clause (OR 包 B 单条)
  const hasExecClause = clauses.some(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      "OR" in c &&
      Array.isArray((c as Record<string, unknown>).OR),
  );
  assert.ok(hasExecClause, "executionClasses clause 必须出现");
});

// ----------------------------------------------------------------------------
// W12 (2026-06-10): queue 派生过滤推到 SQL where.
//
// 修复前: 只有 queue=new_imported 真正过滤, 其余 queue 仅 console.warn 后放行,
// 导致 "侧栏待跟进 1234 / 列表展示全量 5826" 的回归. 现在所有可翻译 queue 都
// 经 buildQueueCustomerWhereInput 进 listFilterClauses, 与 sidebar aggregate
// 同源.
// ----------------------------------------------------------------------------

test("queue=pending_first_call → 推一条 SQL clause (不再静默放行)", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "pending_first_call" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1, "pending_first_call 必须缩窄列表, 不能放行全量");
});

test("queue=pending_follow_up → 推一条 SQL clause", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "pending_follow_up" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
});

test("queue=pending_wechat → 推一条 SQL clause", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "pending_wechat" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
});

test("queue=pending_invitation → 推一条 SQL clause", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "pending_invitation" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
});

test("queue=pending_deal → 推一条 SQL clause", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "pending_deal" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 1);
});

test("queue=all → 不缩窄列表 (返回 0 条 clause)", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "all" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 0);
});

test("queue=migration_pending_follow_up → fallthrough 不缩窄 (依赖 OperationLog, 概览本身也是 0)", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "migration_pending_follow_up" }),
    todayStart,
    todayEnd,
  });
  assert.equal(clauses.length, 0);
});

test("regression — queue + 高级 filter 叠加: 两条 clause 都在 (queue 不再吞掉 tag)", () => {
  const clauses = buildCustomerCenterListFilterClauses({
    filters: makeFilters({ queue: "pending_follow_up", tagIds: ["t1"] }),
    todayStart,
    todayEnd,
  });
  // tagIds + queue = 2 条
  assert.equal(clauses.length, 2);
  const hasTag = clauses.some(
    (c) => typeof c === "object" && c !== null && "customerTags" in c,
  );
  assert.ok(hasTag, "queue 缩窄时 tagIds 仍必须生效");
});
