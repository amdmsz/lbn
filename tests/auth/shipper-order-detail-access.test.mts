import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAccessOrderDetail,
  canAccessOrderModule,
  canAccessPath,
  canAccessPaymentRecordModule,
  canReviewSalesOrder,
} from "../../lib/auth/access.ts";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("SHIPPER can open contextual order details but not the sales order module", () => {
  assert.equal(canAccessOrderDetail("SHIPPER"), true);
  assert.equal(canAccessOrderModule("SHIPPER"), false);
  assert.equal(canAccessPath("SHIPPER", "/orders/sales_order_1"), true);
  assert.equal(canAccessPath("SHIPPER", "/orders"), false);
  assert.equal(canAccessPaymentRecordModule("SHIPPER"), false);
  assert.equal(canReviewSalesOrder("SHIPPER"), false);
});

test("shipper detail uses a shipping-scoped query and a read-only page branch", () => {
  const querySource = readRepoFile("lib/shipping/order-detail.ts");
  const pageSource = readRepoFile("app/(dashboard)/orders/[id]/page.tsx");

  assert.match(querySource, /viewer\.role !== "SHIPPER"/);
  assert.match(querySource, /shippingTask:\s*\{\s*isNot:\s*null/);
  assert.doesNotMatch(querySource, /paymentPlans:/);
  assert.doesNotMatch(querySource, /operationLog/);
  assert.match(pageSource, /session\.user\.role === "SHIPPER"/);
  assert.match(pageSource, /<ShipperOrderDetailSection order=\{shipperOrder\}/);
});
