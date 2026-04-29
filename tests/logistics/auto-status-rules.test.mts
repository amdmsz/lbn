import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextCostAwareLogisticsCheckAt,
  getUnsignedExceptionDeadlineAt,
  isUnsignedShipmentOverdue,
  resolveLogisticsTraceSignal,
} from "../../lib/logistics/auto-status-rules.ts";
import type { LogisticsTraceResult } from "../../lib/logistics/provider.ts";

function buildTrace(overrides: Partial<LogisticsTraceResult>): LogisticsTraceResult {
  return {
    mode: "remote",
    shippingProvider: "顺丰速运",
    carrierCode: "SF",
    trackingNumber: "SF123456789",
    currentStatusCode: "TRANSPORT",
    currentStatusLabel: "运输中",
    currentStatusVariant: "info",
    lastUpdatedAt: "2026-04-29T10:00:00.000Z",
    latestEvent: null,
    checkpoints: [],
    message: null,
    ...overrides,
  };
}

test("resolveLogisticsTraceSignal maps signed trace to delivered", () => {
  assert.equal(
    resolveLogisticsTraceSignal(buildTrace({ currentStatusCode: "SIGN", currentStatusLabel: "已签收" })),
    "DELIVERED",
  );
});

test("resolveLogisticsTraceSignal maps return and rejected traces to exception", () => {
  assert.equal(
    resolveLogisticsTraceSignal(buildTrace({ currentStatusCode: "RETURN", currentStatusLabel: "退回" })),
    "RETURN_OR_REJECTED",
  );

  assert.equal(
    resolveLogisticsTraceSignal(
      buildTrace({ currentStatusCode: null, currentStatusLabel: "客户拒收，快件退回" }),
    ),
    "RETURN_OR_REJECTED",
  );
});

test("getNextCostAwareLogisticsCheckAt schedules bounded check windows", () => {
  const shippedAt = new Date("2026-04-01T00:00:00.000Z");
  const taskCreatedAt = new Date("2026-04-01T00:00:00.000Z");

  assert.equal(
    getNextCostAwareLogisticsCheckAt({
      now: new Date("2026-04-04T00:00:00.000Z"),
      shippedAt,
      taskCreatedAt,
    })?.toISOString(),
    "2026-04-06T00:00:00.000Z",
  );

  assert.equal(
    getNextCostAwareLogisticsCheckAt({
      now: new Date("2026-04-06T00:00:00.000Z"),
      shippedAt,
      taskCreatedAt,
    })?.toISOString(),
    "2026-04-08T00:00:00.000Z",
  );

  assert.equal(
    getNextCostAwareLogisticsCheckAt({
      now: new Date("2026-04-08T00:00:00.000Z"),
      shippedAt,
      taskCreatedAt,
    }),
    null,
  );
});

test("unsigned shipment overdue starts at seven days", () => {
  const shippedAt = new Date("2026-04-01T00:00:00.000Z");
  const taskCreatedAt = new Date("2026-04-01T00:00:00.000Z");

  assert.equal(
    getUnsignedExceptionDeadlineAt({
      shippedAt,
      taskCreatedAt,
    }).toISOString(),
    "2026-04-08T00:00:00.000Z",
  );

  assert.equal(
    isUnsignedShipmentOverdue({
      now: new Date("2026-04-07T23:59:59.000Z"),
      shippedAt,
      taskCreatedAt,
    }),
    false,
  );

  assert.equal(
    isUnsignedShipmentOverdue({
      now: new Date("2026-04-08T00:00:00.000Z"),
      shippedAt,
      taskCreatedAt,
    }),
    true,
  );
});
