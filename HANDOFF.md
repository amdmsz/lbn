# 最近交接说明

更新时间：2026-03-31

## 当前重点

最近主要在客户中心 `/customers` 和客户详情 `/customers/[id]` 做了视觉精修与通话/加微联动。

本地已验证通过：

- `npm run lint`
- `npm run build`

## 最近完成的改动

### 1. 客户中心列表卡片化

客户中心承接列表已经从表格改成客户卡片，主要文件：

- `components/customers/customers-table.tsx`
- `components/customers/customer-list-card.tsx`

卡片当前结构：

- 拨打电话
- 已购产品
- 导入时间
- 通话记录

### 2. 通话记录弹窗化

客户卡片里：

- “拨打电话”是按钮，点击后弹窗录入通话
- “通话记录”是按钮，点击后弹窗查看历史通话
- 没有通话时按钮置灰

相关文件：

- `components/customers/customer-call-record-form.tsx`
- `components/customers/customer-call-record-history.tsx`
- `components/customers/customer-call-records-section.tsx`
- `app/(dashboard)/customers/[id]/call-actions.ts`

### 3. 通话结果接入“加微待通过”

已经把“加微待通过”接进通话结果：

- Prisma `CallResult` 新增 `WECHAT_PENDING`
- 通话结果文案已补齐
- 选择通话结果后会自动同步微信记录

联动规则：

- `WECHAT_PENDING` -> 自动创建 `WechatRecord(PENDING)`
- `WECHAT_ADDED` -> 自动创建 `WechatRecord(ADDED)`
- `REFUSED_WECHAT` -> 自动创建 `WechatRecord(REJECTED)`

相关文件：

- `prisma/schema.prisma`
- `prisma/migrations/20260331093000_add_wechat_pending_call_result/migration.sql`
- `lib/calls/metadata.ts`
- `lib/calls/mutations.ts`

### 4. 客户中心“加微待通过”统计与筛选

客户中心顶部指标、tabs、仪表盘快捷入口都已经接入“加微待通过”。

当前口径：

- `已加微`：认 `WechatRecord.ADDED`，也认 `CallRecord.WECHAT_ADDED`
- `加微待通过`：认 `WechatRecord.PENDING`，也认 `CallRecord.WECHAT_PENDING`

注意：

之前“加微待通过”页面为空，不是没写进去，而是旧逻辑会把历史上有过 `ADDED` 的客户全部排除。
现在已经改成“只要当前存在待通过记录，就能进待通过视图”。

相关文件：

- `lib/customers/queries.ts`
- `app/(dashboard)/customers/page.tsx`
- `app/(dashboard)/dashboard/page.tsx`

## 当前数据库状态

### 已完成

已手动执行以下 SQL migration 到数据库，用于让 MySQL 识别 `WECHAT_PENDING`：

- `prisma/migrations/20260331093000_add_wechat_pending_call_result/migration.sql`

### 已知问题

`npx prisma migrate dev` 目前不是卡在这次改动，而是卡在更早的一条旧 migration：

- `prisma/migrations/20260330113000_milestone_10b_lead_customer_merge/migration.sql`

报错方向：

- shadow database 应用旧 migration 失败
- 提示缺少 `lead_import_batches`

所以当前仓库的 migration 链本身还有历史问题。

## 如果换账号后继续工作

建议先看这些文件：

- `HANDOFF.md`
- `PRD.md`
- `AGENTS.md`
- `app/(dashboard)/customers/page.tsx`
- `components/customers/customer-list-card.tsx`
- `lib/customers/queries.ts`
- `lib/calls/mutations.ts`

## 如果要继续下一步

优先建议：

1. 继续精修客户中心 `/customers/[id]` 各 tab 的密度与层级
2. 清理仓库里仍然残留的中文乱码文案
3. 修复 Prisma 历史 migration 链，让 `migrate dev` 恢复可用
4. 统一客户中心与仪表盘的统计口径说明文案

## 当前结论

客户中心这条线目前已经能支持：

- 客户卡片化展示
- 卡片内直接录通话
- 通话结果录入“加微待通过”
- 自动同步微信待通过记录
- 顶部统计与待通过筛选正常显示

如果新账号接手，直接从 `HANDOFF.md` 和上面列的几个文件继续即可。
