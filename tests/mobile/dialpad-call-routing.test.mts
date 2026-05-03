import assert from "node:assert/strict";
import test from "node:test";
import { resolveMobileDialpadCallAction } from "../../lib/mobile/dialpad-call-routing.ts";

test("mobile dialpad outbound blocks unmatched numbers", () => {
  const action = resolveMobileDialpadCallAction({
    callMode: "crm-outbound",
    normalizedNumber: "13812341234",
    hasMatchedCustomer: false,
    canCreateCallRecord: true,
  });

  assert.equal(action.kind, "blocked");
  if (action.kind === "blocked") {
    assert.equal(action.reason, "外呼仅支持已匹配客户号码。");
  }
});

test("mobile dialpad outbound allows matched customer", () => {
  const action = resolveMobileDialpadCallAction({
    callMode: "crm-outbound",
    normalizedNumber: "13812341234",
    hasMatchedCustomer: true,
    canCreateCallRecord: true,
  });

  assert.equal(action.kind, "crm-outbound");
});

test("mobile dialpad local phone routes to native phone when allowed", () => {
  const action = resolveMobileDialpadCallAction({
    callMode: "local-phone",
    normalizedNumber: "13812341234",
    hasMatchedCustomer: false,
    canCreateCallRecord: true,
  });

  assert.equal(action.kind, "local-phone");
});

test("mobile dialpad blocks calls when call record access is unavailable", () => {
  const action = resolveMobileDialpadCallAction({
    callMode: "local-phone",
    normalizedNumber: "13812341234",
    hasMatchedCustomer: true,
    canCreateCallRecord: false,
  });

  assert.equal(action.kind, "blocked");
});
