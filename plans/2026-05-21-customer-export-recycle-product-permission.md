# Customer Export / Recycle Bin / Product Delete Permission Plan

## Scope

Add a server-side permission model for three related capabilities:

1. Precision customer export by salesperson and date range.
2. Recycle bin elevated access for supervisor-and-above.
3. Product deletion permission for supervisor-and-above.

This change is intentionally bounded. It does not rewrite CRM truth layers or alter order/payment/fulfillment models.

## User Need

The requester wants:

- export customers for a specific salesperson and date window, e.g. `李思琪` + `4/1-4/10`
- include communication records, customer name, phone, address, and product details
- grant highest recycle-bin access
- grant product deletion ability
- open the capability to supervisor-and-above accounts

## Current Baseline

- `Customer` is the sales execution main object.
- `Lead` is import/dedup/assignment only.
- `RecycleBinEntry` already exists and is guarded in `lib/auth/access.ts`, `lib/recycle-bin/lifecycle.ts`, and UI routes.
- Product mutations already gate create/edit/move-to-recycle-bin through `canManageProducts(...)`, which also supports the extra `PRODUCT_MANAGE` permission.
- Customer export already exists in other places, but no dedicated precision export by salesperson + date range has been confirmed yet.

## Invariants

- Do not expose data broadly through UI-only hiding.
- Do not weaken auditability for export, recycle, or delete actions.
- Do not mix order/payment/fulfillment truth into the new export scope.
- Keep SALES visibility scoped to owned data unless the export action is explicitly granted.
- Supervisor-and-above should mean `ADMIN` and `SUPERVISOR` by default; if the user wants broader roles later, treat that as a separate decision.

## Proposed Implementation Steps

1. Add a dedicated customer export permission check in `lib/auth/access.ts`.
2. Extend the customer list/query layer to support filtered export by:
   - salesperson / owner
   - date range
   - optional include-communication toggle
3. Add a CSV/XLSX export route or server action that returns:
   - customer name
   - phone
   - address
   - salesperson
   - date/time
   - communication summary
   - product summary
4. Wire the export button only where the role/permission check passes.
5. Add recycle-bin permission review so supervisor-and-above can access the intended deepest actions, while preserving admin-only purge/finalize if needed.
6. Add product delete permission handling so supervisor-and-above can delete products if that is confirmed as intended.
7. Preserve `OperationLog` entries for export and privileged deletions.

## Validation Strategy

- `npm run lint`
- `npm run build`
- targeted checks for:
  - export route access denied for unauthorized roles
  - export filtered by salesperson/date range
  - recycle-bin route access and action gating
  - product deletion permission gating
  - audit log creation for privileged operations

## Rollback Notes

- Keep the new permission checks additive first.
- Avoid removing existing access paths until the new checks are verified.
- If export scope is too broad, narrow the query before exposing the UI.
- If recycle-bin or product delete permission becomes too permissive, revert only the new permission mapping and keep the old guard logic intact.

## Open Decisions

- Whether the export deliverable should be CSV, XLSX, or both.
- Whether communication records should be exported as a separate sheet or a concatenated text column.
- Whether product deletion means hard delete, recycle-bin move, or both surfaces.
- Whether “supervisor and above” should include only `ADMIN` + `SUPERVISOR`, or also be extended through extra permissions later.
