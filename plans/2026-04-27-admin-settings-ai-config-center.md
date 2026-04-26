# 管理员设置与 AI 录音配置中心计划

## 状态

- 日期：2026-04-27
- 状态：Phase 1 / Phase 2 / Phase 3 已完成；下一步进入 Phase 4 runtime DB config 读取
- 目标：把 `/settings` 从“主数据入口页”升级成管理员配置中心，并把通话录音存储、ASR 转写、AI 分析模型、说话人分离纳入可审计配置。

## 背景

当前 `/settings` 已有账号、团队、标签、字典、通话结果等入口，但还不是完整的系统配置中心。

现有录音与 AI 链路已经具备基础能力：

- 录音文件模型：`CallRecording`
- AI 分析模型：`CallAiAnalysis`
- 录音存储读取：`lib/calls/recording-storage.ts`
- AI provider：`lib/calls/call-ai-provider.ts`
- AI worker：`lib/calls/call-ai-worker.ts`
- 录音质检页：`/call-recordings`

当前主要限制：

- 录音存储与 AI provider 主要依赖环境变量，不方便管理员在后台配置。
- DashScope 文件 ASR 需要公网可访问音频 URL，不适合用户当前内网服务器。
- 内网 ASR 已有 `LOCAL_HTTP_ASR` 路线，但设置页没有配置入口。
- ASR 已能接收 `segments`，但还没有一等的说话人分离 contract。
- `/settings` 权限目前是 `ADMIN / SUPERVISOR` 可进入，真正的全局配置应收口为 `ADMIN`。

## Scope

本计划覆盖以下能力：

- 管理员设置中心 IA / UI 重构。
- 网站信息设置。
- 账号、角色和额外权限管理增强。
- 录音存储路径、上传限制、保留时间、内网挂载策略配置。
- ASR 转文字 provider 配置，优先支持内网 `LOCAL_HTTP_ASR`。
- AI 分析 LLM provider 配置，支持国内便宜好用 provider 与 OpenAI-compatible provider。
- 说话人分离 speaker diarization 的数据 contract、worker 处理和前端展示。
- 设置变更审计、敏感字段保护、配置回滚。

## Non-Goals

- 不把 CRM 改成 PBX 或呼叫中心系统。
- 不重写 Android 通话录音主链。
- 不改变 `Customer` 销售主线和 `TradeOrder` 成交主线。
- 不把 payment / fulfillment truth layer 混入设置中心。
- 不让 `SUPERVISOR` 获得全局系统配置修改权限。
- 不把 API Key 明文展示或明文长期保存。
- 不依赖公网音频 URL 作为内网用户的默认 ASR 方案。

## Invariants

- RBAC 必须服务端执行，不能只靠前端隐藏。
- 全局配置写入只允许 `ADMIN`。
- 主管可继续访问原主数据类设置，但不能修改 AI provider、录音存储路径、网站级安全配置。
- 所有系统配置变更必须写 `OperationLog`，module 使用 `SYSTEM`。
- 敏感值如 API Key 必须 masked display，写入时加密或仅允许通过环境变量注入。
- 环境变量仍作为 fallback，避免 DB 配置异常时系统无法启动。
- 录音文件路径必须做路径越界保护，并限制在允许的 storage roots 之内。
- ASR 结果必须保留 raw payload，方便后续修复 diarization / transcript parser。

## 推荐信息架构

`/settings` 首页改成管理员控制台，一级分区如下：

1. 站点与企业信息
   - 系统名称
   - 企业名称
   - 登录页提示
   - 联系方式
   - Logo / favicon 路径
   - 默认时区与日期格式

2. 账号、角色与权限
   - 账号管理
   - 团队管理
   - 额外权限矩阵
   - 登录安全策略
   - 密码策略
   - 登录会话策略

3. 客户与业务规则
   - 标签体系
   - 字典与类目
   - 通话结果
   - 客户公海池规则入口
   - 导入与去重配置入口

