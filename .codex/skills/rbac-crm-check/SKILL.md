---
name: rbac-crm-check
description: 用于检查和落实酒水 CRM 的角色权限控制：认证、路由保护、菜单可见性、服务端数据过滤、动作权限、ownership 校验，以及权限相关的重要动作是否写入 OperationLog。完成后仍需遵守仓库级标准：npm run lint 与 npm run build。 Use this to review and enforce role-based access control in the liquor CRM, including auditability and repository-wide validation.
---

# Purpose

Use this skill when implementing or reviewing:

- authentication / authorization
- route protection
- sidebar visibility
- server-side data filtering
- action permissions
- ownership checks
- module-level access in the liquor CRM project

# Repository-wide standards

This skill does not override `AGENTS.md`.

Even when this skill is triggered alone, repository-level completion rules still apply:

- `npm run lint`
- `npm run build`

If permission logic touches critical business actions, traceability requirements must still be preserved.

# Priority note

Follow `AGENTS.md` as the repository-wide baseline.  
This skill provides task-specific workflow guidance and must not weaken project-wide standards.

# Core RBAC expectations for this project

These are the default role expectations unless the user explicitly changes them.

## ADMIN
- full system access
- can view all data
- can access system-level settings and administration areas

## SUPERVISOR
- can view all leads and customers
- can assign leads
- can review team activity
- can access team-level operational views and reports

## SALES
- should only see owned / assigned business records by default
- can act on customers or leads they are responsible for
- should not see full-team data unless explicitly intended

## OPS
- focuses on live-session and operations workflows
- may manage live-session records
- may view broader live-related operational data if the module requires it
- should not automatically get broad sales/customer access without reason

## SHIPPER
- focuses on shipping / fulfillment related tasks
- should not get broad customer or sales workflow access by default

# Files to inspect first

Read these before making access-control changes:

1. `PRD.md`
2. `PLANS.md`
3. `AGENTS.md`
4. auth configuration
5. middleware / route protection files
6. sidebar or navigation config
7. relevant data access functions / queries
8. feature files for the module being worked on

# Required review areas

Whenever applying this skill, check all of these layers:

## 1. Authentication layer
- is the user authenticated?
- is session data available where needed?
- does session include role / user id?

## 2. Route access
- are protected routes blocked for unauthenticated users?
- are module routes limited by role where appropriate?

## 3. Navigation visibility
- does the sidebar/menu only show relevant sections for the current role?
- is hidden navigation aligned with actual route protections?

## 4. Server-side data access
- are queries filtered by ownership where needed?
- are SUPERVISOR / ADMIN exceptions handled intentionally?
- is SALES data scope actually enforced on the server, not just the UI?

## 5. Action-level permissions
- can the current role perform the action?
- examples:
  - assign leads
  - create records
  - update records
  - view full lists
  - manage live sessions
  - update shipping status

## 6. Leakage risks
- do detail pages expose records by ID without ownership checks?
- do list endpoints return full data to SALES?
- do counts / aggregates leak team-wide information unintentionally?

## 7. Auditability and traceability
When permission changes affect important business actions, verify that traceability is still preserved.

Examples:

- lead assignment
- owner changes
- status mutations
- review / approval actions
- shipping status updates
- creation of important follow-up records

For these actions, check whether `OperationLog` should be written or preserved.  
Do not weaken auditability while tightening or refactoring permissions.

# Review checklist by module

## Leads
- SUPERVISOR can view all
- SALES only sees own leads
- only allowed roles can assign leads

## Customers
- SUPERVISOR can view all
- SALES only sees own customers
- customer detail pages must enforce ownership or supervisor/admin override

## Call records
- SALES may only create/view records for owned customers
- SUPERVISOR can review team data where intended

## Wechat records
- same ownership principles as call records

## Live sessions / invitations
- SUPERVISOR broad visibility where needed
- SALES limited to own relevant customers
- OPS may get broader live-session management access if intended

## Orders / gifts / shipping
- visibility and mutation should reflect actual business role needs
- SHIPPER should mainly operate in fulfillment scope

# Enforcement guidance

When permission logic is missing, prefer:

- explicit helper functions
- explicit role checks
- explicit ownership checks
- shared access utilities reused across modules

Avoid scattered ad hoc conditionals if a shared access helper would make behavior clearer.

# Validation

Before finishing:

- `npm run lint`
- `npm run build`

If permission logic affects server-side actions, also review whether the affected actions still produce the expected logs or remain traceable.

# What to avoid

- do not rely on UI hiding alone
- do not assume page-level protection is enough without server-side filtering
- do not widen SALES access silently
- do not let OPS / SHIPPER inherit broad access “for convenience”
- do not break existing legitimate supervisor/admin workflows

# Definition of done

RBAC review or implementation is done when:

- route access matches expected roles
- sidebar visibility is aligned with route rules
- server-side data access is properly filtered
- action permissions are explicit
- obvious data leakage paths are closed
- important actions remain auditable where applicable

# Required final response format

Always end with:

1. **RBAC coverage**
   - what layers were checked or implemented

2. **Role behavior**
   - what each relevant role can now view or do in this module

3. **Risk fixes**
   - any permission leaks or inconsistencies that were corrected

4. **Remaining concerns**
   - anything still needing manual verification or future tightening