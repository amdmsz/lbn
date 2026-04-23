# 2026-04-23 Cross-Workbench UI Alignment Plan

## Status

- Status: proposed, pending implementation
- Scope: align non-customer workbenches to the current `/customers` and `/customers/[id]` UI language
- Trigger: user requested to continue the customer-center-style UI upgrade across leads, products, order/fulfillment, and adjacent pages

---

## 1. Objective

Use the current customer workbench and customer dossier as the visual and interaction baseline for the next wave of sitewide UI alignment.

This phase is not a brand-new redesign path.
It is a controlled secondary-surface alignment pass that should make the rest of the app feel like the same product system:

- quieter
- thinner
- table-first
- less explanatory
- more obvious through structure
- closer to the current customer-center workbench language

The goal is to remove page-to-page drift, not to reopen product truth, schema, or route mainlines.

---

## 2. Why A Separate Plan Is Required

This request now spans multiple first-level business surfaces:

- `/leads`
- `/products`
- `/fulfillment`
- `/reports`
- `/finance/*`
- adjacent shared wrappers such as filters, section shells, summary strips, and tab/subnav bars

This is a wide-blast-radius UI refactor.
Per repository rules, it should not be implemented as an unplanned multi-page patch.

Current code audit shows:

- `/customers` and `/customers/[id]` are now the strongest design reference
- `/dashboard` management view is already much closer to the new target
- `/products` and `/fulfillment` have already received one enterprise-workbench pass
- `/leads`, `/reports`, and `/finance/*` still visibly drift in copy density, card language, table rhythm, and control surfaces

So the next step should be a staged alignment plan, not ad hoc page edits.

---

## 3. Scope

### 3.1 Primary pages in this wave

- `/leads`
- `/products`
- `/fulfillment`
- `/reports`
- `/finance/payments`
- `/finance/reconciliation`
- `/finance/exceptions`

### 3.2 Supporting surfaces that may need shared refactor

- `components/shared/data-table-wrapper.tsx`
- `components/shared/page-header.tsx`
- `components/shared/page-summary-strip.tsx`
- `components/shared/metric-card.tsx`
- `components/shared/section-card.tsx`
- `components/shared/record-tabs.tsx`
- `components/shared/pagination-controls.tsx`
- `components/shared/status-badge.tsx`
- `components/shared/empty-state.tsx`
- finance and leads local filter / toolbar components

### 3.3 Out of scope for this plan

- schema changes
- KPI truth changes outside already approved dashboard/customer contracts
- RBAC redesign
- route mainline changes
- compatibility redirect changes
- order/payment/fulfillment truth refactors

---

## 4. Current Code Audit Summary

### 4.1 `/leads`

Current state:

- header and summary are still heavier and more explanatory than customer center
- filters are still their own distinct visual dialect
- unassigned workspace remains too banner-like and blue-emphasized
- batch dialogs and result-summary blocks still feel like an older admin template layer

Implication:

- highest-priority page for structural alignment after customer center

### 4.2 `/products`

Current state:

- product center already uses a dense workbench structure
- however, product cards, expansion rows, and filter copy still carry a more verbose and slightly heavier tone than current customer center
- details are partially aligned but not fully on the same "quiet dossier / workbench" system

Implication:

- do not rebuild product IA
- perform a refinement pass only

### 4.3 `/fulfillment`

Current state:

- page hierarchy is already workbench-first
- `trade-orders` and `shipping` still contain some mixed legacy visual language:
  - older tinted surfaces
  - heavier status density
  - more explanatory helper text than necessary
- good candidate for secondary alignment, not structural reinvention

Implication:

- keep the three-view IA
- compress and unify visual rhythm

### 4.4 `/reports`

Current state:

- still uses `WorkspaceGuide` and report-center explanatory framing
- reads more like a guidance hub than the current quiet operating surfaces
- definitions and ranking areas are structurally fine, but copy and wrappers are not aligned to the new shell

Implication:

- likely needs a real page-level rewrite, not just spacing polish

