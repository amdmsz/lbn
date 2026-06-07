/**
 * lib/payments/decimal.ts 精度安全工具的单测.
 *
 * 覆盖目的: 守住 0.1+0.2≠0.3 / 1/3 / 99.99×2 等浮点陷阱场景, 防止后续
 * 重构 helper 时悄无声息把财务对账拖回 number 时代.
 */
import assert from "node:assert/strict";
import test from "node:test";

import prismaClientModule from "@prisma/client";
import decimalModule from "../../lib/payments/decimal.ts";

const { Prisma } = prismaClientModule;
const {
  decimalToNumber,
  decimalToString,
  equalsDecimal,
  greaterThan,
  nonNegativeCurrency,
  roundCurrency,
  subDecimal,
  sumDecimal,
  toDecimal,
} = decimalModule;

// ============================================================
// toDecimal
// ============================================================

test("toDecimal 把数字 / 字符串 / Decimal 归一化", () => {
  assert.equal(toDecimal(1).toString(), "1");
  assert.equal(toDecimal("99.99").toString(), "99.99");
  assert.equal(toDecimal(new Prisma.Decimal("1.5")).toString(), "1.5");
  // 大数
  assert.equal(toDecimal("999999999999.99").toString(), "999999999999.99");
});

test("toDecimal 空值 / 非法值 → 0", () => {
  assert.equal(toDecimal(null).toString(), "0");
  assert.equal(toDecimal(undefined).toString(), "0");
  assert.equal(toDecimal("").toString(), "0");
  assert.equal(toDecimal("   ").toString(), "0");
  assert.equal(toDecimal(NaN).toString(), "0");
  assert.equal(toDecimal(Infinity).toString(), "0");
  // 非法字符串 → 0 (并 warn, 此处仅断行为)
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production"; // 抑制 warn
  try {
    assert.equal(toDecimal("abc").toString(), "0");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("toDecimal 负数保留符号", () => {
  assert.equal(toDecimal(-12.5).toString(), "-12.5");
  assert.equal(toDecimal("-0.01").toString(), "-0.01");
});

// ============================================================
// sumDecimal
// ============================================================

test("sumDecimal 经典浮点陷阱: 0.1 + 0.2 + 0.3 + 0.4 = 1.0 (无精度漂移)", () => {
  // JS Number: 0.1 + 0.2 + 0.3 + 0.4 = 1.0000000000000002
  // Decimal: 必须精确等于 1
  const total = sumDecimal([0.1, 0.2, 0.3, 0.4]);
  assert.equal(total.toString(), "1");
});

test("sumDecimal 跳过 null / undefined / 空串当作 0", () => {
  const total = sumDecimal([100, null, "50.5", undefined, ""]);
  assert.equal(total.toString(), "150.5");
});

test("sumDecimal 空数组返回 0", () => {
  assert.equal(sumDecimal([]).toString(), "0");
});

test("sumDecimal 累加大量小额 (跨记录聚合) 不丢精度", () => {
  // 1000 笔 0.01 元 = 10 元 (Number 会有累积误差)
  // 注: sumDecimal 不主动 round, 保留 Decimal 精度 → "10" (Decimal 去尾 0)
  const values = Array(1000).fill("0.01");
  assert.equal(sumDecimal(values).toString(), "10");
  // 业务方需要 2 位展示时, 由 decimalToString 兜底
  assert.equal(decimalToString(sumDecimal(values)), "10.00");
});

test("sumDecimal 负数 (回退 / 退款) 与正数混合", () => {
  const total = sumDecimal([100, -30, "50.50", -20.50]);
  assert.equal(total.toString(), "100");
});

// ============================================================
// roundCurrency
// ============================================================

test("roundCurrency 2 位四舍五入 (人民币标准)", () => {
  assert.equal(roundCurrency("99.995").toString(), "100"); // half-up
  assert.equal(roundCurrency("99.994").toString(), "99.99");
  assert.equal(roundCurrency("99.99").toString(), "99.99");
  assert.equal(roundCurrency(0.1).toString(), "0.1");
});

test("roundCurrency 处理 1/3 类无限小数", () => {
  // 1/3 = 0.333... → 0.33 (HALF_UP)
  const oneThird = toDecimal(1).dividedBy(3);
  assert.equal(roundCurrency(oneThird).toString(), "0.33");
});

test("roundCurrency 处理大数 + 浮点累积场景", () => {
  // 99.99 × 100 = 9999 (JS: 9998.999999999998)
  const product = toDecimal("99.99").mul(100);
  assert.equal(roundCurrency(product).toString(), "9999");
});

test("roundCurrency 空值 → 0", () => {
  assert.equal(roundCurrency(null).toString(), "0");
  assert.equal(roundCurrency(undefined).toString(), "0");
  assert.equal(roundCurrency("").toString(), "0");
});

test("roundCurrency 负数同样 HALF_UP", () => {
  // Decimal.js ROUND_HALF_UP (mode 0): half away from zero. 故 -99.995 → -100.
  // 与 JS Math.round 一致, 与财务通常预期一致.
  assert.equal(roundCurrency("-99.995").toString(), "-100");
  assert.equal(roundCurrency("-0.005").toString(), "-0.01");
  assert.equal(roundCurrency("-99.994").toString(), "-99.99");
});

// ============================================================
// nonNegativeCurrency
// ============================================================

test("nonNegativeCurrency 把负数夹到 0 + 2 位四舍五入", () => {
  assert.equal(nonNegativeCurrency(-100).toString(), "0");
  assert.equal(nonNegativeCurrency(-0.01).toString(), "0");
  assert.equal(nonNegativeCurrency("100.005").toString(), "100.01");
  assert.equal(nonNegativeCurrency(0).toString(), "0");
});

test("nonNegativeCurrency 正常正数透传 + round", () => {
  assert.equal(nonNegativeCurrency("99.999").toString(), "100");
  assert.equal(nonNegativeCurrency("50.005").toString(), "50.01");
});

test("nonNegativeCurrency 空值 → 0", () => {
  assert.equal(nonNegativeCurrency(null).toString(), "0");
  assert.equal(nonNegativeCurrency(undefined).toString(), "0");
  assert.equal(nonNegativeCurrency("").toString(), "0");
});

// ============================================================
// greaterThan
// ============================================================

test("greaterThan 经典浮点: 0.1+0.2 不大于 0.3 (Number 会判错)", () => {
  // 0.1 + 0.2 = 0.30000000000000004 (Number)
  // Decimal: 0.1 + 0.2 === 0.3 → not greater than
  const sum = sumDecimal([0.1, 0.2]);
  assert.equal(greaterThan(sum, 0.3), false);
  assert.equal(greaterThan(sum, "0.3"), false);
});

test("greaterThan 严格大于, 等于不算", () => {
  assert.equal(greaterThan(100, 100), false);
  assert.equal(greaterThan(100.01, 100), true);
  assert.equal(greaterThan(100, 100.01), false);
});

test("greaterThan 与 0 / null 比较", () => {
  assert.equal(greaterThan(0.01, 0), true);
  assert.equal(greaterThan(0, null), false); // null → 0
  assert.equal(greaterThan(0.01, null), true);
});

test("greaterThan 负数与正数比较", () => {
  assert.equal(greaterThan(-1, -100), true);
  assert.equal(greaterThan(-100, -1), false);
  assert.equal(greaterThan(0, -0.01), true);
});

// ============================================================
// equalsDecimal
// ============================================================

test("equalsDecimal 经典浮点场景: 0.1+0.2 应该等于 0.3", () => {
  const sum = sumDecimal([0.1, 0.2]);
  assert.equal(equalsDecimal(sum, 0.3), true);
  assert.equal(equalsDecimal(sum, "0.30"), true);
});

test("equalsDecimal 严格按 Decimal 精度比较, 不放过小尾巴", () => {
  // 99.99 vs 99.990 等价
  assert.equal(equalsDecimal("99.99", "99.990"), true);
  assert.equal(equalsDecimal("99.99", "99.991"), false);
});

test("equalsDecimal 空值视为 0", () => {
  assert.equal(equalsDecimal(null, 0), true);
  assert.equal(equalsDecimal(undefined, "0.00"), true);
  assert.equal(equalsDecimal("", null), true);
  assert.equal(equalsDecimal(null, "0.01"), false);
});

test("equalsDecimal 累加结果对比", () => {
  // 1000 × 0.01 = 10.00 (Number 会漂移到 9.999999999999831)
  const total = sumDecimal(Array(1000).fill("0.01"));
  assert.equal(equalsDecimal(total, 10), true);
  assert.equal(equalsDecimal(total, "10.00"), true);
});

// ============================================================
// 辅助 helper smoke (subDecimal / decimalToNumber / decimalToString)
// 不在主单 6 个目标内, 但顺便守住接口契约.
// ============================================================

test("subDecimal 差值不丢精度", () => {
  // 1.00 - 0.10 - 0.20 - 0.30 - 0.40 (Number: 8.881784197001252e-16)
  let cur = toDecimal(1);
  cur = subDecimal(cur, 0.1);
  cur = subDecimal(cur, 0.2);
  cur = subDecimal(cur, 0.3);
  cur = subDecimal(cur, 0.4);
  assert.equal(cur.toString(), "0");
});

test("decimalToNumber / decimalToString 序列化末端转换", () => {
  assert.equal(decimalToNumber("99.99"), 99.99);
  assert.equal(decimalToString("99.99"), "99.99");
  assert.equal(decimalToString("99.995"), "100.00"); // round + fixed(2)
  assert.equal(decimalToString(null), "0.00");
});
