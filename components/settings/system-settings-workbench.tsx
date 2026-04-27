import type { ReactNode } from "react";
import {
  saveOutboundCallSeatBindingAction,
  saveSystemSettingAction,
} from "@/app/(dashboard)/settings/actions";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { ActionBanner } from "@/components/shared/action-banner";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTimeLabel } from "@/lib/account-management/metadata";
import type { ActionNotice } from "@/lib/action-notice";
import type { SettingsViewerRole, SettingsWorkspaceValue } from "@/lib/settings/metadata";
import {
  CALL_AI_ASR_PROVIDERS,
  CALL_AI_LLM_PROVIDERS,
  DIARIZATION_PROVIDERS,
  OUTBOUND_CALL_CODECS,
  OUTBOUND_CALL_PROVIDERS,
  OUTBOUND_CALL_RECORDING_IMPORT_MODES,
  RECORDING_STORAGE_PROVIDERS,
  TRANSCRIPT_SPEAKER_ROLES,
  type CallAiAsrSettingValue,
  type CallAiDiarizationSettingValue,
  type CallAiLlmSettingValue,
  type OutboundCallProviderSettingValue,
  type RecordingStorageSettingValue,
  type RecordingUploadSettingValue,
  type RuntimeWorkerSettingValue,
  type SecurityAuthSettingValue,
  type SiteProfileSettingValue,
} from "@/lib/system-settings/schema";
import type { SystemSettingPublic } from "@/lib/system-settings/queries";
import {
  OUTBOUND_CALL_SEAT_PROVIDERS,
  outboundCallCodecLabels,
  outboundCallProviderLabels,
  outboundCallRecordingImportModeLabels,
  type OutboundCallSeatProvider,
} from "@/lib/outbound-calls/metadata";
import type { OutboundCallSeatBindingRow } from "@/lib/outbound-calls/seat-bindings";

type Metric = {
  label: string;
  value: string;
  hint?: string;
};

type OperationLogItem = {
  id: string;
  action: string;
  description: string | null;
  targetId: string;
  createdAt: Date;
  actor: {
    name: string;
    username: string;
  } | null;
};

const providerLabelMap: Record<string, string> = {
  LOCAL_MOUNT: "LOCAL_MOUNT · 本地挂载",
  MINIO: "MINIO",
  S3: "S3",
  LOCAL_HTTP_ASR: "LOCAL_HTTP_ASR · 内网 ASR",
  FUNASR: "FUNASR · 本地/内网",
  SENSEVOICE: "SENSEVOICE · 本地/内网",
  DASHSCOPE_FILE_ASR: "DASHSCOPE_FILE_ASR · 文件转写",
  OPENAI_COMPATIBLE_AUDIO: "OPENAI_COMPATIBLE_AUDIO",
  OPENAI: "OPENAI",
  MOCK: "MOCK",
  FREESWITCH: "FreeSWITCH / CTI Gateway",
  CUSTOM_HTTP: "自定义 HTTP CTI",
  PCMA: "PCMA · G.711A",
  PCMU: "PCMU · G.711U",
  OPUS: "OPUS",
  AUTO: "自动协商",
  WEBHOOK_URL: "Webhook 录音 URL",
  CDR_PULL: "CDR 拉取",
  FILE_DROP: "文件落盘扫描",
  DEEPSEEK: "DEEPSEEK",
  DASHSCOPE_QWEN: "通义千问",
  MOONSHOT: "Kimi / Moonshot",
  BIGMODEL: "智谱 BigModel",
  VOLCENGINE_ARK: "火山方舟",
  TENCENT_HUNYUAN: "腾讯混元",
  OPENAI_CHAT_COMPATIBLE: "OpenAI-compatible Chat",
  OPENAI_RESPONSES: "OpenAI Responses",
  MOCK_LLM: "MOCK_LLM",
  ASR_SEGMENTS: "ASR segments",
  LLM_INFERENCE: "LLM 推断",
  DISABLED: "关闭",
  SALES: "销售",
  CUSTOMER: "客户",
  UNKNOWN: "未知",
};

function getValue<T>(setting: SystemSettingPublic) {
  return setting.value as T;
}

function formatValue(value: string | number | null | undefined, fallback = "未配置") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatSecretStatus(setting: SystemSettingPublic) {
  if (!setting.secret.supported) {
    return "不需要";
  }

  return setting.secret.configured
    ? `已配置 ${setting.secret.fingerprintMasked ?? ""}`.trim()
    : "未配置";
}

function formatSource(setting: SystemSettingPublic) {
  return setting.source === "database" ? "数据库" : "默认值";
}

function SettingMeta({ setting }: Readonly<{ setting: SystemSettingPublic }>) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] leading-5 text-black/52">
      <StatusBadge
        label={setting.source === "database" ? "DB 配置" : "默认值"}
        variant={setting.source === "database" ? "success" : "neutral"}
      />
      <span>版本 {setting.valueVersion}</span>
      <span>
        {setting.updatedBy
          ? `${setting.updatedBy.name} · ${formatDateTimeLabel(setting.updatedAt)}`
          : "尚未保存"}
      </span>
    </div>
  );
}

