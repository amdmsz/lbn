import { z } from "zod";

export type CallAiProviderContext = {
  recordingId: string;
  callRecordId: string;
  customerName: string;
  customerPhone: string;
  salesName: string;
  callTime: Date;
  durationSeconds: number | null;
  callRemark: string | null;
  callResultCode: string | null;
};

export type CallAiTranscriptionInput = {
  audio: Buffer;
  filename: string;
  mimeType: string;
  storageKey: string;
  context: CallAiProviderContext;
};

export type CallAiTranscriptionResult = {
  text: string;
  raw: unknown;
  modelProvider: string;
  modelName: string;
};

const callAiAnalysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  customerIntent: z.enum(["HIGH", "MEDIUM", "LOW", "REFUSED", "UNKNOWN"]),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"]).nullable(),
  qualityScore: z.number().int().min(0).max(100).nullable(),
  riskFlags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  opportunityTags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  nextActionSuggestion: z.string().trim().max(1000).nullable(),
  dialogueSegments: z
    .array(
      z.object({
        speakerRole: z.enum(["SALES", "CUSTOMER", "UNKNOWN"]).default("UNKNOWN"),
        speakerLabel: z.string().trim().max(40).nullable().default(null),
        text: z.string().trim().min(1).max(1000),
        startMs: z.number().int().min(0).nullable().default(null),
        endMs: z.number().int().min(0).nullable().default(null),
        confidence: z.number().min(0).max(1).nullable().default(null),
      }),
    )
    .max(40)
    .default([]),
});

export type CallAiAnalysisOutput = z.infer<typeof callAiAnalysisOutputSchema>;

type CallAiAnalysisResult = CallAiAnalysisOutput & {
  modelProvider: string;
  modelName: string;
  modelVersion: string | null;
};

type CallAiTranscriber = {
  providerName: string;
  transcribe(input: CallAiTranscriptionInput): Promise<CallAiTranscriptionResult>;
};

type CallAiAnalyzer = {
  providerName: string;
  analyze(input: {
    transcriptText: string;
    transcriptRaw: unknown;
    context: CallAiProviderContext;
  }): Promise<CallAiAnalysisResult>;
};

export type CallAiProvider = {
  providerName: string;
  transcribe(input: CallAiTranscriptionInput): Promise<CallAiTranscriptionResult>;
  analyze(input: {
    transcriptText: string;
    transcriptRaw: unknown;
    context: CallAiProviderContext;
  }): Promise<CallAiAnalysisResult>;
};

export type CallAiConfigSource =
  | "database"
  | "fallback"
  | "default"
  | "override";

export type CallAiSecretSource = "database" | "fallback" | "default";

export type CallAiAsrRuntimeConfig = {
  provider: string;
  endpoint: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxFileBytes: number;
  language: string | null;
  publicAudioBaseUrl: string | null;
  enableDiarization: boolean;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  source: CallAiConfigSource;
  secretSource: CallAiSecretSource;
};

export type CallAiLlmRuntimeConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  maxOutputTokens: number;
  strictJsonOutput: boolean;
  source: CallAiConfigSource;
  secretSource: CallAiSecretSource;
};

export type CallAiDiarizationRuntimeConfig = {
  enabled: boolean;
  provider: string;
  roleMapping: Record<string, "SALES" | "CUSTOMER" | "UNKNOWN">;
  fallbackRoleInference: boolean;
  unknownSpeakerLabel: string;
  minSegmentTextLength: number;
  source: CallAiConfigSource;
};

export type ResolvedCallAiRuntimeConfig = {
  asr: CallAiAsrRuntimeConfig;
  llm: CallAiLlmRuntimeConfig;
  diarization: CallAiDiarizationRuntimeConfig;
};

