# Logistics Auto Status Worker Plan

Date: 2026-04-29

## Goal

Implement a fulfillment-side logistics automation flow:

- When a `ShippingTask` gets its first tracking number, schedule cost-capped logistics checks around day 3 / day 5 / day 7 windows.
- Use the existing server-side logistics provider adapter to refresh fulfillment status.
- Mark the shipment completed only when the logistics trace indicates a signed/delivered terminal state.
- Detect high-confidence destination/address mismatch and surface it as a fulfillment exception.

## Scope

In scope:

- `ShippingTask` / `LogisticsFollowUpTask` scheduling and status updates.
- A new logistics auto-status batch worker script.
- Additive Prisma schema fields needed for structured logistics exception state and last trace snapshot.
- Exception queue inclusion for logistics address mismatch.
- `OperationLog` entries for every automatic status transition and exception detection.
- Minimal tests for status mapping and address mismatch heuristics.

Out of scope:

- Replacing the current XXAPI adapter.
- Making `/orders` or trade-order list the primary logistics maintenance surface.
- Changing `TradeOrder`, payment truth, COD collection truth, or legacy `Order` write paths.
- Auto-canceling shipments on mismatch. Mismatch is a human-review exception, not a destructive transition.

## Existing State

- `ShippingTask` is the fulfillment execution truth.
- `LogisticsFollowUpTask` already exists with `intervalDays`, `nextTriggerAt`, `lastTriggeredAt`, `lastFollowedUpAt`, `closedAt`, and `remark`.
- `updateSalesOrderShipping` currently creates a logistics follow-up task on first tracking fill, but schedules it for `now + 2 days`.
- `/api/logistics/track` and `lib/logistics/provider.ts` already query remote trace data server-side.
- Trace payload currently exposes `currentStatusCode`, `currentStatusLabel`, `latestEvent`, and `checkpoints[]` with `description`, `areaName`, and event time.
- The fulfillment exception query currently covers canceled tasks, missing parent links, tracking/reporting conflicts, and missing export files. It does not yet have structured logistics exception state.

## Invariants

- `TradeOrder` remains the transaction master record.
- `ShippingTask` remains the fulfillment execution record.
- `SalesOrder` remains supplier sub-order execution context, not the transaction truth.
- Do not write or extend legacy `ShippingTask.orderId` flow.
- Do not mix payment / COD truth with logistics status.
- Every worker-driven update must write `OperationLog`.
- Address mismatch should be conservative: flag only high-confidence mismatches, otherwise leave as normal and log the trace snapshot.

## Proposed Schema Changes

Additive migration only.

Add enum:

```prisma
enum LogisticsExceptionType {
  ADDRESS_MISMATCH
  RETURN_OR_REJECTED
  TRACE_QUERY_FAILED
}
```

Add fields to `ShippingTask`:

```prisma
logisticsLastCheckedAt       DateTime?
logisticsLastStatusCode      String?
logisticsLastStatusLabel     String?
logisticsLastEventAt         DateTime?
logisticsExceptionType       LogisticsExceptionType?
logisticsExceptionDetectedAt DateTime?
logisticsExceptionMessage    String? @db.Text
```

Add index:

```prisma
@@index([logisticsExceptionType, shippingStatus, createdAt], map: "shiptask_logistics_exception_idx")
```

Rationale:

- Avoids fragile `remark contains "地址异常"` queries.
- Lets `/fulfillment` exception counts include logistics exceptions without overloading `CANCELED`.
- Keeps the migration additive and rollback-friendly.

## Scheduling Semantics

On first tracking fill:

- Change the initial `LogisticsFollowUpTask` schedule from `now + 2 days` to `shippedAt/now + 3 days`.
- Store `intervalDays = 2` to represent the next low-frequency window spacing.
- Keep the existing owner selection: `salesOrder.ownerId ?? customer.ownerId`.

Worker processing:

- Load due open tasks where:
  - `status in (PENDING, IN_PROGRESS)`
  - `nextTriggerAt <= now`
  - `ShippingTask.trackingNumber` is present
  - `ShippingTask.shippingStatus in (SHIPPED, DELIVERED)`
  - no terminal `COMPLETED` or `CANCELED` status
- Cost-capped smart cadence:
  - The worker may run frequently, but it only calls the logistics API for due `nextTriggerAt` tasks.
  - A task is normally due around day 3, then day 5, then day 7.
  - This caps normal remote API calls at about three checks per shipment.
  - Any terminal signal closes the task early, so signed / returned / address-mismatch shipments do not keep polling.
- Day 3 / day 5 passes:
  - Query logistics trace.
  - If signed/delivered: update `shippingStatus` to `COMPLETED` and close open logistics follow-up tasks.
  - If still in transit: keep `SHIPPED`.
  - If return/reject/problem: set logistics exception fields.
  - Schedule the next low-frequency window.
- Day 7 pass:
  - Query logistics trace again.
  - If signed/delivered: update `shippingStatus` to `COMPLETED`, set `completedAt`, close open logistics follow-up tasks as `DONE`.
  - If not signed/delivered: set `OVERDUE_NOT_SIGNED` exception for manual review.

