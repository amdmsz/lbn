# Call AI Production Runbook

更新时间：2026-04-28

## Purpose

This runbook enables production AI processing for call recordings:

- ASR turns recording audio into transcript text.
- LLM turns transcript text into summary, customer intent, risks, keywords and quality score.
- The worker writes `CallAiAnalysis` and `OperationLog`, then the recording QA page can show the result.

## Current Production Shape

当前生产推荐拆成两段：

- ASR：`OPENAI` + `gpt-4o-transcribe-diarize`，负责录音转写和说话人分离
- LLM：`DEEPSEEK` + `deepseek-v4-pro`，负责摘要、意图、风险、关键词、建议动作和质量分

```env
CALL_AI_ENABLED=1
CALL_AI_ASR_PROVIDER=OPENAI
CALL_AI_ASR_BASE_URL=https://api.openai.com/v1
CALL_AI_ASR_MODEL=gpt-4o-transcribe-diarize
CALL_AI_TRANSCRIPTION_MAX_FILE_MB=25
CALL_AI_LLM_PROVIDER=DEEPSEEK
CALL_AI_LLM_BASE_URL=https://api.deepseek.com
CALL_AI_DEEPSEEK_MODEL=deepseek-v4-pro
CALL_AI_LLM_MAX_OUTPUT_TOKENS=4000
CALL_AI_LLM_TEMPERATURE=0.2
CALL_AI_WORKER_BATCH_LIMIT=5
```

Secrets can be set by env:

```env
OPENAI_API_KEY=replace-with-openai-secret
DEEPSEEK_API_KEY=replace-with-deepseek-secret
```

Or save them in `/settings/call-ai` secret fields. If secrets are saved in system settings, production must keep a stable `SYSTEM_SETTING_ENCRYPTION_KEY`.

`gpt-4o-transcribe-diarize` does not support the normal transcription `prompt` field. The provider code detects `transcribe-diarize` models and sends `response_format=diarized_json` without prompt.

When configuring this through `/settings/call-ai`, keep the ASR endpoint field empty for OpenAI ASR. The endpoint field is for `LOCAL_HTTP_ASR`; OpenAI uses the base URL `https://api.openai.com/v1`.

## Alternative LAN-Only ASR Shape

For LAN-only recordings, keep ASR inside the LAN and send audio bytes from the CRM worker:

```env
CALL_AI_ENABLED=1
CALL_AI_ASR_PROVIDER=LOCAL_HTTP_ASR
CALL_AI_LOCAL_ASR_ENDPOINT=http://127.0.0.1:8787/transcribe
CALL_AI_LOCAL_ASR_MODEL=funasr-sensevoice
CALL_AI_LLM_PROVIDER=DEEPSEEK
CALL_AI_LLM_BASE_URL=https://api.deepseek.com
CALL_AI_DEEPSEEK_MODEL=deepseek-v4-pro
CALL_AI_LLM_MAX_OUTPUT_TOKENS=4000
CALL_AI_LLM_TEMPERATURE=0.2
CALL_AI_WORKER_BATCH_LIMIT=5
```

Put the LLM API key either in `/settings/call-ai` as the LLM secret, or in the server env as the provider-specific key, for example:

```env
DEEPSEEK_API_KEY=replace-with-real-secret
```

If you save secrets in `/settings/call-ai`, the production env must also contain:

```env
SYSTEM_SETTING_ENCRYPTION_KEY=replace-with-openssl-rand-base64-32
```

Generate it once and keep it stable:

```bash
openssl rand -base64 32
```

Do not use `DASHSCOPE_FILE_ASR` unless CRM recordings have a public or signed
URL. For private NFS / LAN recordings, use `LOCAL_HTTP_ASR`.

## Install Systemd Timer

Run on the CRM server after the repo has been deployed.

```bash
cd /var/www/jiuzhuang-crm

sudo cp deploy/systemd/jiuzhuang-crm-call-ai-worker.service /etc/systemd/system/jiuzhuang-crm-call-ai-worker.service
sudo cp deploy/systemd/jiuzhuang-crm-call-ai-worker.timer /etc/systemd/system/jiuzhuang-crm-call-ai-worker.timer

sudo sed -i \
  -e 's#__APP_USER__#crm#g' \
  -e 's#__APP_GROUP__#crm#g' \
  -e 's#__APP_ROOT__#/var/www/jiuzhuang-crm#g' \
  -e 's#__ENV_FILE__#/etc/jiuzhuang-crm/jiuzhuang-crm.env#g' \
  /etc/systemd/system/jiuzhuang-crm-call-ai-worker.service

sudo systemctl daemon-reload
sudo systemctl enable --now jiuzhuang-crm-call-ai-worker.timer
```

