# 正式部署基线

更新时间：2026-04-08

本文档是当前仓库正式部署主文档。

适用目标固定为：

- Ubuntu Server 24.04 LTS
- MySQL
- Nginx
- Node.js LTS
- systemd 托管应用进程
- 单机部署

不适用范围：

- Docker / Docker Compose / K8s / PVE
- 复杂高可用
- 用 `prisma/seed.mjs` 初始化 staging / production

staging 验收请看：[docs/staging-checklist.md](./staging-checklist.md)

## 0. 推荐正式上线节奏

当前仓库推荐的正式上线节奏固定为：

1. 先在 `staging` 按完整正式流程预演一次
2. 按同样的环境变量结构、MySQL 初始化方式、Nginx / systemd 模板和 smoke 清单通过验收
3. 再把同样步骤复制到 `production`

当前推荐默认场景是：

- 单机 Ubuntu 24.04 LTS
- `staging` 与 `production` 使用各自独立的 MySQL 库、环境文件和 systemd service
- 首发数据库为全新空库
- 首发阶段允许先使用内网地址或 IP 验证

如果当前先用内网地址或 IP 对外访问：

- `NEXTAUTH_URL` 必须与当前真实访问地址完全一致
- 后续切换正式域名或 HTTPS 时，必须同步更新 `NEXTAUTH_URL`
- 切换后需要重新执行一次登录、受保护路由跳转和回调地址回归

## 1. 仓库内可直接使用的部署资产

当前仓库提供这些正式部署资产：

- 环境变量模板：[.env.example](../.env.example)
- systemd 模板：[deploy/systemd/jiuzhuang-crm.service](../deploy/systemd/jiuzhuang-crm.service)
- Nginx 模板：[deploy/nginx/jiuzhuang-crm.conf](../deploy/nginx/jiuzhuang-crm.conf)
- MySQL 初始化 SQL 模板：[deploy/mysql/init-database.sql](../deploy/mysql/init-database.sql)
- MySQL 备份脚本：[scripts/backup-mysql.sh](../scripts/backup-mysql.sh)
- 运行时文件备份脚本：[scripts/backup-runtime-assets.sh](../scripts/backup-runtime-assets.sh)
- 单机更新脚本模板：[scripts/deploy-update.sh](../scripts/deploy-update.sh)
- 首个管理员初始化脚本：[scripts/bootstrap-admin.mjs](../scripts/bootstrap-admin.mjs)
- 旧环境 migration metadata 对齐脚本：[scripts/reconcile-prisma-migration-baseline.mjs](../scripts/reconcile-prisma-migration-baseline.mjs)
- Prisma migration rebaseline 说明：[docs/prisma-migration-rebaseline.md](./prisma-migration-rebaseline.md)

当前正式 migration 链除了 baseline 外，还包含首发后新增的正式 additive migration：

```text
20260408153000_add_user_permission_grants
```

## 2. 正式部署前提

在服务器上准备：

- Node.js LTS
- npm
- MySQL 服务
- Nginx
- 一个用于运行应用的系统用户
- 一个用于放置代码和构建产物的目录

文档里的示例路径统一使用：

- 应用目录：`/srv/jiuzhuang-crm/current`
- 环境文件：`/etc/jiuzhuang-crm/jiuzhuang-crm.env`
- 应用用户：`crm`
- 应用组：`crm`

这些只是推荐占位值，你可以替换成自己的实际路径和用户，但必须在 `systemd` 模板里同步替换。

## 3. 环境变量

正式部署至少准备一个独立环境文件，例如：

```bash
sudo mkdir -p /etc/jiuzhuang-crm
sudo cp .env.example /etc/jiuzhuang-crm/jiuzhuang-crm.env
sudo chmod 640 /etc/jiuzhuang-crm/jiuzhuang-crm.env
```

当前正式部署必填变量：

- `DATABASE_URL`
  指向当前环境自己的 MySQL 数据库。
- `NEXTAUTH_URL`
  必须是当前真实对外访问地址。例如 `https://crm.example.com`，或首发阶段实际使用的 `http://10.0.0.15`。
