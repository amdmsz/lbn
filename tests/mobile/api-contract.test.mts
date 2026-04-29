import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveMobileCustomerLevelFromSignals,
  getLatestMobileCallSignal,
  maskMobilePhone,
  parseMobilePagination,
  resolveMobileCustomerLevel,
  resolveMobileCustomerLevels,
} from "../../lib/mobile/api-contract.ts";

test("mobile phone masking keeps only prefix and suffix", () => {
  assert.equal(maskMobilePhone("13812341234"), "138****1234");
  assert.equal(maskMobilePhone("+86 138-1234-1234"), "138****1234");
  assert.equal(maskMobilePhone(""), "");
});

test("mobile customer level keeps CRM priority order", () => {
  const latestRefusedCall = {
    callTime: new Date("2026-04-30T10:00:00.000Z"),
    result: "REFUSED_WECHAT",
  };

  assert.equal(
    deriveMobileCustomerLevelFromSignals({
      approvedTradeOrderCount: 2,
      hasLiveInvitation: true,
      hasSuccessfulWechatSignal: true,
      latestCall: latestRefusedCall,
    }),
    "A",
  );
  assert.equal(
    deriveMobileCustomerLevelFromSignals({
      approvedTradeOrderCount: 1,
      hasLiveInvitation: true,
      hasSuccessfulWechatSignal: true,
      latestCall: latestRefusedCall,
    }),
    "E",
  );
  assert.equal(
    deriveMobileCustomerLevelFromSignals({
      approvedTradeOrderCount: 0,
      hasLiveInvitation: true,
      hasSuccessfulWechatSignal: true,
      latestCall: null,
    }),
    "C",
  );
  assert.equal(
    deriveMobileCustomerLevelFromSignals({
      approvedTradeOrderCount: 0,
      hasLiveInvitation: false,
      hasSuccessfulWechatSignal: true,
      latestCall: null,
    }),
    "B",
  );
});

test("latest mobile call signal ignores records without result signal", () => {
  const latest = getLatestMobileCallSignal([
    {
      callTime: new Date("2026-04-30T10:00:00.000Z"),
      result: "REFUSED_WECHAT",
    },
    {
      callTime: new Date("2026-04-30T11:00:00.000Z"),
      result: null,
      resultCode: null,
    },
  ]);

  assert.equal(latest?.result, "REFUSED_WECHAT");
});

test("mobile pagination and level parsing are bounded", () => {
  const params = new URLSearchParams({
    page: "3",
    limit: "500",
    level: "b类",
  });

  assert.deepEqual(parseMobilePagination(params), {
    page: 3,
    limit: 50,
    skip: 100,
  });
  assert.equal(resolveMobileCustomerLevel(params.get("level")), "B");
  assert.deepEqual(resolveMobileCustomerLevels("b类,C，E,E,x"), ["B", "C", "E"]);
  assert.equal(resolveMobileCustomerLevel("x"), null);
});