## Smoke Check

Check with the newest real recording. For real OpenAI ASR, do not use the no-audio smoke payload; it is only useful for local mock / local ASR smoke.

```bash
cd /var/www/jiuzhuang-crm
set -a
. /etc/jiuzhuang-crm/jiuzhuang-crm.env
set +a
AUDIO="$(find /mnt/lbn-storage/recordings -type f \( -name '*.wav' -o -name '*.m4a' -o -name '*.mp3' \) -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
echo "$AUDIO"
npm run check:call-ai-provider -- --audio="$AUDIO" --mime-type=audio/wav --transcribe-only
npm run check:call-ai-provider -- --audio="$AUDIO" --mime-type=audio/wav
```

If the ASR model is `gpt-4o-transcribe-diarize`, an error like `Prompt is not supported for diarization models` means the deployed code is older than this runbook; update the repo and rebuild first.

Check candidates and enqueue old imported recordings:

```bash
cd /var/www/jiuzhuang-crm
set -a
. /etc/jiuzhuang-crm/jiuzhuang-crm.env
set +a
npm run worker:call-ai -- --enqueue-missing --dry-run --limit=3
npm run worker:call-ai -- --enqueue-missing --limit=3
```

`processedCount=0` is expected when there are no pending recordings. It is not a failure by itself. Confirm by checking recent `CallAiAnalysis` rows or by making one new real call recording.

Check timer and logs:

```bash
systemctl list-timers 'jiuzhuang-crm-call-ai-worker*'
sudo systemctl status jiuzhuang-crm-call-ai-worker.timer --no-pager
sudo journalctl -u jiuzhuang-crm-call-ai-worker.service -n 100 --no-pager
```

## Validate In Database

```bash
cd /var/www/jiuzhuang-crm
set -a
. /etc/jiuzhuang-crm/jiuzhuang-crm.env
set +a
node - <<'NODE'
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });

(async () => {
  const rows = await prisma.callAiAnalysis.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      modelProvider: true,
      modelName: true,
      qualityScore: true,
      failureMessage: true,
      processedAt: true,
      recording: {
        select: {
          storageKey: true,
          status: true,
          customer: { select: { name: true } },
        },
      },
    },
  });

  console.table(rows.map((row) => ({
    id: row.id,
    customer: row.recording.customer.name,
    status: row.status,
    recordingStatus: row.recording.status,
    provider: row.modelProvider ?? "",
    model: row.modelName ?? "",
    score: row.qualityScore ?? "",
    processedAt: row.processedAt?.toISOString() ?? "",
    storageKey: row.recording.storageKey ?? "",
    failure: row.failureMessage ?? "",
  })));
})().finally(() => prisma.$disconnect());
NODE
```

## Troubleshooting

- `call_ai.worker_disabled`: enable `/settings/audit` -> `启用录音 AI worker`, or set `CALL_AI_ENABLED=1`.
- `缺少 API Key`: save the secret in `/settings/call-ai`, or add the provider key to the env file and restart/timer rerun.
- `录音文件路径缺失`: the recording import webhook did not map to CRM storage; verify `CALL_RECORDING_STORAGE_DIR`.
- `录音转码失败`: set `CALL_RECORDING_FFMPEG_PATH` or install `ffmpeg`; AMR recordings are transcoded before ASR.
- `AI 分析结果不是合法 JSON`: keep `strictJsonOutput` enabled and use a model/provider that supports stable JSON output.
- `processedCount=0`: no pending jobs were found. Run with `--enqueue-missing --dry-run`, then confirm whether existing recordings already have `CallAiAnalysis` rows.
- `bash: /home/crm/.bash_profile: Permission denied` in systemd logs: the local service file is using `bash -lc`. Replace it with `bash -c`, run `sudo systemctl daemon-reload`, then restart the one-shot service once.
