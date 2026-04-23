# Staging Checklist

更新时间：2026-04-10

本清单用于当前仓库进入 staging 时的最小验收。
只覆盖已经进入真实基线的功能，不覆盖 PBX、新 schema 里程碑或额外的 schema 重构。

它不是生产部署说明。
生产部署步骤、systemd / Nginx 模板、备份和回滚口径请看：[docs/deployment-baseline.md](./deployment-baseline.md)

## A. 环境与部署

### 环境变量

- [ ] `DATABASE_URL` 已配置并指向 staging MySQL
- [ ] `NEXTAUTH_URL` 已配置为 staging 对外地址
- [ ] `NEXTAUTH_SECRET` 已配置为独立随机密钥
- [ ] `REDIS_URL` 已配置并可被 Web 与 worker 访问
- [ ] 若需要调优异步导入：
  - [ ] `LEAD_IMPORT_CHUNK_SIZE` 已按需配置或留空走默认值
  - [ ] `LEAD_IMPORT_WORKER_CONCURRENCY` 已按需配置或留空走默认值
  - [ ] `LEAD_IMPORT_JOB_ATTEMPTS` 已按需配置或留空走默认值
- [ ] 若需要远程物流轨迹：
  - [ ] `XXAPI_API_KEY` 已配置
  - [ ] `XXAPI_EXPRESS_ENDPOINT` 已按需配置或留空走默认值

### Prisma、构建与运行

- [ ] 执行 `bash scripts/release-preflight.sh`
- [ ] 确认 preflight 内部已实际执行 `npm ci --include=dev`
- [ ] 确认没有使用裸 `npm install`、`--omit=dev` 或只装 production dependencies 的方式构建
- [ ] 确认 `npx prisma migrate status` 已在 preflight 内执行
- [ ] 执行 `npm run prisma:deploy:safe`
- [ ] 确认当前本地 `prisma/migrations` 就是准备上线的正式 source of truth
- [ ] 若当前 staging 是 rebaseline 之前创建的旧环境，先完成 migration metadata reconcile
- [ ] 确认 `npm run build` 已在 preflight 内通过
- [ ] 执行 `npm run start`
- [ ] 执行 `npm run worker:lead-imports`
- [ ] 确认 Web 与 worker 是两个独立可运行进程
- [ ] 执行 `REQUIRE_LEAD_IMPORT_WORKER=1 npm run check:lead-import-runtime`
- [ ] 执行 `bash scripts/release-smoke.sh <staging-base-url>`

### 管理员初始化

- [ ] 执行 `npm run admin:bootstrap -- --username <admin> --name "<display name>" --password "<strong password>"`
- [ ] 确认脚本输出为 `created` 或预期的 `noop`
- [ ] 若重复执行未加 `--force`，确认不会重复造数据
- [ ] 确认管理员首次登录后会被要求改密

### 入口保护与代理

- [ ] 未登录访问 `/customers` 会跳到 `/login`
- [ ] 未登录访问 `/fulfillment` 会跳到 `/login`
- [ ] 已登录访问 `/login` 会按角色跳到默认入口
- [ ] 反向代理已将外部流量正确转发到 Node 服务
- [ ] 当前 staging 使用的 `NEXTAUTH_URL` 与真实访问地址完全一致

### 旧环境 migration metadata 对齐

- [ ] 先执行 `npm run prisma:diff:schema`
- [ ] 若返回 `0` 且环境属于 rebaseline 之前建立的旧库，执行 `npm run db:migration-baseline:reconcile -- --apply`
- [ ] 执行 `npm run prisma:status`
- [ ] 若 `prisma migrate status` 或 `prisma:predeploy:check` 异常，停止上线，不进入重启环节

## B. 核心业务 Smoke

### 登录与会话

- [ ] 管理员可正常登录
- [ ] 首次改密链路正常
- [ ] 登出后再次访问受保护页面会被拦截

### 自动 finalize staging 演练

