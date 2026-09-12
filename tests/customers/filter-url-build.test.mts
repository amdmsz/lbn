/**
 * lib/customers/filter-url.ts buildCustomersHref 单测.
 *
 * 风格跟 tests/customers/grade-derive.test.mts 一致 — 纯函数, 不连 DB.
 *
 * 重点 regression: 之前 buildCustomersHref 不序列化 queue, 用户在
 *   ?queue=pending_first_call 翻页 / 改 pageSize / 走 filter-toolbar 时会
 * 静默丢掉 queue 选择 (parseCustomerCenterFilters 会 fallback "all"). 这里
 * 守护 queue 必须 round-trip 进 URL.
 *
 * 跑法:
 *   node --test --import tsx tests/customers/filter-url-build.test.mts
 */
import assert from "node:assert/strict";
import test from "node:test";

// 与其他客户单测保持一致, 防止下游 import 链断言 DATABASE_URL 存在.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { buildCustomersHref, buildCustomersPageHref } = await import(
  "../../lib/customers/filter-url.ts",
);
const { CUSTOMERS_PAGE_SIZE } = await import("../../lib/customers/metadata.ts");
const { getCustomerFilterParamsFromFormData } = await import(
  "../../lib/customers/batch-filter-params.ts",
);

type Filters = Parameters<typeof buildCustomersHref>[0];

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
    pageSize: CUSTOMERS_PAGE_SIZE,
    ...overrides,
  };
}

test("queue=all 时不写进 URL (默认值不污染 query)", () => {
  const href = buildCustomersHref(makeFilters({ queue: "all" }));
  assert.equal(href, "/customers");
});

test("queue=pending_first_call 翻页时 queue 必须 round-trip 到 URL", () => {
  const href = buildCustomersHref(
    makeFilters({ queue: "pending_first_call" }),
    { page: 3 },
  );
  const url = new URL(href, "http://localhost");
  assert.equal(url.pathname, "/customers");
  assert.equal(url.searchParams.get("queue"), "pending_first_call");
  assert.equal(url.searchParams.get("page"), "3");
});

test("queue 在 overrides 里也能正确覆盖 (filter-toolbar applyFilters 路径)", () => {
  const href = buildCustomersHref(
    makeFilters({ queue: "pending_wechat" }),
    { queue: "pending_invitation" },
  );
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("queue"), "pending_invitation");
});

test("queue + 其他过滤同时存在时, 全部保留", () => {
  const href = buildCustomersHref(
    makeFilters({
      queue: "pending_first_call",
      search: "张三",
      teamId: "team_a",
      pageSize: 50,
    }),
  );
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("queue"), "pending_first_call");
  assert.equal(url.searchParams.get("search"), "张三");
  assert.equal(url.searchParams.get("teamId"), "team_a");
  assert.equal(url.searchParams.get("pageSize"), "50");
});

test("D 类筛选翻页与批量表单透传时必须保留 grades", () => {
  const href = buildCustomersHref(
    makeFilters({ grades: ["D" as Filters["grades"][number]] }),
    { page: 2 },
  );
  const url = new URL(href, "http://localhost");
  assert.deepEqual(url.searchParams.getAll("grades"), ["D"]);
  assert.equal(url.searchParams.get("page"), "2");

  const formData = new FormData();
  formData.append("selectionMode", "filtered");
  formData.append("grades", "D");
  formData.append("page", "2");
  const parsed = getCustomerFilterParamsFromFormData(formData);
  assert.deepEqual(parsed.grades, ["D"]);
  assert.equal(parsed.page, "2");
});

test("分页链接从当前 URL 保留 grades，不受旧 Suspense filters 影响", () => {
  const href = buildCustomersPageHref(
    "/customers",
    new URLSearchParams("grades=D&grades=E&teamId=team_a&page=1"),
    2,
  );
  const url = new URL(href, "http://localhost");
  assert.deepEqual(url.searchParams.getAll("grades"), ["D", "E"]);
  assert.equal(url.searchParams.get("teamId"), "team_a");
  assert.equal(url.searchParams.get("page"), "2");
});
