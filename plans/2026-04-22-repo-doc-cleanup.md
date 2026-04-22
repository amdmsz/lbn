# 2026-04-22 Repo Doc / Cleanup Plan

## Scope

在**不改业务真相、不改 schema、不动主链入口**的前提下，做一次仓库级文档与无效文件清理，目标是：

- 更新仓库入口文档与目录说明，让当前真实代码结构更容易被接手
- 清理确定无运行价值、无引用价值、无审计价值的垃圾文件
- 归档或删除已失效的历史残留，降低仓库噪音
- 不把这次 cleanup 扩成无边界重构

## Execution Status

- 状态：Phase 1 / Phase 2 / Phase 3 已执行完成
- 时间：2026-04-22
- 备注：`node_modules/` 保留，用于本地开发与回归验证；未纳入本次删除动作

## Invariants（不变量）

- 不改 `Customer / Public Pool / Recycle Bin / Fulfillment / Orders / Products` 主链行为
- 不改 Prisma schema、migration、seed 真相
- 不改常用测试库，不顺手处理 baseline 技术债
- 不删除仍被代码、文档、部署说明、兼容流程引用的文件
- 不删除可能被外部协作工具依赖的兼容入口，除非先完成引用迁移并确认替代物
- 只做 additive / subtractive 的文档与垃圾清理，不做逻辑重写

## Current Audit

### A. 可立即安全清理的本地产物

这些文件/目录属于生成物或临时产物，不应长期留在工作区：

- `.next/`
- `node_modules/`
- `tsconfig.tsbuildinfo`
- `next-env.d.ts`
- `.tmp-customers-start.log`

说明：

- 它们不是仓库真相
- 已被 `.gitignore` 覆盖或属于可再生成文件
- 清理后可通过 `npm install` / `npm run build` / Next.js 自动恢复

### B. 已被 Git 跟踪、但高度疑似历史噪音

- `HANDOFF_STEP4B_DONE.md`
- `reports/legacy-customer-import/report-2026-04-08T15-20-53-876Z.json`

目前审计结果：

- `HANDOFF_STEP4B_DONE.md` 仅自身存在，未发现其他文件引用
- `reports/...json` 是一次性导入报告产物，不应作为仓库长期真相

### C. 已被 Git 跟踪、但仍有引用的历史文件

- `STAGE_FREEZE_2026-04-03.md`

当前仍被以下文件引用：

- `HANDOFF.md`
- `PRD.md`

结论：

- 不能直接删除
- 若要清理，必须先把仍然有效的信息吸收到当前主文档或迁移到 `docs/archive/`，再更新引用

### D. 暂不自动删除的兼容/个人工具文件

- `CLAUDE.md`
- `claude.ps1`

当前判断：

- `CLAUDE.md` 是外部 agent 兼容 shim，内容虽小，但存在明确用途可能性
- `claude.ps1` 看起来像个人运行包装脚本，仓库内未发现引用，但可能是协作人的本地入口

处理原则：

- 第一阶段不自动删除
- 若第二阶段要删，先确认是否需要保留为团队兼容入口

### E. 明确不纳入本次清理的目录

这些目录虽然存在历史内容，但仍承担当前真实运行或审计职责，不纳入垃圾清理：

- `prisma/migrations*`
- `scripts/`
- `docs/ops/`
- `tests/`
- `deploy/`
- `reports/` 目录本身（可保留目录，清理其中错误地被跟踪的产物）

## Implementation Checklist

### Phase 1. 安全清理本地产物

- [x] 清理 `.next/`
- [ ] 清理 `node_modules/`
- [x] 清理 `tsconfig.tsbuildinfo`
- [x] 清理 `next-env.d.ts`
- [x] 清理 `.tmp-customers-start.log`
- [x] 确认 `.gitignore` 规则足够覆盖这些产物

### Phase 2. 文档入口更新

- [x] 更新 `README.md`，明确当前文档入口与历史文档定位
- [x] 更新 `HANDOFF.md`，移除对历史 freeze 文档的一级依赖
- [x] 更新 `PRD.md`，避免继续把 freeze 文件作为“当前真相”指针
- [x] 新增 `docs/archive/README.md`，说明运行文档 / 历史文档分层

### Phase 3. 删除或归档 Git 跟踪噪音

- [x] 将 `HANDOFF_STEP4B_DONE.md` 迁移到 `docs/archive/`
- [x] 删除 `reports/legacy-customer-import/report-2026-04-08T15-20-53-876Z.json`
- [x] 对 `STAGE_FREEZE_2026-04-03.md` 采用方案 B
- [ ] 方案 A：吸收必要信息后删除并改引用
- [x] 方案 B：迁移到 `docs/archive/` 并标记为历史归档，再改引用

### Phase 4. 第二轮可选清理

只有在确认不影响团队工具后才执行：

- [ ] 评估是否删除 `claude.ps1`
- [ ] 评估是否保留 `CLAUDE.md` 作为兼容 shim

## Validation

执行阶段完成后至少验证：

1. 引用完整性

```bash
rg -n "STAGE_FREEZE_2026-04-03|HANDOFF_STEP4B_DONE|report-2026-04-08T15-20-53-876Z" .
```

2. 仓库文档入口与状态

```bash
git status --short
```

3. 基础代码回归

```bash
cmd /c npm run lint
cmd /c npm run build
```

4. 必要时重新生成本地产物

```bash
cmd /c npm install
```

## Rollback Notes

- 文档删除或移动必须单独成组，便于回滚
- 历史文件优先“迁移引用 -> 删除文件”，不要直接一起硬删
- 若发现外部工具依赖 `CLAUDE.md` 或 `claude.ps1`，立即停止该项清理并保留
- 若 `README / HANDOFF / PRD` 改动导致入口表达不清，回滚文档修改，不影响代码主链

## Recommended Execution Order

1. 先清理本地产物
2. 再更新文档入口
3. 再删除 Git 跟踪噪音
4. 最后跑 `lint` / `build`

## Decision Notes

这次 cleanup 应该做成一次**简洁、低风险、可回滚**的动作，而不是“看到旧文件就删”。  
尤其是以下两点必须克制：

- 不把历史 migration / scripts / docs/ops 当成垃圾
- 不把个人工具兼容入口和 repo 真相混为一谈
