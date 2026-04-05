# Deployment Baseline

更新时间：2026-04-05

本文档只说明当前仓库进入 staging / 生产部署前的最小可执行基线。
它不是产品规划文档，也不是历史迁移复盘文档。

配套 smoke / 验收步骤见：[docs/staging-checklist.md](./staging-checklist.md)

## 1. 适用范围

当前基线适用于：

- staging 环境首发
- production 空库首发
- 当前 schema 不再变化的普通版本发布

当前基线不适用于：

- 修复历史 `prisma migrate dev` 链
- 做新的 schema 里程碑
- 用 demo seed 初始化正式环境

## 2. 必填环境变量

以下变量在 staging / production 中必须显式提供：

- `DATABASE_URL`
  用于 Prisma 和运行时查询，必须指向目标环境自己的 MySQL 数据库。
- `NEXTAUTH_URL`
  必须是最终对外访问 URL，例如 `https://crm.example.com`。
- `NEXTAUTH_SECRET`
  必须是足够长、随机且只在当前环境使用的密钥。

## 3. 可选环境变量

- `XXAPI_API_KEY`
  配置后才会启用远程物流轨迹查询；留空时系统会退回到本地状态展示，不阻塞主流程。
- `XXAPI_EXPRESS_ENDPOINT`
  默认为 `https://v2.xxapi.cn/api/express`，只有在代理、中转或供应商切换时才需要覆盖。

## 4. 安装与构建

```bash
npm install
npx prisma validate
npx prisma generate
npm run build
```

启动命令：

```bash
npm run start
```

## 5. Prisma 生产同步策略

### 当前正式可执行方案

当前仓库的正式同步方案是：

```bash
npx prisma validate
npx prisma generate
npx prisma db push
```

### 为什么当前不直接依赖 `migrate deploy`

原因不是 Prisma 本身，而是当前仓库的历史 migration 链还没有被单独修复和重新验证：

- 当前真实业务基线已经多次通过 `db push` 同步过 schema
- 历史 `migrate dev` 链存在独立技术债
- 在这笔技术债没有单独收口前，直接把 `migrate deploy` 当成正式生产入口并不安全

因此当前策略是：

- 首发到空库时，用 `db push` 将当前 `schema.prisma` 作为真实结构基线落库
- 没有 schema 变化的版本发布，不重复执行 `db push`
- 如果某次发布包含 schema 变化，在 migration 技术债修复前，只能把这次 schema 变化当成单独维护动作：
  1. 先在 staging 完整验证
  2. 先做数据库备份
  3. 明确审阅 `schema.prisma` 变化
  4. 维护窗口内手动执行 `npx prisma db push`

### 下一次 schema 变更前必须做什么

下一次如果要进入新的 schema 里程碑，必须先单独开一个 migration 技术债收口任务，至少完成：

- 梳理当前真实 schema 基线
- 评估并修复历史 migration 链
- 明确从哪一个 release 开始切回 `migrate dev / migrate deploy`

在此之前，不要把 `migrate deploy` 写进自动发布流程。

## 6. 首个管理员初始化

正式环境不要运行 `npm run db:seed`。

当前正式初始化方案：

```bash
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
```

可选参数：

- `--phone <phone>`
- `--force`

行为说明：

- 脚本会先确保核心角色存在：`ADMIN / SUPERVISOR / SALES / OPS / SHIPPER`
- 如果目标用户名不存在，则创建首个管理员账号
- 如果目标用户名已存在，默认不重复创建，也不会写入脏数据
- 只有显式传入 `--force` 时，才会把已有账号提升/刷新为管理员，并重置密码
- 脚本写入 `OperationLog`
- 新建或 `--force` 刷新的管理员都会被标记为 `mustChangePassword=true`

PowerShell 示例：

```powershell
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
```

Bash 示例：

```bash
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
```

## 7. 本地测试 Seed 的边界

`npm run db:seed` 仍然保留，但它只用于本地测试数据和权限联调。

不要在 staging / production 使用它，因为它会写入：

- 本地测试账号
- 本地测试客户与线索
- 本地测试跟进、直播、订单、礼品与主数据

## 8. 导出目录要求

发货导出文件当前写入：

```text
public/exports/shipping
```

部署时必须满足：

- Node 进程对该目录有写权限
- 目录不存在时允许自动创建
- 如果部署环境使用只读文件系统或无状态容器，需要额外挂载可写目录或接受导出文件是临时产物

如果 staging / production 需要保留导出历史，必须把该目录纳入备份或持久化策略。

## 9. 最低备份与回滚要求

每次正式发布至少满足以下要求：

1. 发布前备份目标数据库
2. 保留上一版构建产物或上一版可回滚 commit / release 包
3. 如果本次包含 `db push`，必须在维护窗口执行
4. 如果发布后发现 schema 或初始化异常，先停止流量，再按顺序处理：
   - 恢复数据库备份
   - 回滚到上一版构建
   - 重新执行 `npx prisma generate`

## 10. 推荐发布顺序

### 空库首发

```bash
npm install
npx prisma validate
npx prisma generate
npx prisma db push
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
npm run build
npm run start
```

### 普通无 schema 变更发布

```bash
npm install
npx prisma validate
npx prisma generate
npm run build
npm run start
```

## 11. 发布前最低检查

- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npm run build`
- 登录页不再暴露 demo 文案
- `/fulfillment` 已纳入代理保护与角色跳转链
- 首个管理员初始化方案已完成实测
