---
name: implement-milestone
description: Implement exactly one milestone or one explicitly bounded scope at a time for the liquor CRM project by first reading project docs and relevant code, then making localized changes, validating with lint/build, and summarizing outputs clearly.
---

# Implement Milestone

## Purpose

Use this skill when the user asks to implement:

- one milestone
- one bounded phase
- one clearly scoped module change
- one contained refactor
- one explicitly limited safety / bugfix / UI / data-flow task

This is the orchestration skill for milestone delivery.  
It controls scope, sequencing, and completion quality.

## Priority note

Follow `AGENTS.md` as the repository-wide baseline.  
This skill does not weaken project-wide rules.

When another specialized skill is also relevant, this skill controls **scope** while the specialized skill controls **implementation style**.

Examples:

- `crm-ui-foundation` controls UI structure/style
- `rbac-crm-check` controls auth/permission review depth
- `prisma-migrate-and-seed` controls schema/migration workflow

## Typical trigger phrases

This skill is especially relevant when the user asks things like:

- 现在开始 Milestone 4
- 只实施 Milestone 5
- 继续做下一步
- 按计划推进下一个阶段
- 先不要做后面的模块
- only implement this milestone
- implement milestone 6 only
- continue with the next milestone
- 这次只做这一期
- 先只收口这一块
- 不要扩 scope

## Required files to read first

Before making changes, inspect these files if they exist:

1. `README.md`
2. `PRD.md`
3. `PLANS.md`
4. `AGENTS.md`
5. `UI_ENTRYPOINTS.md`
6. `DESIGN.md` when the task touches UI / page structure / UX / shared components
7. `HANDOFF.md` when the task touches cutover / compatibility / historical flow
8. `prisma/schema.prisma` when the task touches schema or DB-facing logic
9. the relevant route, component, data access, auth, and feature files for this scope

If the requested milestone is attached to an existing module, inspect that module before changing anything.

## Operating rules

1. Implement exactly one milestone or one explicitly requested bounded scope.
2. Do not leak future milestone work into the current implementation.
3. Do not silently redesign core business rules.
4. Respect explicit repository constraints, especially:
   - Lead and Customer stay separate
   - Customer remains the sales execution mainline
   - TradeOrder remains the transaction mainline
   - payment / fulfillment truth must not be re-blended
   - role-based access must remain correct
   - important actions must remain auditable
5. Prefer extending existing patterns before introducing new architecture.
6. Keep changes localized and reviewable.
7. Do not introduce unnecessary dependencies.
8. Do not refactor unrelated files unless required for correctness, consistency, or the requested cutover.
9. Preserve repository-wide standards from `AGENTS.md` even when another skill is also active.
10. If the scope is UI-only, do not silently modify schema, server actions, route mainlines, or compatibility routes.
11. If the scope is safety-only, do not mix in unrelated audits or cleanup work.

## UI-heavy milestone rule

If the task is primarily a UI / UX redesign, do NOT fake completion with spacing-only edits.

When the request is about any of the following:

- 更高级
- 更像大厂
- 更少滚动
- 更有层次
- 更像企业 SaaS
- 更精致
- 更紧凑
- 更清晰
- 重构 UI
- 页面结构升级

you must allow structure-level refactoring inside the requested scope.

For UI-heavy work, follow `DESIGN.md` and `UI_ENTRYPOINTS.md`, and prioritize changes in this order:

1. page structure
2. component hierarchy
3. information density
4. progressive interactions
5. list / detail boundaries
6. shared page shell / filter / KPI / card / table primitives
7. detail polish

Do NOT pretend a redesign is complete by only:

- shrinking font size
- reducing spacing a little
- changing border radius only
- recoloring existing heavy layouts
- adding more shadows or badges
- replacing text without changing hierarchy

If the old structure is the real problem, replace the structure inside the requested scope.

## Required workflow

### Step 1: Understand the requested scope

Clarify internally:

- what this milestone / bounded scope must deliver
- what it must not include
- which existing files matter
- which permissions or data flows are involved
- which route / compatibility / UI entrypoints are affected
- what validation proves completion

### Step 2: Inspect the current code

Read:

- current route/page files
- shared components
- shared shells / layouts if relevant
- data access or server-side logic
- auth / permission helpers
- navigation helpers
- relevant Prisma models if needed
- compatibility redirect or entrypoint files if relevant

Do not assume the current implementation is empty or wrong by default.

### Step 3: Implement only the requested scope

Examples:

- if asked for Milestone 4, do not start Milestone 5
- if asked for UI unification, do not redesign business logic
- if asked for records listing, do not also build import/export
- if asked for redirectTo safety, do not widen into unrelated security work
- if asked for a page polish, do not rewrite the entire domain

### Step 4: Reuse shared patterns deliberately

Prefer:

- existing layout shells
- shared state handling
- shared empty / loading / error patterns
- shared permission helpers
- shared navigation helpers
- shared action-notice / redirect helpers when relevant

But if the task is UI-heavy, you may restructure the page composition inside the requested scope when the existing composition is the main quality problem.

### Step 5: Respect permissions and auditability

Whenever a milestone includes data access or user actions:

- consider SUPERVISOR scope
- consider SALES ownership scope
- consider OPS / SHIPPER restrictions where relevant
- do not expose data broadly by default
- verify whether important actions still preserve `OperationLog` or equivalent traceability

### Step 6: Validate

Before finishing, run:

- `npm run lint`
- `npm run build`

If the milestone includes schema or seed changes, also run or recommend:

- `npx prisma validate`
- `npx prisma generate`
- migration commands
- seed commands when needed

## What to avoid

- do not implement multiple milestones at once
- do not merge Lead and Customer into one Contact model
- do not add external integrations unless explicitly requested
- do not replace working local-dev flows with deployment-only flows
- do not leave silent permission gaps
- do not ship fake UI redesigns that only adjust spacing
- do not silently drift mainline routes or compatibility routes
- do not mix unrelated cleanup into a bounded milestone

## Definition of done

A milestone or bounded scope is complete only when:

- the requested scope is implemented
- future work was not silently included
- code compiles
- `npm run lint` passes
- `npm run build` passes
- permissions were considered where relevant
- route / entrypoint integrity remains correct where relevant
- traceability remains correct where applicable

## Required final response format

Always end with all of the following:

1. **Completed**
   - what was implemented in this milestone / scope

2. **Files changed**
   - new files
   - modified files

3. **Validation**
   - exact commands run
   - whether lint / build passed

4. **Notes**
   - remaining risks, follow-up items, deferred work, or next recommended refinement