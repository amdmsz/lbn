---
name: prisma-migrate-and-seed
description: 用于酒水 CRM 的 Prisma schema、migration 和本地演示数据处理：修改 schema、生成 migration、更新 seed、排查 MySQL / WSL / 宝塔环境下的连接或权限问题，并输出可执行命令。 Use this for Prisma schema changes, migrations, seed updates, and migration troubleshooting in the liquor CRM project.
---

# Purpose

Use this skill when the task involves:

- editing `prisma/schema.prisma`
- creating or updating migrations
- preparing or fixing local seed data
- diagnosing Prisma migration issues
- aligning schema changes with milestone requirements

# Priority note

Follow `AGENTS.md` as the repository-wide baseline.  
This skill provides task-specific workflow guidance and must not weaken project-wide standards.

# Project-specific modeling rules

These rules are mandatory for this repository:

1. **Lead and Customer must remain separate**
   - `Lead` = raw lead intake
   - `Customer` = deduplicated customer entity
   - one Customer may relate to multiple Leads

2. **Do not overdesign the schema**
   Keep the schema suitable for MVP unless the user explicitly asks for more.

3. **Use enums for core business states**
   Especially for:
   - lead status
   - order type / status
   - payment status
   - shipping status
   - gift review status
   - shipping task status
   - similar business state fields

4. **Auditability matters**
   Favor models and relations that support:
   - ownership
   - assignment history
   - operation logging
   - later business traceability

5. **createdAt / updatedAt**
   Include them where appropriate on important business models.

# Files to inspect first

Read these before changing schema:

1. `PRD.md`
2. `PLANS.md`
3. `AGENTS.md`
4. `prisma/schema.prisma`
5. current seed file(s)
6. any code already depending on the affected models

# Schema editing rules

1. Prefer explicit and readable relations.
2. Preserve existing working model names unless a change is clearly required.
3. Avoid ambiguous relation names.
4. Avoid premature normalization if it makes the MVP harder to use.
5. Do not introduce external-system tables unless explicitly needed.
6. Keep local development and demo data in mind while designing required fields.
7. Do not silently change business semantics described in `PRD.md`.

# Seed data rules

When updating seeds:

- preserve existing demo roles and accounts if they exist
- keep local data useful for testing the current milestone
- generate representative but manageable amounts of data
- keep seed reruns reasonably safe
- avoid uncontrolled duplicates where possible
- ensure test data supports permission testing

Typical useful demo data includes:

- admin / supervisor / sales / ops / shipper users
- multiple leads with mixed statuses
- customers owned by different sales users
- some unassigned records where relevant
- records matching the milestone being tested

# Migration workflow

When finishing schema work, recommend the appropriate commands:

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate dev --name <descriptive_name>`
- `npx prisma db seed`

If the user only needs quick local schema syncing and migration history is not the goal, `npx prisma db push` may be mentioned as a fallback, but migrations remain preferred.

# Migration diagnostics checklist

If migration fails, check likely causes in this order:

1. invalid `DATABASE_URL`
2. MySQL connectivity problems
3. wrong host / port for WSL or BT panel environments
4. insufficient database privileges
5. Prisma shadow database permission issues
6. relation naming or schema validation errors
7. seed assumptions breaking due to required fields
8. existing data conflicting with new required constraints

# WSL / BT panel awareness

This project may run code on Windows while MySQL runs in WSL or BT panel.

When relevant:

- do not assume `127.0.0.1` will always work from Windows
- be mindful of custom MySQL ports
- mention URL-encoding for passwords with special characters if connection strings are involved
- remember that `prisma migrate dev` may require shadow database privileges

# Validation

Before finishing, recommend or run as appropriate:

- `npx prisma validate`
- `npx prisma generate`

If schema changes are part of the task, also surface the right migration and seed commands.

Repository-wide completion rules from `AGENTS.md` still apply when related code is changed.

# What to avoid

- do not collapse Lead and Customer into one generic Contact model
- do not make schema changes unrelated to the requested milestone
- do not break seed data silently
- do not add tables just because they “might be useful later”
- do not switch away from Prisma without explicit instruction

# Definition of done

Schema work is done when:

- the requested model changes are implemented
- schema validates
- migration path is clear
- seed data supports local testing if needed
- business rules remain aligned with `PRD.md` / `PLANS.md`
- risks and manual commands are clearly explained

# Required final response format

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