import assert from "node:assert/strict";
import test from "node:test";
import {
  appendRedirectSearchParams,
  buildRedirectTarget,
  getRedirectPathname,
  sanitizeRedirectTarget,
} from "../../lib/action-notice.ts";

test("sanitizeRedirectTarget 会保留合法站内 query 和 hash", () => {
  assert.equal(
    sanitizeRedirectTarget("/orders?page=2#detail", "/orders"),
    "/orders?page=2#detail",
  );
});

test("sanitizeRedirectTarget 会把空值和外链回退到默认页", () => {
  assert.equal(sanitizeRedirectTarget("", "/orders"), "/orders");
  assert.equal(sanitizeRedirectTarget("https://evil.com", "/orders"), "/orders");
  assert.equal(sanitizeRedirectTarget("//evil.com", "/orders"), "/orders");
  assert.equal(sanitizeRedirectTarget("javascript:alert(1)", "/orders"), "/orders");
});

test("buildRedirectTarget 会把 notice 参数追加到 hash 之前", () => {
  const target = buildRedirectTarget("/orders?page=2#detail", "success", "ok");
  const url = new URL(target, "https://crm.local");

  assert.equal(url.pathname, "/orders");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("noticeStatus"), "success");
  assert.equal(url.searchParams.get("noticeMessage"), "ok");
  assert.equal(url.hash, "#detail");
});

test("appendRedirectSearchParams 会保留原 query 并覆盖同名参数", () => {
  const target = appendRedirectSearchParams("/shipping?stageView=PENDING_REPORT#batch", {
    stageView: "PENDING_TRACKING",
    batchViewId: "batch_123",
  });
  const url = new URL(target, "https://crm.local");

  assert.equal(url.pathname, "/shipping");
  assert.equal(url.searchParams.get("stageView"), "PENDING_TRACKING");
  assert.equal(url.searchParams.get("batchViewId"), "batch_123");
  assert.equal(url.hash, "#batch");
});

test("getRedirectPathname 只返回净化后的 pathname", () => {
  assert.equal(getRedirectPathname("/orders?page=2#detail"), "/orders");
});