### 4.5 `/finance/*`

Current state:

- `payments`, `reconciliation`, and `exceptions` are functionally correct
- but they still sit inside an older `DataTableWrapper` pattern with more explicit explanation and less refined first-screen hierarchy
- cards, filter bars, and summary areas feel flatter and more generic than the customer center

Implication:

- treat finance as a shared mini-domain with one visual system
- likely refactor wrapper first, then page sections

### 4.6 `/dashboard`

Current state:

- management dashboard is already close to the target
- general `DashboardWorkbench` is more mixed, but lower priority than leads / reports / finance

Implication:

- do not expand scope into another dashboard redesign in this wave
- only touch if a shared primitive forces a follow-up fix

---

## 5. Invariants

The following must remain unchanged during implementation.

### 5.1 Route invariants

- `/customers` remains sales mainline
- `/dashboard` remains supervisor/admin home mainline
- `/products` remains product domain mainline
- `/fulfillment` remains fulfillment domain mainline
- `/orders`, `/shipping`, `/shipping/export-batches`, `/suppliers` remain compatibility routes only

### 5.2 Business invariants

- `Customer` remains sales execution mainline
- `TradeOrder` remains transaction master record
- payment and fulfillment truth stay separated
- `/leads` remains import/review/assignment-focused, not a second customer center

### 5.3 Interaction invariants

- no empty-state CTA may reopen deprecated routes
- no hover / more-action / dropdown may drift off current mainlines
- inline and batch actions must keep existing audit and permission behavior

### 5.4 Design invariants

- reuse current shell tokens and quiet customer-center language
- reduce copy before adding decoration
- prefer dense table rhythm over card expansion
- use progressive disclosure for secondary detail

---

## 6. Execution Strategy

Implementation should happen in bounded waves.
Do not mix all pages into one patch.

### Wave 1. Shared Secondary-Workbench Primitives

Goal:

- unify wrappers before touching multiple pages

Target files:

- `components/shared/data-table-wrapper.tsx`
- `components/shared/page-header.tsx`
- `components/shared/page-summary-strip.tsx`
- `components/shared/metric-card.tsx`
- `components/shared/section-card.tsx`
- `components/shared/record-tabs.tsx`
- `components/shared/pagination-controls.tsx`

Checklist:

- [ ] make `DataTableWrapper` less stage-like and closer to current customer-center sections
- [ ] align summary cards to the quieter strip language
- [ ] align wrapper spacing, border weight, and section title density
- [ ] normalize subnav/tab/control heights
- [ ] ensure wrappers work for both light and dark themes

Exit criteria:

- secondary pages can adopt the same section system without page-local hacks

### Wave 2. Leads Center Alignment

Goal:

- make `/leads` feel like a sibling of `/customers`, not an older admin module

Target files:

- `app/(dashboard)/leads/page.tsx`
- `components/leads/leads-filters.tsx`
- `components/leads/leads-table.tsx`
- `components/leads/lead-recycle-dialog.tsx`

Checklist:

- [ ] compress header and summary copy
- [ ] fold quick filters and advanced filters into one calmer control band
- [ ] reduce the visual weight of unassigned/assigned split
- [ ] tone down blue-tinted primary workspace framing
- [ ] align table rhythm, batch-action strip, and dialogs with customer center
- [ ] keep assignment and recycle flows unchanged behaviorally

Exit criteria:

- `/leads` feels like the upstream intake workbench to `/customers`

### Wave 3. Reports + Finance Domain Alignment

Goal:

- replace the current explanation-heavy reporting surfaces with quieter analytical workbenches

Target files:

- `app/(dashboard)/reports/page.tsx`
- `components/reports/report-overview.tsx`
- `app/(dashboard)/finance/payments/page.tsx`
- `components/finance/finance-payments-section.tsx`
- `app/(dashboard)/finance/reconciliation/page.tsx`
- `components/finance/finance-reconciliation-section.tsx`
- `app/(dashboard)/finance/exceptions/page.tsx`
- `components/finance/finance-exceptions-section.tsx`
- `components/finance/finance-subnav.tsx`

