# Staging Checklist

更新时间：2026-04-05

本清单用于当前仓库进入 staging 时的最小验收。
只覆盖已经进入真实基线的功能，不覆盖 PBX、新 schema 里程碑或历史 migration 修复。

## A. 环境与部署

### 环境变量

- [ ] `DATABASE_URL` 已配置并指向 staging MySQL
- [ ] `NEXTAUTH_URL` 已配置为 staging 对外地址
- [ ] `NEXTAUTH_SECRET` 已配置为独立随机密钥
- [ ] 若需要远程物流轨迹：
  - [ ] `XXAPI_API_KEY` 已配置
  - [ ] `XXAPI_EXPRESS_ENDPOINT` 已按需配置或留空走默认值

### Prisma 与构建

- [ ] 执行 `npx prisma validate`
- [ ] 执行 `npx prisma generate`
- [ ] 首发到空库或需要同步当前 schema 时，执行 `npx prisma db push`
- [ ] 执行 `npm run build`
- [ ] 执行 `npm run start`

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

## B. 核心业务 Smoke

### 登录与会话

- [ ] 管理员可正常登录
- [ ] 首次改密链路正常
- [ ] 登出后再次访问受保护页面会被拦截

### 客户主线

- [ ] `/customers` 正常加载
- [ ] 客户列表筛选正常
- [ ] 客户卡片可进入详情
- [ ] `/customers/[id]` 各 tab 正常切换

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

### SUPERVISOR

- [ ] 可进入 `/customers`
- [ ] 可进入 `/fulfillment`
- [ ] 可进入 `/products`
- [ ] 可进入 `/customers/public-pool/settings`
- [ ] 只能看到本团队相关公海规则与报表范围

### SALES

- [ ] 默认入口是 `/customers`
- [ ] 可创建和编辑自己客户的 TradeOrder
- [ ] 可进入 `/payment-records` 与 `/collection-tasks`
- [ ] 不应把 `/shipping` 当作主工作台
- [ ] 只能认领公海客户，不能进入公海规则页

### SHIPPER

- [ ] 默认入口是 `/fulfillment?tab=shipping`
- [ ] 可进入 `/fulfillment?tab=shipping`
- [ ] 可进入 `/fulfillment?tab=batches`
- [ ] 不可进入 `/customers`
- [ ] 不可进入 `/products`

### OPS

- [ ] 可进入直播与运营相关页面
- [ ] 可进入 `/products`
- [ ] 不可进入 `/customers`
- [ ] 不可误获得公海池管理权限
- [ ] 不可误获得发货执行权限

## D. 文件与导出

- [ ] `public/exports/shipping` 目录可写
- [ ] 批量生成批次后能写出文件
- [ ] `fileUrl` 可通过 Web 访问
- [ ] 重生成文件动作正常
- [ ] 缺文件状态时页面提示正常

## E. 备份与回滚前置检查

- [ ] 发布前已做数据库快照
- [ ] 已标记当前候选版本的 Git tag 或明确 release commit
- [ ] 已保留上一个可启动版本
- [ ] 如果本次需要执行 `db push`，已安排维护窗口

## 验收结论

### 可以判定通过的条件

- 上述 A、B、C、D、E 核心项没有阻塞性失败
- 登录、TradeOrder、`/fulfillment`、公海池、商品中心均可完成最小 smoke
- 角色权限没有明显误扩权

### 出现以下情况时，不建议继续推进

- 管理员 bootstrap 失败
- `/fulfillment` 或 `/customers/public-pool` 入口无法打开
- schema 无法通过 `prisma validate / generate`
- 构建失败
- 登录保护与角色跳转失效
