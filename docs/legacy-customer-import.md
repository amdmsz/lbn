# Legacy Customer Import

This repository now includes a migration-safe script for importing old-system customer assets into the current CRM without changing Prisma schema.

## Why this script exists

The old Excel file is customer-asset data, not full transaction history.

Recommended landing:

- `Customer`: main import target for legacy customer assets
- `CustomerOwnershipEvent`: ownership trace when a mapped sales owner is assigned or when a customer enters the public pool
- `CustomerTag`: exact legacy customer type and category are preserved as tags
- `OperationLog`: full legacy snapshot and import actions remain traceable

Not imported directly from this Excel:

- `TradeOrder`
- `SalesOrder`
- `PaymentPlan`
- `PaymentRecord`
- `CollectionTask`
- `ShippingTask`

Those layers need real order, payment, and fulfillment details. This workbook only contains summary signals such as total spend and purchase count.

## Default behavior

- Reads the configured worksheet and uses the configured header row
- Treats `手机号` as the primary dedup key
- Creates new customers directly in `Customer`
- Preserves exact legacy type and category as tags under the `LEGACY_IMPORT` tag group
- Reuses existing active business tags when old category names can be resolved to current tags such as `A类 / B类 / C类 / D类`
- Writes a compact legacy summary into `Customer.remark`
- Writes the full raw legacy snapshot into `OperationLog.afterData`
- Keeps matched existing customers conservative:
  - fills only empty name and address fields by default
  - does not overwrite an existing owner by default
- Creates new customers as:
  - private customers when `建议导入归属工号` resolves to an active `SALES` user and the category is not excluded
  - public-pool customers otherwise

## Default field mapping

- `原客户ID` -> legacy snapshot in `OperationLog.afterData` and summary marker in `Customer.remark`
- `客户姓名` -> `Customer.name`
- `手机号` -> `Customer.phone`
- `详细地址` -> `Customer.address`
- `省份 / 城市 / 区县` -> `Customer.province / city / district`
- `客户类型` -> legacy type tag
- `客户分类` -> legacy category tag
- `累计消费金额 / 购买次数` -> legacy snapshot and initial level hint
- `建档时间 / 导入时间 / 回访结果 / 导入产品 / 备注` -> legacy snapshot and summary remark
- `建议导入归属工号` -> resolved through `ownerCodeMap` in the config file

## Legacy signal mapping

- `A类 / B类 / C类 / D类已加微信`:
  - reuse matching current-system tags when available
  - create an imported `WechatRecord(ADDED)` if the customer does not already have a successful wechat touch
  - this lets the customer enter the current CRM's `已加微信 / 待邀约` path
- `跟进客户（未接通/拒接）`:
  - create an imported `CallRecord(HUNG_UP)`
  - set `nextFollowUpAt` to the imported occurrence time so the customer enters `待回访`
- `拒绝添加`:
  - create an imported `CallRecord(REFUSED_WECHAT)`
- `无效客户（空号/停机）`:
  - create an imported `CallRecord(INVALID_NUMBER)`

## Import center support

- `/lead-imports?mode=customer_continuation` now shows preview-time expected outcomes before import
- the preview highlights unresolved owner usernames and unresolved business tags without blocking import
- signal words such as `跟进客户（未接通/拒接）`, `拒绝添加`, and `无效客户（空号/停机）` are treated as continuation signals, not mistaken as unresolved business tags
- lead import detail pages now show mapping metrics for:
  - `A / B / C / D` category hits
  - `已加微信`
  - `待邀约`
  - `待回访`
  - `拒绝添加`
  - `无效号码`
- `/lead-import-templates?mode=customer_continuation` now includes a fixed-template management card for customer continuation downloads, field aliases, and mapping guidance

## Default inference rules

Initial `Customer.level` for new customers:

- `A类（复购5W客户）` / `B类（复购1W以上）` -> `VIP`
- `C类客户（复购客户）` -> `REGULAR`
- any row with purchase count or spend > 0 -> `REGULAR`
- otherwise -> `NEW`

Initial `Customer.status` for new customers:

- `无效客户（空号/停机）` -> `LOST`
- `拒绝添加` -> `DORMANT`
- otherwise -> `ACTIVE`

Default owner assignment exclusions:

- `拒绝添加`
- `无效客户（空号/停机）`

## Config

Copy the example file:

```json
{
  "filePath": "C:/Users/yourname/Downloads/老.xlsx",
  "sheetName": "导入模板",
  "headerRowIndex": 2,
  "actorUsername": "admin",
  "ownerCodeMap": {
    "S014": "sales",
    "S003": "sales2"
  },
  "assignNewCustomersToMappedOwner": true,
  "assignExistingUnownedToMappedOwner": false,
  "mergeExistingStrategy": "fill-empty",
  "ownerAssignmentExcludedCategories": [
    "拒绝添加",
    "无效客户（空号/停机）"
  ],
  "legacyRemarkPrefix": "[legacy-import]"
}
```

Notes:

- `actorUsername` must resolve to an `ADMIN` or `SUPERVISOR`
- `ownerCodeMap` maps old-system owner codes to current `username`
- `mergeExistingStrategy` supports:
  - `fill-empty`
  - `none`

## Commands

Preview:

```bash
npm run db:import-legacy-customers -- --dry-run --config=./scripts/import-legacy-customers.config.example.json
```

Apply:

```bash
npm run db:import-legacy-customers -- --apply --config=./scripts/import-legacy-customers.config.example.json
```

Optional arguments:

- `--limit=100`
- `--report-file=./reports/legacy-customer-import/manual-report.json`

Targeted rule test:

```bash
npm run test:lead-imports
```

## Safety notes

- The script is idempotent on tags and conservative on existing customers
- Existing customers are matched by phone only
- Existing owned customers are not reassigned by default
- Full legacy raw rows remain available in `OperationLog.afterData`
- This script intentionally does not manufacture order, payment, or shipping history from summary-only legacy data

## Async import center rollout

- `/lead-imports` and `/lead-imports?mode=customer_continuation` now submit batches asynchronously
- the web request only validates the file, creates the batch, stores the source file under `runtime/imports/lead-imports`, and enqueues the batch
- BullMQ + Redis + a dedicated worker process execute parsing, matching, and row writes in the background
- both the import center and the batch detail page poll a shared batch-progress API and show:
  - current batch status: `QUEUED / IMPORTING / COMPLETED / FAILED`
  - current worker stage: `QUEUED / PARSING / MATCHING / WRITING / FINALIZING`
  - processed row count, success count, duplicate count, failed count, and heartbeat time
- batch detail pages keep the final report, failure rows, duplicate rows, and continuation mapping metrics after completion

## Runtime requirements

- production now requires `REDIS_URL`
- start the async worker with:

```bash
npm run worker:lead-imports
```

- recommended runtime variables:

```bash
REDIS_URL=redis://127.0.0.1:6379
LEAD_IMPORT_WORKER_CONCURRENCY=1
LEAD_IMPORT_CHUNK_SIZE=20
LEAD_IMPORT_JOB_ATTEMPTS=3
```

- current local deployment example:

```bash
REDIS_URL=redis://172.31.186.171:6379
LEAD_IMPORT_WORKER_CONCURRENCY=1
LEAD_IMPORT_CHUNK_SIZE=20
LEAD_IMPORT_JOB_ATTEMPTS=3
```

- v1 defaults stay conservative on purpose:
  - worker concurrency defaults to `1`
  - batches are processed in small chunks
  - retries resume from persisted batch/row state instead of replaying the whole batch
