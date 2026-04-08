# AGENTS.md

## Project

This repository is a private CRM for a liquor private-domain sales team.

It is not a generic ERP.  
Its primary purpose is to support the real business chain of:

- lead intake
- deduplication and lead-to-customer merging
- lead assignment
- customer ownership and customer work queues
- sales follow-up
- live-session invitation and conversion
- order creation and review
- payment collection and collection tasks
- shipping execution
- logistics follow-up
- auditability

---

## Product baseline

The current business baseline of this repository is:

- `Lead` is for intake, source, deduplication, assignment, and audit
- `Customer` is the main business object for sales execution
- `Customer.ownerId` is the primary ownership field for sales-side work
- Sales should primarily work from `/customers`, not `/leads`
- `/leads` is primarily an ADMIN / SUPERVISOR intake, review, and assignment area
- Team and account management are part of the system baseline, not optional extras
- `TradeOrder` is the transaction master record
- `SalesOrder` is the supplier sub-order execution record under `TradeOrder`
- `ShippingTask` is the fulfillment execution record
- `PaymentPlan`, `PaymentRecord`, and `CollectionTask` are the payment-layer baseline
- `LogisticsFollowUpTask` is independent from order status and shipping status
- `/products` is the single first-level entry for the product domain
- supplier management lives inside `/products?tab=suppliers`, not as a separate first-level workbench
- `OPS` and `SHIPPER` must not be silently expanded into sales customer views
- Important business actions must remain traceable through `OperationLog`

---

## Product goals

Build a sales execution and customer operating platform covering:

- lead intake
- lead assignment
- call follow-up
- wechat follow-up records
- live session invitation and watch records
- customer work queues
- supplier / product / SKU baseline
- sales orders
- payment plans and payment records
- collection tasks
- shipping tasks
- shipping export batches
- logistics follow-up tasks
- dashboard and audit logs
- organization, teams, and internal account management

---

## Tech stack

- Next.js 15
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- MySQL
- NextAuth

---

## Repository-wide rules

- Read `PRD.md` before making large changes.
- Read `PLANS.md` before starting a new milestone.
- Plan first for complex work.
- Keep the current sales-execution mainline stable.
- Do not introduce unnecessary dependencies.
- Use Prisma for all database modeling.
- Keep business enums centralized.
- All important actions must write operation logs.
- Add loading, empty, and error states.
- Respect role-based permissions.
- Do not rely on UI hiding alone for RBAC.
- Prefer additive evolution over destructive rewrites.
- Avoid rewriting stable modules unless explicitly required.
- Keep Prisma enum runtime usage out of frontend/shared/module-init risk chains; use local runtime constants there and reserve Prisma enums for database typing and backend truth/query/service layers.

---

## Prisma enum runtime rules

- Prisma enums are for database types, Prisma schema alignment, backend constraints, and server-side truth/query/service layers.
- Do not use Prisma enums as runtime constant objects in frontend, shared, metadata, settings, workbench, filter, page-level option builders, or other files that may execute during module initialization.
- In those runtime-facing modules, do not write `PrismaEnum.X` or `Object.values(PrismaEnum)`.
- Runtime options, labels, default values, and form choices must come from local string constants or metadata constants that stay aligned with Prisma enum values.
- Prefer `import type` when a module only needs enum typing.
- When a server action or service needs input validation, prefer validating against local runtime constants such as `z.enum(MY_VALUES)` instead of depending on Prisma enum runtime objects in shared/front-end risk chains.
- If a module may be imported by the client, shared UI, or page initialization path, assume Prisma enum runtime objects are unsafe there unless there is a strong server-only reason and the file stays fully inside backend truth/query/service code.

---

## Current role rules

### ADMIN
- full platform visibility
- can manage organization, users, teams, and system-level settings
- can view all customers, orders, payments, fulfillment, and logs

### SUPERVISOR
- team-level business owner
- can review leads, assignments, team customers, team orders, and team collection tasks
- can approve or reject sales orders
- can coordinate fulfillment and collection within team scope

### SALES
- primary working area is `/customers`
- can only work on owned / assigned customers
- can create and edit own sales orders
- can submit payment records for owned customers
- can work own collection tasks
- can view own customers' shipping and logistics results
- does not use `/shipping` as an operational workbench

### OPS
- works on live-session and operating configuration areas
- may assist with live-session product binding or gift-related coordination
- does not become a default payment or fulfillment operator
- does not inherit sales-customer visibility

### SHIPPER
- primary working area is `/fulfillment?tab=shipping`
- handles report/export, supplier submission, tracking number fill-in, and fulfillment status progression
- may access `/live-sessions` to create or maintain live-session basics for activity collaboration and result lookback
- may maintain fulfillment-related product and supplier master data in `/products` when execution collaboration requires it
- can view fulfillment-relevant amount summaries in read-only fashion
- does not confirm payments
- does not inherit sales-customer visibility through live-session access

