# 2026-04-28 Call AI QA, Knowledge Base, Recycle Restore, And Workbench UX Plan

## Goal

把当前“能转写、能总结”的通话 AI，升级成真正贴近酒水私域销售一线的质检与训练系统；同时修复录音质检台信息架构、筛选状态丢失/列表回退体验，以及“新导入线索进入回收站后恢复找不到”的业务 bug。

This is a high-risk, multi-domain change. It touches AI prompt contract, call recording UI, possible Prisma schema, recycle-bin lifecycle, customer/lead list navigation, and auditability. It must be shipped in phases.

## Scope

- `/call-recordings` 录音质检台布局与 transcript 展示
- `lib/calls/*` AI 转写、分析 prompt、worker 结果 contract
- 录音 AI 资料库 / 话术知识库数据模型与人工复核流程
- `/customers`、`/leads` 热点工作台筛选与详情打开方式
- `lib/recycle-bin/*` 中 Lead / Customer 成对回收与恢复逻辑
- 文档、runbook、验证脚本

## Invariants

- `Customer` 仍是销售执行主对象；`Lead` 只做导入、去重、分配、审核。
- `/call-recordings` 仍是录音质检主入口；AI 是辅助，不替代主管复核。
- 服务端 RBAC 不放宽。销售只能看自己权限范围内的数据，主管按团队范围。
- 重要动作继续保留 `OperationLog` 或已有审计链。
- 不把筛选体验优化变成路由主线重写。
- 不把 AI 资料库自动当作“真理”。优秀/反面案例必须先人工标注或复核，再用于话术总结。

## Current Findings

### AI 分析太通用

`lib/calls/call-ai-provider.ts` 的 `buildAnalysisPrompt()` 现在是通用质检口径，评分为：

- 开场建立信任 15
- 需求/场景/预算挖掘 20
- 产品与价格匹配 20
- 异议处理 15
- 明确下一步 20
- 合规与服务态度 10

这没有区分当前业务最高频的两类场景：

- 新线索首呼：核心目标是加微信，完成从陌生电话到私域承接。
- 直播邀约/攻单：核心目标是确认观看/到场、制造直播利益点、推进套餐/付款/订单。

当前输出 schema 也只有 summary、intent、score、risk、opportunity、keywords、nextAction、dialogueSegments，缺少 scenario、阶段、失败步骤、好坏话术片段、加微质量、直播攻单质量等字段。

### Transcript UI 被截断

现有 UI 里有显式截断路径：

- `CallTranscriptDialogue` 默认 `maxSegments=8`
- `CallAiInsightPanel` 在录音工作台里传入 `maxTranscriptSegments={6}`
- fallback transcript 有 `line-clamp` 截断
- 数据查询已经加载了 `transcriptText` 与 `transcriptJson`

所以用户看到“语音转文字不全”，大概率是 UI 呈现不全，不一定是 ASR 没转出来。后续仍要用服务端样本确认 ASR 原始文本是否完整。

### 录音质检台信息架构不对

当前 `/call-recordings` 把客户信息、播放、AI/复核压在同一行或右侧堆叠里。用户需要的结构更清楚：

- 主内容：录音播放
- 播放下面：完整语音转文字
- 右侧：AI 分析、评分、风险、下一步、复核动作

这应该改成 split workbench，而不是继续往右侧塞内容。

### 筛选体验有 remount/回跳风险

`components/customers/customer-center-workbench.tsx` 里 `CustomerFilterToolbar` 使用 `key={JSON.stringify(data.filters)}`。这会在筛选变化后强制 remount 筛选条，用户感知就是“筛选栏刷新/重置”。

客户和线索列表已经大量用 URL search params、`router.replace(..., { scroll: false })`、SmartScroll，但这只能部分保留状态。热工作台需要更强的 list-state preservation：

- 筛选控件不 remount
- 结果区刷新
- 列表 scroll position 可恢复
- 详情可以新窗口/新 tab 或 drawer 打开，避免返回后重新找客户