function Field({
  label,
  description,
  children,
  wide = false,
}: Readonly<{
  label: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}>) {
  return (
    <label className={wide ? "space-y-2 xl:col-span-2" : "space-y-2"}>
      <span className="crm-label">{label}</span>
      {children}
      {description ? (
        <p className="text-[12px] leading-5 text-black/52">{description}</p>
      ) : null}
    </label>
  );
}

function ToggleField({
  name,
  label,
  description,
  defaultChecked,
}: Readonly<{
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
}>) {
  return (
    <label className="rounded-[0.9rem] border border-black/7 bg-[rgba(247,248,250,0.72)] p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-black/82">{label}</span>
          {description ? (
            <span className="mt-1 block text-[12px] leading-5 text-black/52">
              {description}
            </span>
          ) : null}
        </span>
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="mt-1 h-4 w-4 rounded border-black/20 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
        />
      </div>
    </label>
  );
}

function SelectField<T extends readonly string[]>({
  name,
  defaultValue,
  values,
}: Readonly<{
  name: string;
  defaultValue: string;
  values: T;
}>) {
  return (
    <select name={name} defaultValue={defaultValue} className="crm-select">
      {values.map((value) => (
        <option key={value} value={value}>
          {providerLabelMap[value] ?? value}
        </option>
      ))}
    </select>
  );
}

function SystemSettingForm({
  setting,
  redirectTo,
  children,
  secretLabel,
}: Readonly<{
  setting: SystemSettingPublic;
  redirectTo: string;
  children: ReactNode;
  secretLabel?: string;
}>) {
  return (
    <form action={saveSystemSettingAction} className="space-y-4">
      <input type="hidden" name="namespace" value={setting.namespace} />
      <input type="hidden" name="key" value={setting.key} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <SettingMeta setting={setting} />
          {setting.secret.supported ? (
            <p className="mt-2 text-[12px] leading-5 text-black/52">
              API Key：{formatSecretStatus(setting)}
            </p>
          ) : null}
        </div>
        <button type="submit" className="crm-button crm-button-primary self-start">
          保存配置
        </button>
      </div>

      {children}

      {setting.secret.supported ? (
        <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
          <Field
            label={secretLabel ?? "API Key"}
            description="留空会保留当前密钥；密钥只加密保存，不写入 valueJson 和审计明文。"
          >
            <input
              type="password"
              name="secretPlaintext"
              autoComplete="new-password"
              placeholder={setting.secret.configured ? "已配置，留空不变" : "输入后保存"}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="clearSecret"
            label="清空当前密钥"
            description="勾选后保存会删除已配置密钥。"
            defaultChecked={false}
          />
        </div>
      ) : null}

      <Field label="变更原因" description="会进入配置修订记录，方便回溯。">
        <input
          name="changeReason"
          maxLength={1000}
          placeholder="例如：切换内网 ASR、更新存储挂载路径"
          className="crm-input"
        />
      </Field>
    </form>
  );
}

function SystemSettingsLayout({
  activeValue,
  viewerRole,
  title,
  description,
  metrics,
  notice,
  children,
}: Readonly<{
  activeValue: SettingsWorkspaceValue;
  viewerRole: SettingsViewerRole;
  title: string;
  description: string;
  metrics: Metric[];
  notice: ActionNotice;
  children: ReactNode;
}>) {
  return (
    <div className="crm-page">
      <SettingsPageHeader
        activeValue={activeValue}
        viewerRole={viewerRole}
        title={title}
        description={description}
        badges={
          <>
            <StatusBadge label="ADMIN" variant="info" />
            <StatusBadge label="可审计配置" variant="success" />
          </>
        }
        metrics={metrics}
      />

      {notice ? (
        <ActionBanner tone={notice.tone} className="mt-4">
          {notice.message}
        </ActionBanner>
      ) : null}

      <div className="mt-5 grid gap-5">{children}</div>
    </div>
  );
}

function SettingSection({
  setting,
  redirectTo,
  eyebrow,
  title,
  description,
  children,
  secretLabel,
}: Readonly<{
  setting: SystemSettingPublic;
  redirectTo: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  secretLabel?: string;
}>) {
  return (
    <SectionCard eyebrow={eyebrow} title={title} description={description}>
      <SystemSettingForm
        setting={setting}
        redirectTo={redirectTo}
        secretLabel={secretLabel}
      >
        {children}
      </SystemSettingForm>
    </SectionCard>
  );
}

