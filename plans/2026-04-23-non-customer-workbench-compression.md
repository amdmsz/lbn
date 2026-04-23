# 2026-04-23 Non-Customer Workbench Compression

## Scope

This plan covers non-customer-center page-shell compression for the current CRM UI cutover.

Primary target:

- reduce above-the-fold height
- remove repeated header/meta/summary noise
- make list/table work appear earlier
- align non-customer workbenches to the thinner products-page logic

In scope:

- shared page-shell primitives used by non-customer pages
- page-level exceptions where shared compression is not enough
- settings / list / domain pages outside `/customers`

Out of scope:

- `/customers` daily workbench behavior
- customer business truth, RBAC, routing, schema, server mutations
- redesigning domain logic or entrypoint semantics

## Invariants

Must not change:

- mainline routes recorded in `UI_ENTRYPOINTS.md`
- compatibility redirect behavior
- CTA destinations
- RBAC visibility rules
- auditability / server actions / data loading contracts

Must preserve:

- loading / empty / error states
- table-first behavior on operational pages
- current tab / filter / pagination semantics

## Implementation Checklist

1. Audit shared shell primitives:
   - `components/shared/page-header.tsx`
   - `components/shared/data-table-wrapper.tsx`
   - `components/shared/page-summary-strip.tsx`
   - `components/shared/record-tabs.tsx`
   - `components/shared/page-shell.tsx`
   - `components/shared/summary-header.tsx`
   - `components/settings/settings-page-header.tsx`

2. Apply thinner default compact language:
   - reduce vertical padding
   - reduce gaps between header / summary / toolbar
   - reduce tab chrome thickness
   - reduce list-section title density
   - keep hierarchy readable

3. Add page-level overrides where needed for heavy non-customer pages:
   - dashboard / management dashboard
   - fulfillment
   - leads
   - recycle-bin
   - settings center / settings list pages
   - orders / finance / reports pages if shared changes are insufficient

4. Verify customer-center mainline is not structurally regressed.

5. Run validation:
   - `npm run lint`
   - `npm run build`

## Validation Strategy

Functional validation:

- open representative non-customer routes and confirm the main work area appears earlier
- confirm tabs, filters, CTA, and pagination still work
- confirm no page loses header context or primary action access

Representative routes:

- `/dashboard`
- `/leads`
- `/products`
- `/fulfillment`
- `/reports`
- `/finance/payments`
- `/recycle-bin`
- `/settings`

## Rollback Notes

Rollback should happen in this order:

1. revert page-level overrides if a specific page becomes too compressed
2. revert shared primitive changes selectively:
   - `page-shell`
   - `page-header`
   - `summary-header`
   - `data-table-wrapper`
   - `record-tabs`
   - `page-summary-strip`
3. keep route / data / server code untouched throughout, so rollback remains UI-only