type OpenAiResponseBody = {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: unknown;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type ChatCompletionBody = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenAiCompatibleProfile = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

type DashScopeTaskResponse = {
  output?: {
    task_id?: string;
    task_status?: string;
    results?: Array<{
      transcription_url?: string;
      text?: string;
      sentences?: Array<{ text?: string }>;
    }>;
  };
  message?: string;
  code?: string;
};

type LocalHttpAsrResponse = {
  text?: unknown;
  transcriptText?: unknown;
  transcript?: unknown;
  result?: {
    text?: unknown;
    transcript?: unknown;
  };
  segments?: Array<{
    text?: unknown;
  }>;
  error?: {
    message?: string;
  };
  message?: string;
};

const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description: "3 到 6 句中文业务总结，聚焦客户意向、异议和下一步。",
    },
    customerIntent: {
      type: "string",
      enum: ["HIGH", "MEDIUM", "LOW", "REFUSED", "UNKNOWN"],
    },
    sentiment: {
      type: ["string", "null"],
      enum: ["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED", null],
    },
    qualityScore: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: 100,
    },
    riskFlags: {
      type: "array",
      items: { type: "string" },
      maxItems: 12,
    },
    opportunityTags: {
      type: "array",
      items: { type: "string" },
      maxItems: 12,
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      maxItems: 20,
    },
    nextActionSuggestion: {
      type: ["string", "null"],
    },
    dialogueSegments: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          speakerRole: {
            type: "string",
            enum: ["SALES", "CUSTOMER", "UNKNOWN"],
          },
          speakerLabel: {
            type: ["string", "null"],
          },
          text: {
            type: "string",
          },
          startMs: {
            type: ["integer", "null"],
            minimum: 0,
          },
          endMs: {
            type: ["integer", "null"],
            minimum: 0,
          },
          confidence: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 1,
          },
        },
        required: [
          "speakerRole",
          "speakerLabel",
          "text",
          "startMs",
          "endMs",
          "confidence",
        ],
      },
    },
  },
  required: [
    "summary",
    "customerIntent",
    "sentiment",
    "qualityScore",
    "riskFlags",
    "opportunityTags",
    "keywords",
    "nextActionSuggestion",
    "dialogueSegments",
  ],
} as const;

const compatibleProviderDefaults: Record<
  string,
  Omit<OpenAiCompatibleProfile, "apiKey">
