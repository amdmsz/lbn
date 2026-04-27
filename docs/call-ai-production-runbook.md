# Call AI Production Runbook

## Purpose

This runbook enables production AI processing for call recordings:

- ASR turns recording audio into transcript text.
- LLM turns transcript text into summary, customer intent, risks, keywords and quality score.
- The worker writes `CallAiAnalysis` and `OperationLog`, then the recording QA page can show the result.

## Recommended Production Shape

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

Put the LLM API key either in `/settings/call-ai` as the LLM secret, or in the
server env as the provider-specific key, for example:

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

Check effective AI provider config without exposing secrets:

```bash
cd /var/www/jiuzhuang-crm
set -a
. /etc/jiuzhuang-crm/jiuzhuang-crm.env
set +a
npm run check:call-ai-provider -- --transcribe-only
```

Check candidates and enqueue old imported recordings:

```bash
cd /var/www/jiuzhuang-crm
set -a
. /etc/jiuzhuang-crm/jiuzhuang-crm.env
set +a
npm run worker:call-ai -- --enqueue-missing --dry-run --limit=3
npm run worker:call-ai -- --enqueue-missing --limit=3
```

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
