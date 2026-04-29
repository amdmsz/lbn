# Gift Management Decommission Plan

Date: 2026-04-29

## Goal

Remove the user-facing Gift Management feature because the current workflow is not useful enough for daily operations.

Default interpretation for the first implementation pass:

- Decommission the feature from the product UI and write paths.
- Preserve existing `GiftRecord` data and historical references.
- Do not drop database tables, columns, enums, or relations in the same pass.

This avoids breaking existing payment, collection, shipping, customer history, finance, and recycle-bin references that already point at `GiftRecord`.

## Scope

In scope for the first safe decommission pass:

- Remove `/gifts` as an accessible workbench.
- Remove Gift Management from navigation and discoverable UI entrypoints.
- Remove or disable create/review/fulfillment write paths for gift records.
- Remove gift creation/review controls from customer detail and live-session contexts if present.
- Keep existing historical gift records readable only where needed for audit/history, or replace them with neutral archived summary text.
- Keep payment/collection/shipping records that reference `giftRecordId` build-safe and query-safe.
- Update docs so `GiftRecord` is no longer presented as an active business module.

Out of scope for first pass:

- Dropping `GiftRecord` table.
- Dropping `giftRecordId` columns from `ShippingTask`, `PaymentPlan`, `PaymentRecord`, or `CollectionTask`.
- Removing `GIFT_RECORD` enum values from payment/source or operation-log enums.
- Deleting production data.
- Rewriting historical finance/payment reports.

## Invariants

- `Customer` remains the sales execution mainline.
- `TradeOrder` remains the transaction mainline.
- Order gifts continue through `TradeOrderItem(type=GIFT)` and `TradeOrderItemComponent(type=GIFT)`, not `GiftRecord`.
- Payment, collection, shipping, finance, and audit pages must not crash when old rows reference `giftRecordId`.
- Existing auditability must remain intact.
- RBAC must not expose hidden gift write actions after the UI route is removed.
- Build, lint, Prisma validation, and route generation must pass.

## Current Dependency Inventory

Primary feature files:

- `app/(dashboard)/gifts/page.tsx`
- `app/(dashboard)/gifts/actions.ts`
- `app/(dashboard)/gifts/loading.tsx`
- `app/(dashboard)/gifts/error.tsx`
- `components/gifts/gifts-section.tsx`
- `lib/gifts/queries.ts`
- `lib/gifts/mutations.ts`
- `lib/gifts/fulfillment-compat.ts`

Entrypoints and permissions:

- `lib/navigation.ts`
- `lib/auth/access.ts`
- `components/layout/sidebar-nav.tsx` may render navigation derived from `lib/navigation.ts`.

Cross-module consumers to inspect/update:

- `components/customers/customer-detail-workbench.tsx`
- `components/live-sessions/live-sessions-section.tsx`
- `components/payments/payment-records-section.tsx`
- `components/payments/collection-tasks-section.tsx`
- `components/finance/finance-payments-section.tsx`
- `components/finance/finance-reconciliation-section.tsx`
- `lib/customers/queries.ts`
- `lib/finance/queries.ts`
- `lib/payments/queries.ts`
- `lib/payments/mutations.ts`
- `lib/payments/scope.ts`
- `lib/shipping/queries.ts`
- `lib/shipping/mutations.ts`
- `lib/recycle-bin/customer-adapter.ts`
- `lib/recycle-bin/queries.ts`
- `lib/live-sessions/recycle-guards.ts`

Schema references to preserve in first pass:

- `GiftRecord`
- `GiftQualificationSource`
- `GiftReviewStatus`
- `PaymentSourceType.GIFT_RECORD`
- `OperationLogEntityType.GIFT_RECORD`
- `ShippingTask.giftRecordId`
- `PaymentPlan.giftRecordId`
- `PaymentRecord.giftRecordId`
- `CollectionTask.giftRecordId`

Seed references:

- `prisma/seed.mjs`

## Implementation Checklist

### Step 1: Hide module entrypoints

- Remove Gift Management from `lib/navigation.ts`.
- Ensure sidebar/top navigation no longer exposes `/gifts`.
- Replace `/gifts` page with a route-safe redirect to a current mainline, likely `/customers` or `/fulfillment`.
- Keep `loading.tsx` and `error.tsx` only if the route remains as redirect; delete them if the route folder is fully removed.

### Step 2: Disable gift write paths

- Remove `components/gifts/gifts-section.tsx` from the page route.
- Remove or neutralize imports of `createGiftRecordAction`, `updateGiftReviewAction`, and `saveGiftFulfillmentCompatAction`.
- Ensure no UI still renders create/review/fulfillment forms for gift records.
- If direct POST/server-action imports can no longer be reached, delete `app/(dashboard)/gifts/actions.ts` and `lib/gifts/mutations.ts` only after confirming no imports remain.

### Step 3: Clean cross-module UI

- In customer detail, remove active GiftRecord creation/management UI.
- In live-session pages, remove GiftRecord shortcut links and replace with current customer follow-up or order gift path if needed.
- In payment records and collection tasks, keep old `GIFT_RECORD` rows readable but do not link users to `/gifts`.
- In finance pages, keep old GiftRecord labels as historical source labels only.

### Step 4: Preserve historical reads safely

- Keep `lib/gifts/queries.ts` only if any retained historical summary still needs it.
- Otherwise delete gift-specific query code after all imports are gone.
- Keep generic payment/collection/shipping relations that include `giftRecord` to avoid historical data crashes.
- Any display of old gift records should be read-only and clearly historical.

### Step 5: Update docs and route registry

- Update `PRD.md` section 5.1 to state `GiftRecord` is decommissioned as an active workflow and retained only for historical compatibility.
- Update `UI_ENTRYPOINTS.md` to remove `/gifts` from active/discoverable UI and document redirect/deprecated status if route is retained.
- Update `PLANS.md` current baseline to record Gift Management decommission.

### Step 6: Optional future schema cleanup

Only after production/staging data review and explicit approval:

- Export/count existing `giftrecord`, payment, collection, shipping references.
- Decide whether to archive historical rows into a JSON audit table or keep normalized tables.
- Create a Prisma migration to remove unused gift tables/relations/enums.
- Backfill or null-check all referencing records before dropping constraints/columns.
- Run `npm run prisma:predeploy:check` and `bash scripts/release-preflight.sh` before deploy.

## Validation Strategy

Run after implementation:

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npx prisma validate
npm run lint
npm run build
```

Recommended targeted checks:

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
Get-ChildItem -Path app,components,lib -Recurse -File |
  Select-String -Pattern '/gifts|GiftsSection|createGiftRecordAction|updateGiftReviewAction|saveGiftFulfillmentCompatAction'
```

Manual smoke checks:

- Sidebar no longer shows Gift Management.
- Navigating to `/gifts` redirects or shows a deliberate decommission message.
- `/customers`, `/live-sessions`, `/payment-records`, `/collection-tasks`, `/finance/payments`, `/fulfillment`, and `/orders/[id]` still load.
- Historical `GIFT_RECORD` payment/collection rows, if present, do not crash list rendering.

## Rollback Notes

Safe rollback for first pass:

- Restore `/gifts` route files.
- Restore navigation entry.
- Restore gift write action imports.
- Re-run lint/build.

Because first pass does not drop schema or delete rows, rollback should not require database restore.

Hard schema cleanup rollback, if ever performed later:

- Requires database backup restore or a forward migration that recreates dropped tables/columns.
- Must not be bundled with first-pass UI decommission.
