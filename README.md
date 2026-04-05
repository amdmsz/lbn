# Liquor CRM

酒水私域销售团队内部 CRM。

当前仓库的真实业务基线已经收口到：

- `Customer` 为销售执行主对象，Sales 主工作区是 `/customers`
- `TradeOrder` 为成交主单，`SalesOrder` 为 supplier 子单
- `/fulfillment` 为统一订单履约入口，包含 `trade-orders / shipping / batches` 三视图
- `/products` 为商品域唯一一级入口，supplier 管理收进 `/products?tab=suppliers`
- 公海池已经是 `Customer ownership lifecycle`，不是 Lead 2.0

## 文档入口

- 产品基线：[PRD.md](./PRD.md)
- 里程碑与真实进度：[PLANS.md](./PLANS.md)
- 交接摘要：[HANDOFF.md](./HANDOFF.md)
- UI 主入口与兼容路径：[UI_ENTRYPOINTS.md](./UI_ENTRYPOINTS.md)
- 前端 Prisma enum runtime 规则：[docs/frontend-runtime-rules.md](./docs/frontend-runtime-rules.md)
- staging / production 部署基线：[docs/deployment-baseline.md](./docs/deployment-baseline.md)
- staging 验收清单：[docs/staging-checklist.md](./docs/staging-checklist.md)

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- MySQL
- NextAuth

## Local Setup

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. 配置 `.env`

本地开发至少需要：

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

物流轨迹联调按需补充：

- `XXAPI_API_KEY`
- `XXAPI_EXPRESS_ENDPOINT`

4. 生成 Prisma Client

```bash
npx prisma generate
```

5. 同步本地数据库结构

```bash
npx prisma db push
```

6. 按需导入本地 demo 数据

```bash
npm run db:seed
```

说明：

- `db:seed` 只用于本地演示和权限联调
- 不要在 staging / production 使用 `db:seed`

7. 启动开发环境

```bash
npm run dev
```

默认访问：

- `http://localhost:3000`
- 未登录会跳转到 `/login`

## 首个管理员初始化

正式环境与 staging 不再依赖 demo seed 初始化账号。

当前最小初始化方案：

```bash
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
```

脚本会：

- 确保核心角色存在
- 创建首个管理员
- 避免重复造数据
- 在显式 `--force` 时才刷新已有账号

详细说明见：

- [docs/deployment-baseline.md](./docs/deployment-baseline.md)

## Prisma 与发布基线

当前仓库的正式生产同步策略已经单独收口在部署文档中。

当前原则：

- 本地开发优先使用 `npx prisma db push`
- staging / production 首发到空库时，当前也以 `db push` 作为真实 schema 同步方案
- 历史 migration 链技术债尚未修复前，不把 `migrate deploy` 当成当前默认生产入口

不要在没有单独 migration 修复里程碑的情况下，把当前仓库直接切回 `migrate deploy`。

## 常用命令

```bash
npx prisma validate
npx prisma generate
npx prisma db push
npm run lint
npm run build
npm run start
```

## 发布前最低检查

- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npm run build`
- 首个管理员初始化方案已验证
- 登录页不暴露 demo 文案
- `/fulfillment`、`/products`、公海池和兼容路由口径与文档一致

## 当前 Staging 验收边界

当前建议进入 staging 验收的边界只包含这些已经落地的主线：

- 客户主线：`/customers` 与客户详情执行链
- 成交与履约主线：`TradeOrder` + `/fulfillment`
- 商品中心收口：`/products` + `/products?tab=suppliers`
- 公海池 ownership lifecycle：`/customers/public-pool`
- 登录、环境变量、Prisma 同步与管理员初始化基线

不包含：

- PBX / 外呼
- 新 schema 里程碑
- 历史 migration 链修复
- 新业务功能扩展