- `NEXTAUTH_SECRET`
  必须是独立、随机且足够长的密钥。
- `NODE_ENV`
  正式环境固定为 `production`。

当前正式部署推荐显式提供：

- `PORT`
  Next.js 监听端口，建议固定为 `3000` 并只监听本机，由 Nginx 反代。

当前可选变量：

- `XXAPI_API_KEY`
  配置后才启用远程物流轨迹查询。
- `XXAPI_EXPRESS_ENDPOINT`
  留空时使用默认 `https://v2.xxapi.cn/api/express`。

当前仓库没有额外必须的 PBX、短信、对象存储或 Redis 变量。

## 4. MySQL 初始化

当前推荐先用模板 SQL 创建数据库和账号：

```bash
mysql -uroot -p < deploy/mysql/init-database.sql
```

执行前先把模板中的占位值替换为真实值：

- `__DB_NAME__`
- `__DB_USER__`
- `__DB_PASSWORD__`

如果你不想直接修改模板文件，也可以把 SQL 内容复制到临时文件后再执行。

## 5. Prisma migration 基线

当前仓库的 Prisma migration 技术债已经通过 rebaseline 收口。

新的正式 baseline migration 是：

```text
20260407224500_rebuild_current_schema_baseline
```

旧的不可重放链已归档到：

```text
prisma/migrations_pre_rebaseline_20260407
```

详细说明见：[docs/prisma-migration-rebaseline.md](./prisma-migration-rebaseline.md)

### 空库 / 新环境

空库首发现在使用正式 migration 工作流：

```bash
npx prisma migrate deploy
```

### 已有旧环境

如果环境是在 rebaseline 之前建立的，且当前数据库结构已经和 `schema.prisma` 一致，那么需要做一次 migration metadata 对齐。

先确认：

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

确认返回 `0` 之后，再执行：

```bash
npm run db:migration-baseline:reconcile -- --apply
```

## 6. 首发空库部署步骤

当前首发空库的正式顺序明确写死为：

