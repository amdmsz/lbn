---
name: rbac-crm-check
description: Use this skill to review and enforce role-based access control in the liquor CRM, including authentication, route protection, sidebar visibility, server-side filtering, action permissions, ownership checks, compatibility-route safety, and auditability with repository-wide lint/build validation.
---

# RBAC CRM Check

## Purpose

Use this skill when implementing or reviewing:

- authentication / authorization
- route protection
- sidebar visibility
- server-side data filtering
- action permissions
- ownership checks
- module-level access
- compatibility-route behavior tied to access control
- permission-sensitive server actions
- auditability around privileged business actions

## Repository-wide standards

This skill does not override `AGENTS.md`.

Even when this skill is triggered alone, repository-level completion rules still apply:

- `npm run lint`
- `npm run build`

If permission logic touches critical business actions, traceability requirements must still be preserved.

## Priority note

Follow `AGENTS.md` as the repository-wide baseline.  
This skill provides task-specific workflow guidance and must not weaken project-wide standards.

If another skill is also active:

- `implement-milestone` controls scope
- this skill controls permission review depth
- `crm-ui-foundation` may control UI exposure/polish
- `prisma-migrate-and-seed` may be relevant if ownership schema changes

## Core RBAC expectations for this project

These are the default role expectations unless the user explicitly changes them.

## ADMIN

- full system access
- can view all data
- can access system-level settings and administration areas
- can inspect full order / payment / fulfillment / audit data

## SUPERVISOR

- can view all leads and team/customer operational data where intended
- can assign leads
- can review team activity
- can access team-level operational views and reports
- can review/coordinate work across sales-facing modules where intended

## SALES

- should only see owned / assigned business records by default
- works primarily from `/customers`
- can act on customers or leads they are responsible for
- should not see full-team data unless explicitly intended
- should not gain fulfillment-wide or finance-wide visibility by default

## OPS

- focuses on live-session and operations workflows
- may manage live-session or operational records where intended
- does not automatically inherit broad sales/customer/order/payment visibility
- should not enter transaction/payment main workbenches without explicit design

## SHIPPER

- focuses on shipping / fulfillment related tasks
- should mainly operate in fulfillment execution scope
- should not get broad customer or sales workflow access by default
- may see only limited commercial summaries where needed for execution

## Files to inspect first

Read these before making access-control changes:

1. `README.md`
2. `PRD.md`
3. `PLANS.md`
4. `AGENTS.md`
5. `UI_ENTRYPOINTS.md`
6. auth configuration
7. middleware / route protection files
8. sidebar or navigation config
9. relevant data access functions / queries
10. relevant server actions / mutations
11. feature files for the module being worked on

If route behavior or redirects are affected, check the relevant mainline/compatibility route definitions in `UI_ENTRYPOINTS.md`.

## Required review areas

Whenever applying this skill, check all of these layers:

## 1. Authentication layer

- is the user authenticated?
- is session data available where needed?
- does session include role / user id?
- are unauthenticated access paths blocked where expected?

## 2. Route access

- are protected routes blocked for unauthenticated users?
- are module routes limited by role where appropriate?
- do compatibility routes preserve the same access boundaries?
- do redirects avoid leaking into views a role should not reach?

## 3. Navigation visibility

- does the sidebar/menu only show relevant sections for the current role?
- is hidden navigation aligned with actual route protections?
- does a hidden menu item still remain safely blocked server-side?

## 4. Server-side data access

- are queries filtered by ownership where needed?
- are SUPERVISOR / ADMIN exceptions handled intentionally?
- is SALES data scope actually enforced on the server, not just the UI?
- are SHIPPER / OPS restricted to intended domain slices?

## 5. Action-level permissions

- can the current role perform the action?
- examples:
  - assign leads
  - create records
  - update records
  - view full lists
  - manage live sessions
  - update shipping status
  - submit payment records
  - change ownership
  - approve / review / recycle / auto-assign

## 6. Leakage risks

- do detail pages expose records by ID without ownership checks?
- do list endpoints return full data to SALES?
- do counts / aggregates leak team-wide information unintentionally?
- do compatibility routes accidentally bypass new access checks?
- do redirect targets send users into scopes they should not access?

## 7. Auditability and traceability

When permission changes affect important business actions, verify that traceability is still preserved.

Examples:

- lead assignment
- owner changes
- status mutations
- review / approval actions
- shipping status updates
- public-pool claim / assign / release / auto-assign / recycle
- creation of important follow-up or payment-related records

For these actions, check whether `OperationLog` should be written or preserved.  
Do not weaken auditability while tightening or refactoring permissions.

## Review checklist by module

## Leads

- SUPERVISOR can view broader lead data where intended
- SALES only sees own leads
- only allowed roles can assign / review leads

## Customers

- SUPERVISOR can view intended broader customer scope
- SALES only sees own customers by default
- customer detail pages must enforce ownership or supervisor/admin override
- public-pool flows must respect explicit rule boundaries

## Call records / follow-up records / WeChat records

- SALES may only create/view records for owned customers
- SUPERVISOR can review broader team data where intended
- cross-linked detail pages must preserve the same ownership logic

## Orders / payment / collection

- parent and child detail access must stay intentional
- SALES should not see non-owned business records by default
- payment and collection views should not leak full-team execution data without intent
- child-detail compatibility flows must not weaken access rules

## Fulfillment / shipping

- SHIPPER should mainly operate in fulfillment execution scope
- fulfillment actions must be explicitly guarded
- shipping execution should not automatically grant broad customer visibility
- contextual order/customer links must preserve access constraints

## Products / suppliers

- access should follow actual business role design
- hidden menus alone are not enough
- mutations must still be role-guarded on the server

## Public pool

- claim / assign / release / recycle / auto-assign actions must be explicit
- list visibility must match intended team/global scope
- settings/report pages must not leak out of intended roles

## Enforcement guidance

When permission logic is missing, prefer:

- explicit helper functions
- explicit role checks
- explicit ownership checks
- shared access utilities reused across modules
- server-side filtering as the real source of truth

Avoid scattered ad hoc conditionals if a shared access helper would make behavior clearer.

## Validation

Before finishing:

- `npm run lint`
- `npm run build`

If permission logic affects server-side actions, also review whether the affected actions still produce the expected logs or remain traceable.

If route behavior changed, re-check the relevant entrypoints from `UI_ENTRYPOINTS.md`.

## What to avoid

- do not rely on UI hiding alone
- do not assume page-level protection is enough without server-side filtering
- do not widen SALES access silently
- do not let OPS / SHIPPER inherit broad access “for convenience”
- do not break existing legitimate supervisor/admin workflows
- do not forget compatibility routes when tightening access
- do not improve UI while leaving the backend permission hole open

## Definition of done

RBAC review or implementation is done when:

- route access matches expected roles
- sidebar visibility is aligned with route rules
- server-side data access is properly filtered
- action permissions are explicit
- obvious data leakage paths are closed
- compatibility routes do not bypass access logic
- important actions remain auditable where applicable

## Required final response format

Always end with:

1. **RBAC coverage**
   - what layers were checked or implemented

2. **Role behavior**
   - what each relevant role can now view or do in this module

3. **Risk fixes**
   - any permission leaks or inconsistencies that were corrected

4. **Remaining concerns**
   - anything still needing manual verification or future tightening