### 新导入线索回收恢复后“消失”

初步风险点在 Lead 和 Customer 的 cascade recycle/restore：

- 导入线索可能自动创建轻量 Customer。
- Lead 回收时可能级联创建 Customer 回收站条目。
- Restore 目前更像只恢复当前选中的 recycle entry。
- Lead restore guard 会阻止关联 Customer 仍在回收站的情况。
- 如果用户只恢复 Lead 或只恢复 Customer，另一个对象仍隐藏，用户会觉得“不见了”。
- 恢复后对象也可能回到 `/leads?view=assigned` 或 `/customers` 的特定 owner/public-pool 视图，默认筛选隐藏了它。

需要先用生产数据查最近导入批次的 Lead/Customer recycle entries，再修复成对恢复行为或在 UI 中明确提示。

## Target AI Product Design

### Scenario Classifier

新增场景分类，不要再用一套通用评分覆盖所有电话：

- `NEW_LEAD_ADD_WECHAT`：新线索首呼/冷启动，目标是加微信。
- `LIVE_INVITE_CONVERSION`：直播邀约、直播开始前/中/后攻单，目标是到场、成交、付款。
- `EXISTING_CUSTOMER_FOLLOWUP`：老客户复购、售后、补充需求。
- `AFTER_SALES_OR_OTHER`：物流、售后、杂项或信息不足。

### Scenario Rubric

新线索加微信评分：

- 身份与信任建立：是否说清来源、身份、来电价值。
- 加微信理由：是否给出客户愿意添加的利益点，而不是生硬索要。
- 信息交换：是否拿到酒品偏好、用途、预算、地区、时间。
- 异议处理：客户忙、怕骚扰、不需要、价格敏感时的处理。
- 明确下一步：是否约定微信发送内容、回访时间、直播提醒。
- 合规与边界：不夸大、不虚假承诺、不强压客户。

直播邀约/攻单评分：

- 直播场景铺垫：是否说明直播利益点、时间、稀缺性。
- 需求匹配：是否把客户用途和套餐/酒品绑定起来。
- 成交推进：是否识别购买信号并推动下单/定金/付款。
- 异议拆解：价格、品质、真假、物流、赠品、售后。
- 直播承接动作：预约提醒、微信跟进、直播间动作、订单确认。
- 风险控制：不过度承诺、不制造虚假紧迫。

### Additive Output Contract

建议在 schema milestone 中新增结构化字段，而不是长期塞进 tags：

- `scenario`
- `scenarioConfidence`
- `scenarioScore`
- `stage`
- `failedStep`
- `bestLine`
- `badLine`
- `coachSuggestion`
- `objectionsJson`
- `customerSignalsJson`
- `scriptMomentsJson`

Phase 1 如果不做 schema，可先把场景写入 `opportunityTags` / `riskFlags`，把教练建议写入 `nextActionSuggestion`，但这只是临时兼容，不是长期结构。

## Target Recording UI

### Layout

改为 master-detail/split workbench：

- 左侧或上方列表：录音队列，显示客户、销售、时长、AI 状态、分数、场景。
- 主内容区：选中录音的播放器，波形/进度/倍速/下载/复制链接。
- 播放器下方：完整 transcript，按销售/客户分段，不默认截断。
- 右侧 sticky panel：AI 分析、场景、评分、风险、机会、下一步、复核动作。

### Transcript Rules

- 默认展示完整 transcript，不再只显示 6 或 8 段。
- 长 transcript 使用内部滚动和折叠目录，而不是截断文字。
- 支持复制全文、复制客户原话、跳转到对应时间点。
- ASR 原始文本为空时明确显示“转写为空/音频过短/AI 失败原因”，不要伪装成没有内容。

### AI Panel Rules

- 右侧只放“分析”和“决策”，不要再混入完整转写。
- 首屏只放：场景、分数、结论、下一步、关键风险。
- 下方 progressive disclosure：异议、优秀话术、问题话术、复核记录、原始 JSON。

