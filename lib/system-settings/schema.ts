import { z, type ZodType } from "zod";

export const SYSTEM_SETTING_NAMESPACES = [
  "site.profile",
  "security.auth",
  "recording.storage",
  "recording.upload",
  "call_ai.asr",
  "call_ai.llm",
  "call_ai.diarization",
  "runtime.worker",
] as const;

export type SystemSettingNamespace = (typeof SYSTEM_SETTING_NAMESPACES)[number];

export const SYSTEM_SETTING_ACTIVE_KEY = "active" as const;
export type SystemSettingKey = typeof SYSTEM_SETTING_ACTIVE_KEY;

export const RECORDING_STORAGE_PROVIDERS = ["LOCAL_MOUNT", "MINIO", "S3"] as const;

export const CALL_AI_ASR_PROVIDERS = [
  "MOCK",
  "OPENAI",
  "OPENAI_COMPATIBLE_AUDIO",
  "DASHSCOPE_FILE_ASR",
  "LOCAL_HTTP_ASR",
  "LOCAL_ASR",
  "FUNASR",
  "SENSEVOICE",
] as const;

export const CALL_AI_LLM_PROVIDERS = [
  "MOCK_LLM",
  "OPENAI_RESPONSES",
  "OPENAI_CHAT_COMPATIBLE",
  "DASHSCOPE_QWEN",
  "DEEPSEEK",
  "MOONSHOT",
  "BIGMODEL",
  "VOLCENGINE_ARK",
  "TENCENT_HUNYUAN",
] as const;

export const DIARIZATION_PROVIDERS = [
  "ASR_SEGMENTS",
  "LLM_INFERENCE",
  "DISABLED",
] as const;

export const TRANSCRIPT_SPEAKER_ROLES = [
  "SALES",
  "CUSTOMER",
  "UNKNOWN",
] as const;

const nullableTrimmedString = (maxLength: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    },
    z.string().trim().max(maxLength).nullable(),
  );

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().trim().max(maxLength),
  );

const siteProfileSettingSchema = z
  .object({
    systemName: optionalTrimmedString(80).default("酒水私域 CRM"),
    companyName: nullableTrimmedString(120).default(null),
    loginNotice: nullableTrimmedString(500).default(null),
    supportContact: nullableTrimmedString(200).default(null),
    logoPath: nullableTrimmedString(500).default(null),
    faviconPath: nullableTrimmedString(500).default(null),
    defaultTimezone: optionalTrimmedString(64).default("Asia/Shanghai"),
    dateTimeFormat: optionalTrimmedString(64).default("YYYY-MM-DD HH:mm"),
  })
  .strict();

export type SiteProfileSettingValue = z.infer<typeof siteProfileSettingSchema>;

const securityAuthSettingSchema = z
  .object({
    passwordMinLength: z.coerce.number().int().min(6).max(64).default(8),
    requireMixedCase: z.coerce.boolean().default(false),
    requireNumber: z.coerce.boolean().default(true),
    requireSymbol: z.coerce.boolean().default(false),
    forcePasswordChangeOnInvite: z.coerce.boolean().default(true),
    sessionMaxAgeHours: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
    idleTimeoutMinutes: z.coerce.number().int().min(5).max(24 * 60).nullable().default(null),
    loginRateLimitPerMinute: z.coerce.number().int().min(1).max(120).default(20),
  })
  .strict();

export type SecurityAuthSettingValue = z.infer<typeof securityAuthSettingSchema>;

const recordingStorageSettingSchema = z
  .object({
    provider: z.enum(RECORDING_STORAGE_PROVIDERS).default("LOCAL_MOUNT"),
    storageDir: optionalTrimmedString(500).default("runtime/call-recordings"),
    uploadTmpDir: optionalTrimmedString(500).default("runtime/call-recording-uploads"),
    bucket: nullableTrimmedString(191).default(null),
    publicBaseUrl: nullableTrimmedString(500).default(null),
    retentionDays: z.coerce.number().int().min(1).max(3650).default(365),
    playbackCacheEnabled: z.coerce.boolean().default(true),
    playbackCacheDir: nullableTrimmedString(500).default(null),
  })
  .strict();

