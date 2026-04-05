# UI_ENTRYPOINTS

## Purpose

This document records the real UI and interaction entrypoints in the repository as of `2026-04-05`.

It is not a product wish list.
It is a code-audited registry for:

- current unique mainline entrypoints
- compatibility entrypoints
- legacy or residual entrypoints that still exist in code
- high-risk places that must be checked together when a capability is changed

This file should be updated whenever a capability is cut over, redirected, or re-homed.

---

## Current Domain Mainlines

- Order and fulfillment domain mainline: `/fulfillment`
- Trade-order list mainline: `/fulfillment?tab=trade-orders`
- Shipping execution mainline: `/fulfillment?tab=shipping`
- Batch records mainline: `/fulfillment?tab=batches`
- Customer-scoped order creation mainline: `/customers/[id]?tab=orders&createTradeOrder=1`
- Customer public-pool mainline: `/customers/public-pool`
- Public-pool rules mainline: `/customers/public-pool/settings`
- Public-pool reports mainline: `/customers/public-pool/reports`
- Product domain mainline: `/products`
- Supplier management mainline: `/products?tab=suppliers`

Compatibility routes currently still in use:

- `/orders` -> redirects to `/fulfillment?tab=trade-orders`
- `/shipping` -> redirects to `/fulfillment?tab=shipping`
- `/shipping/export-batches` -> redirects to `/fulfillment?tab=batches`
- `/suppliers` -> redirects to `/products?tab=suppliers`
- `/orders/[id]` -> parent-first detail, child fallback compatibility route

---

## High-Risk Action Registry

### 1. Create Order

**唯一主链（当前真实主入口）**

- Customer-scoped `TradeOrder` form at `/customers/[id]?tab=orders&createTradeOrder=1`

**主入口列表**

- Customer detail orders tab CTA in `components/customers/customer-detail-workbench.tsx`
- Customer list card CTA in `components/customers/customer-list-card.tsx`
- Customer-center order shortcuts routed through customer detail in `components/customers/customer-center-workbench.tsx`
- Continue-edit links from trade-order list and trade-order detail back to the same customer-scoped form

**兼容入口列表**

- `/orders/[id]` detail pages may still expose “continue edit” links that route back into the customer-scoped `TradeOrder` composer

**已废弃 / 应废弃入口**

- Any old `SalesOrderForm`-based customer create-order popup flow
- Any customer-center CTA that opens a single-SKU legacy order form

**涉及的关键文件**

- `app/(dashboard)/customers/[id]/page.tsx`
- `components/customers/customer-detail-workbench.tsx`
- `components/customers/customer-list-card.tsx`
- `components/trade-orders/trade-order-form.tsx`
- `lib/trade-orders/mutations.ts`

**每次改该能力时必须同步检查的入口**

- Customer detail orders tab
- Customer list card hover/mobile actions
- Trade-order list “continue edit”
- Trade-order detail “continue edit”
- Empty states that send users back to `/customers`

**当前风险说明**

- Mainline is already unified to `TradeOrder`, but some internal naming still uses `SalesOrder` terms
- Legacy `SalesOrderForm` code still exists in repository and should not be re-wired into customer entrypoints

---

### 2. View Order Detail

**唯一主链（当前真实主入口）**

- Parent `TradeOrder` detail at `/orders/[tradeOrderId]`

**主入口列表**

- Trade-order list “查看详情” in `components/trade-orders/trade-orders-section.tsx`
- Customer detail order records in `components/customers/customer-detail-workbench.tsx`
- Trade-order execution summary cards in `components/trade-orders/trade-order-execution-summary-card.tsx`

**兼容入口列表**

- `/orders/[id]` child-order fallback when the id belongs to a `SalesOrder`
- Payment and collection pages still expose both parent and child detail links
- Shipping execution cards may link to `/orders/${salesOrderId}` when drilling into child execution detail

**已废弃 / 应废弃入口**

- Treating child-order detail as the primary order detail entry

**涉及的关键文件**

- `app/(dashboard)/orders/[id]/page.tsx`
- `components/trade-orders/trade-orders-section.tsx`
- `components/trade-orders/trade-order-detail-section.tsx`
- `components/customers/customer-detail-workbench.tsx`
- `components/payments/payment-records-section.tsx`
- `components/payments/collection-tasks-section.tsx`

**每次改该能力时必须同步检查的入口**

- Trade-order list
- Customer detail order history
- Shipping execution detail buttons
- Payment-record and collection-task source links
- Execution summary cards

**当前风险说明**

- `/orders/[id]` is intentionally dual-mode today
- Parent detail is the business mainline, but child-detail compatibility links still exist across execution pages

---

### 3. Go to Shipping Execution

**唯一主链（当前真实主入口）**

