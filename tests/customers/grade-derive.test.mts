/**
 * lib/customers/grade.ts 推导规则单测.
 *
 * 风格跟 tests/customers/force-delete-scope.test.mts 一致 — 纯函数, 不连 DB.
 * 这里只关心 deriveCustomerGrade 的优先级 + pickHigherGrade 的不降级守护.
 *
 * 优先级 (用户口述, 不要回退): A > B > C > F > D.
 *   - A 一旦给定就不降级, 除非订单全部撤销
 *   - 加微 + 邀约直播 -> B (微信优先)
 *   - 有订单 + 加微 -> A (订单赢)
 *   - 空号比未接通强
 *
 * 跑法:
 *   node --test --import tsx tests/customers/grade-derive.test.mts
 */
import assert from "node:assert/strict";
import test from "node:test";

// 必须在任何 lib/db/prisma 之前的 import 设置 (尽管 grade.ts 自身不连 prisma,
// 但 @prisma/client 的 enum 对象需要环境 sanity, 保持与其他客户单测一致).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mariadb://test:test@127.0.0.1:3306/test";

const { CustomerGrade } = await import("@prisma/client");
const {
  deriveCustomerGrade,
  pickHigherGrade,
  CUSTOMER_GRADE_BADGE_TONE,
  CUSTOMER_GRADE_LABEL,
} = await import("../../lib/customers/grade.ts");

type Signal = Parameters<typeof deriveCustomerGrade>[0];

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    approvedOrderCount: 0,
    hasWechat: false,
    hasLiveInvitation: false,
    isInvalidNumber: false,
    hasUnansweredCall: false,
    ...overrides,
  };
}

test("有订单 → A 级 (最高优先, 哪怕同时加了微信 / 邀约直播 / 没接通)", () => {
  assert.equal(
    deriveCustomerGrade(makeSignal({ approvedOrderCount: 1 })),
    CustomerGrade.A,
  );
  assert.equal(
    deriveCustomerGrade(
      makeSignal({
        approvedOrderCount: 3,
        hasWechat: true,
        hasLiveInvitation: true,
        hasUnansweredCall: true,
      }),
    ),
    CustomerGrade.A,
    "approvedOrderCount > 0 必须压住所有其他信号",
  );
  assert.equal(
    deriveCustomerGrade(
      makeSignal({
        approvedOrderCount: 1,
        isInvalidNumber: true, // 真实业务里不该出现, 但函数得稳
      }),
    ),
    CustomerGrade.A,
  );
});

test("加微信 → B 级 (订单为 0 时, 微信优先于直播 / 未接通 / 空号)", () => {
  assert.equal(
    deriveCustomerGrade(makeSignal({ hasWechat: true })),
    CustomerGrade.B,
  );
  assert.equal(
    deriveCustomerGrade(
      makeSignal({ hasWechat: true, hasLiveInvitation: true }),
    ),
    CustomerGrade.B,
    "微信优先于直播",
  );
  assert.equal(
    deriveCustomerGrade(
      makeSignal({ hasWechat: true, hasUnansweredCall: true }),
    ),
    CustomerGrade.B,
  );
  // 空号但加了微信 — 加微信赢 (这种情况说明销售用了别的渠道触达)
  assert.equal(
    deriveCustomerGrade(makeSignal({ hasWechat: true, isInvalidNumber: true })),
    CustomerGrade.B,
  );
});

test("邀约直播 → C 级 (没订单 / 没微信时)", () => {
  assert.equal(
    deriveCustomerGrade(makeSignal({ hasLiveInvitation: true })),
    CustomerGrade.C,
  );
  // 直播 + 未接通 — 直播赢
  assert.equal(
    deriveCustomerGrade(
      makeSignal({ hasLiveInvitation: true, hasUnansweredCall: true }),
    ),
    CustomerGrade.C,
  );
});

test("空号 → F 级 (优先级在 D 之上, 因为 F 是稳定结论)", () => {
  assert.equal(
    deriveCustomerGrade(makeSignal({ isInvalidNumber: true })),
    CustomerGrade.F,
  );
  // 空号 + 未接通 — 空号赢
  assert.equal(
    deriveCustomerGrade(
      makeSignal({ isInvalidNumber: true, hasUnansweredCall: true }),
    ),
    CustomerGrade.F,
  );
});

test("未接听 → D 级 (其他信号都空时的兜底)", () => {
  assert.equal(
    deriveCustomerGrade(makeSignal({ hasUnansweredCall: true })),
    CustomerGrade.D,
  );
});

test("无信号 → null (新建客户不硬塞 D, 让上游决定)", () => {
  assert.equal(deriveCustomerGrade(makeSignal()), null);
});

test("pickHigherGrade: A 给定后不降级到 B / C / D / F", () => {
  assert.equal(
    pickHigherGrade(CustomerGrade.A, CustomerGrade.B),
    CustomerGrade.A,
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.A, CustomerGrade.C),
    CustomerGrade.A,
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.A, CustomerGrade.D),
    CustomerGrade.A,
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.A, CustomerGrade.F),
    CustomerGrade.A,
  );
});

test("pickHigherGrade: B 可以被 A 顶上去, 但不会被 C/D/F 顶下来", () => {
  assert.equal(
    pickHigherGrade(CustomerGrade.B, CustomerGrade.A),
    CustomerGrade.A,
    "加微之后又下单了 → A",
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.B, CustomerGrade.C),
    CustomerGrade.B,
    "加微之后再邀约直播 → 还是 B",
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.B, CustomerGrade.D),
    CustomerGrade.B,
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.B, CustomerGrade.F),
    CustomerGrade.B,
  );
});

test("pickHigherGrade: F (空号) 在 D 之上, 但 C/B/A 能顶住 F", () => {
  assert.equal(
    pickHigherGrade(CustomerGrade.D, CustomerGrade.F),
    CustomerGrade.F,
    "确认空号比未接通强",
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.F, CustomerGrade.C),
    CustomerGrade.C,
    "空号判定后销售真邀约到直播 → 该升 C (反向修正之前的 F)",
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.F, CustomerGrade.B),
    CustomerGrade.B,
    "F 但销售真加上了微信 → 升 B",
  );
  assert.equal(
    pickHigherGrade(CustomerGrade.F, CustomerGrade.A),
    CustomerGrade.A,
    "F 但销售真带出单 → 升 A",
  );
});

test("pickHigherGrade: null 在两端的处理", () => {
  assert.equal(pickHigherGrade(null, CustomerGrade.B), CustomerGrade.B);
  assert.equal(pickHigherGrade(CustomerGrade.B, null), CustomerGrade.B);
  assert.equal(pickHigherGrade(null, null), null);
});

test("UI metadata 覆盖全部 5 个 grade, 不能漏 mapping", () => {
  const grades = [
    CustomerGrade.A,
    CustomerGrade.B,
    CustomerGrade.C,
    CustomerGrade.D,
    CustomerGrade.F,
  ] as const;
  for (const grade of grades) {
    assert.ok(
      CUSTOMER_GRADE_BADGE_TONE[grade],
      `CUSTOMER_GRADE_BADGE_TONE 缺 ${grade}`,
    );
    assert.ok(
      CUSTOMER_GRADE_LABEL[grade],
      `CUSTOMER_GRADE_LABEL 缺 ${grade}`,
    );
  }
});
