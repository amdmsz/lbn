# Customer Force Hard Delete Plan

## Scope

Implement a supervisor-and-above customer hard delete path that can delete a customer directly, without the current recycle-bin/import-light-customer business blockers.

This is a destructive data operation. The implementation must be explicit, auditable, and dependency-aware; a raw `customer.delete()` is not enough because many tables hold non-null foreign keys to `Customer`.

## Invariants

- `ADMIN` can force hard delete any customer.
- `SUPERVISOR` can force hard delete customers inside their team/customer management scope only.
- `SALES`, `OPS`, and `SHIPPER` cannot force hard delete customers.
- The operation bypasses business blockers such as ownership history, follow-up history, orders, payments, fulfillment, tags, and recycle-bin state.
- The operation must still be a controlled transaction, not a best-effort partial delete.
- The operation must write an `OperationLog` before deleting dependent records that would otherwise remove the customer detail audit trail.
- If a dependency cannot be safely deleted or detached, the transaction must fail before deleting the customer.
- No Prisma schema change is planned unless validation finds a table that cannot be cleaned through existing fields.

## Current Blocking Facts

- `Customer` is referenced by many non-null relations: `TradeOrder`, `SalesOrder`, legacy `Order`, `GiftRecord`, `ShippingTask`, `LogisticsFollowUpTask`, `CodCollectionRecord`, `CollectionTask`, `CustomerOwnershipEvent`, `CustomerTag`, `CallRecording`, `OutboundCallSession`, `LiveInvitation`, and others.
- Existing `purgeCustomerTarget()` only calls `customer.delete()`, so it only works for light customers with no blocking relations.
- Existing imported-customer hard delete only supports import-created customers and explicitly blocks transaction / payment / fulfillment chains.
- Therefore “不要管任何东西” requires a new force-delete repository/service that deletes or detaches all dependent data in a correct order.

## Implementation Checklist

1. Add a dedicated permission helper if needed:
   - Keep or reuse `canPermanentlyDeleteCustomers(role)`.
   - Treat `SUPERVISOR` as team-scoped, `ADMIN` as global.

2. Add customer force-delete dependency repository:
   - Suggested file: `lib/customers/force-delete.ts`.
   - Export `forceHardDeleteCustomer(actor, { customerId, reason })`.
   - Load actor team scope and visible customer first.
   - Reject roles below supervisor.
   - Reject supervisor when the customer is outside their team/public-pool management scope.

3. Build a transaction-safe dependency cleanup order:
   - Snapshot customer identity and counts before deletion.
   - Resolve IDs first for nested cleanup:
     - `TradeOrder`, `SalesOrder`, legacy `Order`, `GiftRecord`, `ShippingTask`
     - `CallRecord`, `CallRecording`, `OutboundCallSession`, `LiveInvitation`
     - `PaymentPlan`, `PaymentRecord`, `CollectionTask`, `LogisticsFollowUpTask`, `CodCollectionRecord`
     - `Lead`, `LeadCustomerMergeLog`, `CustomerHistoryArchive`, `RecycleBinEntry`
   - Delete child records before parents:
     - call AI / reviews / uploads / action events before call recordings / call records
     - COD records before payment records / plans when linked
     - collection tasks before payment plans
     - shipping export lines before trade/sales/shipping parents
     - sales order items / gift items before sales orders
     - trade order components/items before trade orders
   - Detach audit-style optional references where appropriate:
     - `Lead.customerId = null`
     - `LeadCustomerMergeLog.customerId = null`
     - `CustomerHistoryArchive.targetCustomerId = null`
     - optional `CallActionEvent.customerId = null` if not deleted through call/session path
   - Delete customer-owned direct records:
     - `CustomerTag`, `CustomerOwnershipEvent`, `FollowUpTask`, `WechatRecord`, `LiveAudienceRecord` links, `LiveInvitation`.
   - Delete or resolve active recycle-bin entries for that customer so hidden/recycle views do not break.
   - Delete `Customer` last.

4. Preserve auditability:
   - Create an `OperationLog` entry before destructive cleanup:
     - `module: CUSTOMER`
     - `targetType: CUSTOMER`
     - `targetId: customerId`
     - `action: customer.force_hard_deleted`
     - include actor, reason, customer snapshot, and dependency counts.
   - Since later cleanup may delete customer-scoped logs depending on existing query rules, do not rely on customer detail page as the only audit surface.

5. Wire server actions:
   - Add a server action in `app/(dashboard)/customers/[id]/actions.ts` or a shared customer action module.
   - Validate `customerId` and a required reason/confirmation token.
   - Revalidate:
     - `/customers`
     - `/customers/public-pool`
     - `/dashboard`
     - `/recycle-bin`
     - `/orders`
     - `/fulfillment`
     - `/finance`

6. Wire UI:
   - Use `crm-ui-foundation`.
   - Add a destructive action in customer detail, visible only to supervisor/admin.
   - Keep confirmation strong:
     - show customer name/phone/owner
     - require typing the customer phone or name
     - require a reason
   - After success redirect to `/customers` or `/customers/public-pool`.
   - Do not expose to sales.

7. Tests / verification:
   - Unit-test permission helper and scope:
     - admin can delete global
     - supervisor can delete own-team customer
     - supervisor cannot delete other-team customer
     - sales cannot delete
   - Add a targeted transaction test or script for a seeded customer with:
     - lead, follow-up, call, wechat, invitation
     - trade order, sales order, shipping, payment, collection
     - tags, ownership events, recycle-bin entry
   - Verify no FK error and customer disappears from customer list/detail.

## Validation Strategy

Run locally:

```powershell
Set-Location C:\Users\amdmsz\Documents\LbnCrm
npx prisma validate
npm run lint
npm run build
```

If a targeted script/test is added:

```powershell
node --test --experimental-strip-types tests/customers/force-hard-delete.test.mts
```

Before production deploy:

```bash
bash scripts/release-preflight.sh
```

After production deploy:

```bash
bash scripts/release-smoke.sh https://crm.cclbn.com
REQUIRE_LEAD_IMPORT_WORKER=1 npm run check:lead-import-runtime
```

## Rollback Notes

- Code rollback restores the old UI/action path but does not restore already-deleted customer data.
- Production execution should be preceded by a database backup or PITR confirmation.
- For accidental hard delete, restoration requires database backup recovery, not app-level restore.
- If deployment fails before any delete operation is used, rollback is a normal git/service rollback.

## Open Decisions

- Whether `SUPERVISOR` should stay team-scoped or be allowed to delete all customers globally. Recommended: team-scoped.
- Whether force hard delete should delete transaction/payment/fulfillment records entirely, or detach only where schema allows. Recommended for this request: delete dependent business records, detach historical audit records where fields are nullable.
- Whether the action should also be available from the customer table bulk actions. Recommended: detail page first; batch hard delete later only after single-delete has production confidence.