export function SiteSettingsWorkbench({
  setting,
  viewerRole,
  notice,
}: Readonly<{
  setting: SystemSettingPublic;
  viewerRole: SettingsViewerRole;
  notice: ActionNotice;
}>) {
  const value = getValue<SiteProfileSettingValue>(setting);

  return (
    <SystemSettingsLayout
      activeValue="site"
      viewerRole={viewerRole}
      title="网站信息"
      description="集中维护系统名称、企业资料、登录展示和默认区域格式。"
      notice={notice}
      metrics={[
        { label: "系统名称", value: value.systemName, hint: formatSource(setting) },
        { label: "企业名称", value: formatValue(value.companyName), hint: "登录页与导出抬头" },
        { label: "版本", value: String(setting.valueVersion), hint: "SystemSetting" },
      ]}
    >
      <SettingSection
        setting={setting}
        redirectTo="/settings/site"
        eyebrow="Site"
        title="站点资料"
        description="这些字段会先作为后台配置保存；运行时读取会在下一阶段接入。"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <Field label="系统名称">
            <input
              name="systemName"
              defaultValue={value.systemName}
              required
              maxLength={80}
              className="crm-input"
            />
          </Field>
          <Field label="企业名称">
            <input
              name="companyName"
              defaultValue={value.companyName ?? ""}
              maxLength={120}
              className="crm-input"
            />
          </Field>
          <Field label="联系信息">
            <input
              name="supportContact"
              defaultValue={value.supportContact ?? ""}
              maxLength={200}
              className="crm-input"
            />
          </Field>
          <Field label="默认时区">
            <input
              name="defaultTimezone"
              defaultValue={value.defaultTimezone}
              required
              maxLength={64}
              className="crm-input"
            />
          </Field>
          <Field label="Logo 路径">
            <input
              name="logoPath"
              defaultValue={value.logoPath ?? ""}
              maxLength={500}
              className="crm-input"
            />
          </Field>
          <Field label="Favicon 路径">
            <input
              name="faviconPath"
              defaultValue={value.faviconPath ?? ""}
              maxLength={500}
              className="crm-input"
            />
          </Field>
          <Field label="日期时间格式">
            <input
              name="dateTimeFormat"
              defaultValue={value.dateTimeFormat}
              required
              maxLength={64}
              className="crm-input"
            />
          </Field>
          <Field label="登录页提示">
            <textarea
              name="loginNotice"
              defaultValue={value.loginNotice ?? ""}
              rows={3}
              maxLength={500}
              className="crm-textarea"
            />
          </Field>
        </div>
      </SettingSection>
    </SystemSettingsLayout>
  );
}

export function RecordingStorageSettingsWorkbench({
  storageSetting,
  uploadSetting,
  viewerRole,
  notice,
}: Readonly<{
  storageSetting: SystemSettingPublic;
  uploadSetting: SystemSettingPublic;
  viewerRole: SettingsViewerRole;
  notice: ActionNotice;
}>) {
  const storage = getValue<RecordingStorageSettingValue>(storageSetting);
  const upload = getValue<RecordingUploadSettingValue>(uploadSetting);

  return (
    <SystemSettingsLayout
      activeValue="recording-storage"
      viewerRole={viewerRole}
      title="录音存储"
      description="维护本地挂载路径、上传分片、保留周期和播放缓存策略。"
      notice={notice}
      metrics={[
        { label: "Provider", value: storage.provider, hint: formatSource(storageSetting) },
        { label: "单文件", value: `${upload.maxFileMb} MB`, hint: "上传限制" },
        { label: "保留", value: `${storage.retentionDays} 天`, hint: "默认 retention" },
      ]}
    >
      <SettingSection
        setting={storageSetting}
        redirectTo="/settings/recording-storage"
        eyebrow="Storage"
        title="存储位置"
        description="内网服务器优先使用 LOCAL_MOUNT，把独立存储机器挂载成服务端本地目录。"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <Field label="存储 Provider">
            <SelectField
              name="provider"
              defaultValue={storage.provider}
              values={RECORDING_STORAGE_PROVIDERS}
            />
          </Field>
          <Field label="保留天数">
            <input
              type="number"
              name="retentionDays"
              min={1}
              max={3650}
              defaultValue={storage.retentionDays}
              className="crm-input"
            />
          </Field>
          <Field label="录音根路径" wide>
            <input
              name="storageDir"
              required
              maxLength={500}
              defaultValue={storage.storageDir}
              className="crm-input"
            />
          </Field>
          <Field label="分片临时目录" wide>
            <input
              name="uploadTmpDir"
              required
              maxLength={500}
              defaultValue={storage.uploadTmpDir}
              className="crm-input"
            />
          </Field>
          <Field label="Bucket">
            <input
              name="bucket"
              maxLength={191}
              defaultValue={storage.bucket ?? ""}
              className="crm-input"
            />
          </Field>
          <Field label="公网/签名 Base URL">
            <input
              name="publicBaseUrl"
              maxLength={500}
              defaultValue={storage.publicBaseUrl ?? ""}
              className="crm-input"
            />
          </Field>
          <Field label="播放缓存目录">
            <input
              name="playbackCacheDir"
              maxLength={500}
              defaultValue={storage.playbackCacheDir ?? ""}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="playbackCacheEnabled"
            label="启用播放缓存"
            description="用于转码后的播放文件缓存。"
            defaultChecked={storage.playbackCacheEnabled}
          />
        </div>
      </SettingSection>

      <SettingSection
        setting={uploadSetting}
        redirectTo="/settings/recording-storage"
        eyebrow="Upload"
        title="上传限制"
        description="Android 录音上传会按这些限制执行分片、过期和完整性校验。"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="最大文件 MB">
            <input
              type="number"
              name="maxFileMb"
              min={1}
              max={2048}
              defaultValue={upload.maxFileMb}
              className="crm-input"
            />
          </Field>
          <Field label="分片大小 MB">
            <input
              type="number"
              name="chunkSizeMb"
              min={1}
              max={100}
              defaultValue={upload.chunkSizeMb}
              className="crm-input"
            />
          </Field>
          <Field label="上传过期分钟">
            <input
              type="number"
              name="uploadExpiresMinutes"
              min={5}
              max={1440}
              defaultValue={upload.uploadExpiresMinutes}
              className="crm-input"
            />
          </Field>
          <Field label="允许的 MIME 类型" wide>
            <textarea
              name="allowedMimeTypes"
              rows={4}
              defaultValue={upload.allowedMimeTypes.join("\n")}
              className="crm-textarea"
            />
          </Field>
          <ToggleField
            name="requireSha256"
            label="要求 SHA-256"
            description="服务端校验分片与最终文件。"
            defaultChecked={upload.requireSha256}
          />
        </div>
      </SettingSection>
    </SystemSettingsLayout>
  );
}

