import assert from "node:assert/strict";
import test from "node:test";
import quickResultsModule from "../../lib/calls/follow-up-quick-results.ts";

const {
  buildFollowUpQuickResults,
  FOLLOW_UP_QUICK_RESULTS,
  isFollowUpQuickResultCode,
} = quickResultsModule;

test("电脑端跟进快捷结果包含待通过并保持业务顺序", () => {
  assert.deepEqual(
    FOLLOW_UP_QUICK_RESULTS.map((item) => [item.code, item.label]),
    [
      ["NOT_CONNECTED", "未接通"],
      ["WECHAT_PENDING", "待通过"],
      ["WECHAT_ADDED", "已加微信"],
      ["REFUSED_WECHAT", "拒加"],
      ["NEED_CALLBACK", "接通·再跟"],
      ["INVALID_NUMBER", "空号"],
    ],
  );
  assert.equal(isFollowUpQuickResultCode("WECHAT_PENDING"), true);
});

test("待通过快捷结果仍服从服务端启用状态", () => {
  const enabled = buildFollowUpQuickResults([
    { value: "NOT_CONNECTED", label: "未接通" },
    { value: "WECHAT_ADDED", label: "已加微信" },
  ]);

  assert.deepEqual(
    enabled.map((item) => item.code),
    ["NOT_CONNECTED", "WECHAT_ADDED"],
  );
});