Checklist:

- [ ] remove `WorkspaceGuide`-style framing from reports first screen
- [ ] make report overview read like a quiet analytics workbench
- [ ] unify finance subnav with current record-tab / top-nav language
- [ ] compress finance card stacks and filter rows
- [ ] reduce explanatory text density in reconciliation / exceptions
- [ ] make exception grouping and payment tables calmer and easier to scan

Exit criteria:

- reports and finance feel like the same product family as customer center

### Wave 4. Product Center Refinement

Goal:

- keep product IA intact while aligning detail density and surface language

Target files:

- `app/(dashboard)/products/page.tsx`
- `components/products/products-section.tsx`
- related product drawers only if required by wrapper alignment

Checklist:

- [ ] reduce verbose filter copy
- [ ] compress product list card rhythm
- [ ] reduce repeated pills / auxiliary labels
- [ ] align expansion rows and empty states to quieter dossier/workbench language
- [ ] keep current `/products` mainline and drawer flows unchanged

Exit criteria:

- product center feels refined, not rebuilt

### Wave 5. Fulfillment Center Refinement

Goal:

- align `trade-orders / shipping / batches` with the quieter customer-center system

Target files:

- `app/(dashboard)/fulfillment/page.tsx`
- `components/fulfillment/order-fulfillment-center.tsx`
- `components/trade-orders/trade-orders-section.tsx`
- `components/shipping/shipping-operations-section.tsx`
- batch-related sections if needed

Checklist:

- [ ] compress wrapper copy and summary framing
- [ ] reduce tint / card heaviness in trade-order rows and shipping workspaces
- [ ] reduce status clutter where it harms scan speed
- [ ] align filter bands, section headings, and current-stage blocks
- [ ] keep fulfillment IA and navigation params intact

Exit criteria:

- fulfillment reads as the same operating system as customer center, without route drift

---

## 7. Recommended Execution Order

1. shared secondary-workbench primitives
2. `/leads`
3. `/reports` + `/finance/*`
4. `/products`
5. `/fulfillment`
6. final repo-wide empty-state / dropdown / hover audit for touched pages

Reason:

- leads, reports, and finance currently have the largest visual drift
- products and fulfillment are already partially aligned and should be refined later

---

## 8. Validation Strategy

Every wave must pass:

- `cmd /c npm run lint`
- `cmd /c npm run build`

### Route-mainline checks

- verify touched page headers and actions still point to the correct mainlines
- verify no empty-state button reopens legacy routes
- verify no dropdown / hover action drifts off `/products`, `/fulfillment`, `/customers`, or `/leads`

### Responsive checks

- desktop wide
- laptop width
- tablet / narrow width
- mobile for pages with sheet or compact nav behavior

### Domain-specific checks

- leads:
  - batch assignment still works
  - recycle dialogs still work
  - unassigned / assigned toggles still preserve context
- finance:
  - exports still use current filters
  - finance subnav remains intact
- fulfillment:
  - `tab`, `stageView`, `supplierViewId`, `batchViewId` flows remain intact
- products:
  - drawer open/close flows and detail links remain intact

---

## 9. Rollback Notes

- keep each wave in a separate reviewable patch
- shared wrapper changes must be isolated from page-specific refactors
- do not combine leads, reports, finance, products, and fulfillment into one mega diff
- if a wave regresses discoverability or route integrity, revert only that wave

---

## 10. Definition Of Done

This plan is complete only when:

- touched pages visibly align with the current customer-center UI language
- page hierarchy is thinner and quieter
- helper copy is reduced without losing usability
- filters, tables, section wrappers, and summary rows feel systemized
- route truth and compatibility routes remain correct
- lint and build pass after each bounded wave

---

## 11. Next Session Recommendation

The next implementation session should start with:

1. Wave 1 shared secondary-workbench primitives
2. Wave 2 `/leads`

This is the highest-value bounded slice and keeps the blast radius manageable.