- `/fulfillment?tab=shipping`

**主入口列表**

- Fulfillment domain tab switch in `components/fulfillment/order-fulfillment-center.tsx`
- Trade-order list shipping shortcuts in `components/trade-orders/trade-orders-section.tsx`
- Trade-order detail header and summary cards in `components/trade-orders/trade-order-detail-section.tsx`
- Shipping batch records “back to execution” and context jumps in `components/shipping/shipping-export-batches-section.tsx`

**兼容入口列表**

- `/shipping` redirect page
- Execution links built from `tradeNo`, `stageView`, `supplierViewId`

**已废弃 / 应废弃入口**

- Treating `/shipping/export-batches` as a fulfillment workbench entry

**涉及的关键文件**

- `app/(dashboard)/fulfillment/page.tsx`
- `app/(dashboard)/shipping/page.tsx`
- `components/fulfillment/order-fulfillment-center.tsx`
- `components/trade-orders/trade-orders-section.tsx`
- `components/trade-orders/trade-order-detail-section.tsx`
- `components/shipping/shipping-operations-section.tsx`
- `lib/fulfillment/navigation.ts`

**每次改该能力时必须同步检查的入口**

- Fulfillment tabs
- Trade-order list row actions
- Trade-order detail actions
- Batch-records back-links
- Supplier execution cards

**当前风险说明**

- Mainline is unified, but parameterized context links are business-critical
- If `stageView` or `supplierViewId` changes, parent detail, batch records, and trade-order list can all silently drift

---

### 4. View Batch Records

**唯一主链（当前真实主入口）**

- `/fulfillment?tab=batches`

**主入口列表**

- Fulfillment domain tab switch
- Trade-order list “查看批次” in more-actions
- Trade-order detail header and summary cards
- Shipping execution supplier-level batch links

**兼容入口列表**

- `/shipping/export-batches` redirect page

**已废弃 / 应废弃入口**

- Treating batch records as the first execution entry rather than result/audit view

**涉及的关键文件**

- `app/(dashboard)/shipping/export-batches/page.tsx`
- `components/fulfillment/order-fulfillment-center.tsx`
- `components/trade-orders/trade-orders-section.tsx`
- `components/trade-orders/trade-order-detail-section.tsx`
- `components/shipping/shipping-export-batches-section.tsx`
- `lib/fulfillment/navigation.ts`

**每次改该能力时必须同步检查的入口**

- Fulfillment tabs
- Trade-order list more-actions
- Trade-order detail batch summary
- Shipping execution latest-batch actions

**当前风险说明**

- Domain positioning is correct now, but some links still use `tradeNo` keyword lookup rather than explicit batch-source identity

---

### 5. Fill Tracking / View Logistics

**唯一主链（当前真实主入口）**

- Tracking fill mainline: supplier work pool in `/fulfillment?tab=shipping`
- Logistics trace viewing mainline: click-triggered trace panels from shipping or detail contexts

**主入口列表**

- Supplier-level bulk tracking fill in `components/shipping/shipping-operations-section.tsx`
- Shipping item-level fill/update actions in the same section
- Trade-order list logistics status button in `components/trade-orders/trade-order-logistics-cell.tsx`
- Sales-order detail logistics trace in `components/sales-orders/sales-order-detail-section.tsx`

**兼容入口列表**

- Trade-order list logistics drawer is a read-only visibility shortcut, not the operational fill mainline

**已废弃 / 应废弃入口**

- Any attempt to make trade-order list the primary logistics maintenance surface

**涉及的关键文件**

- `components/shipping/shipping-operations-section.tsx`
- `components/shipping/logistics-trace-panel.tsx`
- `components/shipping/logistics-trace-content.tsx`
- `components/trade-orders/trade-order-logistics-cell.tsx`
- `components/sales-orders/sales-order-detail-section.tsx`
- `app/api/logistics/track/route.ts`
- `lib/logistics/provider.ts`
- `lib/logistics/client.ts`

**每次改该能力时必须同步检查的入口**

- Shipping execution fill forms
- Trade-order list logistics button
- Logistics hover / drawer behavior
- Sales-order detail logistics section
- API error-state handling

**当前风险说明**

- Operational fill and read-only trace are intentionally split
- This split is correct, but easy to break if list-level shortcuts start growing into a second logistics workbench

---

### 6. Create Product

**唯一主链（当前真实主入口）**

- `/products` product tab with in-page create form

**主入口列表**

- Top CTA in `components/products/products-section.tsx`
- Empty-state CTA in the same section

**兼容入口列表**

- Direct access to `/products#create-product`

**已废弃 / 应废弃入口**

- Any separate supplier-domain product creation flow

**涉及的关键文件**