> = {
  OPENAI_CHAT_COMPATIBLE: {
    providerName: "OPENAI_CHAT_COMPATIBLE",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  DASHSCOPE_QWEN: {
    providerName: "DASHSCOPE_QWEN",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-flash",
  },
  DEEPSEEK: {
    providerName: "DEEPSEEK",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
  },
  MOONSHOT: {
    providerName: "MOONSHOT",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.6",
  },
  BIGMODEL: {
    providerName: "BIGMODEL",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.1",
  },
  VOLCENGINE_ARK: {
    providerName: "VOLCENGINE_ARK",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "",
  },
  TENCENT_HUNYUAN: {
    providerName: "TENCENT_HUNYUAN",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    model: "hunyuan-turbos-latest",
  },
};

function parsePositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getEnv(...names: Array<string | null | undefined>) {
  for (const name of names) {
    if (!name) {
      continue;
    }

    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function getProviderName(...names: string[]) {
  const raw = getEnv(...names);
  return raw ? raw.toUpperCase() : "";
}

function getTranscriberProviderName() {
  return getProviderName("CALL_AI_ASR_PROVIDER", "CALL_AI_TRANSCRIBE_PROVIDER", "CALL_AI_PROVIDER") || "MOCK";
}

function getAnalyzerProviderName() {
  return getProviderName("CALL_AI_LLM_PROVIDER", "CALL_AI_ANALYSIS_PROVIDER", "CALL_AI_PROVIDER") || "MOCK";
}

function getOpenAiBaseUrl() {
  return getEnv("CALL_AI_OPENAI_BASE_URL") || "https://api.openai.com/v1";
}

function getTranscriptionMaxBytes() {
  return parsePositiveIntEnv("CALL_AI_TRANSCRIPTION_MAX_FILE_MB", 25) * 1024 * 1024;
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function buildAudioPublicUrl(storageKey: string, publicBaseUrl?: string | null) {
  const baseUrl = publicBaseUrl?.trim() || getEnv("CALL_AI_AUDIO_PUBLIC_BASE_URL");

  if (!baseUrl) {
    return "";
  }

  return `${baseUrl.replace(/\/$/, "")}/${storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function normalizeLlmProviderName(provider: string) {
  return provider === "MOCK" ? "MOCK_LLM" : provider;
}

function parseTemperatureEnv() {
  const parsed = Number.parseFloat(process.env.CALL_AI_LLM_TEMPERATURE ?? "");
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 2) : 0.2;
}

export function getEnvCallAiRuntimeConfig(): ResolvedCallAiRuntimeConfig {
  const asrProvider = getTranscriberProviderName();
  const llmProvider = normalizeLlmProviderName(getAnalyzerProviderName());
  const llmProfile =
    compatibleProviderDefaults[llmProvider] && llmProvider !== "MOCK_LLM"
      ? buildCompatibleProfile(llmProvider)
      : null;
  const openAiLlmBaseUrl =
    getEnv("CALL_AI_LLM_BASE_URL", "CALL_AI_OPENAI_BASE_URL") ||
    getOpenAiBaseUrl();
  const openAiLlmModel =
    getEnv("CALL_AI_LLM_MODEL", "CALL_AI_ANALYSIS_MODEL") || "gpt-4o-mini";
  const asrBaseUrl =
    asrProvider === "DASHSCOPE_FILE_ASR" ||
    asrProvider === "DASHSCOPE_FILE" ||
    asrProvider === "DASHSCOPE_ASR"
      ? getEnv("CALL_AI_ASR_BASE_URL") || "https://dashscope.aliyuncs.com"
      : getEnv("CALL_AI_ASR_BASE_URL", "CALL_AI_OPENAI_BASE_URL") ||
        getOpenAiBaseUrl();
  const llmApiKey =
    llmProvider === "MOCK_LLM"
      ? ""
      : llmProfile?.apiKey ||
        getEnv("CALL_AI_LLM_API_KEY", "CALL_AI_API_KEY", "OPENAI_API_KEY");

  return {
    asr: {
      provider: asrProvider,
      endpoint: getEnv(
        "CALL_AI_LOCAL_ASR_ENDPOINT",
        "CALL_AI_ASR_ENDPOINT",
        "CALL_AI_ASR_BASE_URL",
      ),
      baseUrl: asrBaseUrl,
      apiKey:
        asrProvider === "MOCK"
          ? ""
          : getEnv(
              "CALL_AI_LOCAL_ASR_API_KEY",
              "CALL_AI_ASR_API_KEY",
              asrProvider === "DASHSCOPE_FILE_ASR" ||
                asrProvider === "DASHSCOPE_FILE" ||
                asrProvider === "DASHSCOPE_ASR"
                ? "DASHSCOPE_API_KEY"
                : "",
              "CALL_AI_API_KEY",
              "OPENAI_API_KEY",
            ),
      model:
        getEnv("CALL_AI_LOCAL_ASR_MODEL", "CALL_AI_ASR_MODEL", "CALL_AI_TRANSCRIBE_MODEL") ||
        (asrProvider === "DASHSCOPE_FILE_ASR" ? "paraformer-v2" : "local-http-asr"),
      timeoutMs: parsePositiveIntEnv("CALL_AI_ASR_TIMEOUT_MS", 300_000),
      maxFileBytes: getTranscriptionMaxBytes(),
      language: getEnv("CALL_AI_ASR_LANGUAGE") || "zh",
      publicAudioBaseUrl: getEnv("CALL_AI_AUDIO_PUBLIC_BASE_URL") || null,
      enableDiarization: process.env.CALL_AI_ASR_DIARIZATION_ENABLED !== "0",
      pollIntervalMs: parsePositiveIntEnv("CALL_AI_ASR_POLL_INTERVAL_MS", 3000),
      pollTimeoutMs: parsePositiveIntEnv(
        "CALL_AI_ASR_POLL_TIMEOUT_MS",
        5 * 60 * 1000,
      ),
      source: "fallback",
      secretSource: "fallback",
    },
    llm: {
      provider: llmProvider,
      baseUrl: llmProfile?.baseUrl || openAiLlmBaseUrl,
      apiKey: llmApiKey,
      model: llmProfile?.model || openAiLlmModel,
      timeoutMs: parsePositiveIntEnv("CALL_AI_LLM_TIMEOUT_MS", 120_000),
      temperature: parseTemperatureEnv(),
      maxOutputTokens: parsePositiveIntEnv("CALL_AI_LLM_MAX_OUTPUT_TOKENS", 2000),
      strictJsonOutput: process.env.CALL_AI_LLM_STRICT_JSON_OUTPUT !== "0",
      source: "fallback",
      secretSource: "fallback",
    },
    diarization: {
      enabled: process.env.CALL_AI_DIARIZATION_ENABLED !== "0",
      provider: getEnv("CALL_AI_DIARIZATION_PROVIDER") || "ASR_SEGMENTS",
      roleMapping: {
        speaker_0: "SALES",
        speaker_1: "CUSTOMER",
      },
      fallbackRoleInference: process.env.CALL_AI_DIARIZATION_FALLBACK !== "0",
      unknownSpeakerLabel: getEnv("CALL_AI_UNKNOWN_SPEAKER_LABEL") || "未知",
      minSegmentTextLength: parsePositiveIntEnv(
        "CALL_AI_MIN_SEGMENT_TEXT_LENGTH",
        1,
      ),
      source: "fallback",
    },
  };
}

async function parseJsonResponse(response: Response) {
  const bodyText = await response.text();

  if (!response.ok) {
    try {
      const body = JSON.parse(bodyText) as OpenAiResponseBody | ChatCompletionBody;
      throw new Error(body.error?.message || bodyText || "AI API request failed.");
    } catch (error) {
      if (error instanceof Error && error.message !== bodyText) {
        throw error;
      }

      throw new Error(bodyText || "AI API request failed.");
    }
  }

  return bodyText ? JSON.parse(bodyText) : {};
}

function extractResponseOutputText(body: OpenAiResponseBody) {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  for (const output of body.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw new Error("OpenAI analysis response did not include output text.");
}

function extractChatCompletionText(body: ChatCompletionBody) {
  const content = body.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  throw new Error("AI chat response did not include message content.");
}

function validateAnalysisOutput(value: unknown) {
  return callAiAnalysisOutputSchema.parse(value);
}

function parseAnalysisJson(text: string) {
  const trimmed = text.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = jsonBlock || trimmed;

  try {
    return validateAnalysisOutput(JSON.parse(candidate));
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return validateAnalysisOutput(
        JSON.parse(candidate.slice(firstBrace, lastBrace + 1)),
      );
    }

    throw new Error("AI 分析结果不是合法 JSON。");
  }
}

function buildAnalysisPrompt(input: {
  transcriptText: string;
  context: CallAiProviderContext;
}) {
  return [
    `客户：${input.context.customerName} / ${input.context.customerPhone}`,
    `销售：${input.context.salesName}`,
    `通话时间：${input.context.callTime.toISOString()}`,
    `通话时长：${input.context.durationSeconds ?? "未知"} 秒`,
    `CRM已记录结果：${input.context.callResultCode ?? "未记录"}`,
    `CRM备注：${input.context.callRemark ?? "无"}`,
    "",
    "请基于以下中文销售通话转写，输出严格 JSON，不要输出 Markdown，不要输出解释文字。",
    "字段必须包含：summary, customerIntent, sentiment, qualityScore, riskFlags, opportunityTags, keywords, nextActionSuggestion, dialogueSegments。",
    "dialogueSegments 最多 40 段，用于区分销售和客户的对话；每段包含 speakerRole(SALES/CUSTOMER/UNKNOWN), speakerLabel, text, startMs, endMs, confidence。无法判断角色时用 UNKNOWN，无法判断时间时用 null。",
    "customerIntent 只能是 HIGH/MEDIUM/LOW/REFUSED/UNKNOWN；sentiment 只能是 POSITIVE/NEUTRAL/NEGATIVE/MIXED/null；qualityScore 是 0-100 或 null。",
    "不要捏造客户已承诺购买，无法判断时使用 UNKNOWN 或 null。",
    "",
    input.transcriptText,
  ].join("\n");
}

class MockTranscriber implements CallAiTranscriber {
  providerName = "MOCK_ASR";

  async transcribe(input: CallAiTranscriptionInput): Promise<CallAiTranscriptionResult> {
    return {
      text: [
        "MOCK 转写：当前环境未启用真实 ASR。",
        `客户 ${input.context.customerName}，通话记录 ${input.context.callRecordId}。`,
        input.context.callRemark ? `销售备注：${input.context.callRemark}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      raw: {
        provider: this.providerName,
        filename: input.filename,
        bytes: input.audio.length,
      },
      modelProvider: this.providerName,
      modelName: "mock-transcriber",
    };
  }
}

class MockAnalyzer implements CallAiAnalyzer {
  providerName = "MOCK_LLM";

  async analyze(input: {
    transcriptText: string;
    context: CallAiProviderContext;
  }): Promise<CallAiAnalysisResult> {
    const output = validateAnalysisOutput({
      summary: input.context.callRemark
        ? `MOCK 总结：本次通话备注为「${input.context.callRemark}」。需要销售继续补充真实转写后的客户反馈。`
        : "MOCK 总结：当前仅完成录音处理链路，尚未启用真实 AI 分析。",
      customerIntent: "UNKNOWN",
      sentiment: "NEUTRAL",
      qualityScore: null,
      riskFlags: [],
      opportunityTags: [],
      keywords: ["通话录音", "待真实AI处理"],
      nextActionSuggestion: "配置 CALL_AI_ASR_PROVIDER 和 CALL_AI_LLM_PROVIDER 后重新处理该录音。",
      dialogueSegments: [
        {
          speakerRole: "SALES",
          speakerLabel: "销售",
          text: input.context.callRemark || "您好，这边是酒水顾问，想跟您确认一下需求。",
          startMs: null,
          endMs: null,
          confidence: null,
        },
        {
          speakerRole: "CUSTOMER",
          speakerLabel: "客户",
          text: "好的，后续可以继续跟进。",
          startMs: null,
          endMs: null,
          confidence: null,
        },
      ],
    });

    return {
      ...output,
      modelProvider: this.providerName,
      modelName: "mock-analyzer",
      modelVersion: null,
    };
  }
}

class OpenAiAudioTranscriber implements CallAiTranscriber {
  providerName = "OPENAI_ASR";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxFileBytes: number;
  private readonly timeoutMs: number;
  private readonly language: string | null;

  constructor(config: CallAiAsrRuntimeConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || getOpenAiBaseUrl();
    this.model = config.model || "gpt-4o-transcribe";
    this.maxFileBytes = config.maxFileBytes;
    this.timeoutMs = config.timeoutMs;
    this.language = config.language;

    if (!this.apiKey) {
      throw new Error("缺少 CALL_AI_ASR_API_KEY、CALL_AI_API_KEY 或 OPENAI_API_KEY。");
    }
  }

  async transcribe(input: CallAiTranscriptionInput): Promise<CallAiTranscriptionResult> {
    if (input.audio.length > this.maxFileBytes) {
      throw new Error("录音文件超过当前 AI 转写大小限制。");
    }

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      input.filename,
    );
    formData.append("model", this.model);
    formData.append("response_format", "json");
    if (this.language) {
      formData.append("language", this.language);
    }
    formData.append(
      "prompt",
      `酒水私域销售通话。客户：${input.context.customerName}。销售：${input.context.salesName}。`,
    );

    const response = await fetch(joinUrl(this.baseUrl, "/audio/transcriptions"), {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });
    const body = (await parseJsonResponse(response)) as { text?: unknown };

    if (typeof body.text !== "string" || !body.text.trim()) {
      throw new Error("AI 转写结果为空。");
    }

    return {
      text: body.text.trim(),
      raw: body,
      modelProvider: this.providerName,
      modelName: this.model,
    };
  }
}

class OpenAiCompatibleAudioTranscriber extends OpenAiAudioTranscriber {
  providerName = "OPENAI_COMPATIBLE_AUDIO_ASR";
}

class DashScopeFileTranscriber implements CallAiTranscriber {
  providerName = "DASHSCOPE_FILE_ASR";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly publicAudioBaseUrl: string | null;

  constructor(config: CallAiAsrRuntimeConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://dashscope.aliyuncs.com";
    this.model = config.model || "paraformer-v2";
    this.pollIntervalMs = config.pollIntervalMs;
    this.pollTimeoutMs = config.pollTimeoutMs;
    this.publicAudioBaseUrl = config.publicAudioBaseUrl;

    if (!this.apiKey) {
      throw new Error("缺少 CALL_AI_ASR_API_KEY 或 DASHSCOPE_API_KEY。");
    }
  }

  async transcribe(input: CallAiTranscriptionInput): Promise<CallAiTranscriptionResult> {
    const audioUrl = buildAudioPublicUrl(
      input.storageKey,
      this.publicAudioBaseUrl,
    );

    if (!audioUrl) {
      throw new Error("DashScope 文件转写需要配置 CALL_AI_AUDIO_PUBLIC_BASE_URL。");
    }

    const submitted = await this.request("/api/v1/services/audio/asr/transcription", {
      model: this.model,
      input: {
        file_urls: [audioUrl],
      },
      parameters: {
        language_hints: ["zh", "en"],
      },
    }, true);
    const taskId = submitted.output?.task_id;

    if (!taskId) {
      throw new Error("DashScope ASR 未返回 task_id。");
    }

    const deadline = Date.now() + this.pollTimeoutMs;
    let latest: DashScopeTaskResponse = submitted;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      latest = await this.getTask(taskId);

      if (latest.output?.task_status === "SUCCEEDED") {
        const text = await this.extractTaskText(latest);

        return {
          text,
          raw: latest,
          modelProvider: this.providerName,
          modelName: this.model,
        };
      }

      if (latest.output?.task_status === "FAILED") {
        throw new Error(latest.message || "DashScope ASR 任务失败。");
      }
    }

    throw new Error("DashScope ASR 任务超时。");
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
    asyncTask = false,
  ): Promise<DashScopeTaskResponse> {
    const response = await fetch(joinUrl(this.baseUrl, path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(asyncTask ? { "X-DashScope-Async": "enable" } : {}),
      },
      body: JSON.stringify(body),
    });

    return (await parseJsonResponse(response)) as DashScopeTaskResponse;
  }

  private async getTask(taskId: string): Promise<DashScopeTaskResponse> {
    const response = await fetch(joinUrl(this.baseUrl, `/api/v1/tasks/${taskId}`), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    return (await parseJsonResponse(response)) as DashScopeTaskResponse;
  }

  private async extractTaskText(task: DashScopeTaskResponse) {
    const inlineText = task.output?.results
      ?.map((result) => result.text || result.sentences?.map((item) => item.text).join(""))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (inlineText) {
      return inlineText;
    }

    const transcriptionUrl = task.output?.results?.[0]?.transcription_url;

    if (!transcriptionUrl) {
      throw new Error("DashScope ASR 任务没有返回转写内容。");
    }

    const response = await fetch(transcriptionUrl);
    const body = await parseJsonResponse(response);
    const text = JSON.stringify(body);

    if (!text.trim()) {
      throw new Error("DashScope ASR 转写下载为空。");
    }

    return text;
  }
}