## AI Knowledge Base Design

### Purpose

把主管认可的好/坏电话片段沉淀成资料库，最终由 AI 定期总结话术 SOP，给销售学习。

### Data Model Candidate

Schema milestone 可新增：

- `CallPlaybookExample`
  - linked `recordingId`, `callRecordId`, `analysisId`, `customerId`, `salesId`
  - `scenario`
  - `exampleType`: GOOD / BAD / RISK / OBJECTION / CLOSING / WECHAT_ASK
  - `snippetText`
  - `startMs`, `endMs`
  - `reason`
  - `tagsJson`
  - `approvedById`, `approvedAt`

- `CallPlaybookInsight`
  - `scenario`
  - `title`
  - `summary`
  - `talkTrack`
  - `antiPatterns`
  - `sourceExampleIdsJson`
  - `generatedByModel`
  - `reviewStatus`: DRAFT / APPROVED / ARCHIVED

### Workflow

1. AI 从通话中提取候选好/坏片段。
2. 主管在录音质检台点“加入资料库”。
3. 资料库积累到阈值后，AI 按场景总结话术。
4. 主管审核后发布到团队学习区。
5. 销售侧只看到已审核话术，不看到未经复核的自动结论。

## Recycle Restore Fix Plan

### Diagnostics First

在生产服务器查询最近 Lead / Customer 回收站条目，确认“消失”的实际状态：

```bash
cd /var/www/jiuzhuang-crm
set -a
. /etc/jiuzhuang-crm/jiuzhuang-crm.env
set +a

ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env node - <<'NODE'
require("dotenv").config({ path: process.env.ENV_FILE, quiet: true });
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });

(async () => {
  const entries = await prisma.recycleBinEntry.findMany({
    where: { domain: { in: ["LEAD", "CUSTOMER"] } },
    take: 50,
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      domain: true,
      targetType: true,
      targetId: true,
      titleSnapshot: true,
      secondarySnapshot: true,
      status: true,
      activeEntryKey: true,
      restoreRouteSnapshot: true,
      deletedAt: true,
      resolvedAt: true,
      blockerSnapshotJson: true,
    },
  });
  console.dir(entries, { depth: null });
})().finally(() => prisma.$disconnect());
NODE
```

### Expected Fix

- Restore Lead 时，如果它级联隐藏了 lightweight Customer，应同时恢复 paired Customer recycle entry，或弹出明确的“同时恢复关联客户”动作。
- Restore Customer 时，如果它来自导入 Lead，也要检查 paired Lead 是否仍在 recycle bin。
- Restore result message 必须告诉用户恢复到哪里：
  - `/leads?view=unassigned`
  - `/leads?view=assigned`
  - `/customers`
  - `/customers/public-pool`
- 恢复动作写 OperationLog / recycle resolved metadata。
- 为 Lead imported customer cascade restore 增加测试。

## Site-Wide Filter And Navigation UX Plan

### Phase A: Hot Workbench Fix

先做 `/customers` 和 `/leads`：

- 移除筛选组件上会强制 remount 的 dynamic key。
- 筛选 input/select 采用 URL params 初始化，但交互期间保持 client state。
- 提交筛选只更新结果区；pending 状态只覆盖 table/list，不重置筛选条。
- 分页、page size、视图切换保留当前筛选。
- 列表 scroll position 使用 `sessionStorage` keyed by pathname + query。

### Phase B: Detail Opening

- 客户列表行增加“新窗口打开”图标按钮。
- 默认点击姓名可按当前产品决策：
  - conservative：仍本页打开，但提供新窗口按钮。
  - aggressive：直接 target `_blank` 打开客户详情。
- 线索详情同理。
- 保留原 URL search params 作为 return context，确保详情返回能回到筛选上下文。

### Phase C: Drawer Later

如果新窗口仍不够顺手，再做 detail drawer：

