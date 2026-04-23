# 2026-04-22 Sitewide UI And Truth Cutover Plan

## Status

- Status: proposed, not yet executed
- Scope: full-site UI / visual system refresh + customer classification truth cutover
- Trigger: user confirmed a sitewide redesign and product-truth switch, not a page-local polish

---

## 1. Objective

Replace the current "incremental enterprise workbench cleanup" direction with a full, repository-wide cutover that does both:

1. switches the customer-operating truth to a single `ABCDE` classification system
2. upgrades the full app shell, visual language, page hierarchy, and working surfaces to a lighter, sharper, premium operating system

This is a product and UI cutover, not just a skin refresh.

The end state should feel:

- cleaner
- calmer
- more premium
- more obvious to use without helper copy
- more table-first and workbench-first
- less thick, less decorative, less "CRM template"

---

## 2. Locked Product Decisions

The following decisions are now treated as the intended new truth unless explicitly changed later:

### 2.1 Customer classification truth

- `ABCDE` becomes the only formal customer classification truth.
- Existing `Customer.level` style semantics (`NEW / REGULAR / VIP`) should be removed from the UI and retired from the product model.
- The intended business meaning is:
  - `A`: 已复购
  - `B`: 已加微信
  - `C`: 已邀约
  - `D`: 未接通
  - `E`: 拒加

### 2.2 Classification behavior

- Classification is single-select, not multi-tag.
- A customer can have only one current classification at a time.
- Later stronger signals may overwrite earlier weaker signals.
- Locked priority:
  - `A > C > B > E > D`
- `E` may later be overwritten by `B` or `C`.
- Existing follow-up / call / wechat / invitation records should be mapped into the new classification system where possible.

### 2.3 Supervisor operating truth

- Supervisor first screen becomes `employee list -> drill into employee customer pool`.
- Supervisor main KPIs are day-based operating metrics, not generic 30-day report cards.
- Supervisor home should use a pure table, not cards plus side panels.

### 2.4 Sales operating truth

- Sales first screen becomes a daily assignment workbench.
- Primary surface is a dense table.
- Sales must be able to edit remark and classification inline inside the table.
- The imported lead-side intent / purchase field is a first-screen field and should remain visible.

### 2.5 KPI interpretation

- Invitation means live-session invitation.
- Connect rate is calculated against assigned customers, not raw call attempts.

### 2.6 UX direction

- Remove oversized top navigation blocks, bloated page headers, and explanatory copy that users do not need.
- The interface should read as self-explanatory through layout and hierarchy rather than instructions.

### 2.7 Execution assumption to lock during implementation

- `D` should be derived from the latest effective unresolved contact outcome when no higher-priority `A / C / B / E` signal exists, rather than treated as a day-only temporary badge.
- If implementation reveals a business conflict, confirm this single rule before backfill execution.

---

## 3. Scope

This cutover includes all of the following workstreams.

### 3.1 Product and truth docs

- `PRD.md`
- `PLANS.md`
- `DESIGN.md`
- `UI_ENTRYPOINTS.md`
- `README.md`
- any page-specific addendum that still describes the old customer-level or gradual-only UI direction

### 3.2 Shared shell and visual system

- [`app/globals.css`](C:/Users/amdmsz/Documents/LbnCrm/app/globals.css)
- [`components/layout/dashboard-shell.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/layout/dashboard-shell.tsx)
- [`components/layout/sidebar-nav.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/layout/sidebar-nav.tsx)
- shared workbench primitives and page skeleton components

### 3.3 Shared workbench primitives likely affected

