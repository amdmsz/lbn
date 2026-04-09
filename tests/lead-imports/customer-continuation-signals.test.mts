import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerContinuationTagLookupSet,
  buildImportedTagLookupCandidates,
  collectCustomerContinuationCategories,
  getCustomerContinuationOutcomeBadges,
  hasMatchingImportedTag,
  isCustomerContinuationSignalOnlyTagValue,
  resolveCustomerContinuationSignal,
} from "../../lib/lead-imports/customer-continuation-signals.ts";

test("A/B/C/D 类标签候选值会同时兼容代码和中文类名", () => {
  assert.deepEqual(
    buildImportedTagLookupCandidates("A类高净值客户").sort(),
    ["A", "A类", "A类高净值客户"].sort(),
  );
  assert.deepEqual(
    buildImportedTagLookupCandidates("D").sort(),
    ["D", "D类"].sort(),
  );
});

test("业务标签匹配会兼容 A/B/C/D 代码", () => {
  const lookup = buildCustomerContinuationTagLookupSet(["A", "B", "高净值老客"]);

  assert.equal(hasMatchingImportedTag("A类客户", lookup), true);
  assert.equal(hasMatchingImportedTag("高净值老客", lookup), true);
  assert.equal(hasMatchingImportedTag("未建标签", lookup), false);
});

test("D 类客户会映射为已加微信并进入待邀约", () => {
  const badges = getCustomerContinuationOutcomeBadges({
    tags: ["D类"],
    summary: {},
  });

  assert.deepEqual(
    badges.map((item) => item.key),
    ["WECHAT_ADDED", "PENDING_INVITATION"],
  );
});

test("跟进客户未接通/拒接会映射为挂断待回访", () => {
  const badges = getCustomerContinuationOutcomeBadges({
    tags: ["跟进客户（未接通/拒接）"],
    summary: {},
  });

  assert.deepEqual(
    badges.map((item) => item.key),
    ["HUNG_UP", "PENDING_CALLBACK"],
  );
});

test("拒绝添加与无效客户并存时优先落无效号码", () => {
  const signal = resolveCustomerContinuationSignal({
    tags: ["拒绝添加", "无效客户（空号/停机）"],
    summary: {},
  });

  assert.equal(signal?.kind, "CALL_RESULT");
  assert.equal(signal?.resultCode, "INVALID_NUMBER");
});

test("信号类词汇不会被当成未识别业务标签", () => {
  assert.equal(isCustomerContinuationSignalOnlyTagValue("拒绝添加"), true);
  assert.equal(isCustomerContinuationSignalOnlyTagValue("跟进客户（未接通/拒接）"), true);
  assert.equal(isCustomerContinuationSignalOnlyTagValue("空号/停机"), true);
  assert.equal(isCustomerContinuationSignalOnlyTagValue("A类"), false);
});

test("分类识别也会参考跟进结果等摘要字段", () => {
  assert.deepEqual(
    collectCustomerContinuationCategories({
      tags: [],
      summary: {
        latestFollowUpResult: "D类已加微信，待邀约",
      },
    }),
    ["D"],
  );
});
