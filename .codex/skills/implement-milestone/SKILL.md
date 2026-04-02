---
name: implement-milestone
description: Implement exactly one milestone at a time for the liquor CRM project by first reading project docs and relevant code, then making localized changes, validating with lint/build, and summarizing outputs clearly.
---

# Implement Milestone

## Purpose

Use this skill when the user asks to implement one milestone, one bounded phase, or one clearly scoped module change in the liquor CRM project.

This skill is the orchestration skill for milestone delivery.  
It controls scope, sequencing, and completion quality.

## Priority note

Follow `AGENTS.md` as the repository-wide baseline.  
This skill does not weaken project-wide rules.

When another specialized skill is also relevant, this skill controls scope while the specialized skill controls implementation style.

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

## Required files to read first

Before making changes, inspect these files if they exist:

1. `PRD.md`
2. `PLANS.md`
3. `AGENTS.md`
4. `prisma/schema.prisma`
5. the relevant route, component, data access, auth, and feature files for this milestone

If the milestone is attached to an existing module, inspect that module before changing anything.

## Operating rules

1. Implement exactly one milestone or one explicitly requested bounded scope.
2. Do not leak future milestone work into the current implementation.
3. Do not silently redesign core business rules.
4. Respect explicit project constraints, especially:
   - Lead and Customer stay separate
   - role-based access must remain correct
   - important actions must remain auditable
5. Prefer extending existing patterns before introducing new architecture.
6. Keep changes localized and reviewable.
7. Do not introduce unnecessary dependencies.
8. Do not refactor unrelated files unless required for consistency or correctness.
9. Preserve repository-wide standards from `AGENTS.md` even when another skill is also active.

## UI-heavy milestone rule

If the task is primarily a UI / UX redesign, do NOT fake completion with padding or margin tweaks only.

When the request is about any of the following:

- 更高级
- 更像大厂
- 更少滚动
- 更有层次
- 更像企业 SaaS

you must allow structure-level refactoring inside the requested module.

For UI-heavy work, prioritize changes in this order:

1. page structure
2. component hierarchy
3. information density
4. progressive interactions
5. list / detail boundaries

Do NOT pretend a redesign is complete by only:

- shrinking font size
- reducing spacing a little
- changing border radius only
- recoloring existing heavy layouts

If the old structure is the real problem, replace the structure.

## Required workflow

### Step 1: Understand the requested scope

Clarify internally:

- what this milestone must deliver
- what it must not include
- which existing files matter
- which permissions or data flows are involved
- what validation proves completion

### Step 2: Inspect the current code

Read:

- current route/page files
- shared components
- data access or server-side logic
- auth / permission helpers
- relevant Prisma models if needed

Do not assume the current implementation is empty or wrong by default.

### Step 3: Implement only the requested scope

Examples:

- if asked for Milestone 4, do not start Milestone 5
- if asked for UI unification, do not redesign business logic
- if asked for records listing, do not also build import/export

### Step 4: Reuse shared patterns deliberately

Prefer:

- existing layout shells
- shared state handling
- shared empty / loading / error patterns
- shared permission helpers

But if the task is UI-heavy, you may restructure the page composition inside the requested scope when the existing composition is the main quality problem.

### Step 5: Respect permissions

Whenever a milestone includes data access or user actions:

- consider SUPERVISOR scope
- consider SALES scope
- consider OPS / SHIPPER restrictions if applicable
- do not expose data broadly by default

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

## Definition of done

A milestone is complete only when:

- the requested scope is implemented
- future work was not silently included
- code compiles
- `npm run lint` passes
- `npm run build` passes
- permissions were considered
- traceability remains correct where applicable

## Required final response format

Always end with all of the following:

1. **Completed**
   - what was implemented in this milestone

2. **Files changed**
   - new files
   - modified files

3. **Validation**
   - exact commands run
   - whether lint / build passed

4. **Notes**
   - remaining risks, follow-up items, or next recommended refinement
