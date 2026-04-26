# Call AI Local ASR Runbook

## Purpose

Use this when the CRM server is on a LAN / intranet and recordings cannot be exposed through a public URL.

`LOCAL_HTTP_ASR` sends recording bytes directly from the CRM worker to an internal ASR service using `multipart/form-data`.

## Contract

Request:

- method: `POST`
- content type: `multipart/form-data`
- fields:
  - `file`: audio file bytes
  - `model`: ASR model name
  - `storageKey`: CRM recording storage key
  - `context`: JSON string with call context

Response can be any one of:

```json
{ "text": "..." }
```

```json
{ "transcriptText": "..." }
```

```json
{ "result": { "text": "..." } }
```

```json
{ "segments": [{ "text": "..." }] }
```

## Smoke Test

Terminal A:

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run dev:local-asr-smoke
```

Terminal B:

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run check:call-ai-provider -- --endpoint=http://127.0.0.1:8787/transcribe
```

Expected output:

- `call_ai_provider.transcription_ok`
- `call_ai_provider.analysis_ok`

## Real Internal ASR

Example:

```env
CALL_AI_ENABLED=1
CALL_AI_ASR_PROVIDER=LOCAL_HTTP_ASR
CALL_AI_LOCAL_ASR_ENDPOINT=http://10.0.0.20:8000/asr/transcribe
CALL_AI_LOCAL_ASR_MODEL=funasr-sensevoice
CALL_AI_LLM_PROVIDER=DEEPSEEK
DEEPSEEK_API_KEY=...
CALL_AI_DEEPSEEK_MODEL=deepseek-v4-flash
```

Check with a real uploaded audio file:

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run check:call-ai-provider -- --endpoint=http://10.0.0.20:8000/asr/transcribe --audio=C:\path\to\recording.m4a --transcribe-only
```

Then run the worker:

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run worker:call-ai -- --dry-run --limit=3
npm run worker:call-ai -- --enqueue-missing --dry-run --limit=3
npm run worker:call-ai -- --limit=3
```

`--enqueue-missing` is useful after enabling AI on an environment that already
has uploaded recordings. It creates pending AI jobs for READY / UPLOADED
recordings that do not yet have a `CallAiAnalysis` row.

AMR / AMR-WB recordings captured from Android system call recorders are
transcoded to M4A before they are sent to `LOCAL_HTTP_ASR`, so the ASR service
does not need to support OPPO / Android native AMR containers directly.

## Notes

- Do not use `DASHSCOPE_FILE` for LAN-only recordings; cloud ASR cannot pull private IP URLs.
- Keep the ASR endpoint reachable only from trusted internal servers.
- If the CRM server cannot access the internet, use `LOCAL_HTTP_ASR` and add a local LLM provider before production.