4. 通话录音与存储
   - 存储 provider：`LOCAL_MOUNT` first
   - 录音根路径
   - 分片临时目录
   - 单文件大小限制
   - 分片大小
   - 默认保留天数
   - 播放转码缓存策略
   - 存储健康检查

5. AI 转写与分析
   - ASR provider
   - 内网 ASR endpoint
   - ASR model
   - ASR max file size
   - LLM provider
   - LLM base URL
   - LLM model
   - API Key masked input
   - 分析 JSON schema 测试
   - provider smoke test

6. 说话人分离
   - 是否启用 diarization
   - ASR speaker field mapping
   - 销售 / 客户角色映射策略
   - fallback role inference
   - transcript display mode

7. 审计、运行时与维护
   - 最近设置变更
   - worker 运行提示
   - 录音队列状态
   - AI 失败原因聚合
   - 配置导出 / 只读快照

## Schema Proposal

### `SystemSetting`

用途：保存 typed config。按 namespace + key 唯一。

建议字段：

- `id`
- `namespace`
- `key`
- `valueJson`
- `secretValueEncrypted`
- `valueVersion`
- `isSecret`
- `description`
- `updatedById`
- `createdAt`
- `updatedAt`

索引：

- `@@unique([namespace, key])`
- `@@index([namespace, updatedAt])`

### `SystemSettingRevision`

用途：配置变更历史与 rollback 基础。

建议字段：

- `id`
- `settingId`
- `namespace`
- `key`
- `beforeJson`
- `afterJson`
- `beforeSecretFingerprint`
- `afterSecretFingerprint`
- `changedById`
- `changeReason`
- `createdAt`

### `OperationTargetType`

新增：

- `SYSTEM_SETTING`

这样配置修改可以通过 `OperationLog` 做统一审计：

- `module = SYSTEM`
- `action = system_setting.updated`
- `targetType = SYSTEM_SETTING`
- `targetId = SystemSetting.id`

## Config Namespaces

建议第一版支持这些 namespace：

- `site.profile`
- `security.auth`
- `recording.storage`
- `recording.upload`
- `call_ai.asr`
- `call_ai.llm`
- `call_ai.diarization`
- `runtime.worker`

示例：

```json
{
  "namespace": "call_ai.asr",
  "key": "active",
  "valueJson": {
    "provider": "LOCAL_HTTP_ASR",
    "endpoint": "http://127.0.0.1:8787/transcribe",
    "model": "local-http-asr",
    "timeoutMs": 300000,
    "maxFileMb": 25
  }
}
```

```json
{
  "namespace": "call_ai.llm",
  "key": "active",
  "valueJson": {
    "provider": "DEEPSEEK",
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-v4-flash",
    "temperature": 0.2
  },
  "isSecret": true
}
```

## Provider Strategy

### ASR

第一优先级：

- `LOCAL_HTTP_ASR`
- `FUNASR`
- `SENSEVOICE`

原因：适合内网服务器，不要求录音公网可访问。

保留但不作为内网默认：

- `DASHSCOPE_FILE_ASR`
- `OPENAI`
- `OPENAI_COMPATIBLE_AUDIO`

### LLM

第一版保留并做后台可配置：

- `DEEPSEEK`
- `DASHSCOPE_QWEN`
- `MOONSHOT`
- `BIGMODEL`
- `VOLCENGINE_ARK`
- `TENCENT_HUNYUAN`
- `OPENAI_CHAT_COMPATIBLE`
- `OPENAI_RESPONSES`
- `MOCK_LLM`

Provider 实现继续复用 `lib/calls/call-ai-provider.ts`，先改成读取 `ResolvedCallAiConfig`，再保留 env fallback。

## Diarization Contract

扩展 `CallAiTranscriptionResult`：

```ts
type CallAiTranscriptSegment = {
  index: number;
  startMs: number | null;
  endMs: number | null;
  speaker: string | null;
  role: "SALES" | "CUSTOMER" | "UNKNOWN";
  text: string;
  confidence: number | null;
};
```

`CallAiTranscriptionResult` 增加：