- `app/(dashboard)/products/page.tsx`
- `components/products/products-section.tsx`
- `components/products/product-create-form.tsx`

**每次改该能力时必须同步检查的入口**

- Product top CTA
- Product empty state
- Product detail back-links

**当前风险说明**

- Mainline is clean and unified
- The main risk is accidental re-splitting between product center and supplier center

---

### 7. Create Supplier

**唯一主链（当前真实主入口）**

- `/products?tab=suppliers`

**主入口列表**

- Manage-suppliers tab and forms in `components/suppliers/suppliers-section.tsx`

**兼容入口列表**

- `/suppliers` redirect page
- Inline supplier quick-create inside product form via `components/products/product-supplier-field.tsx`

**已废弃 / 应废弃入口**

- Any reintroduction of supplier center as a first-class parallel business domain

**涉及的关键文件**

- `app/(dashboard)/products/page.tsx`
- `app/(dashboard)/suppliers/page.tsx`
- `components/suppliers/suppliers-section.tsx`
- `components/products/product-supplier-field.tsx`

**每次改该能力时必须同步检查的入口**

- Product-domain supplier tab
- `/suppliers` redirect
- Product create/edit supplier field modal

**当前风险说明**

- Inline supplier creation is sanctioned and should remain contextual
- Full supplier management must still live under product domain

---

### 8. Submit Payment Record

**唯一主链（当前真实主入口）**

- Payment record submission form inside child-order detail payment section

**主入口列表**

- `components/payments/sales-order-payment-section.tsx`
- Wired from `components/sales-orders/sales-order-detail-section.tsx`
- Routed via `app/(dashboard)/orders/[id]/page.tsx` when the detail page is serving child-order compatibility mode

**兼容入口列表**

- `app/(dashboard)/payment-records/actions.ts` re-exports the same server action

**已废弃 / 应废弃入口**

- Any attempt to push payment submission into fulfillment workbench

**涉及的关键文件**

- `components/payments/sales-order-payment-section.tsx`
- `components/sales-orders/sales-order-detail-section.tsx`
- `app/(dashboard)/orders/[id]/page.tsx`
- `app/(dashboard)/orders/actions.ts`
- `app/(dashboard)/payment-records/actions.ts`

**每次改该能力时必须同步检查的入口**

- Child-order detail payment section
- Payment-records review list
- Redirect targets after submission
- Parent/detail links from payment-records list

**当前风险说明**

- Current mainline is still child-order anchored because payment truth is execution-layer scoped
- This is valid today, but easy to confuse with the new parent-order IA

---

### 9. View Collection Tasks

**唯一主链（当前真实主入口）**

- `/collection-tasks`

**主入口列表**

- Main page in `app/(dashboard)/collection-tasks/page.tsx`
- Trade-order detail payment/collection summary links
- Execution summary cards and finance/report shortcuts

**兼容入口列表**

- Query-param filtered links from parent detail or trade-order execution summaries

**已废弃 / 应废弃入口**

- Treating collection-task views as part of shipping workbench

**涉及的关键文件**

- `app/(dashboard)/collection-tasks/page.tsx`
- `components/payments/collection-tasks-section.tsx`
- `components/trade-orders/trade-order-detail-section.tsx`
- `components/trade-orders/trade-order-execution-summary-card.tsx`
- `lib/trade-orders/execution-links.ts`

**每次改该能力时必须同步检查的入口**

- Collection-task list
- Trade-order detail summaries
- Payment-records cross-links
- Report and dashboard shortcuts

**当前风险说明**

- Parent detail now links into collection context correctly
- Child-detail links still exist for compatibility and must not be mistaken for new mainline

---

### 10. Manage Customer Public Pool

**唯一主链（当前真实主入口）**

- `/customers/public-pool`

**主入口列表**

- Customer center quick action in `components/customers/customer-center-workbench.tsx`
- Public-pool workbench in `components/customers/public-pool-workbench.tsx`
- Team rules page in `components/customers/public-pool-settings-workbench.tsx`
- Reports page in `components/customers/public-pool-reports-workbench.tsx`

**兼容入口列表**

- Customer detail back-links may return to public-pool context through `from=public-pool`

**已废弃 / 应废弃入口**

- Any attempt to rebuild public pool as a Lead-only workbench
- Any attempt to move team rules or reports out of the public-pool domain

**涉及的关键文件**

- `app/(dashboard)/customers/public-pool/page.tsx`
- `app/(dashboard)/customers/public-pool/actions.ts`
- `app/(dashboard)/customers/public-pool/settings/page.tsx`
- `app/(dashboard)/customers/public-pool/reports/page.tsx`
- `components/customers/public-pool-workbench.tsx`
- `components/customers/public-pool-settings-workbench.tsx`
- `components/customers/public-pool-reports-workbench.tsx`
- `lib/customers/ownership.ts`
- `lib/customers/public-pool.ts`
- `lib/customers/public-pool-auto-assign.ts`
- `lib/customers/public-pool-recycle.ts`
- `lib/customers/public-pool-settings.ts`