function OutboundCallSeatBindingForm({
  row,
  defaultProvider,
}: Readonly<{
  row: OutboundCallSeatBindingRow;
  defaultProvider: OutboundCallSeatProvider;
}>) {
  const binding = row.outboundCallSeatBinding;
  const defaultSeatNo = row.username;

  return (
    <form
      action={saveOutboundCallSeatBindingAction}
      className="grid gap-3 rounded-[0.95rem] border border-black/7 bg-white px-3.5 py-3 shadow-[var(--color-shell-shadow-sm)] xl:grid-cols-[minmax(12rem,1.1fr)_8.5rem_8rem_8rem_8rem_8rem_6.5rem]"
    >
      <input type="hidden" name="redirectTo" value="/settings/outbound-call" />
      <input type="hidden" name="userId" value={row.id} />

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-black/82">
          {row.name}
        </p>
        <p className="mt-1 truncate text-[12px] text-black/52">
          @{row.username} / {row.team?.name ?? "未分组"} / {row.role.name}
        </p>
      </div>

      <label className="space-y-1.5">
        <span className="crm-label">Provider</span>
        <SelectField
          name="provider"
          defaultValue={binding?.provider ?? defaultProvider}
          values={OUTBOUND_CALL_SEAT_PROVIDERS}
        />
      </label>

      <label className="space-y-1.5">
        <span className="crm-label">坐席号</span>
        <input
          name="seatNo"
          required
          maxLength={80}
          defaultValue={binding?.seatNo ?? defaultSeatNo}
          placeholder={defaultSeatNo}
          className="crm-input"
        />
      </label>

      <label className="space-y-1.5">
        <span className="crm-label">分机</span>
        <input
          name="extensionNo"
          maxLength={80}
          defaultValue={binding?.extensionNo ?? ""}
          placeholder="可选"
          className="crm-input"
        />
      </label>

      <label className="space-y-1.5">
        <span className="crm-label">主叫</span>
        <input
          name="displayNumber"
          maxLength={80}
          defaultValue={binding?.displayNumber ?? ""}
          placeholder="线路侧决定"
          className="crm-input"
        />
      </label>

      <label className="space-y-1.5">
        <span className="crm-label">路由组</span>
        <input
          name="routingGroup"
          maxLength={120}
          defaultValue={binding?.routingGroup ?? ""}
          placeholder="default"
          className="crm-input"
        />
      </label>

      <div className="flex items-end gap-2">
        <label className="mb-2 flex items-center gap-2 text-[12px] font-medium text-black/62">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={binding?.enabled ?? true}
            className="h-4 w-4 rounded border-black/20 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
          />
          启用
        </label>
        <button
          type="submit"
          className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-xs"
        >
          保存
        </button>
      </div>

      {binding?.lastRegisteredAt || binding?.updatedAt ? (
        <p className="text-[11px] leading-5 text-black/42 xl:col-span-7">
          最近保存 {formatDateTimeLabel(binding.updatedAt)}
          {binding.lastRegisteredAt
            ? ` / 最近注册 ${formatDateTimeLabel(binding.lastRegisteredAt)}`
            : ""}
        </p>
      ) : (
        <p className="text-[11px] leading-5 text-black/42 xl:col-span-7">
          未单独保存时，系统会直接使用 CRM 登录账号 @{defaultSeatNo} 作为坐席号。
        </p>
      )}
    </form>
  );
}

