import assert from "node:assert/strict";
import test from "node:test";
import { resolveMobileDialpadCallAction } from "../../lib/mobile/dialpad-call-routing.ts";

test("mobile dialpad blocks unmatched numbers so recordings stay customer-linked", () => {
  const action = resolveMobileDialpadCallAction({
    callMode: "local-phone",
    normalizedNumber: "13812341234",
    hasMatchedCustomer: false,
    canCreateCallRecord: true,
  });

  assert.equal(action.kind, "blocked");
  if (action.kind === "blocked") {
    assert.equal(action.reason, "请选择客户或输入已匹配客户号码，录音上传需要客户关联。");
  }
});

test("mobile dialpad routes matched customers to the native phone", () => {
  const action = resolveMobileDialpadCallAction({
    callMode: "local-phone",
    normalizedNumber: "13812341234",
    hasMatchedCustomer: true,
    canCreateCallRecord: true,
  });

  assert.equal(action.kind, "local-phone");
});

test("mobile dialpad blocks empty numbers", () => {
  const action = resolveMobileDialpadCallAction({
    callMode: "local-phone",
    normalizedNumber: "",
    hasMatchedCustomer: false,
    canCreateCallRecord: true,
  });

  assert.equal(action.kind, "blocked");
  if (action.kind === "blocked") {
    assert.equal(action.reason, "请先输入号码。");
  }
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