- [ ] 已确认 staging 使用独立 `DATABASE_URL`
- [ ] 已确认 `RECYCLE_AUTO_FINALIZE_ACTOR_ID` 指向 staging 专用 `ACTIVE ADMIN`
- [ ] 已明确 `RECYCLE_AUTO_FINALIZE_BATCH_LIMIT`
- [ ] 已明确 `RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD`
- [ ] 已明确 `RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD`
- [ ] 已执行 `npm run worker:recycle-auto-finalize -- --dry-run`
- [ ] 已看到 `recycle_auto_finalize.stdout_summary`
- [ ] 已确认 `stdout_summary.dryRun = true`
- [ ] 已确认 `blocked` 不导致非零退出
- [ ] 已确认只有 `failed / fatal` 才导致非零退出
- [ ] 已确认 dry-run 没有新增真实 finalize 的 `OperationLog`
- [ ] 如准备继续推进，已在 staging 再执行一次真实 `npm run worker:recycle-auto-finalize`
- [ ] 已人工核对 staging 真实执行后的 `OperationLog` 与 `/recycle-bin` 终态变化
- [ ] 详细步骤与命令已按 [docs/recycle-auto-finalize-runbook.md](./recycle-auto-finalize-runbook.md) 留档

### 客户主线

- [ ] `/customers` 正常加载
- [ ] 客户列表筛选正常
- [ ] 客户卡片可进入详情
- [ ] `/customers/[id]` 各 tab 正常切换

### 异步导入主线

- [ ] 从线索导入入口提交一批导入任务
- [ ] `npm run check:lead-import-runtime` 能返回 Redis / queue / worker 正常状态
- [ ] 导入批次进入排队 / 处理中状态
- [ ] worker 能正常消费该批次
- [ ] 成功批次能正常完成
- [ ] 失败批次能正确写入失败状态与失败信息
- [ ] worker 日志里可看到 `ready / active / completed / failed`
- [ ] 停掉 worker 时，能观察到批次不会被正常消费
- [ ] 恢复 worker 后，批次处理链路恢复正常

### TradeOrder 主线

- [ ] 从客户详情 `orders` tab 打开 TradeOrder 表单
- [ ] 能保存草稿
- [ ] 能提交审核
- [ ] `/orders/[id]` 命中父单时展示父单详情

### `/fulfillment` 三视图

- [ ] `/fulfillment?tab=trade-orders` 正常加载
- [ ] `/fulfillment?tab=shipping` 正常加载
- [ ] `/fulfillment?tab=batches` 正常加载
- [ ] `/orders` 正确跳转到 `/fulfillment?tab=trade-orders`
- [ ] `/shipping` 正确跳转到 `/fulfillment?tab=shipping`
- [ ] `/shipping/export-batches` 正确跳转到 `/fulfillment?tab=batches`

### 公海池 ownership lifecycle

- [ ] `/customers/public-pool` 正常加载
- [ ] 可查看 pool / recycle / records 三类视图
- [ ] 认领、指派、释放动作链路正常
- [ ] 客户详情从 public-pool 上下文返回时不丢上下文

### 公海池规则与报表

- [ ] `/customers/public-pool/settings` 正常加载
- [ ] 团队规则保存后有正确提示
- [ ] `/customers/public-pool/reports` 正常加载
- [ ] 报表中的团队视图、owner 视图、长滞留客户列表可打开

### 自动化动作

- [ ] 自动分配 preview 正常返回结果
- [ ] 自动分配 apply 正常执行
- [ ] `ROUND_ROBIN` 策略下 cursor 能续位
- [ ] `LOAD_BALANCING` 策略下能给低负载销售分配
- [ ] 自动回收 preview 正常返回结果
- [ ] 自动回收 apply 正常执行
- [ ] 离职回收 preview / apply 正常执行

### 商品中心与 supplier 管理

- [ ] `/products` 正常加载
- [ ] `/products?tab=suppliers` 正常加载
- [ ] `/suppliers` 正确跳转到 `/products?tab=suppliers`
- [ ] 商品新建可选择 supplier
- [ ] 商品表单内 inline create supplier 后可自动回填

### 物流轨迹

- [ ] 若未配置 `XXAPI_API_KEY`，系统能优雅退回到本地状态显示
- [ ] 若已配置 `XXAPI_API_KEY`，物流轨迹查询能返回远程结果
- [ ] `trade-orders` 列表 hover / click 物流交互正常
- [ ] supplier 发货池里的物流轨迹面板可打开