export function OutboundCallSettingsWorkbench({
  providerSetting,
  seatBindings,
  viewerRole,
  notice,
}: Readonly<{
  providerSetting: SystemSettingPublic;
  seatBindings: OutboundCallSeatBindingRow[];
  viewerRole: SettingsViewerRole;
  notice: ActionNotice;
}>) {
  const value = getValue<OutboundCallProviderSettingValue>(providerSetting);
  const explicitSeatBindings = seatBindings.filter(
    (row) => row.outboundCallSeatBinding,
  ).length;
  const disabledSeatBindings = seatBindings.filter(
    (row) => row.outboundCallSeatBinding && !row.outboundCallSeatBinding.enabled,
  ).length;
  const defaultSeatProvider = OUTBOUND_CALL_SEAT_PROVIDERS.includes(
    value.provider as OutboundCallSeatProvider,
  )
    ? (value.provider as OutboundCallSeatProvider)
    : "FREESWITCH";

  return (
    <SystemSettingsLayout
      activeValue="outbound-call"
      viewerRole={viewerRole}
      title="外呼 CTI"
      description="配置 CRM 到 CTI Gateway 的点击外呼、坐席绑定、回调签名和服务端录音策略。"
      notice={notice}
      metrics={[
        {
          label: "Provider",
          value: outboundCallProviderLabels[value.provider] ?? value.provider,
          hint: value.enabled ? "已启用" : "关闭",
        },
        {
          label: "默认坐席",
          value: String(seatBindings.length),
          hint: `账号即坐席 / 覆盖 ${explicitSeatBindings}`,
        },
        {
          label: "Codec",
          value: outboundCallCodecLabels[value.codec] ?? value.codec,
          hint:
            outboundCallRecordingImportModeLabels[value.recordingImportMode] ??
            value.recordingImportMode,
        },
      ]}
    >
      <SettingSection
        setting={providerSetting}
        redirectTo="/settings/outbound-call"
        eyebrow="Provider"
        title="CTI Gateway"
        description="CRM 只调用服务端 CTI Gateway；SIP/VOS 密钥留在 PBX 或环境变量，不进前端。"
        secretLabel="Gateway / Webhook Secret"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="外呼 Provider">
            <SelectField
              name="provider"
              defaultValue={value.provider}
              values={OUTBOUND_CALL_PROVIDERS}
            />
          </Field>
          <Field label="Codec">
            <SelectField
              name="codec"
              defaultValue={value.codec}
              values={OUTBOUND_CALL_CODECS}
            />
          </Field>
          <Field label="录音导入模式">
            <SelectField
              name="recordingImportMode"
              defaultValue={value.recordingImportMode}
              values={OUTBOUND_CALL_RECORDING_IMPORT_MODES}
            />
          </Field>
          <Field label="Gateway Base URL" wide>
            <input
              name="gatewayBaseUrl"
              defaultValue={value.gatewayBaseUrl ?? ""}
              maxLength={500}
              placeholder="http://cti-gateway.internal:8080"
              className="crm-input"
            />
          </Field>
          <Field label="Start Path">
            <input
              name="startPath"
              defaultValue={value.startPath}
              required
              maxLength={160}
              className="crm-input"
            />
          </Field>
          <Field label="Webhook Base URL" wide>
            <input
              name="webhookBaseUrl"
              defaultValue={value.webhookBaseUrl ?? ""}
              maxLength={500}
              placeholder="https://crm.cclbn.com/api/outbound-calls/webhooks/freeswitch"
              className="crm-input"
            />
          </Field>
          <Field label="默认路由组">
            <input
              name="defaultRoutingGroup"
              defaultValue={value.defaultRoutingGroup ?? ""}
              maxLength={120}
              className="crm-input"
            />
          </Field>
          <Field label="拨号前缀">
            <input
              name="dialPrefix"
              defaultValue={value.dialPrefix ?? ""}
              maxLength={40}
              placeholder="例如 0"
              className="crm-input"
            />
          </Field>
          <Field label="默认主叫号码">
            <input
              name="defaultDisplayNumber"
              defaultValue={value.defaultDisplayNumber ?? ""}
              maxLength={80}
              className="crm-input"
            />
          </Field>
          <Field label="发起超时秒">
            <input
              type="number"
              name="timeoutSeconds"
              min={3}
              max={180}
              defaultValue={value.timeoutSeconds}
              className="crm-input"
            />
          </Field>
          <Field label="Webhook 签名容忍秒">
            <input
              type="number"
              name="webhookTimestampToleranceSeconds"
              min={30}
              max={3600}
              defaultValue={value.webhookTimestampToleranceSeconds}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="enabled"
            label="启用 CRM 外呼"
            description="启用后客户详情会显示 CTI 外呼入口。"
            defaultChecked={value.enabled}
          />
          <ToggleField
            name="recordOnServer"
            label="服务端录音"
            description="由 PBX / CTI 侧录音，CRM 后续导入。"
            defaultChecked={value.recordOnServer}
          />
          <ToggleField
            name="requireWebhookSecret"
            label="要求回调签名"
            description="生产环境必须开启。"
            defaultChecked={value.requireWebhookSecret}
          />
        </div>
      </SettingSection>

      <SectionCard
        eyebrow="Seats"
        title="坐席绑定"
        description="默认使用 CRM 登录账号作为 CTI 坐席号；这里只维护少数需要覆盖或禁用的账号。"
      >
        <div className="space-y-3">
          <div className="grid gap-2 rounded-[0.95rem] border border-black/7 bg-[var(--color-panel-soft)] px-3.5 py-3 text-[12px] leading-5 text-black/56 md:grid-cols-3">
            <span>
              坐席规则：未单独保存时，系统用销售 CRM 登录账号作为坐席号。
            </span>
            <span>
              覆盖规则：需要不同坐席号、分机、路由组或禁用时，在下方单独保存。
            </span>
            <span>
              当前禁用：{disabledSeatBindings} 个；真实 SIP 密码仍只放在 CTI Gateway / PBX。
            </span>
          </div>

          {seatBindings.length > 0 ? (
            <div className="space-y-3">
              {seatBindings.map((row) => (
                <OutboundCallSeatBindingForm
                  key={row.id}
                  row={row}
                  defaultProvider={defaultSeatProvider}
                />
              ))}
            </div>
          ) : (
            <div className="crm-empty-state text-sm leading-7 text-[var(--color-sidebar-muted)]">
              暂无可绑定账号。
            </div>
          )}
        </div>
      </SectionCard>
    </SystemSettingsLayout>
  );
}