- [`components/layout-patterns/workbench-layout.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/layout-patterns/workbench-layout.tsx)
- [`components/shared/page-header.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/page-header.tsx)
- [`components/shared/page-summary-strip.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/page-summary-strip.tsx)
- [`components/shared/metric-card.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/metric-card.tsx)
- [`components/shared/section-card.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/section-card.tsx)
- [`components/shared/filters-panel.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/filters-panel.tsx)
- [`components/shared/entity-table.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/entity-table.tsx)
- [`components/shared/status-badge.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/status-badge.tsx)
- [`components/shared/empty-state.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/shared/empty-state.tsx)

### 3.4 Customer and dashboard surfaces

- [`app/(dashboard)/dashboard/page.tsx`](C:/Users/amdmsz/Documents/LbnCrm/app/(dashboard)/dashboard/page.tsx)
- [`components/dashboard/dashboard-workbench.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/dashboard/dashboard-workbench.tsx)
- [`app/(dashboard)/customers/page.tsx`](C:/Users/amdmsz/Documents/LbnCrm/app/(dashboard)/customers/page.tsx)
- [`components/customers/customer-center-workbench.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-center-workbench.tsx)
- [`components/customers/customer-filter-toolbar.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-filter-toolbar.tsx)
- [`components/customers/customers-table.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customers-table.tsx)
- [`components/customers/customer-list-card.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-list-card.tsx)
- [`components/customers/customer-detail-workbench.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-detail-workbench.tsx)

### 3.5 Queries and metadata

- [`lib/customers/metadata.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/customers/metadata.ts)
- [`lib/customers/queries.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/customers/queries.ts)
- [`lib/customers/mutations.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/customers/mutations.ts)
- [`lib/reports/queries.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/reports/queries.ts)
- lead-import mapping and historical signal migration helpers

### 3.6 Secondary page alignment

All customer-adjacent surfaces touched by the new truth or the new shell must be reviewed after main cutover:

- `/customers/[id]`
- `/customers/public-pool*`
- `/leads`
- `/reports`
- any list or detail page that still surfaces old customer level or old dashboard language

---

## 4. Non-Goals

This plan does not automatically authorize:

- a schema rewrite without an explicit schema milestone
- breaking route truth or compatibility routes
- changing `TradeOrder / SalesOrder / Payment / Fulfillment` truth layers
- replacing business logic with purely visual shortcuts
- deleting auditability or `OperationLog` hooks

If a later implementation step truly requires schema changes for classification truth, that must be promoted into a dedicated schema milestone instead of being smuggled into the UI rollout.

---

## 5. Core Invariants

The following invariants must remain true throughout implementation.

### 5.1 Business invariants

- `Customer` remains the sales execution mainline.
- `TradeOrder` remains the transaction master record.
- Payment truth remains `PaymentPlan / PaymentRecord / CollectionTask`.
- Fulfillment truth remains `ShippingTask / ShippingExportBatch / LogisticsFollowUpTask / CodCollectionRecord`.
- Live invitation continues to be the invitation truth used in customer progression.

### 5.2 Route invariants

- `/customers` remains the primary sales workbench route.
- `/customers/[id]` remains the customer dossier route.
- `/fulfillment` mainline routes and compatibility redirects remain intact.
- UI changes must not silently reopen deprecated workflows through hover, empty-state, or "more" actions.

### 5.3 RBAC and audit invariants

- RBAC stays server-enforced.
- New inline editing must still respect ownership and role boundaries.
- Important actions must keep auditability.

### 5.4 UX invariants

- Default screens must become shorter and clearer, not simply prettier.
- More power must come from disclosure, drawers, inline actions, and table affordances, not more panels.

---

## 6. Risks

This cutover has real blast radius.

### 6.1 Product-truth risk

- `ABCDE` replaces current customer-level semantics but current code still exposes `Customer.level` conventions.
- Historical data may not map cleanly from call/wechat/invitation records into a single current classification.

### 6.2 Reporting risk

- Current dashboard metrics are largely 30-day report metrics.
- Supervisor and sales home pages need new day-based operational metrics with new denominators.

### 6.3 UX regression risk

- Full-shell redesign can accidentally reduce discoverability if too much is removed at once.
- Over-minimalism would hurt heavy daily use.

### 6.4 Cutover risk

- A big-bang implementation across shell, dashboard, customer center, detail pages, and docs would be hard to validate.
- Work must be staged, even if the destination is a sitewide redesign.

---

## 7. Execution Strategy

This should be executed as a staged cutover with tightly scoped milestones, not a single giant patch.

### Phase 0. Truth Reset In Docs

Goal:

- update repository truth before UI implementation starts

Checklist:

- [ ] rewrite `PRD.md` customer-classification truth to `ABCDE`
- [ ] rewrite supervisor/sales home definitions in `PRD.md`
- [ ] rewrite `PLANS.md` to replace the old "no full-site rewrite" language with an explicit cutover program
- [ ] rewrite `DESIGN.md` to lock the new visual system and copy-minimizing principles
- [ ] rewrite `UI_ENTRYPOINTS.md` to define new supervisor and sales daily mainlines
- [ ] update `README.md` so future sessions read the new direction first

Exit criteria:

- docs stop describing the old customer-level and gradual-only UI baseline as current truth

### Phase 1. Classification And KPI Contracts

Goal:

- define executable product contracts before touching large UI surfaces

Checklist:

- [ ] formalize `A/B/C/D/E` derivation rules in customer metadata
- [ ] decide whether `Customer.level` is kept temporarily as storage-only compatibility or removed from active write paths
- [ ] define backfill / mapping rules from call, wechat, invitation, and repurchase signals
- [ ] define exact KPI formulas for:
  - [ ] 今日分配线索数量
  - [ ] 接通率
  - [ ] 加微数
  - [ ] 历史加微率
  - [ ] 邀约进场
  - [ ] 出单
  - [ ] 销售额
  - [ ] 当天线索加微率
- [ ] define employee table columns for supervisor view
- [ ] define sales daily workbench columns and inline edit behavior

Exit criteria:

- no KPI label remains ambiguous
- classification rules are specific enough to implement and test

### Phase 2. Shared Visual System And App Shell

Goal:

- replace the current warm, thick, gradient-heavy shell with a sharper premium workbench system

Checklist:

- [ ] redesign root color tokens in `app/globals.css`
- [ ] tighten typography scale and surface rhythm
- [ ] reduce decorative gradients and thick panel language
- [ ] redesign sidebar to be slimmer, calmer, and more architectural
- [ ] reduce top mobile header and shell noise
- [ ] restyle shared buttons, tabs, tables, filters, cards, and empty states
- [ ] ensure the new theme works on both desktop and mobile

Exit criteria:

- the shell already feels like the target product before page-local work starts

### Phase 3. Supervisor Cockpit

Goal:

- replace the generic dashboard with an operational supervisor cockpit

Checklist:

- [ ] redesign `/dashboard` around day-based KPI strip
- [ ] replace ranking/card language with employee operations table
- [ ] add drill-down entry into each employee customer pool
- [ ] surface `A/B/C/D/E` distribution in the table
- [ ] remove verbose role descriptions and excess helper copy
- [ ] keep only high-value quick actions

Exit criteria:

- supervisor home answers "who is performing, where to intervene, and what to open next" in one screen

### Phase 4. Sales Daily Workbench

Goal:

- turn `/customers` into the default daily operating screen for sales

Checklist:

- [ ] default first screen to today's assigned queue
- [ ] compress header and filter strip
- [ ] make table the default and primary mode
- [ ] move low-frequency data out of first-screen density
- [ ] add inline classification editing
- [ ] add inline remark editing
- [ ] keep imported intent/purchase field visible in-row
- [ ] surface latest call result and daily call count per customer
- [ ] remove card-heavy fallback as the primary mental model

Exit criteria:

- sales can work primarily from the table without needing repeated detail-page navigation

### Phase 5. Customer Detail Dossier

Goal:

- reduce customer detail into a thin operational dossier

Checklist:

- [ ] remove old customer-level presentation
- [ ] surface current `ABCDE` class clearly
- [ ] shrink the top summary block
- [ ] prioritize latest signals, timeline, and next action
- [ ] keep calls / wechat / live / orders grouped but visually lighter
- [ ] remove repeated descriptive text

Exit criteria:

- detail page becomes a secondary context surface, not a heavy mini-system

### Phase 6. Secondary Surface Alignment

Goal:

- prevent drift after the main surfaces cut over

Checklist:

- [ ] align `/customers/public-pool*` with the new shell and token system
- [ ] review `/leads` for copy, spacing, and classification references
- [ ] review `/reports` for old dashboard language
- [ ] review empty states, hover actions, and action menus repo-wide
- [ ] remove stale references to `Customer.level` labels in remaining customer-facing pages

Exit criteria:

- no visible customer-facing page still reads like the old system

### Phase 7. Hardening And Validation

Goal:

- ship a stable cutover rather than a visually attractive regression set

Checklist:

- [ ] lint
- [ ] build
- [ ] targeted route QA
- [ ] role-based smoke test
- [ ] route-mainline audit against `UI_ENTRYPOINTS.md`
- [ ] empty / loading / error state audit
- [ ] mobile and desktop responsive pass

---

## 8. File Ownership And Expected Touch Set

Expected primary ownership by workstream:

### Docs and product contracts

- `PRD.md`
- `PLANS.md`
- `DESIGN.md`
- `UI_ENTRYPOINTS.md`
- `README.md`

### Shared shell and theme

- [`app/globals.css`](C:/Users/amdmsz/Documents/LbnCrm/app/globals.css)
- [`components/layout/dashboard-shell.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/layout/dashboard-shell.tsx)
- [`components/layout/sidebar-nav.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/layout/sidebar-nav.tsx)
- shared component primitives listed above

### Customer truth and data shaping

- [`lib/customers/metadata.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/customers/metadata.ts)
- [`lib/customers/queries.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/customers/queries.ts)
- [`lib/customers/mutations.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/customers/mutations.ts)
- lead-import mapping helpers

