# 2026-04-22 Release Guardrails Plan

## Scope

基于本次真实发布事故，补齐仓库级发布防呆与护栏，范围仅限：

- 发布前检查脚本
- 正式更新脚本
- 构建期依赖防呆
- Prisma migration 门禁
- 发布后最小 smoke test
- deployment / staging 文档同步

不包含：

- 业务功能开发
- schema 语义变更
- worker / systemd 架构重做
- CI 平台接入

## Invariants

- 不改业务主链行为
- 不引入新的业务依赖
- 不修改 Prisma schema 真相
- 不绕开现有 `scripts/prisma-guardrails.mjs`
- 正式发布顺序必须变得更严格，而不是更灵活

## Root Cause Summary

1. 线上 `git pull` 可能被脏工作区拦住，缺少统一发布前清洁门禁。
2. 服务器构建依赖 `devDependencies`，尤其 `postcss.config.mjs` 明确依赖 `@tailwindcss/postcss`，一旦按 production omit dev 安装就会构建失败。
3. migration 相关检查分散存在，但没有被 release preflight / deploy script 严格串成不可跳过的顺序。
4. 当前 `deploy-update.sh` 在包含 migration 的发布里，存在 build 之前先动数据库的可能窗口。

## Implementation Checklist

### Phase 1. 审计并补 preflight

- [ ] 强化 `scripts/release-preflight.sh`
- [ ] 增加 `package-lock.json` 干净检查
- [ ] 固定执行 `npm ci --include=dev`
- [ ] 固定执行 `npx prisma validate`
- [ ] 固定执行 `npx prisma generate`
- [ ] 固定执行 `npm run lint`
- [ ] 固定执行 `npm run build`
- [ ] 固定执行 `npx prisma migrate status` / 等效正式门禁

### Phase 2. 重构 deploy-update

- [ ] 保留工作区干净检查
- [ ] 固定 `npm ci --include=dev`
- [ ] 固定先 preflight / build
- [ ] 固定 build 通过后才允许 `prisma migrate deploy`
- [ ] 失败立即退出
- [ ] 重启 Web / worker 前确认前序步骤全部成功

### Phase 3. 增加 smoke test

- [ ] 新增最小 smoke 脚本
- [ ] 覆盖 `/login`
- [ ] 覆盖 `/products`
- [ ] 覆盖 `/customers`
- [ ] 覆盖 `/orders`
- [ ] 覆盖一个关键静态资源
- [ ] 覆盖一个关键 API 路由

### Phase 4. 文档同步

- [ ] 更新 `docs/deployment-baseline.md`
- [ ] 更新 `docs/staging-checklist.md`
- [ ] 如确有必要，更新 `AGENTS.md`

### Phase 5. 本地验证

- [ ] 跑 `npm run lint`
- [ ] 跑 `npm run build`
- [ ] 对新脚本做最小运行验证

## Validation Strategy

```bash
cmd /c npm run lint
cmd /c npm run build
bash scripts/release-preflight.sh
```

如 smoke 脚本依赖本地服务，再补：

```bash
bash scripts/release-smoke.sh http://127.0.0.1:3000
```

## Rollback Notes

- 脚本改动失败时，优先回滚 `scripts/release-preflight.sh` 与 `scripts/deploy-update.sh`
- 文档改动可独立回滚
- 不对数据库做任何新增写操作；只有发布时才会通过 `migrate deploy` 触发数据库变更