export function CallAiSettingsWorkbench({
  asrSetting,
  llmSetting,
  diarizationSetting,
  viewerRole,
  notice,
}: Readonly<{
  asrSetting: SystemSettingPublic;
  llmSetting: SystemSettingPublic;
  diarizationSetting: SystemSettingPublic;
  viewerRole: SettingsViewerRole;
  notice: ActionNotice;
}>) {
  const asr = getValue<CallAiAsrSettingValue>(asrSetting);
  const llm = getValue<CallAiLlmSettingValue>(llmSetting);
  const diarization = getValue<CallAiDiarizationSettingValue>(diarizationSetting);

  return (
    <SystemSettingsLayout
      activeValue="call-ai"
      viewerRole={viewerRole}
      title="录音 AI"
      description="配置录音转文字、AI 分析模型和销售 / 客户说话人分离策略。"
      notice={notice}
      metrics={[
        { label: "ASR", value: asr.provider, hint: formatSecretStatus(asrSetting) },
        { label: "LLM", value: llm.provider, hint: formatSecretStatus(llmSetting) },
        {
          label: "Diarization",
          value: diarization.enabled ? "启用" : "关闭",
          hint: diarization.provider,
        },
      ]}
    >
      <SettingSection
        setting={asrSetting}
        redirectTo="/settings/call-ai"
        eyebrow="ASR"
        title="录音转文字"
        description="内网部署优先使用 LOCAL_HTTP_ASR / FunASR / SenseVoice，不要求录音公网可访问。"
        secretLabel="ASR API Key"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="ASR Provider">
            <SelectField
              name="provider"
              defaultValue={asr.provider}
              values={CALL_AI_ASR_PROVIDERS}
            />
          </Field>
          <Field label="模型">
            <input
              name="model"
              defaultValue={asr.model}
              required
              maxLength={160}
              className="crm-input"
            />
          </Field>
          <Field label="语言">
            <input
              name="language"
              defaultValue={asr.language ?? ""}
              maxLength={40}
              className="crm-input"
            />
          </Field>
          <Field label="内网 ASR Endpoint" wide>
            <input
              name="endpoint"
              defaultValue={asr.endpoint ?? ""}
              maxLength={500}
              className="crm-input"
            />
          </Field>
          <Field label="最大文件 MB">
            <input
              type="number"
              name="maxFileMb"
              min={1}
              max={2048}
              defaultValue={asr.maxFileMb}
              className="crm-input"
            />
          </Field>
          <Field label="超时 ms">
            <input
              type="number"
              name="timeoutMs"
              min={5000}
              max={1800000}
              defaultValue={asr.timeoutMs}
              className="crm-input"
            />
          </Field>
          <Field label="音频公网 Base URL" wide>
            <input
              name="publicAudioBaseUrl"
              defaultValue={asr.publicAudioBaseUrl ?? ""}
              maxLength={500}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="enableDiarization"
            label="请求 ASR 说话人分离"
            description="ASR 支持 segments 时才会生效。"
            defaultChecked={asr.enableDiarization}
          />
        </div>
      </SettingSection>

      <SettingSection
        setting={llmSetting}
        redirectTo="/settings/call-ai"
        eyebrow="LLM"
        title="AI 分析模型"
        description="支持 DeepSeek、通义千问、Kimi、智谱、火山方舟、腾讯混元和 OpenAI-compatible。"
        secretLabel="LLM API Key"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="LLM Provider">
            <SelectField
              name="provider"
              defaultValue={llm.provider}
              values={CALL_AI_LLM_PROVIDERS}
            />
          </Field>
          <Field label="模型">
            <input
              name="model"
              defaultValue={llm.model}
              required
              maxLength={160}
              className="crm-input"
            />
          </Field>
          <Field label="温度">
            <input
              type="number"
              step="0.1"
              name="temperature"
              min={0}
              max={2}
              defaultValue={llm.temperature}
              className="crm-input"
            />
          </Field>
          <Field label="Base URL" wide>
            <input
              name="baseUrl"
              defaultValue={llm.baseUrl ?? ""}
              maxLength={500}
              className="crm-input"
            />
          </Field>
          <Field label="最大输出 tokens">
            <input
              type="number"
              name="maxOutputTokens"
              min={256}
              max={16000}
              defaultValue={llm.maxOutputTokens}
              className="crm-input"
            />
          </Field>
          <Field label="超时 ms">
            <input
              type="number"
              name="timeoutMs"
              min={5000}
              max={600000}
              defaultValue={llm.timeoutMs}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="strictJsonOutput"
            label="强制 JSON 输出"
            description="用于稳定写入摘要、意向和质检字段。"
            defaultChecked={llm.strictJsonOutput}
          />
        </div>
      </SettingSection>

      <SettingSection
        setting={diarizationSetting}
        redirectTo="/settings/call-ai"
        eyebrow="Diarization"
        title="说话人分离"
        description="把 ASR segments 标准化为销售 / 客户 / 未知，后续展示与分析都会复用该 contract。"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="分离 Provider">
            <SelectField
              name="provider"
              defaultValue={diarization.provider}
              values={DIARIZATION_PROVIDERS}
            />
          </Field>
          <Field label="speaker_0">
            <SelectField
              name="speaker0Role"
              defaultValue={diarization.roleMapping.speaker_0 ?? "SALES"}
              values={TRANSCRIPT_SPEAKER_ROLES}
            />
          </Field>
          <Field label="speaker_1">
            <SelectField
              name="speaker1Role"
              defaultValue={diarization.roleMapping.speaker_1 ?? "CUSTOMER"}
              values={TRANSCRIPT_SPEAKER_ROLES}
            />
          </Field>
          <Field label="未知说话人名称">
            <input
              name="unknownSpeakerLabel"
              defaultValue={diarization.unknownSpeakerLabel}
              required
              maxLength={40}
              className="crm-input"
            />
          </Field>
          <Field label="最短片段字数">
            <input
              type="number"
              name="minSegmentTextLength"
              min={1}
              max={100}
              defaultValue={diarization.minSegmentTextLength}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="enabled"
            label="启用分离"
            description="关闭后 transcript 只保留纯文本。"
            defaultChecked={diarization.enabled}
          />
          <ToggleField
            name="fallbackRoleInference"
            label="允许 LLM fallback"
            description="ASR 没有 speaker 时做低置信度推断。"
            defaultChecked={diarization.fallbackRoleInference}
          />
        </div>
      </SettingSection>
    </SystemSettingsLayout>
  );
}