class LocalHttpAsrTranscriber implements CallAiTranscriber {
  providerName = "LOCAL_HTTP_ASR";
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxFileBytes: number;
  private readonly timeoutMs: number;

  constructor(config: CallAiAsrRuntimeConfig) {
    this.endpoint = config.endpoint || config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model || "local-http-asr";
    this.maxFileBytes = config.maxFileBytes;
    this.timeoutMs = config.timeoutMs;

    if (!this.endpoint) {
      throw new Error("缺少 CALL_AI_LOCAL_ASR_ENDPOINT 或 CALL_AI_ASR_ENDPOINT。");
    }
  }

  async transcribe(input: CallAiTranscriptionInput): Promise<CallAiTranscriptionResult> {
    if (input.audio.length > this.maxFileBytes) {
      throw new Error("录音文件超过当前 AI 转写大小限制。");
    }

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      input.filename,
    );
    formData.append("model", this.model);
    formData.append("storageKey", input.storageKey);
    formData.append(
      "context",
      JSON.stringify({
        recordingId: input.context.recordingId,
        callRecordId: input.context.callRecordId,
        customerName: input.context.customerName,
        salesName: input.context.salesName,
        callTime: input.context.callTime.toISOString(),
      }),
    );

    const response = await fetch(this.endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
      body: formData,
    });
    const body = (await parseJsonResponse(response)) as LocalHttpAsrResponse;
    const text =
      pickLocalAsrText(body.text) ||
      pickLocalAsrText(body.transcriptText) ||
      pickLocalAsrText(body.transcript) ||
      pickLocalAsrText(body.result?.text) ||
      pickLocalAsrText(body.result?.transcript) ||
      body.segments
        ?.map((segment) => pickLocalAsrText(segment.text))
        .filter(Boolean)
        .join("\n")
        .trim();

    if (!text) {
      throw new Error(body.error?.message || body.message || "内网 ASR 转写结果为空。");
    }

    return {
      text,
      raw: body,
      modelProvider: this.providerName,
      modelName: this.model,
    };
  }
}

