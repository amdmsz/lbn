# 酒庄 CRM

酒庄 CRM 是服务于酒水私域销售团队的内部 CRM。

当前仓库的真实业务基线以 `Customer` 销售主线、`TradeOrder` 成交主线、`/fulfillment` 履约主入口、`/products` 商品主入口为准，不是泛 ERP，也不包含 PBX / 外呼能力。

## 文档入口

- 产品基线：[PRD.md](./PRD.md)
- 真实进度：[PLANS.md](./PLANS.md)
- 交接摘要：[HANDOFF.md](./HANDOFF.md)
- UI 主入口与兼容路由：[UI_ENTRYPOINTS.md](./UI_ENTRYPOINTS.md)
- 正式部署主文档：[docs/deployment-baseline.md](./docs/deployment-baseline.md)
- staging 验收清单：[docs/staging-checklist.md](./docs/staging-checklist.md)
- Prisma migration rebaseline 说明：[docs/prisma-migration-rebaseline.md](./docs/prisma-migration-rebaseline.md)

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板并填写本地值

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. 同步现有 migration 并生成 Prisma Client

```bash
npx prisma migrate deploy
npx prisma generate
```

4. 按需导入本地演示数据

```bash
npm run db:seed
```

`db:seed` 只用于本地测试 / 演示数据，不用于 staging / production。

5. 启动开发环境

```bash
npm run dev
```

默认访问 `http://localhost:3000`。

## 正式部署

正式部署路线已经收口为：

- Ubuntu Server 24.04 LTS
- MySQL
- Nginx
- Node.js LTS
- systemd 托管 Next.js 进程

请直接使用 [docs/deployment-baseline.md](./docs/deployment-baseline.md) 中的正式部署说明、环境变量模板、systemd / Nginx 配置模板、备份脚本和更新脚本。

当前推荐的上线顺序固定为：

1. 先在 `staging` 按正式步骤完成一轮空库首发预演
2. 按 [docs/staging-checklist.md](./docs/staging-checklist.md) 完成 smoke
3. 再把同样步骤复制到 `production`

如果首发阶段先用内网地址或 IP：

- `NEXTAUTH_URL` 必须与当前真实访问地址完全一致
- 后续切域名或 HTTPS 时，必须同步更新 `NEXTAUTH_URL` 和 Nginx 配置

## 常用校验命令

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
```