export type RecordingStorageSettingValue = z.infer<
  typeof recordingStorageSettingSchema
>;

const recordingUploadSettingSchema = z
  .object({
    maxFileMb: z.coerce.number().int().min(1).max(2048).default(200),
    chunkSizeMb: z.coerce.number().int().min(1).max(100).default(5),
    uploadExpiresMinutes: z.coerce.number().int().min(5).max(24 * 60).default(120),
    allowedMimeTypes: z
      .array(optionalTrimmedString(120))
      .min(1)
      .max(20)
      .default(["audio/mpeg", "audio/mp4", "audio/m4a", "audio/amr", "audio/wav"]),
    requireSha256: z.coerce.boolean().default(true),
  })
  .strict();

export type RecordingUploadSettingValue = z.infer<
  typeof recordingUploadSettingSchema
>;

const callAiAsrSettingSchema = z
  .object({
    provider: z.enum(CALL_AI_ASR_PROVIDERS).default("LOCAL_HTTP_ASR"),
    endpoint: nullableTrimmedString(500).default("http://127.0.0.1:8787/transcribe"),
    model: optionalTrimmedString(160).default("local-http-asr"),
    timeoutMs: z.coerce.number().int().min(5_000).max(30 * 60_000).default(300_000),
    maxFileMb: z.coerce.number().int().min(1).max(2048).default(200),
    language: nullableTrimmedString(40).default("zh"),
    publicAudioBaseUrl: nullableTrimmedString(500).default(null),
    enableDiarization: z.coerce.boolean().default(true),
  })
  .strict();

export type CallAiAsrSettingValue = z.infer<typeof callAiAsrSettingSchema>;

const callAiLlmSettingSchema = z
  .object({
    provider: z.enum(CALL_AI_LLM_PROVIDERS).default("DEEPSEEK"),
    baseUrl: nullableTrimmedString(500).default("https://api.deepseek.com"),
    model: optionalTrimmedString(160).default("deepseek-chat"),
    temperature: z.coerce.number().min(0).max(2).default(0.2),
    maxOutputTokens: z.coerce.number().int().min(256).max(16_000).default(2_000),
    timeoutMs: z.coerce.number().int().min(5_000).max(10 * 60_000).default(120_000),
    strictJsonOutput: z.coerce.boolean().default(true),
  })
  .strict();

export type CallAiLlmSettingValue = z.infer<typeof callAiLlmSettingSchema>;

const callAiDiarizationSettingSchema = z
  .object({
    enabled: z.coerce.boolean().default(true),
    provider: z.enum(DIARIZATION_PROVIDERS).default("ASR_SEGMENTS"),
    roleMapping: z
      .record(z.string().trim().min(1).max(64), z.enum(TRANSCRIPT_SPEAKER_ROLES))
      .default({
        speaker_0: "SALES",
        speaker_1: "CUSTOMER",
      }),
    fallbackRoleInference: z.coerce.boolean().default(true),
    unknownSpeakerLabel: optionalTrimmedString(40).default("未知"),
    minSegmentTextLength: z.coerce.number().int().min(1).max(100).default(1),
  })
  .strict();

export type CallAiDiarizationSettingValue = z.infer<
  typeof callAiDiarizationSettingSchema
>;

const runtimeWorkerSettingSchema = z
  .object({
    leadImportWorkerRequired: z.coerce.boolean().default(false),
    callAiWorkerEnabled: z.coerce.boolean().default(true),
    callAiWorkerConcurrency: z.coerce.number().int().min(1).max(20).default(1),
    callAiRetryLimit: z.coerce.number().int().min(0).max(10).default(3),
    queueHealthCheckEnabled: z.coerce.boolean().default(true),
  })
  .strict();