function pickLocalAsrText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

class OpenAiResponsesAnalyzer implements CallAiAnalyzer {
  providerName = "OPENAI_RESPONSES";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: CallAiLlmRuntimeConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || getOpenAiBaseUrl();
    this.model = config.model || "gpt-4o-mini";
    this.timeoutMs = config.timeoutMs;

    if (!this.apiKey) {
      throw new Error("缺少 CALL_AI_LLM_API_KEY、CALL_AI_API_KEY 或 OPENAI_API_KEY。");
    }
  }

  async analyze(input: {
    transcriptText: string;
    transcriptRaw: unknown;
    context: CallAiProviderContext;
  }): Promise<CallAiAnalysisResult> {
    const response = await fetch(joinUrl(this.baseUrl, "/responses"), {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "你是酒水私域 CRM 的通话质检助手。只根据转写内容和 CRM 上下文输出结构化 JSON；不要输出 Markdown。",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildAnalysisPrompt(input),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "call_ai_analysis",
            strict: true,
            schema: analysisJsonSchema,
          },
        },
      }),
    });
    const body = (await parseJsonResponse(response)) as OpenAiResponseBody;
    const parsed = validateAnalysisOutput(JSON.parse(extractResponseOutputText(body)));

    return {
      ...parsed,
      modelProvider: this.providerName,
      modelName: this.model,
      modelVersion: null,
    };
  }
}