### FINANCE
- currently optional / reserved
- if enabled later, should focus on payment visibility, reconciliation, exceptions, and finance workflows
- do not assume FINANCE is fully active unless the milestone explicitly enables it

---

## Business object boundaries

### Lead
Use `Lead` for:
- raw intake
- source tracking
- deduplication
- assignment
- import / merge / allocation audit trail

### Customer
Use `Customer` for:
- sales ownership
- work queues
- calls / wechat / live records
- sales orders
- payment and collection visibility
- fulfillment result visibility
- long-term customer operations

### TradeOrder
Use `TradeOrder` for:
- the transaction master record
- what was sold in one commercial deal
- what gifts or bundles were attached to that deal
- parent-level review truth
- parent-level amount summaries
- parent-level receiver snapshots

### TradeOrderItem
Use `TradeOrderItem` for:
- the sales-side parent line
- `SKU / GIFT / BUNDLE` line semantics
- parent-level pricing snapshots for the sold line
- bundle parent rows before execution expansion

### TradeOrderItemComponent
Use `TradeOrderItemComponent` for:
- the execution split source of truth
- supplier grouping
- bundle expansion
- gift execution components
- the rows that eventually materialize into `SalesOrderItem`

### SalesOrder
Use `SalesOrder` for:
- one supplier sub-order under a `TradeOrder`
- supplier-scoped amount snapshots
- supplier-scoped execution entrypoints
- compatibility review state mirror for legacy pages and filters
- the child anchor for payment and fulfillment execution

Do not use `SalesOrder` as the single source of truth for actual collection state.

### PaymentPlan
Use `PaymentPlan` for:
- what should be collected
- collection stage
- collection channel
- outstanding amount structure

### PaymentRecord
Use `PaymentRecord` for:
- what was actually submitted as a payment
- who submitted it
- who confirmed it
- whether it is confirmed or rejected

### CollectionTask
Use `CollectionTask` for:
- pending collection work
- follow-up work on unpaid or partially paid plans
- COD / balance / freight follow-up if the milestone needs it

### ShippingTask
Use `ShippingTask` for:
- fulfillment execution
- report status
- shipping status
- shipping provider and tracking number
- shipping-side snapshots and execution metadata

Do not turn `ShippingTask` into the transaction master or payment master.

### GiftRecord
Use `GiftRecord` for:
- marketing / activity gift eligibility and gift fulfillment semantics
- freight-related collection may connect into the payment layer
- do not merge `GiftRecord` with `SalesOrderGiftItem`

### SalesOrderGiftItem
Use `SalesOrderGiftItem` for:
- read-only compatibility for legacy order gifts
- history migration lookup only
- never use it as a substitute for `GiftRecord`
- never extend it as the new write path for order gifts

---

## Layering rules

For product, order, payment, shipping, and finance changes, always keep these layers separate:

### product layer
- `Supplier`
- `Product`
- `ProductSku`
- `ProductBundle`
- `PriceBook`
- `PriceBookItem`
- `LiveSessionProduct`

### transaction layer
- `TradeOrder`
- `TradeOrderItem`
- `TradeOrderItemComponent`
- `SalesOrder`
- `SalesOrderItem`
- `SalesOrderGiftItem` (legacy read-only compatibility)

### payment layer
- `PaymentPlan`
- `PaymentRecord`
- `CollectionTask`

### fulfillment layer
- `ShippingTask`
- `ShippingExportBatch`
- `LogisticsFollowUpTask`
- `CodCollectionRecord`

### finance / reconciliation layer
- finance confirmation
- reconciliation views
- exception handling
- later finance workflows

Important:
- do not collapse these layers into one giant table or workflow
- do not push payment truth back into a single payment-status field
- do not make fulfillment logic the source of truth for collection logic
- do not make finance views the source of truth for payment or fulfillment

---

## Order and payment rules

### Supplier rule
- a `TradeOrder` may contain items from multiple suppliers
- a `SalesOrder` still allows exactly one `supplierId`
- cross-supplier deals must be split into multiple supplier sub-orders under one `TradeOrder`

### Shipping rule
- a `SalesOrder` currently allows exactly one primary `ShippingTask`
- do not casually introduce multi-shipment behavior unless the milestone explicitly upgrades the model

### Review flow
- new or updated `TradeOrder` records must respect review flow
- typical review states:
  - `PENDING_REVIEW`
  - `APPROVED`
  - `REJECTED`
- rejected trade orders should be editable and resubmittable where the product flow requires it
- `SalesOrder.reviewStatus` is only a compatibility mirror and must not become the review source of truth again

### Order pricing rule
- original list price is read-only at order-entry time
- sales should primarily enter deal price
- discount amount should be derived, not manually invented in conflicting ways
- if deal price is below default unit price, require a discount reason

