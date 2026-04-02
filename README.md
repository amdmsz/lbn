# Liquor CRM MVP

酒水私域销售团队内部 CRM。

当前 MVP 已覆盖：

- 线索接入与分配
- 客户管理
- 通话 / 微信跟进记录
- 直播场次与邀约记录
- 订单 / 礼品 / 代发任务
- Dashboard / 基础报表
- OperationLog 审计日志

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

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
```

3. 配置 `.env`

- `DATABASE_URL` 指向本地 MySQL
- `NEXTAUTH_URL` 本地开发通常为 `http://localhost:3000`
- `NEXTAUTH_SECRET` 使用随机长字符串

4. 生成 Prisma Client

```bash
npx prisma generate
```

5. 同步数据库结构

```bash
npx prisma db push
```

6. 导入演示数据

```bash
npm run db:seed
```

7. 启动开发环境

```bash
npm run dev
```

默认访问：

- `http://localhost:3000`
- 未登录会跳转到 `/login`

## Demo Accounts

执行 `npm run db:seed` 后会生成以下演示账号：

- `admin`
- `supervisor`
- `sales`
- `ops`
- `shipper`

默认密码：

```text
demo123456
```

## Prisma Commands

常用命令：

```bash
npx prisma validate
npx prisma generate
npx prisma db push
npx prisma studio
```

当前仓库保留了早期 migration，但后续 MVP 演进主要通过 schema 直推本地数据库。

- 本地开发优先使用 `npx prisma db push`
- 如果后续补齐正式 migration，再在生产环境改用 `npx prisma migrate deploy`

## Seed Command

```bash
npm run db:seed
```

用途：

- 初始化角色
- 初始化演示用户
- 初始化线索 / 客户 / 跟进 / 直播 / 订单 / 礼品等基础演示数据

## Build Commands

代码检查：

```bash
npm run lint
```

生产构建：

```bash
npm run build
```

本地模拟生产启动：

```bash
npm run start
```

## Deployment Outline

适用于宝塔 Node 项目部署前后的最小流程。

1. 准备生产 MySQL 数据库
2. 上传代码并安装依赖

```bash
npm install
```

3. 配置生产环境变量

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

4. 生成 Prisma Client

```bash
npx prisma generate
```

5. 同步数据库结构

MVP 当前建议：

```bash
npx prisma db push
```

如果后续补齐正式 migration，再切换为：

```bash
npx prisma migrate deploy
```

6. 如需初始化演示环境，再执行：

```bash
npm run db:seed
```

7. 构建生产包

```bash
npm run build
```

8. 宝塔 Node 启动命令

```bash
npm run start
```

9. 配置反向代理与域名，将外部流量转发到 Node 服务端口

## Suggested Pre-release Checks

- `npm run lint`
- `npm run build`
- 登录页可正常鉴权
- 各角色导航与路由权限一致
- 核心列表页和详情页具备 loading / empty / error 状态
- 关键动作可在 OperationLog 中追溯