- `segments?: CallAiTranscriptSegment[]`
- `diarizationProvider?: string | null`
- `diarizationConfidence?: number | null`

存储策略：

- `transcriptText` 保存可读文本。
- `transcriptJson` 保存 raw + normalized segments。
- 第一版不新增单独 `CallTranscriptSegment` 表，除非后续需要按话术/片段检索。

可读文本格式：

```text
[00:00] 销售：您好，我是...
[00:04] 客户：你们这个酒多少钱...
```

角色识别优先级：

1. ASR 直接返回 `role`。
2. ASR 返回 `speaker`，按配置映射 `speaker_0 -> SALES`、`speaker_1 -> CUSTOMER`。
3. 没有 speaker 时，LLM 根据对话语义做 fallback inference，但标记为低置信度。

注意：如果手机录音是单声道混音且 ASR 不支持 diarization，两人区分只能做概率推断，不能承诺 100% 准确。

## Implementation Checklist

### 当前执行进度

- Phase 1 已完成：`/settings` 管理员设置中心 IA / UI、admin-only 入口与权限收口。
- Phase 2 已完成：`SystemSetting / SystemSettingRevision` schema、migration、typed config service、secret 加密与审计 mutation。
- Phase 3 已完成：`/settings/site`、`/settings/recording-storage`、`/settings/call-ai`、`/settings/security`、`/settings/audit` 已接入真实可保存表单，保存后写 revision 和 `OperationLog`。
- Phase 4 待开始：录音存储、AI provider 和 worker runtime 读取 DB config，并保留 env fallback。

### Phase 1: Settings IA / UI 重构，先不改 schema

- 重构 `components/settings/settings-control-center.tsx`。
- 扩展 `lib/settings/metadata.ts`，新增上面 7 个设置分区。
- 保留原入口：users、teams、tags、dictionaries、call-results。
- 新增占位但明确状态的入口卡片：
  - `/settings/site`
  - `/settings/recording-storage`
  - `/settings/call-ai`
  - `/settings/security`
  - `/settings/audit`
- `ADMIN` 显示全量，`SUPERVISOR` 只显示主数据类入口。
- 更新 `lib/auth/access.ts` 的 settings path guard。
- 不接真实写入，避免第一步把 UI 和 DB 风险混在一起。

### Phase 2: SystemSetting schema 和配置服务

- 修改 `prisma/schema.prisma`，新增 `SystemSetting` / `SystemSettingRevision`。
- 新增 migration。
- 新增 `lib/system-settings/schema.ts`，定义 typed config zod schema。
- 新增 `lib/system-settings/queries.ts` 和 `lib/system-settings/mutations.ts`。
- 新增 masked secret helper。
- 新增 encryption helper：
  - 使用 `SYSTEM_SETTING_ENCRYPTION_KEY`。
  - 本地缺失时禁止保存 API Key，只允许保存非敏感字段。
- 所有 mutation 写 `OperationLog` 和 revision。
- 加 targeted tests 覆盖 config resolve、secret masking、RBAC。

### Phase 3: 管理员配置页面

- 实现 `/settings/site`。
- 实现 `/settings/recording-storage`。
- 实现 `/settings/call-ai`，包含 ASR、LLM、diarization 三组配置。
- 实现 `/settings/security` 的第一版：密码策略、会话提示、登录安全占位。
- 实现 `/settings/audit` 的第一版：读取最近 `SYSTEM` 操作日志。
- 页面都保留 loading / error / empty。
- 表单保存后显示配置版本和最近修改人。

### Phase 4: Runtime 读取 DB 配置

- `recording-storage.ts` 改为读取 resolved storage config，env fallback。
- `call-ai-provider.ts` 改为接收 resolved provider config，env fallback。
- `call-ai-worker.ts` 在处理每条录音时 snapshot 当前配置到 `OperationLog.afterData`。
- `scripts/check-call-ai-provider.ts` 支持读取 DB 配置，也保留 CLI override。
- 保留现有 `.env` 流程，不让生产部署突然依赖设置页初始化。