```bash
npm ci
npx prisma validate
npx prisma migrate deploy
npx prisma generate
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

如果你通过 `systemd` 启动，则最后一步改为启用并启动 service。

### staging -> production 推荐执行顺序

#### A. staging 预演

1. 准备 staging MySQL、环境文件、systemd service、Nginx 反代和运行时目录
2. 执行首发空库部署步骤
3. 按 [docs/staging-checklist.md](./staging-checklist.md) 完成 smoke
4. 执行：

```bash
npx prisma migrate status
```

只有 staging 验收通过后，再进入 production。

#### B. production 首发

1. 记录当前 release commit 或 Git tag
2. 准备 production 独立环境文件和空库
3. 对空库或初始化状态先做一次备份留档
4. 按与 staging 相同的顺序执行首发空库部署步骤
5. 执行正式上线后最低自检

### 首发空库部署说明

1. `npm ci`
   使用锁文件安装依赖，适合正式环境。
2. `npx prisma validate`
   确认当前 schema 合法。
3. `npx prisma migrate deploy`
   把当前正式 migration 链应用到空库。
4. `npx prisma generate`
   生成当前版本 Prisma Client。
5. `npm run admin:bootstrap ...`
   初始化首个管理员。
6. `npm run build`
   生成正式构建产物。
7. `systemd` 或 `npm run start`
   启动正式服务进程。

## 7. `seed` 与 `admin:bootstrap` 的边界

### 正式环境初始化入口

正式环境首个管理员初始化，唯一推荐入口是：

```bash
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
```

脚本能力：

- 确保核心角色存在
- 创建首个管理员
- 重复执行时默认 `noop`
- 只有显式 `--force` 才刷新已有账号
- 写入 `OperationLog`
- 新建或强制刷新后的管理员会被标记为 `mustChangePassword=true`

### `seed` 的边界

[`prisma/seed.mjs`](../prisma/seed.mjs) 只用于：

- 本地演示数据
- 本地权限联调
- 本地 UI / 数据联调

不要在 staging / production 使用：

```bash
npm run db:seed
```

它会写入 demo 账号、演示客户、演示主数据和演示订单相关数据，不适合作为正式初始化方案。

## 8. systemd 部署

模板文件：

- [deploy/systemd/jiuzhuang-crm.service](../deploy/systemd/jiuzhuang-crm.service)

使用方式：

1. 复制模板到系统目录

```bash
sudo cp deploy/systemd/jiuzhuang-crm.service /etc/systemd/system/jiuzhuang-crm.service
```

2. 替换这些占位值

- `__APP_USER__`
- `__APP_GROUP__`
- `__APP_ROOT__`
- `__ENV_FILE__`

3. 重新加载并启用

```bash
sudo systemctl daemon-reload
sudo systemctl enable jiuzhuang-crm
sudo systemctl start jiuzhuang-crm
sudo systemctl status jiuzhuang-crm --no-pager
```

4. 查看日志

```bash
sudo journalctl -u jiuzhuang-crm -f
```

## 9. Nginx 反向代理

模板文件：

- [deploy/nginx/jiuzhuang-crm.conf](../deploy/nginx/jiuzhuang-crm.conf)

使用方式：

1. 复制到 `sites-available`

```bash
sudo cp deploy/nginx/jiuzhuang-crm.conf /etc/nginx/sites-available/jiuzhuang-crm.conf
```

2. 替换 `__SERVER_NAME__`

3. 建立软链接并检查配置

```bash
sudo ln -s /etc/nginx/sites-available/jiuzhuang-crm.conf /etc/nginx/sites-enabled/jiuzhuang-crm.conf
sudo nginx -t
sudo systemctl reload nginx
```

当前模板先给 HTTP 版本。

如果要接 HTTPS，建议在这一层完成证书终止，然后继续把流量反代到本机 `127.0.0.1:3000`。

## 10. 运行时目录与权限

当前仓库存在两个正式部署时必须关注的本地写盘目录：

### A. 发货导出目录

- 物理目录：`public/exports/shipping`
- 代码写入点：[lib/shipping/export.ts](../lib/shipping/export.ts)
- 对外访问路径：`/exports/shipping/<file>`

要求：

- 应用进程必须对该目录有写权限
- 目录不存在时允许自动创建
- 如果要保留历史导出文件，必须纳入备份

### B. 头像上传目录

- 物理目录：`public/uploads/avatars`
- 代码写入点：[lib/account/self-actions.ts](../lib/account/self-actions.ts)
- 访问方式：通过 `/api/account/avatar/<filename>` 读取

要求：

- 应用进程必须对该目录有写权限
- 目录不存在时允许自动创建
- 如果你希望头像在部署后持续保留，必须纳入备份

推荐初始化：

```bash
sudo mkdir -p /srv/jiuzhuang-crm/current/public/exports/shipping
sudo mkdir -p /srv/jiuzhuang-crm/current/public/uploads/avatars
sudo chown -R crm:crm /srv/jiuzhuang-crm/current/public/exports /srv/jiuzhuang-crm/current/public/uploads
```

如果通过单机更新脚本执行发布，脚本也会先确保这两个目录存在；但首次上线仍建议在 systemd 启动前手动创建并校验权限。

## 11. 备份最低方案

当前最低备份基线分成两部分：

### A. MySQL 备份

使用：

```bash
ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env BACKUP_DIR=/srv/backups/jiuzhuang-crm/mysql bash scripts/backup-mysql.sh
```

### B. 运行时文件备份

使用：

```bash
BACKUP_DIR=/srv/backups/jiuzhuang-crm/runtime-assets bash scripts/backup-runtime-assets.sh
```

这个脚本会归档：

- `public/exports`
- `public/uploads`

至少在这些场景前执行备份：

- 正式首发前
- 旧环境做 migration metadata reconcile 前
- 正式发布前
- 清理导出目录或上传目录前

## 12. 单机更新脚本模板

当前仓库提供最小更新脚本：

- [scripts/deploy-update.sh](../scripts/deploy-update.sh)

基础用法：

```bash
sudo ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env SERVICE_NAME=jiuzhuang-crm bash scripts/deploy-update.sh
```

如果要切到指定 tag 或 commit：

```bash
sudo ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env SERVICE_NAME=jiuzhuang-crm bash scripts/deploy-update.sh v0.1.0
```

注意：

- 脚本默认不会自动执行 schema 变更或数据库备份
- 如果某次发布包含新的 migration，推荐使用：

```bash
sudo ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env \
SERVICE_NAME=jiuzhuang-crm \
APP_USER=crm \
APP_GROUP=crm \
RUN_DB_BACKUP=1 \
RUN_RUNTIME_BACKUP=1 \
RUN_MIGRATE_DEPLOY=1 \
DB_BACKUP_DIR=/srv/backups/jiuzhuang-crm/mysql \
RUNTIME_BACKUP_DIR=/srv/backups/jiuzhuang-crm/runtime-assets \
bash scripts/deploy-update.sh
```

- 上面这条命令会按顺序执行：
  - 运行时目录准备
  - 可选数据库备份
  - 可选运行时文件备份
  - `npm ci`
  - `npx prisma validate`
  - 可选 `npx prisma migrate deploy`
  - `npx prisma generate`
  - `npm run build`
  - `systemctl restart <service>`

## 13. 日志与最低回滚方案

### 日志

当前最小正式方案是：

- Next.js 标准输出 / 标准错误交给 `systemd`
- 日志查看使用 `journalctl`

常用命令：

```bash
sudo journalctl -u jiuzhuang-crm -n 200 --no-pager
sudo journalctl -u jiuzhuang-crm -f
```

### 回滚

每次正式发布至少满足：

1. 发布前打 Git tag 或明确记录 release commit
2. 发布前执行数据库备份
3. 保留上一个可启动版本
4. 如果本次包含新的 migration 或做过旧环境 reconcile，必须先完成备份并确认回滚点

最低回滚顺序：

1. 停止继续切流或先摘掉外部流量
2. 回到上一个可启动版本
3. `npm ci`
4. `npx prisma generate`
5. `npm run build`
6. `systemctl restart jiuzhuang-crm`
7. 如果问题来自数据库或 migration metadata，再恢复数据库快照和 `_prisma_migrations` 备份

## 14. 常见失败排查

### `DATABASE_URL is required`

检查：

- 环境文件是否已被 `systemd` 正确加载
- 手工执行命令时是否显式传入了 `ENV_FILE`

### `migrate deploy` 失败

先检查：

- 当前数据库账号是否具备建表、建索引、建外键权限
- 当前库是否真的是空库或已在正确 baseline 上
- 是否误把旧环境当成空库直接跑了 `migrate deploy`

旧环境请先看：[docs/prisma-migration-rebaseline.md](./prisma-migration-rebaseline.md)

### 登录成功后会话异常或频繁掉登录

检查：

- `NEXTAUTH_URL` 是否与最终访问域名一致
- `NEXTAUTH_SECRET` 是否稳定且未在多次部署中被误改
- Nginx 是否正确传递 `Host` 和 `X-Forwarded-Proto`

### 头像上传或导出失败

检查：

- `public/exports/shipping`
- `public/uploads/avatars`

通常原因是：

- 目录不存在
- 目录所有者不对
- `systemd` 进程没有写权限

### 物流轨迹为空

先确认是不是预期行为：

- 未配置 `XXAPI_API_KEY` 时，系统会优雅退回本地状态展示
- 这不阻塞主流程，不属于正式部署失败

## 15. 正式部署后最低自检

最少执行这些检查：

- 打开 `/login`
- 用 `admin:bootstrap` 创建的管理员登录
- 访问 `/dashboard`
- 访问 `/customers`
- 访问 `/fulfillment`
- 访问 `/products`
- 执行 `npx prisma migrate status`
- 手动确认 `public/exports/shipping` 和 `public/uploads/avatars` 可写
- 如果需要物流远程查询，再单独验证 `XXAPI_*` 配置