Assumption:

- "最后更新为已完成" means "finalize to completed as soon as provider trace confirms sign/delivery." This avoids silently completing lost, returned, or wrong-address shipments.

## Address Mismatch Detection

Create a pure helper, for example `lib/logistics/address-match.ts`.

Inputs:

- `ShippingTask.receiverAddressSnapshot`
- trace `latestEvent`
- trace `checkpoints`

Heuristic:

- Normalize text by removing whitespace, punctuation, and common suffix noise.
- Extract receiver-side province / city / district tokens using conservative regexes for `省`, `市`, `区`, `县`, `州`, `盟`.
- Extract trace-side destination clues from `areaName` and descriptions, prioritizing delivery/sign/checkpoint nodes.
- Return:
  - `MATCH`
  - `MISMATCH`
  - `UNKNOWN`
- Only flag `MISMATCH` when there is a clear conflict, such as receiver city token differs from trace destination city token.
- If trace only says "运输中" without destination locality, return `UNKNOWN`.

Exception behavior:

- On high-confidence mismatch, write:
  - `ShippingTask.logisticsExceptionType = ADDRESS_MISMATCH`
  - `logisticsExceptionDetectedAt = now`
  - `logisticsExceptionMessage` with concise evidence
  - `OperationLog` action `logistics.address_mismatch_detected`
- Do not auto-cancel the shipping task.
- Include mismatch records in the fulfillment exception queue by extending `buildShippingExceptionWhere`.

## Worker Architecture

Add:

- `lib/logistics/auto-status-worker.ts`
- `scripts/logistics-auto-status-worker.ts`
- `npm` script: `worker:logistics-auto-status`

Worker options:

- `--limit=50`
- `--dry-run`
- `LOGISTICS_AUTO_STATUS_ACTOR_ID`
- `LOGISTICS_AUTO_STATUS_BATCH_LIMIT`

Structured result:

- `scannedCount`
- `processedCount`
- `completedCount`
- `deliveredCount`
- `exceptionCount`
- `queryFailedCount`
- `skippedCount`
- `failedCount`

Runtime notes:

- The worker should rely on the existing `XXAPI_API_KEY` and `XXAPI_EXPRESS_ENDPOINT`.
- If the API key is missing, it should produce structured warnings and skip remote updates rather than corrupting statuses.
- Deployment can run this worker daily via cron/process manager, but API calls remain bounded by due windows because tasks are selected by `nextTriggerAt` and closed once terminal.

## Implementation Checklist

1. Add Prisma enum/fields/index and migration.
2. Update `updateSalesOrderShipping`:
   - initial logistics follow-up `nextTriggerAt = firstTrackingAt + 3 days`
   - `intervalDays = 2`
   - audit payload reflects the new schedule
3. Add logistics status mapping helper:
   - signed/delivered -> terminal delivered signal
   - transport/dispatch/collect -> in-progress signal
   - return/reject/problem/fail -> exception signal
4. Add address mismatch helper and focused tests.
5. Add `runLogisticsAutoStatusBatch`.
6. Add CLI wrapper script and `package.json` script.
7. Extend `buildShippingExceptionWhere` to include `logisticsExceptionType != null`.
8. Add minimal UI copy/badge in the fulfillment exception list so users can see "地址异常" or "物流异常" without opening logs.
9. Add `OperationLog` writes for:
   - low-frequency check completed
   - overdue-not-signed exception detected
   - auto-delivered
   - auto-completed
   - logistics exception detected
   - trace query failed after due check

## Validation Strategy

Run after implementation:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
npm run worker:logistics-auto-status -- --dry-run --limit=5
```

Add targeted tests:

```bash
node --test --experimental-strip-types tests/logistics/address-match.test.mts
node --test --experimental-strip-types tests/logistics/auto-status-worker.test.mts
```

Manual repro:

1. Create or pick a reported `ShippingTask`.
2. Fill tracking number.
3. Confirm a `LogisticsFollowUpTask` is created with `nextTriggerAt = shippedAt + 3 days`.
4. Run worker in dry-run against a due task.
5. Run worker normally against a fixture/stubbed provider or test environment.
6. Confirm `ShippingTask.shippingStatus`, logistics exception fields, and `OperationLog` entries.
7. Confirm `/fulfillment?tab=shipping&stageView=EXCEPTION` includes mismatch tasks.

## Rollback Notes

- Stop the cron/process for `worker:logistics-auto-status`.
- Existing manual shipping updates continue to work.
- Because schema changes are additive, old UI and mutations can ignore the new fields.
- If a false-positive mismatch is found, clear the structured exception fields with a supervised/manual remediation script and keep the `OperationLog` audit trail.

## Risks

- Remote trace payload may not expose a clean destination address. The mismatch heuristic must stay conservative to avoid false positives.
- Some carriers may report broad area names only. Those should produce `UNKNOWN`, not exception.
- Auto-completing without signed/delivered evidence would create fulfillment truth debt, so this plan avoids that by default.
- Running the worker frequently is safe but unnecessary; daily cron is enough because API calls are gated by `nextTriggerAt` windows.