export function SecuritySettingsWorkbench({
  setting,
  viewerRole,
  notice,
}: Readonly<{
  setting: SystemSettingPublic;
  viewerRole: SettingsViewerRole;
  notice: ActionNotice;
}>) {
  const value = getValue<SecurityAuthSettingValue>(setting);

  return (
    <SystemSettingsLayout
      activeValue="security"
      viewerRole={viewerRole}
      title="登录安全"
      description="维护密码复杂度、会话有效期、首次改密和登录频率限制。"
      notice={notice}
      metrics={[
        { label: "最短密码", value: `${value.passwordMinLength} 位`, hint: formatSource(setting) },
        { label: "会话", value: `${value.sessionMaxAgeHours} 小时`, hint: "登录态有效期" },
        { label: "限流", value: `${value.loginRateLimitPerMinute}/分钟`, hint: "登录请求" },
      ]}
    >
      <SettingSection
        setting={setting}
        redirectTo="/settings/security"
        eyebrow="Security"
        title="认证策略"
        description="这些策略已进入可审计配置；实际登录运行时读取会在下一阶段接入。"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="密码最短长度">
            <input
              type="number"
              name="passwordMinLength"
              min={6}
              max={64}
              defaultValue={value.passwordMinLength}
              className="crm-input"
            />
          </Field>
          <Field label="会话有效小时">
            <input
              type="number"
              name="sessionMaxAgeHours"
              min={1}
              max={720}
              defaultValue={value.sessionMaxAgeHours}
              className="crm-input"
            />
          </Field>
          <Field label="空闲超时分钟">
            <input
              type="number"
              name="idleTimeoutMinutes"
              min={5}
              max={1440}
              defaultValue={value.idleTimeoutMinutes ?? ""}
              className="crm-input"
            />
          </Field>
          <Field label="登录限流 / 分钟">
            <input
              type="number"
              name="loginRateLimitPerMinute"
              min={1}
              max={120}
              defaultValue={value.loginRateLimitPerMinute}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="requireNumber"
            label="要求数字"
            description="新密码必须包含数字。"
            defaultChecked={value.requireNumber}
          />
          <ToggleField
            name="requireMixedCase"
            label="要求大小写"
            description="新密码必须包含大小写字母。"
            defaultChecked={value.requireMixedCase}
          />
          <ToggleField
            name="requireSymbol"
            label="要求特殊字符"
            description="新密码必须包含符号。"
            defaultChecked={value.requireSymbol}
          />
          <ToggleField
            name="forcePasswordChangeOnInvite"
            label="临时密码强制改密"
            description="邀请或重置密码后下次登录必须修改。"
            defaultChecked={value.forcePasswordChangeOnInvite}
          />
        </div>
      </SettingSection>
    </SystemSettingsLayout>
  );
}

