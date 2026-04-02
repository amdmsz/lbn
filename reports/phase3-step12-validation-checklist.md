# Step 1 + Step 2 Validation Checklist

Use this checklist before and after Step 3 changes. The goal is to verify that the new TradeOrder write path remains stable while `/orders` switches to the parent-order view.

## Draft And Submit

- [ ] Create a draft from `/customers/[id]?tab=orders&createTradeOrder=1` with 2 SKU lines under the same supplier.
- [ ] Save draft, reopen the same draft, change quantity and deal price, then submit for review.
- [ ] Verify submit only materializes the current supplier sub-order set.
- [ ] Verify old child orders from previous rejected attempts are not left behind after re-save + resubmit.

## Supplier Split

- [ ] Create a trade order draft with SKU lines from 2 different suppliers.
- [ ] Verify split preview shows 2 supplier groups, correct line counts, and correct subtotal per supplier.
- [ ] Submit for review and verify exactly 2 `SalesOrder` sub-orders are materialized.
- [ ] Verify same-supplier SKU lines merge into one sub-order.

## Review And Artifacts

- [ ] Approve one pending `TradeOrder`.
- [ ] Verify shipping and payment artifacts initialize exactly once for each child `SalesOrder`.
- [ ] Reopen the approved trade order and verify no destructive rebuild path is available.
- [ ] Reject one pending `TradeOrder`.
- [ ] Verify reject does not initialize shipping or payment artifacts.

## Resubmit

- [ ] Reject a pending trade order, reopen it from customer context, adjust SKU lines, and submit again.
- [ ] Verify supplier child orders are refreshed from the latest draft state.
- [ ] Verify re-submit does not duplicate shipping or payment artifacts before approval.

## Legacy Compatibility

- [ ] In child-order views, verify each trade-backed `SalesOrder` shows `tradeNo`, `subOrderNo`, and supplier.
- [ ] In `/orders/[salesOrderId]`, verify review from the child detail still routes through parent review logic.
- [ ] In customer order history, verify trade-backed child records remain understandable after split.