class OpenAiCompatibleChatAnalyzer implements CallAiAnalyzer {
  providerName: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(profile: OpenAiCompatibleProfile & {
    timeoutMs: number;
    temperature: number;
    maxOutputTokens: number;
  }) {
    this.providerName = profile.providerName;
    this.baseUrl = profile.baseUrl;
    this.apiKey = profile.apiKey;
    this.model = profile.model;
    this.timeoutMs = profile.timeoutMs;
    this.temperature = profile.temperature;
    this.maxOutputTokens = profile.maxOutputTokens;

    if (!this.apiKey) {
      throw new Error(`缺少 ${this.providerName} API Key。`);
    }

    if (!this.model) {
      throw new Error(`缺少 ${this.providerName} model 配置。`);
    }
  }

  async analyze(input: {
    transcriptText: string;
    context: CallAiProviderContext;
  }): Promise<CallAiAnalysisResult> {
    const response = await fetch(joinUrl(this.baseUrl, "/chat/completions"), {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "你是酒水私域 CRM 的通话质检助手。只输出严格 JSON，不输出 Markdown。",
          },
          {
            role: "user",
            content: buildAnalysisPrompt(input),
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxOutputTokens,
        response_format: {
          type: "json_object",
        },
      }),
    });
    const body = (await parseJsonResponse(response)) as ChatCompletionBody;
    const parsed = parseAnalysisJson(extractChatCompletionText(body));

    return {
      ...parsed,
      modelProvider: this.providerName,
      modelName: this.model,
      modelVersion: null,
    };
  }
}