export function SettingsAuditWorkbench({
  runtimeSetting,
  logs,
  systemLogCount,
  configuredCount,
  viewerRole,
  notice,
}: Readonly<{
  runtimeSetting: SystemSettingPublic;
  logs: OperationLogItem[];
  systemLogCount: number;
  configuredCount: number;
  viewerRole: SettingsViewerRole;
  notice: ActionNotice;
}>) {
  const runtime = getValue<RuntimeWorkerSettingValue>(runtimeSetting);

  return (
    <SystemSettingsLayout
      activeValue="audit"
      viewerRole={viewerRole}
      title="审计与运行时"
      description="查看最近系统配置动作，并维护 worker 运行参数。"
      notice={notice}
      metrics={[
        { label: "SYSTEM 日志", value: String(systemLogCount), hint: "OperationLog" },
        { label: "已保存配置", value: String(configuredCount), hint: "SystemSetting" },
        {
          label: "AI Worker",
          value: runtime.callAiWorkerEnabled ? "启用" : "关闭",
          hint: `${runtime.callAiWorkerConcurrency} 并发`,
        },
      ]}
    >
      <SettingSection
        setting={runtimeSetting}
        redirectTo="/settings/audit"
        eyebrow="Runtime"
        title="后台 worker 参数"
        description="这里保存运行参数；进程常驻仍需要部署侧进程管理器负责。"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="AI worker 并发">
            <input
              type="number"
              name="callAiWorkerConcurrency"
              min={1}
              max={20}
              defaultValue={runtime.callAiWorkerConcurrency}
              className="crm-input"
            />
          </Field>
          <Field label="AI 重试次数">
            <input
              type="number"
              name="callAiRetryLimit"
              min={0}
              max={10}
              defaultValue={runtime.callAiRetryLimit}
              className="crm-input"
            />
          </Field>
          <ToggleField
            name="callAiWorkerEnabled"
            label="启用录音 AI worker"
            description="控制配置层开关。"
            defaultChecked={runtime.callAiWorkerEnabled}
          />
          <ToggleField
            name="leadImportWorkerRequired"
            label="强制检查导入 worker"
            description="用于部署自检策略。"
            defaultChecked={runtime.leadImportWorkerRequired}
          />
          <ToggleField
            name="queueHealthCheckEnabled"
            label="启用队列健康检查"
            description="后续 hardening 会读取。"
            defaultChecked={runtime.queueHealthCheckEnabled}
          />
        </div>
      </SettingSection>

      <SectionCard
        eyebrow="Audit"
        title="最近 SYSTEM 操作"
        description="配置保存会写入 OperationLog，敏感字段只保留脱敏指纹。"
      >
        {logs.length > 0 ? (
          <div className="overflow-hidden rounded-[0.95rem] border border-black/7">
            <table className="min-w-full divide-y divide-black/7 text-left text-[13px]">
              <thead className="bg-[var(--color-panel-soft)] text-[11px] uppercase tracking-[0.12em] text-black/42">
                <tr>
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">动作</th>
                  <th className="px-3 py-2 font-medium">操作者</th>
                  <th className="px-3 py-2 font-medium">对象</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/7 bg-white">
                {logs.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-black/56">
                      {formatDateTimeLabel(item.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-black/82">{item.action}</div>
                      <div className="mt-1 text-[12px] leading-5 text-black/50">
                        {item.description ?? "无描述"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-black/62">
                      {item.actor
                        ? `${item.actor.name} (@${item.actor.username})`
                        : "系统"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-black/42">
                      {item.targetId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="crm-empty-state text-sm leading-7 text-[var(--color-sidebar-muted)]">
            暂无 SYSTEM 操作日志。
          </div>
        )}
      </SectionCard>
    </SystemSettingsLayout>
  );
}
