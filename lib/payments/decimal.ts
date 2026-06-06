/**
 * 支付/金额计算的精度安全工具.
 *
 * 背景: 仓库 lib/payments/mutations.ts 全链路用 JS Number + 字符串混算 + 自制
 * roundCurrency, 在 0.1+0.2≠0.3 这类经典浮点场景下会让 PaymentPlan.totalCollected
 * 与 sum(PaymentRecord.amount) 永远差几分钱, 财务对账失真.
 *
 * 本模块复用 Prisma 内置的 Prisma.Decimal (Decimal.js fork, 任意精度十进制),
 * 不引入新依赖. 上线策略 (audit 建议):
 *   1) [本提交] 先引入 helper, 双跑过渡期 — 业务路径暂不切, 但 helper 可用
 *   2) [后续提交] 把 lib/payments/* 的金额聚合/比较切到 Decimal-only, 仅在序列化
 *      给前端/数据库时再 toNumber/toFixed
 *   3) [后续提交] 单测覆盖 0.1×3 / 99.99×2 / 1/3 等典型浮点陷阱场景
 *
 * 使用模式:
 *   import { toDecimal, sumDecimal, roundCurrency, decimalToNumber } from "@/lib/payments/decimal";
 *   const total = sumDecimal([rec1.amount, rec2.amount, rec3.amount]);
 *   if (total.greaterThan(plan.expectedAmount)) { ... }
 *   const totalForDb = roundCurrency(total);  // 仍是 Decimal
 *   await prisma.paymentPlan.update({ data: { totalCollected: totalForDb } });
 */

import { Prisma } from "@prisma/client";

export type DecimalInput =
  | Prisma.Decimal
  | number
  | string
  | null
  | undefined;

const ZERO: Prisma.Decimal = new Prisma.Decimal(0);

/**
 * 把任意金额输入归一化成 Prisma.Decimal. 空值 → 0.
 * 非法字符串 (如 "abc") → 0, 同时 console.warn 在开发环境提示.
 */
export function toDecimal(value: DecimalInput): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return new Prisma.Decimal(0);
    return new Prisma.Decimal(value);
  }
  const trimmed = String(value).trim();
  if (trimmed === "") return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(trimmed);
  } catch {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[payments/decimal] toDecimal: invalid input "${trimmed}", coerced to 0`);
    }
    return new Prisma.Decimal(0);
  }
}

/**
 * 求和 — 跨账户/跨记录金额聚合的标准入口.
 */
export function sumDecimal(values: DecimalInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (acc, value) => acc.plus(toDecimal(value)),
    ZERO,
  );
}

/**
 * 按 2 位小数四舍五入 (人民币标准). 返回 Decimal, 不丢精度.
 */
export function roundCurrency(value: DecimalInput): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * 取绝对值 — 用于回退/退款金额处理.
 */
export function absDecimal(value: DecimalInput): Prisma.Decimal {
  return toDecimal(value).abs();
}

/**
 * 取 max(value, 0) — 业务上不允许负值的字段 (剩余金额 / 应收金额) 必用.
 */
export function nonNegativeDecimal(value: DecimalInput): Prisma.Decimal {
  const d = toDecimal(value);
  return d.lessThan(0) ? ZERO : d;
}

/**
 * 取 max(value, 0), 同时按 2 位四舍五入 — 大部分金额入库的入口.
 */
export function nonNegativeCurrency(value: DecimalInput): Prisma.Decimal {
  return roundCurrency(nonNegativeDecimal(value));
}

/**
 * 差值: a - b. 不做 round, 调用方按需 .roundCurrency().
 */
export function subDecimal(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

/**
 * 把 Decimal 转成 number, 用于序列化给前端 / 老代码兼容. 注意精度可能丢失,
 * 一般在 API response/UI 最末端调用.
 */
export function decimalToNumber(value: DecimalInput): number {
  const d = toDecimal(value);
  return d.toNumber();
}

/**
 * 把 Decimal 转成字符串, 保留 2 位 — 用于展示金额 / 写入 String 类型 DB 列.
 */
export function decimalToString(value: DecimalInput): string {
  return roundCurrency(value).toFixed(2);
}

/**
 * 比较: a > b?  返回 boolean.
 */
export function greaterThan(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

/**
 * 比较: a == b?  返回 boolean (按 Decimal 精度严格比较).
 */
export function equalsDecimal(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

/**
 * 比较: a >= b?  返回 boolean.
 */
export function greaterThanOrEqual(
  a: DecimalInput,
  b: DecimalInput,
): boolean {
  return toDecimal(a).greaterThanOrEqualTo(toDecimal(b));
}

/**
 * 工具: 判断金额是否为 "有效正数" (非 0 / 非 null / 非负).
 * 适合 if (isPositiveAmount(record.amount)) { ... }
 */
export function isPositiveAmount(value: DecimalInput): boolean {
  return toDecimal(value).greaterThan(0);
}

/**
 * Zero 常量 — 避免每次 new Prisma.Decimal(0).
 */
export const DECIMAL_ZERO = ZERO;