- 客户轻档案 drawer 展示关键字段、外呼入口、跟进记录。
- 深操作仍进入 `/customers/[id]`。
- Drawer 必须复用服务端权限，不做前端假数据越权。

## Implementation Milestones

### Milestone 1: Immediate UX And Prompt Tightening

Scope:

- `/call-recordings` 重新布局：播放 + 完整转写在主区域，AI 分析在右侧。
- 去掉 transcript 默认截断，保留长文本内部滚动。
- `buildAnalysisPrompt()` 加入两个业务场景的判断与评分说明，但不改 DB schema。
- `/customers` 去掉 filter toolbar dynamic key，加入客户详情新窗口按钮。
- 加生产诊断脚本或 runbook，用来定位 Lead/Customer 恢复后不可见原因。

Validation:

- `npm run lint`
- `npm run build`
- 手动检查 `/call-recordings`：完整 transcript、AI panel、播放器倍速/进度条。
- 手动检查 `/customers`：筛选后筛选条不重置，详情可新窗口打开。

### Milestone 2: Recycle Restore Correctness

Scope:

- 根据生产诊断结果修复 Lead/Customer paired restore。
- 增加测试覆盖：
  - imported lead -> cascade customer recycle -> restore lead
  - restore customer while paired lead remains recycled
  - restore route snapshot 正确返回
- UI 上展示 paired restore impact。

Validation:

- targeted tests for recycle-bin lifecycle
- `npm run lint`
- `npm run build`
- 生产 dry-run 查询确认历史异常对象状态。

### Milestone 3: Structured AI Schema

Scope:

- Prisma migration：给 `CallAiAnalysis` 或新表增加 scenario/scoring/moments fields。
- 更新 provider schema、worker persist、query hydration、UI panel。
- 增加 re-analyze action：按新 prompt 对已有录音重新分析。

Validation:

- `npx prisma validate`
- `npx prisma generate`
- `npm run prisma:predeploy:check`
- `npm run lint`
- `npm run build`
- 对 3 条真实录音 dry-run compare old/new analysis。

### Milestone 4: AI Knowledge Base

Scope:

- 新增 `CallPlaybookExample` / `CallPlaybookInsight`。
- 主管可从录音质检台标注好/坏片段。
- 新增资料库页面或 `/call-recordings?tab=playbook`。
- AI 定期总结场景话术，主管审核后发布。

Validation:

- RBAC：销售不能修改资料库；主管按团队；管理员全局。
- Audit：标注、审核、发布有操作记录。
- `npm run lint`
- `npm run build`

### Milestone 5: Site-Wide Workbench State System

Scope:

- 抽出 shared filter state / list state pattern。
- 应用到 `/leads`、`/customers`、`/customers/public-pool`、`/orders`、`/fulfillment` 等高频列表。
- 统一新窗口/detail drawer 交互规范。

Validation:

- 每个主入口手动 smoke test。
- `npm run lint`
- `npm run build`

## Rollback Notes

- Milestone 1 不改 schema，最容易回滚；可单独 revert UI/prompt changes。
- Milestone 2 改生命周期逻辑，必须先通过生产数据诊断确认，不直接对历史数据做批量修复。
- Milestone 3/4 有 Prisma migration，发布前必须走 `npm run prisma:predeploy:check` 和 `bash scripts/release-preflight.sh`。
- AI knowledge base 只新增，不应改变已有 `CallAiAnalysis` 的展示真相，直到新 UI 稳定。

## Recommended First Execution

下一轮优先只做 Milestone 1：

1. 录音质检台重排，完整 transcript 不截断。
2. AI prompt 增加新线索加微 / 直播攻单场景判断。
3. 客户列表详情新窗口入口和筛选条不 remount。
4. 加回收站诊断命令/脚本，不直接改 restore 逻辑。

这样能最快解决用户当前最明显的痛点，同时不把 schema、回收站状态机和 AI 资料库一次性混在同一个发布里。