**每次改该能力时必须同步检查的入口**

- Customer center quick action
- Public-pool claim / assign / release actions
- Inactive recycle and owner-exit recycle preview/apply
- Auto-assign preview/apply and round-robin cursor behavior
- Public-pool settings and reports links
- Customer detail return-to-public-pool context

**当前风险说明**

- The public pool is already a `Customer ownership lifecycle` surface, not a Lead 2.0 page
- Auto-assign, recycle, reports, and settings are already wired together and should not drift into disconnected pseudo-features

---

## Customer-Center Entry Audit

### Customer Card Quick Actions

**当前主链**

- Call customer
- View call records
- Create `TradeOrder` through customer-scoped new-order route

**关键文件**

- `components/customers/customer-list-card.tsx`
- `components/customers/customers-table.tsx`

**当前风险说明**

- Mainline is fixed
- Internal prop naming like `canCreateSalesOrder` is still legacy-flavored and can confuse future edits

---

### Customer Detail CTA Audit

**当前主链**

- Orders tab CTA opens customer-scoped `TradeOrder` composer
- Existing record cards link to parent order detail first

**关键文件**

- `components/customers/customer-detail-workbench.tsx`
- `app/(dashboard)/customers/[id]/page.tsx`

**当前风险说明**

- Mainline is mostly unified
- Historical order cards still carry compatibility behavior because some records may still resolve through child-order ids

---

### Empty-State CTA Audit

High-risk empty states that should be checked when a capability is cut over:

- Trade-order list empty state -> `/customers`
- Shipping batch empty state -> back to shipping execution
- Product list empty state -> create product / reset filters
- Supplier list empty state -> create supplier / reset filters
- Customer list empty states and reset actions

**当前风险说明**

- Empty-state buttons are often forgotten during cutovers
- They can silently reopen legacy workflows even when primary buttons are already unified

---

### Hover / Dropdown / More-Action Audit

High-risk surfaces that must be checked in addition to primary page buttons:

- Customer list card hover/mobile action set
- Trade-order list “更多” dropdown
- Trade-order list logistics hover-card
- Trade-order detail supplier summary actions
- Shipping execution supplier-level more-actions and latest-batch actions

**当前风险说明**

- These are the easiest places for legacy routes to survive after the main page is cut over

---

## Compatibility Routes and Redirects

### Active Compatibility Routes

- `/orders` -> `/fulfillment?tab=trade-orders`
- `/shipping` -> `/fulfillment?tab=shipping`
- `/shipping/export-batches` -> `/fulfillment?tab=batches`
- `/suppliers` -> `/products?tab=suppliers`
- `/orders/[id]` -> parent-first detail, child fallback compatibility mode

### Current Redirect Owners

- `app/(dashboard)/orders/page.tsx`
- `app/(dashboard)/shipping/page.tsx`
- `app/(dashboard)/shipping/export-batches/page.tsx`
- `app/(dashboard)/suppliers/page.tsx`
- `app/(dashboard)/orders/[id]/page.tsx`

### Current Risk

- Redirect pages are already correct, but `/orders/[id]` remains a mixed-mode compatibility surface and is the most important route to re-check whenever order detail behavior changes

---

## Unified vs Residual Summary

### Already Unified

- Customer-scoped order creation -> `TradeOrder` composer
- Fulfillment domain entry -> `/fulfillment`
- Shipping execution -> `/fulfillment?tab=shipping`
- Batch records -> `/fulfillment?tab=batches`
- Product and supplier domain -> `/products` + `/products?tab=suppliers`

### Residual / Compatibility / Watchlist

- `/orders/[id]` dual-mode parent/child detail behavior
- `SalesOrderForm` code still exists and should remain non-mainline
- Payment record submission is still child-order anchored
- Some internal naming and counters still use old `SalesOrder` language
- Parent-detail and execution pages still carry some child-detail compatibility links by design

---

## Every Cutover Must Check

When changing any workflow, always answer these before shipping:

1. What is the new unique mainline entrypoint?
2. Which old entrypoints are still compatibility-only?
3. Which old entrypoints should now be explicitly deprecated?
4. Which CTA, hover action, empty-state button, dropdown item, and “more” action must be updated together?
5. Which redirect or compatibility routes must still be verified after the cutover?
6. Did any parent-detail, child-detail, shipping, payment, or batch cross-link silently keep the old route alive?
7. Did the empty-state CTA reopen an old workflow?
8. Did contextual shortcuts remain aligned with the same mainline instead of growing a second implementation?