### Receiver / price snapshots
- order receiver data must be snapshotted
- product name, SKU/spec, original price, and deal price must be snapshotted
- do not depend on mutable current master data for historical orders

### paymentScheme rule
`paymentScheme` is an order-side scenario classifier, not the final payment truth.

Examples:
- `FULL_PREPAID`
- `DEPOSIT_PLUS_BALANCE`
- `FULL_COD`
- `DEPOSIT_PLUS_COD`

It may be used to generate `PaymentPlan`, but it must not replace the payment layer.

---

## Fulfillment rules

### Report vs shipped
- reported to supplier is not the same as shipped
- filling the tracking number is the point where shipped state becomes valid
- keep report status and shipping status separate

### Logistics follow-up
- `LogisticsFollowUpTask` is independent
- do not bury logistics follow-up into order or shipping status fields
- if tracking is first filled in, creating a logistics follow-up task is usually expected

### COD
- COD is not the same as “already collected”
- fulfillment may move forward before COD is confirmed
- use a fulfillment-side COD structure like `CodCollectionRecord` if the milestone needs it
- later payment confirmation and finance views should be able to reconcile COD properly

---

## Legacy cutover rules

These are repository-wide rules for V2 cutover and legacy retirement.

### Frozen legacy write paths
- new orders must not write to legacy `Order`
- new commerce write paths must write through `TradeOrder` first
- new fulfillment must not write through legacy `ShippingTask.orderId`
- legacy `Order` is read-only compatibility only
- legacy `ShippingTask.orderId` is read-only compatibility only

### Gift fulfillment compatibility
- `ShippingTask.giftRecordId` may remain temporarily as a gift-fulfillment compatibility path
- do not delete it casually unless the milestone explicitly finishes gift-fulfillment migration

### Cleanup order
When deleting legacy structures, follow this order strictly:
1. page cutover
2. service-layer freeze
3. history migration / archive verification
4. schema cleanup

### History policy
- history must be migrated or archived, not silently discarded
- do not drop legacy tables or fields before verifying no remaining dependencies
- read-only legacy access may continue for a period, but it must not remain a primary write path

### No continued expansion
- do not extend legacy `Order` with new business logic
- do not extend legacy `ShippingTask.orderId` path with new business logic
- all new commerce work must land on the V2 structures

---

## Navigation and information architecture rules

The sidebar and product information architecture are business-domain driven, not table-driven.

### Expected business-domain grouping
- workspace
- customer operations
- commerce / product
- fulfillment
- analytics
- settings

### Strong grouping rules
- lead center and import center belong together
- supplier center and product center belong together
- keep Product Center as the first-level navigation entry and treat supplier management as a secondary capability inside it
- sales should not be given shipping as a primary work area
- shipper may use Product Center for fulfillment-related product and supplier maintenance, but `/fulfillment` remains the primary work area

### Role-aware navigation
- do not assume every role sees the same tree
- new modules must define who sees them and why

---

## Migration-safe design rules

Before major schema or flow changes:
- output a migration-safe redesign plan first
- identify retained models
- identify upgraded models
- identify new models
- explain compatibility with current pages and data
- explain which legacy write paths are being frozen

When changing Prisma schema:
- prefer additive changes first
- preserve compatibility while pages and services are switching
- only delete fields or tables after cutover is real
- if needed, provide archive or read-only compatibility strategy

---

## UI and workflow rules

- reuse shared UI before creating page-local variants
- keep page responsibilities clear
- do not overload one page with intake, execution, fulfillment, and finance all together
- keep loading / empty / error states present
- prefer role-appropriate defaults over giant one-size-fits-all pages

Examples:
- sales order creation should usually start from customer context
- shipping views should be supplier- and status-oriented
- finance views should be summary-, exception-, and reconciliation-oriented

---

## Auditability rules

The following categories must preserve `OperationLog` coverage:

- user / team creation, edit, disable, reset password
- lead import / dedup / merge / assignment
- customer ownership changes
- supplier / product / SKU maintenance
- order creation / update / review / rejection / resubmission
- payment record submission / confirmation / rejection
- collection task state changes
- shipping export, supplier reporting, tracking fill-in, fulfillment status changes
- COD result changes
- important exception closure or correction actions

If a workflow becomes less traceable after your change, the change is incomplete.

---

## Validation

Before finishing:
- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npm run build`

If schema changes are involved, also recommend or run where appropriate:
- migration commands
- backfill commands
- seed commands if local demo data is affected

---

## Definition of done

A task is done only when:

- code compiles
- lint passes
- build passes
- permissions are correct
- important actions are traceable
- changes are aligned with `PRD.md`
- changes are aligned with `PLANS.md`
- changes do not accidentally break the current sales-execution mainline
- changes do not collapse product / transaction / payment / fulfillment / finance layers back into one mixed model