function buildCompatibleProfile(
  provider: string,
  config?: CallAiLlmRuntimeConfig,
): OpenAiCompatibleProfile {
  const defaults =
    compatibleProviderDefaults[provider] ??
    compatibleProviderDefaults.OPENAI_CHAT_COMPATIBLE;
  const specificPrefix = `CALL_AI_${provider}`;
  const apiKey =
    config?.apiKey ||
    getEnv(
      `${specificPrefix}_API_KEY`,
      "CALL_AI_LLM_API_KEY",
      provider === "DASHSCOPE_QWEN" ? "DASHSCOPE_API_KEY" : "",
      provider === "DEEPSEEK" ? "DEEPSEEK_API_KEY" : "",
      provider === "MOONSHOT" ? "MOONSHOT_API_KEY" : "",
      provider === "BIGMODEL" ? "ZHIPU_API_KEY" : "",
      provider === "VOLCENGINE_ARK" ? "ARK_API_KEY" : "",
      provider === "TENCENT_HUNYUAN" ? "HUNYUAN_API_KEY" : "",
      "CALL_AI_API_KEY",
    );

  return {
    providerName: defaults.providerName,
    baseUrl:
      config?.baseUrl ||
      getEnv(`${specificPrefix}_BASE_URL`, "CALL_AI_LLM_BASE_URL") ||
      defaults.baseUrl,
    apiKey,
    model:
      config?.model ||
      getEnv(
        `${specificPrefix}_MODEL`,
        "CALL_AI_LLM_MODEL",
        "CALL_AI_ANALYSIS_MODEL",
      ) ||
      defaults.model,
  };
}