## C. 角色级 Smoke

### ADMIN

- [ ] 可进入 `/customers`
- [ ] 可进入 `/fulfillment`
- [ ] 可进入 `/products`
- [ ] 可进入 `/customers/public-pool/settings`
- [ ] 可进入 `/settings/users`
- [ ] 可查看导入批次状态与失败信息（若该能力已开放到当前界面）

### SUPERVISOR

- [ ] 可进入 `/customers`
- [ ] 可进入 `/fulfillment`
- [ ] 可进入 `/products`
- [ ] 可进入 `/customers/public-pool/settings`
- [ ] 只能看到本团队相关公海规则与报表范围
- [ ] 可发起或追踪本团队相关导入任务（若该能力已开放到当前界面）

### SALES

- [ ] 默认入口是 `/customers`
- [ ] 可创建和编辑自己客户的 TradeOrder
- [ ] 可进入 `/payment-records` 与 `/collection-tasks`
- [ ] 不应把 `/shipping` 当作主工作台
- [ ] 只能认领公海客户，不能进入公海规则页
- [ ] 不应误获得团队级导入处理权限

### SHIPPER

- [ ] 默认入口是 `/fulfillment?tab=shipping`
- [ ] 可进入 `/fulfillment?tab=shipping`
- [ ] 可进入 `/fulfillment?tab=batches`
- [ ] 可进入 `/live-sessions`
- [ ] 可创建直播场次
- [ ] 创建直播场次后写入 `OperationLog`
- [ ] 可进入并维护 `/products`
- [ ] 不可进入 `/customers`
- [ ] 不因 worker 或 Redis 运行依赖而误获得导入管理权限

### OPS

- [ ] 可进入直播与运营相关页面
- [ ] 可进入 `/products`
- [ ] 不可进入 `/customers`
- [ ] 不可误获得公海池管理权限
- [ ] 不可误获得发货执行权限

## D. 文件、导出与后台进程

- [ ] `public/exports/shipping` 目录可写
- [ ] 批量生成批次后能写出文件
- [ ] `fileUrl` 可通过 Web 访问
- [ ] 重生成文件动作正常
- [ ] 缺文件状态时页面提示正常
- [ ] Redis 进程或实例可达
- [ ] lead import worker 持续运行且日志正常
- [ ] 重启 Web 不会导致 worker 配置漂移
- [ ] 重启 worker 后可继续消费后续导入批次

## E. 备份与回滚前置检查

- [ ] 发布前已做数据库快照
- [ ] 发布前已备份 `public/exports` 与 `public/uploads`
- [ ] 已标记当前候选版本的 Git tag 或明确 release commit
- [ ] 已保留上一个可启动版本
- [ ] 如果本次需要执行 migration metadata reconcile 或新 migration，已安排维护窗口
- [ ] 如果本次涉及异步导入链路调整，已确认 Redis 与 worker 的回滚方案

## F. Production 前复制检查

- [ ] 已整理出一份 production 环境变量清单，变量名与 staging 完全一致
- [ ] 已确认 production 使用独立 MySQL 库、环境文件和 systemd service
- [ ] 已确认 production Redis 可用且 `REDIS_URL` 已替换为 production 值
- [ ] 已记录 staging 验收通过时对应的 Git tag 或 release commit
- [ ] 已确认 production 首发仍然按空库流程执行，而不是沿用本地 seed 数据
- [ ] 已确认 production 同时部署 Web service 与 lead import worker service

## 验收结论

### 可以判定通过的条件

- 上述 A、B、C、D、E 核心项没有阻塞性失败
- 登录、异步导入、TradeOrder、`/fulfillment`、公海池、商品中心均可完成最小 smoke
- 角色权限没有明显误扩权
- Web、Redis、worker 三段链路完整

### 出现以下情况时，不建议继续推进

- 管理员 bootstrap 失败
- `/fulfillment` 或 `/customers/public-pool` 入口无法打开
- schema 无法通过 `prisma validate / generate`
- 构建失败
- 登录保护与角色跳转失效
- Redis 不可达
- lead import worker 无法稳定启动
- 导入批次无法被 worker 正常消费