### Phase 5: ASR segments / 说话人分离

- 扩展 `LocalHttpAsrResponse` 支持：
  - `segments[].startMs`
  - `segments[].endMs`
  - `segments[].speaker`
  - `segments[].role`
  - `segments[].confidence`
- 标准化 transcript segments。
- `transcriptText` 生成带时间戳和角色的文本。
- `transcriptJson` 保存 raw + normalized。
- LLM 分析 prompt 优先使用带角色文本。
- 录音质检页和客户详情通话记录展示分角色 transcript。

### Phase 6: Hardening / 运维

- 增加录音存储健康检查：
  - 路径存在
  - 可写
  - 可读
  - 剩余空间提示
- 增加 AI provider smoke test：
  - ASR endpoint ping
  - LLM JSON schema test
  - 不发送真实客户数据的 dummy test
- 增加 runbook：
  - 内网 ASR 配置
  - API key 配置
  - 存储机器挂载配置
  - worker 启动与失败排查
- 增加 staging checklist。

## Files Expected To Change

第一期 UI / IA：

- `app/(dashboard)/settings/page.tsx`
- `components/settings/settings-control-center.tsx`
- `components/settings/settings-workspace-nav.tsx`
- `lib/settings/metadata.ts`
- `lib/auth/access.ts`

配置模型：

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `lib/system-settings/*`
- `app/(dashboard)/settings/*`

录音与 AI runtime：

- `lib/calls/recording-storage.ts`
- `lib/calls/call-ai-provider.ts`
- `lib/calls/call-ai-worker.ts`
- `scripts/check-call-ai-provider.ts`
- `components/calls/call-recordings-workbench.tsx`
- `components/customers/customer-call-record-history.tsx`

文档：

- `docs/call-ai-local-asr-runbook.md`
- `docs/deployment-baseline.md`
- `UI_ENTRYPOINTS.md`

## Validation Strategy

每个 phase 至少跑：

```bash
npm run lint
npm run build
```

涉及 schema 的 phase 还要跑：

```bash
npx prisma validate
npx prisma generate
npx prisma migrate dev --name add_system_settings_config_center
```

AI provider smoke test：

```bash
npm run check:call-ai-provider -- --endpoint=http://127.0.0.1:8787/transcribe
```

worker dry run：

```bash
npm run worker:call-ai -- --dry-run --limit=5
```

手工验收：

- ADMIN 可进入全量设置中心。
- SUPERVISOR 仍只能进主数据设置。
- 配置修改写入 `OperationLog`。
- API Key 不明文展示。
- 录音上传、播放、AI 转写、AI 分析仍能跑通。
- 内网 ASR 不要求公网录音 URL。
- diarization 开启后 transcript 能展示“销售 / 客户”分段。

## Rollback Notes

UI rollback：

- 只回退 `/settings` 相关组件和 metadata，不影响录音与 AI runtime。

Schema rollback：

- 新表 additive，不删除旧数据。
- 如果配置中心异常，runtime 继续走 env fallback。
- 不在第一版删除任何现有 env 配置。

Runtime rollback：

- `recording-storage.ts` 和 `call-ai-provider.ts` 保留 env-first 或 env-fallback 开关。
- 可通过禁用 DB config 读取恢复旧路径。

AI rollback：

- diarization 只增强 `transcriptJson` 和 `transcriptText` 生成，不破坏原始 raw。
- 如 segments 解析失败，退回纯文本转写。

## Recommended Execution Order

1. 先执行 Phase 1：设置中心 UI / IA 重构，无 schema。
2. 再执行 Phase 2 + Phase 3：SystemSetting schema 与管理员表单。
3. 再执行 Phase 4：runtime 切到 DB config + env fallback。
4. 最后执行 Phase 5 + Phase 6：diarization 展示、smoke test、runbook 和硬化。

这个顺序可以保证每一步都能单独 build、单独回滚，不把页面、数据库和 worker 改动压成一个大提交。
