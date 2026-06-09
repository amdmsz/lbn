/**
 * Wave 6/7/8/9 regression fix: 结构性验证.
 *
 * `getCustomerCenterDataStats` / `getCustomerCenterDataList` 必须是 React
 * `cache()` 返回的 callable — 不再是原始 `async function`. 这是 page.tsx 两
 * 个 Suspense 边界共享 SQL aggregate 结果的关键: React 在同一 server render
 * 上下文里, 同 arg 引用复用同一个 Promise, `getCustomerCenterStatsAggregate`
 * (8 对 count+groupBy = 16+ SQL, 每条都带 `id: notIn [recycled]`) 不再跑 2 遍.
 *
 * 这里只断言 "exports 被 cache 包过" 这层契约 — 不连 Prisma, 不依赖真 render
 * 上下文 (React cache 只在 server render 里激活 dedup, node:test 里仅作透传).
 *
 * 跑法:
 *   node --test --import tsx tests/customers/queries-cache-dedup.test.mts
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { cache } = await import("react");
const queries = await import("../../lib/customers/queries.ts");

test("getCustomerCenterDataStats 必须是 React cache() 包过的", () => {
  // React cache() 返回的对象不是原生 async function: 它是带内部缓存表的可调
  // 用对象, 仍然是 function typeof. 我们核对引用与 cache() 返回的 sentinel
  // 兼容形态 — 至少跟原始 async function 行为不同.
  assert.equal(
    typeof queries.getCustomerCenterDataStats,
    "function",
    "getCustomerCenterDataStats 应该仍是可调用的",
  );
  // sanity: cache() 自身就是 function, 且我们的 export 应该是它的产物.
  // 这里通过构造一个临时 cache wrapper 验证 toString 形态可以区分原生 async
  // function — 然后断言我们的 export 跟原生 async 形态不一致.
  const ref = cache(async (_x: string) => _x);
  const refStr = ref.toString();
  const exportStr = queries.getCustomerCenterDataStats.toString();
  assert.equal(
    exportStr,
    refStr,
    `getCustomerCenterDataStats 应该是 cache(impl) 返回的 wrapper, 当前: ${exportStr.slice(0, 80)}`,
  );
});

test("getCustomerCenterDataList 必须是 React cache() 包过的", () => {
  assert.equal(typeof queries.getCustomerCenterDataList, "function");
  const ref = cache(async (_x: string) => _x);
  const refStr = ref.toString();
  const exportStr = queries.getCustomerCenterDataList.toString();
  assert.equal(
    exportStr,
    refStr,
    `getCustomerCenterDataList 应该是 cache(impl) 返回的 wrapper, 当前: ${exportStr.slice(0, 80)}`,
  );
});
