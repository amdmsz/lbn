---
name: prisma-migrate-and-seed
description: Use this skill for Prisma schema changes, migrations, seed updates, and migration troubleshooting in the liquor CRM project, including MySQL / WSL / BT panel environment issues and clear runnable commands.
---

# Prisma Migrate and Seed

## Purpose

Use this skill when the task involves:

- editing `prisma/schema.prisma`
- creating or updating migrations
- preparing or fixing local seed data
- diagnosing Prisma migration issues
- aligning schema changes with milestone requirements
- clearing DB/schema/seed inconsistencies

## Priority note

Follow `AGENTS.md` as the repository-wide baseline.  
This skill provides task-specific workflow guidance and must not weaken project-wide standards.

If another skill is active:

- `implement-milestone` controls scope
- this skill controls schema/migration/seed workflow
- `rbac-crm-check` may also be relevant if schema changes affect ownership or access rules

## Project-specific modeling rules

These rules are mandatory for this repository:

1. **Lead and Customer must remain separate**
   - `Lead` = raw lead intake
   - `Customer` = deduplicated customer entity
   - one Customer may relate to multiple Leads

2. **Do not overdesign the schema**
   Keep the schema suitable for the current milestone unless the user explicitly asks for more.

3. **Respect the current mainline model truth**
   - `Customer` = sales execution mainline
   - `TradeOrder` = transaction mainline
   - `SalesOrder` = supplier execution child order
   - payment truth lives in payment-layer models
   - fulfillment truth lives in fulfillment-layer models

4. **Auditability matters**
   Favor models and relations that support:
   - ownership
   - assignment history
   - operation logging
   - later business traceability

5. **createdAt / updatedAt**
   Include them where appropriate on important business models.

## Files to inspect first

Read these before changing schema:

1. `README.md`
2. `PRD.md`
3. `PLANS.md`
4. `AGENTS.md`
5. `HANDOFF.md` when relevant
6. `prisma/schema.prisma`
7. current seed file(s)
8. any code already depending on the affected models
9. auth / ownership / mutation files if the schema change affects permissions or auditability

## Schema editing rules

1. Prefer explicit and readable relations.
2. Preserve existing working model names unless a change is clearly required.
3. Avoid ambiguous relation names.
4. Avoid premature normalization if it makes the current milestone harder to use.
5. Do not introduce external-system tables unless explicitly needed.
6. Keep local development and demo data in mind while designing required fields.
7. Do not silently change business semantics described in `PRD.md`.
8. Do not re-blend product / transaction / payment / fulfillment truth into one model just because it looks simpler.
9. When changing required fields, think about migration impact on existing data.

## Prisma enum runtime rule

Prisma enums are for DB/backend typing and persistence semantics.

Do NOT use Prisma enum objects as shared runtime constants for:

- frontend pages
- shared UI config
- client-side option lists
- default select values
- runtime validation in shared/browser code

Prefer:

- local string constant arrays
- local label maps
- local zod enums built from local constants
- type-only Prisma enum imports when needed

When schema changes affect enums, also inspect any runtime option/label code that may need local constant updates.

## Seed data rules

When updating seeds:

- preserve existing demo roles and accounts if they exist
- keep local data useful for testing the current milestone
- generate representative but manageable amounts of data
- keep seed reruns reasonably safe
- avoid uncontrolled duplicates where possible
- ensure test data supports permission testing
- ensure test data supports the newly changed schema

Typical useful demo data includes:

- admin / supervisor / sales / ops / shipper users
- multiple leads with mixed statuses
- customers owned by different sales users
- some unassigned records where relevant
- trade/payment/fulfillment records matching the current milestone

## Migration workflow

When finishing schema work, recommend the appropriate commands:

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate dev --name <descriptive_name>`
- `npx prisma db seed`

If the user only needs quick local schema syncing and migration history is not the goal, `npx prisma db push` may be mentioned as a fallback, but migrations remain preferred.

If production/staging deployment is relevant, surface:

- `npx prisma migrate deploy`

## Migration diagnostics checklist

If migration fails, check likely causes in this order:

1. invalid `DATABASE_URL`
2. MySQL connectivity problems
3. wrong host / port for WSL or BT panel environments
4. insufficient database privileges
5. Prisma shadow database permission issues
6. relation naming or schema validation errors
7. seed assumptions breaking due to required fields
8. existing data conflicting with new required constraints

## WSL / BT panel awareness

This project may run code on Windows while MySQL runs in WSL or BT panel.

When relevant:

- do not assume `127.0.0.1` will always work from Windows
- be mindful of custom MySQL ports
- mention URL-encoding for passwords with special characters if connection strings are involved
- remember that `prisma migrate dev` may require shadow database privileges
- distinguish local dev fixes from server deployment fixes

## Validation

Before finishing, recommend or run as appropriate:

- `npx prisma validate`
- `npx prisma generate`

If schema changes are part of the task, also surface the right migration and seed commands.

If related application code changed too, repository-wide completion rules still apply:

- `npm run lint`
- `npm run build`

## What to avoid

- do not collapse Lead and Customer into one generic Contact model
- do not make schema changes unrelated to the requested milestone
- do not break seed data silently
- do not add tables just because they “might be useful later”
- do not switch away from Prisma without explicit instruction
- do not push Prisma enum runtime objects into UI/shared runtime code
- do not ignore migration impact on existing data

## Definition of done

Schema work is done when:

- the requested model changes are implemented
- schema validates
- migration path is clear
- seed data supports local testing if needed
- business rules remain aligned with `PRD.md` / `PLANS.md`
- runtime enum usage has not been made worse
- risks and manual commands are clearly explained

## Required final response format

Always end with:

1. **Schema changes**
   - what models / enums / relations changed

2. **Seed changes**
   - what local data was added or updated

3. **Commands to run**
   - exact Prisma commands for the user

4. **Possible failure points**
   - likely DB / permission / schema issues if commands fail

5. **Notes**
   - any intentional simplifications
   - any deferred schema improvements