function createTranscriber(config: CallAiAsrRuntimeConfig): CallAiTranscriber {
  const provider = config.provider;

  if (provider === "OPENAI") {
    return new OpenAiAudioTranscriber(config);
  }

  if (provider === "OPENAI_COMPATIBLE_AUDIO") {
    return new OpenAiCompatibleAudioTranscriber(config);
  }

  if (
    provider === "DASHSCOPE_FILE_ASR" ||
    provider === "DASHSCOPE_FILE" ||
    provider === "DASHSCOPE_ASR"
  ) {
    return new DashScopeFileTranscriber(config);
  }

  if (
    provider === "LOCAL_HTTP_ASR" ||
    provider === "LOCAL_ASR" ||
    provider === "FUNASR" ||
    provider === "SENSEVOICE"
  ) {
    return new LocalHttpAsrTranscriber(config);
  }

  return new MockTranscriber();
}

function createAnalyzer(config: CallAiLlmRuntimeConfig): CallAiAnalyzer {
  const provider = normalizeLlmProviderName(config.provider);

  if (provider === "OPENAI" || provider === "OPENAI_RESPONSES") {
    return new OpenAiResponsesAnalyzer(config);
  }

  if (
    provider === "OPENAI_CHAT_COMPATIBLE" ||
    provider === "DASHSCOPE_QWEN" ||
    provider === "DEEPSEEK" ||
    provider === "MOONSHOT" ||
    provider === "BIGMODEL" ||
    provider === "VOLCENGINE_ARK" ||
    provider === "TENCENT_HUNYUAN"
  ) {
    return new OpenAiCompatibleChatAnalyzer({
      ...buildCompatibleProfile(provider, config),
      timeoutMs: config.timeoutMs,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
    });
  }

  return new MockAnalyzer();
}

export function createCallAiProviderFromConfig(
  config: ResolvedCallAiRuntimeConfig,
): CallAiProvider {
  const transcriber = createTranscriber(config.asr);
  const analyzer = createAnalyzer(config.llm);

  return {
    providerName: `${transcriber.providerName}+${analyzer.providerName}`,
    transcribe(input) {
      return transcriber.transcribe(input);
    },
    analyze(input) {
      return analyzer.analyze(input);
    },
  };
}

export function createCallAiProvider(): CallAiProvider {
  return createCallAiProviderFromConfig(getEnvCallAiRuntimeConfig());
}
