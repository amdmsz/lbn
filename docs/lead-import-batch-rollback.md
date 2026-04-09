# Lead Import Batch Rollback

更新时间：2026-04-10

本文档记录“整批撤销导入”的当前本地实现状态，供后续开发、联调和验收时快速对齐。

## 1. 目标与边界

本能力解决的是：

- 线索导入后，发现整批其实是老客户数据，需要整批回滚
- 客户续接导入后，发现整批导入错误，需要撤销本批新建客户

本能力明确不做：

- partial rollback
- 清空历史批次
- backfill 旧批次
- 删除 `LeadImportBatch / LeadImportRow / OperationLog`

## 2. 支持范围

### 线索导入

- 支持 `AUDIT_PRESERVED`
- ADMIN 额外支持 `HARD_DELETE`

### 客户续接导入

- 仅支持回滚本批 `CREATED_CUSTOMER`
- 不支持 `HARD_DELETE`

## 3. 执行规则

- 必须先预检
- 只有整批所有有效行都可逆时才允许执行
- 任何一条有效行阻断，整批都不能执行

### 典型阻断

- 行命中系统原有 `Lead`
- 行命中系统原有 `Customer`
- 本批新建客户已经进入交易、支付、履约等后续链路
- `HARD_DELETE` 模式下，导入 Lead 已产生 owner、跟进、任务、订单、标签等后续痕迹

## 4. 回滚模式

### `AUDIT_PRESERVED`

- 删除本批新建客户
- Lead 不硬删
- Lead 标记 `rolledBackAt / rolledBackBatchId`
- rolled-back Lead 从正常可见链路里排除，但历史仍保留

### `HARD_DELETE`

- 仅 ADMIN 可用
- 删除本批新建客户
- 对满足安全条件的导入 Lead 做硬删除
- merge / history 展示改走 snapshot，不依赖 live relation

## 5. 可见性与快照规则

- rolled-back Lead 默认从 `/leads` 排除
- rolled-back Lead 默认从客户详情 lead 摘要排除
- rolled-back Lead 默认从导入 dedup 排除
- rolled-back Lead 默认从报表统计排除
- 历史 merge 展示优先走 snapshot：
  - `leadIdSnapshot`
  - `leadNameSnapshot`
  - `leadPhoneSnapshot`

## 6. RBAC 与审计

- `ADMIN / SUPERVISOR` 可预检与执行 `AUDIT_PRESERVED`
- 仅 `ADMIN` 可执行 `HARD_DELETE`
- 整批撤销执行、阻断、Lead 处理、客户删除收口都必须写 `OperationLog`

## 7. 关键代码位置

- Schema / migration
  - `prisma/schema.prisma`
  - `prisma/migrations/20260410113000_add_lead_import_batch_rollbacks/migration.sql`
- 核心服务
  - `lib/lead-imports/batch-rollback.ts`
  - `lib/customers/imported-customer-deletion.ts`
- 页面与动作
  - `app/(dashboard)/lead-imports/actions.ts`
  - `app/(dashboard)/lead-imports/[id]/page.tsx`
  - `components/lead-imports/lead-import-batches-table.tsx`
- 可见性过滤
  - `lib/leads/visibility.ts`
  - `lib/leads/queries.ts`
  - `lib/customers/queries.ts`
  - `lib/reports/queries.ts`

## 8. 推荐命令

```bash
npx prisma migrate dev --name add_lead_import_batch_rollbacks
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

## 9. 最小验收清单

1. 线索导入整批都是新建数据时，`AUDIT_PRESERVED` 预检通过并可执行。
2. 同一批线索导入中只要有一条命中原有 `Lead / Customer`，整批被阻断。
3. ADMIN 在安全条件满足时可执行 `HARD_DELETE`。
4. 客户续接批次只要出现 `MATCHED_EXISTING_CUSTOMER`，整批被阻断。
5. 已硬删对象在历史展示中仍能通过 snapshot 看见基础信息。