export type RuntimeWorkerSettingValue = z.infer<typeof runtimeWorkerSettingSchema>;

export type SystemSettingDefinition = {
  namespace: SystemSettingNamespace;
  key: SystemSettingKey;
  title: string;
  description: string;
  schema: ZodType;
  defaultValue: unknown;
  supportsSecret: boolean;
};

export const SYSTEM_SETTING_DEFINITIONS = [
  {
    namespace: "site.profile",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "网站信息",
    description: "系统名称、企业信息、登录展示和默认区域格式。",
    schema: siteProfileSettingSchema,
    defaultValue: siteProfileSettingSchema.parse({}),
    supportsSecret: false,
  },
  {
    namespace: "security.auth",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "登录安全",
    description: "密码策略、会话策略和登录频率限制。",
    schema: securityAuthSettingSchema,
    defaultValue: securityAuthSettingSchema.parse({}),
    supportsSecret: false,
  },
  {
    namespace: "recording.storage",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "录音存储",
    description: "录音存储 provider、本地挂载目录、缓存与保留天数。",
    schema: recordingStorageSettingSchema,
    defaultValue: recordingStorageSettingSchema.parse({}),
    supportsSecret: false,
  },
  {
    namespace: "recording.upload",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "录音上传",
    description: "录音文件大小、分片大小、过期时间和校验策略。",
    schema: recordingUploadSettingSchema,
    defaultValue: recordingUploadSettingSchema.parse({}),
    supportsSecret: false,
  },
  {
    namespace: "call_ai.asr",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "录音转文字",
    description: "ASR provider、内网 endpoint、模型、超时和说话人分离开关。",
    schema: callAiAsrSettingSchema,
    defaultValue: callAiAsrSettingSchema.parse({}),
    supportsSecret: true,
  },
  {
    namespace: "call_ai.llm",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "AI 分析模型",
    description: "LLM provider、base URL、模型、温度和 JSON 输出策略。",
    schema: callAiLlmSettingSchema,
    defaultValue: callAiLlmSettingSchema.parse({}),
    supportsSecret: true,
  },
  {
    namespace: "call_ai.diarization",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "说话人分离",
    description: "销售 / 客户角色映射、fallback 推断和 transcript 分段策略。",
    schema: callAiDiarizationSettingSchema,
    defaultValue: callAiDiarizationSettingSchema.parse({}),
    supportsSecret: false,
  },
  {
    namespace: "runtime.worker",
    key: SYSTEM_SETTING_ACTIVE_KEY,
    title: "后台 worker",
    description: "导入 worker、录音 AI worker 和队列健康检查的运行参数。",
    schema: runtimeWorkerSettingSchema,
    defaultValue: runtimeWorkerSettingSchema.parse({}),
    supportsSecret: false,
  },
] as const satisfies readonly SystemSettingDefinition[];

export function getSystemSettingDefinition(namespace: string, key: string) {
  return (
    SYSTEM_SETTING_DEFINITIONS.find(
      (definition) => definition.namespace === namespace && definition.key === key,
    ) ?? null
  );
}

export function requireSystemSettingDefinition(namespace: string, key: string) {
  const definition = getSystemSettingDefinition(namespace, key);

  if (!definition) {
    throw new Error(`Unsupported system setting ${namespace}.${key}.`);
  }

  return definition;
}

export function parseSystemSettingValue(
  namespace: string,
  key: string,
  value: unknown,
) {
  const definition = requireSystemSettingDefinition(namespace, key);
  return definition.schema.parse(value ?? definition.defaultValue);
}

export function getSystemSettingDefaultValue(namespace: string, key: string) {
  return requireSystemSettingDefinition(namespace, key).defaultValue;
}

export function isSystemSettingSecretSupported(namespace: string, key: string) {
  return requireSystemSettingDefinition(namespace, key).supportsSecret;
}

export function buildSystemSettingQualifiedKey(namespace: string, key: string) {
  return `${namespace}.${key}`;
}