### Supervisor cockpit

- [`app/(dashboard)/dashboard/page.tsx`](C:/Users/amdmsz/Documents/LbnCrm/app/(dashboard)/dashboard/page.tsx)
- [`components/dashboard/dashboard-workbench.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/dashboard/dashboard-workbench.tsx)
- [`lib/reports/queries.ts`](C:/Users/amdmsz/Documents/LbnCrm/lib/reports/queries.ts)

### Sales workbench

- [`app/(dashboard)/customers/page.tsx`](C:/Users/amdmsz/Documents/LbnCrm/app/(dashboard)/customers/page.tsx)
- [`components/customers/customer-center-workbench.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-center-workbench.tsx)
- [`components/customers/customer-filter-toolbar.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-filter-toolbar.tsx)
- [`components/customers/customers-table.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customers-table.tsx)
- [`components/customers/customer-list-card.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-list-card.tsx)

### Customer dossier

- [`components/customers/customer-detail-workbench.tsx`](C:/Users/amdmsz/Documents/LbnCrm/components/customers/customer-detail-workbench.tsx)
- related sub-sections for calls / wechat / live / logs as needed

---

## 9. Validation Strategy

Validation must prove both behavior and UX integrity.

### 9.1 Static validation

- `npm run lint`
- `npm run build`

### 9.2 Product-truth validation

- verify classification derivation against seeded and real representative customers
- verify priority rule `A > C > B > E > D`
- verify that inline classification edits persist correctly and remain permission-safe
- verify that old customer-level UI is gone from main surfaces

### 9.3 KPI validation

- compare each supervisor KPI against a queryable source-of-truth sample
- verify connect-rate denominator uses assigned customers
- verify invitation metrics use live-invitation data
- verify daily metrics do not silently fall back to rolling 30-day cards

### 9.4 Route and workflow validation

- sales: open `/customers`, work a full day-flow from list only
- supervisor: open `/dashboard`, drill into an employee pool
- customer detail: open `/customers/[id]`, confirm lighter dossier behavior
- empty states and more-actions: confirm no legacy route reopening

### 9.5 Responsive validation

- desktop wide screen
- laptop
- mobile shell and sheet navigation

---

## 10. Rollback Notes

Rollback should happen by milestone, not by panic-editing.

### 10.1 Recommended delivery discipline

- ship each phase as a separate reviewable commit or PR-sized slice
- do not combine truth rewrite, shell rewrite, dashboard rewrite, and customer workbench rewrite into one unreviewable mega-diff

### 10.2 Safe rollback boundaries

- docs-only changes can be reverted independently
- shell/theme changes should be isolated from query and mutation changes
- KPI/query changes should be isolated from page polish
- inline edit behavior should be isolated from visual-only table restyling

### 10.3 If a phase fails

- revert only the affected phase
- preserve route truth and compatibility routes
- do not partially keep ambiguous KPI labels or half-mapped classifications in production-facing pages

---

## 11. Recommended Execution Order For The Next Session

The next implementation session should execute in this order:

1. rewrite `PRD.md`, `DESIGN.md`, `PLANS.md`, `UI_ENTRYPOINTS.md`, and `README.md`
2. formalize `ABCDE` classification contract and KPI formulas in `lib/*`
3. refactor shared shell and tokens
4. replace supervisor dashboard
5. replace sales customer workbench
6. thin out customer detail
7. run validation and route audit

---

## 12. Done Criteria

This cutover is done only when:

- `ABCDE` is the active customer classification truth across the product
- supervisor and sales home screens follow the new operating model
- the app shell and shared components consistently use the new visual system
- the first screen across key workbenches is lighter, shorter, and more obvious
- stale customer-level semantics and thick explanatory copy are removed
- route truth, RBAC, and audit chains remain correct
- lint and build pass
