# Mobile SIM Call Recording + AI Quality Plan

## Status

- Date: 2026-04-26
- Scope: full feature plan
- Goal: Android App uses the employee SIM card to call customers, records locally, uploads reliably, stores recordings outside the web server, runs AI transcription / summary / quality checks, and lets supervisors review recordings by customer, employee, date, status, and AI signals.

This is no longer a tiny MVP. It is one full call-recording milestone with staged implementation.

## Product Flow

```text
Sales opens a customer in Android App
  -> taps Call
  -> App dials with the employee SIM card
  -> App records the call locally
  -> call ends
  -> App uploads the recording with resumable upload
  -> CRM attaches recording to CallRecord
  -> AI worker transcribes audio
  -> AI worker generates summary, keywords, intent, risks, and quality score
  -> Sales saves normal call result / remark
  -> Supervisor reviews recording, transcript, AI summary, and score
```

核心体验：销售还是用自己的手机号打给客户；主管在客户通话记录和录音列表里直接听录音、看转写、看 AI 总结和质检评分。

## Scope

### Include

- Android native SIM call feature.
- Android local call recording.
- Device binding and device status management.
- Resumable / chunked upload.
- Recording storage on a separate storage machine or object storage.
- Customer call-record inline audio playback.
- Supervisor recording review page with employee/date/customer/status filters.
- AI transcription.
- AI call summary.
- AI quality score.
- AI risk and opportunity extraction.
- AI keyword tagging.
- Retention / lifecycle policy for recordings and AI artifacts.
- Full RBAC and OperationLog audit.

### Exclude

- No cloud call-center / PBX.
- No replacement of `Customer` mainline.
- No change to `TradeOrder`, payment, fulfillment, product truth layers.
- No AI auto-edit of customer truth without explicit user action.
- No automatic disciplinary workflow in first release.

## Invariants

- `Customer` remains the sales execution main object.
- `CallRecord` remains the business call record; recording and AI data attach to it.
- `Customer.ownerId` remains the Sales ownership anchor.
- Sales can only create/upload recordings for their own customers.
- Supervisor can only review team recordings.
- Admin can review all recordings.
- OPS and SHIPPER do not gain recording access by default.
- Audio files are not stored in MySQL and not stored on the website server disk.
- Important events write `OperationLog`.
- AI output is assistive. It is not the legal or business truth by itself.

## Architecture

```text
Android App
  -> native SIM call + foreground recording service
  -> local encrypted recording cache
  -> resumable chunk upload

Next.js CRM
  -> mobile call session API
  -> recording upload API
  -> recording stream API
  -> customer calls UI
  -> supervisor recording workbench

Storage
  -> mounted storage directory or MinIO/S3-compatible bucket

Workers
  -> recording upload finalizer
  -> AI transcription worker
  -> AI summary / scoring worker
  -> retention cleanup worker

Database
  -> CallRecord
  -> CallRecording
  -> CallRecordingUpload
  -> MobileDevice
  -> CallAiAnalysis
  -> CallQualityReview
```

## Data Model

### `CallRecord`

Extend:

```prisma
recording CallRecording?
aiAnalysis CallAiAnalysis?
```

Keep existing fields for call result, duration, remark, and next follow-up.

### `CallRecording`

Stores recording metadata only.

Key fields:

- `id`
- `callRecordId`
- `customerId`
- `salesId`
- `teamId`
- `deviceId`
- `status`: `LOCAL_PENDING | UPLOADING | UPLOADED | PROCESSING | READY | FAILED | EXPIRED | DELETED`
- `storageProvider`: `LOCAL_MOUNT | MINIO | S3`
- `storageBucket`
- `storageKey`
- `mimeType`
- `codec`
- `fileSizeBytes`
- `durationSeconds`
- `sha256`
- `uploadedAt`
- `retentionUntil`
- `failureCode`
- `failureMessage`
- `createdAt`
- `updatedAt`

Indexes:

- `[customerId, createdAt]`
- `[salesId, createdAt]`
- `[teamId, createdAt]`
- `[status, createdAt]`
- `[retentionUntil]`

### `CallRecordingUpload`

Supports resumable upload.

Key fields:

- `id`
- `recordingId`
- `status`: `INITIATED | UPLOADING | COMPLETED | FAILED | CANCELED`
- `chunkSizeBytes`
- `totalChunks`
- `uploadedChunks`
- `totalSizeBytes`
- `sha256`
- `expiresAt`
- `createdAt`
- `updatedAt`

Chunk state can be stored as JSON for first version, not a separate chunk table unless needed.

### `MobileDevice`

Device binding and operational control.

Key fields:

- `id`
- `userId`
- `deviceFingerprint`
- `deviceModel`
- `androidVersion`
- `appVersion`
- `recordingEnabled`
- `recordingCapability`: `UNKNOWN | SUPPORTED | UNSUPPORTED | BLOCKED`
- `lastSeenAt`
- `disabledAt`
- `createdAt`
- `updatedAt`

Use this for:

- lost phone disable
- employee offboarding
- supported-device tracking
- app version visibility

### `CallAiAnalysis`

AI output for one call.

Key fields:

- `id`
- `callRecordId`
- `recordingId`
- `status`: `PENDING | TRANSCRIBING | ANALYZING | READY | FAILED`
- `transcriptText`
- `transcriptJson`
- `summary`
- `customerIntent`: `HIGH | MEDIUM | LOW | REFUSED | UNKNOWN`
- `sentiment`: `POSITIVE | NEUTRAL | NEGATIVE | MIXED`
- `qualityScore`
- `riskFlagsJson`
- `opportunityTagsJson`
- `keywordsJson`
- `nextActionSuggestion`
- `modelProvider`
- `modelName`
- `modelVersion`
- `processedAt`
- `failureMessage`
- `createdAt`
- `updatedAt`

AI output must be editable only through explicit review actions, not silently copied into customer truth.

### `CallQualityReview`

Supervisor manual review on top of AI.

Key fields:

- `id`
- `callRecordId`
- `recordingId`
- `reviewerId`
- `aiScoreSnapshot`
- `manualScore`
- `reviewStatus`: `PENDING | REVIEWED | NEEDS_COACHING | EXCELLENT | DISMISSED`
- `comment`
- `createdAt`
- `updatedAt`

### Operation Enums

Add target types:

- `CALL_RECORDING`
- `CALL_AI_ANALYSIS`
- `CALL_QUALITY_REVIEW`
- `MOBILE_DEVICE`

Use `OperationModule.CALL`.

## Android App

Files likely touched:

- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/android/app/src/main/java/com/lbn/crm/MainActivity.java`
- `apps/mobile/android/app/src/main/java/com/lbn/crm/calls/*`

Permissions:

```xml
<uses-permission android:name="android.permission.CALL_PHONE" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.READ_CALL_LOG" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Native responsibilities:

- register/bind device
- request call/recording permissions
- start SIM call
- start foreground recording service
- stop recording when call ends
- save encrypted local recording
- create upload session
- upload chunks with retry
- retry unfinished uploads on app launch
- notify web layer when call ended so Sales can save call result / remark

## APIs

### Mobile Device

- `POST /api/mobile/devices/register`
- `PATCH /api/mobile/devices/:id/heartbeat`
- `PATCH /api/mobile/devices/:id/capability`

### Call Session

- `POST /api/mobile/calls/start`
  - creates or reserves a `CallRecord`
  - verifies Sales ownership
  - returns callRecordId, customer phone, upload config

- `PATCH /api/mobile/calls/:callRecordId/end`
  - updates duration and native call status

### Recording Upload

- `POST /api/mobile/call-recordings/uploads`
  - creates `CallRecording` + `CallRecordingUpload`

- `PUT /api/mobile/call-recordings/uploads/:uploadId/chunks/:index`
  - stores chunk
  - validates chunk checksum

- `POST /api/mobile/call-recordings/uploads/:uploadId/complete`
  - assembles or commits object
  - validates full sha256
  - marks recording uploaded
  - enqueues AI processing

### Playback

- `GET /api/call-recordings/:id/audio`
  - streams audio or redirects to short-lived signed URL
  - writes `call_recording.played`

### AI

- `POST /api/call-recordings/:id/reprocess-ai`
  - Admin/Supervisor only
  - requeues AI processing

### Quality Review

- `POST /api/call-recordings/:id/reviews`
  - Supervisor/Admin only
  - saves manual score and comment

## AI Pipeline

Use a provider adapter so the implementation can support different vendors.

```text
Recording uploaded
  -> enqueue transcription job
  -> ASR turns audio into transcript
  -> enqueue analysis job
  -> LLM creates summary / score / risk flags / next action
  -> save CallAiAnalysis
  -> show result in customer call records and recording workbench
```

### Multi-Channel Provider Strategy

The AI layer is split into two provider axes:

- `CALL_AI_ASR_PROVIDER`: audio transcription.
- `CALL_AI_LLM_PROVIDER`: transcript summary / intent / quality scoring.

Reason: domestic LLM vendors usually provide strong OpenAI-compatible text APIs, but ASR is a separate product capability. The default remains `MOCK` for local development and safe deployment.

Supported ASR providers:

- `MOCK`
- `OPENAI`
- `OPENAI_COMPATIBLE_AUDIO`
- `DASHSCOPE_FILE`
- `LOCAL_HTTP_ASR`

Supported LLM providers:

- `MOCK`
- `OPENAI` / `OPENAI_RESPONSES`
- `OPENAI_CHAT_COMPATIBLE`
- `DASHSCOPE_QWEN`
- `DEEPSEEK`
- `MOONSHOT`
- `BIGMODEL`
- `VOLCENGINE_ARK`
- `TENCENT_HUNYUAN`

Recommended cost-first setup when the CRM audio server has no public inbound URL:

```env
CALL_AI_ENABLED=1
CALL_AI_ASR_PROVIDER=LOCAL_HTTP_ASR
CALL_AI_LOCAL_ASR_ENDPOINT=http://10.0.0.20:8000/asr/transcribe
CALL_AI_LOCAL_ASR_MODEL=funasr-sensevoice

CALL_AI_LLM_PROVIDER=DEEPSEEK
DEEPSEEK_API_KEY=...
CALL_AI_DEEPSEEK_MODEL=deepseek-v4-flash
```

`LOCAL_HTTP_ASR` posts the recording bytes directly to an internal ASR service using `multipart/form-data`, so the recording file does not need a public URL. The internal ASR endpoint should return one of: `text`, `transcriptText`, `transcript`, `result.text`, or `segments[].text`.

Use `DASHSCOPE_FILE` only when DashScope can pull a public or signed recording URL. A pure LAN-only server should not use `CALL_AI_AUDIO_PUBLIC_BASE_URL` with a private address because cloud ASR cannot reach it.

Local provider validation commands:

```powershell
npm run dev:local-asr-smoke
npm run check:call-ai-provider -- --endpoint=http://127.0.0.1:8787/transcribe
```

For the full internal ASR runbook, see `docs/call-ai-local-asr-runbook.md`.

For better model-vendor redundancy, keep ASR and LLM separately configurable instead of using one `CALL_AI_PROVIDER` for everything.

### AI Outputs

Transcription:

- full transcript
- optional timestamped segments
- optional speaker labels if available

Summary:

- 3 to 6 sentence business summary
- customer objections
- customer intent
- next action suggestion

Quality score:

- opening clarity
- product explanation
- objection handling
- compliance disclosure
- closing / next step
- overall score 0-100

Risk flags:

- complaint
- refund / dispute
- abusive language
- sensitive personal information
- price promise risk
- compliance disclosure missing

Opportunity tags:

- high purchase intent
- WeChat follow-up
- live invitation
- reorder potential
- gift / discount sensitivity

### AI Guardrails

- AI output is labeled as AI-generated.
- Supervisor can override manual review score.
- AI does not auto-change `Customer` classification by default.
- Any future AI-assisted customer update must require explicit user confirmation and audit.
- Failed AI processing must not block recording playback.

### Open-Source Android Recorder Learnings

Reviewed projects and examples:

- `chenxiaolong/BCR`
- `axet/android-call-recorder`
- `tntkhang/call-recording-master`

Implementation rules we should keep:

- Android call recording is device / ROM dependent. Treat device capability as operational data, not as a universal promise.
- Foreground service + notification is required when recording during calls.
- Use an audio-source fallback chain. Prefer `VOICE_COMMUNICATION`, then fall back to `MIC`, then `DEFAULT` when a device rejects a source.
- Store local session state immediately so the web layer can show `RECORDING / UPLOADING / FAILED` even after activity lifecycle changes.
- Do not rely on privileged sources such as `VOICE_CALL` unless the app is installed as a system/privileged app; that is not our default deployment model.
- Build a real-device matrix before rollout: brand, model, Android version, source used, whether both sides are captured, upload result.

## Storage

Support two storage adapters:

1. `LOCAL_MOUNT`
   - mounted directory from a separate storage machine
   - simplest first deployment

2. `MINIO`
   - S3-compatible object storage
   - better for scale and lifecycle later

Environment variables:

```env
CALL_RECORDING_STORAGE_PROVIDER=LOCAL_MOUNT
CALL_RECORDING_STORAGE_DIR=/data/lbn-crm/call-recordings
CALL_RECORDING_UPLOAD_TMP_DIR=/data/lbn-crm/call-recording-uploads
CALL_RECORDING_MAX_FILE_MB=200
CALL_AI_ENABLED=1
CALL_AI_ASR_PROVIDER=MOCK
CALL_AI_LLM_PROVIDER=MOCK
CALL_AI_API_KEY=
```

Object key:

```text
recordings/{yyyy}/{mm}/team_{teamId}/sales_{salesId}/call_{callRecordId}.m4a
```

## Retention

First full version includes policy fields and a cleanup script.

Default:

- Recording retention: 12 months
- AI transcript / summary retention: follows recording retention
- Manual quality review: retained as business audit metadata

Script:

```bash
npm run worker:call-recording-retention
```

Behavior:

- dry-run mode first
- mark expired
- delete object storage file
- keep metadata and OperationLog
- write `call_recording.expired`

## UI / IA

### Customer Detail

Update customer calls tab:

- call result / remark stays first-class
- recording player appears inline on records
- transcript and AI summary are collapsed by default
- AI score and risk flags are visible to Supervisor/Admin
- Sales can see own recording and summary if enabled

### Recording Review Page

Route:

```text
/call-recordings
```

Access:

- Admin
- Supervisor

Filters:

- employee
- customer keyword
- date range
- recording status
- AI status
- quality score range
- risk flag
- opportunity tag

Main table:

- time
- employee
- customer
- duration
- call result
- recording status
- AI status
- quality score
- risk flags
- play/review action

Detail drawer:

- audio player
- transcript
- AI summary
- quality score breakdown
- manual supervisor review
- OperationLog snippets

### Device Management

Route:

```text
/settings/mobile-devices
```

Access:

- Admin
- Supervisor can view team devices if needed

Fields:

- employee
- device model
- app version
- recording capability
- last seen
- enabled/disabled

Keep it compact; this is an operations table, not a separate product.

## RBAC

Add helpers:

- `canAccessCallRecordingModule(role)`
- `canReviewCallRecording(role)`
- `canManageMobileDevice(role)`
- `getCallRecordingScope(role, userId, teamId)`

Rules:

- `ADMIN`: all recordings, all devices, all reviews
- `SUPERVISOR`: team recordings, team review, team AI results
- `SALES`: own recording playback and upload; no team page
- `OPS`: no access by default
- `SHIPPER`: no access

All playback, AI reprocess, review, and device actions must check server-side permissions.

## OperationLog Events

Required:

- `mobile_device.registered`
- `mobile_device.disabled`
- `mobile_call.started`
- `mobile_call.ended`
- `call_recording.upload_started`
- `call_recording.upload_completed`
- `call_recording.upload_failed`
- `call_recording.played`
- `call_recording.expired`
- `call_ai.transcription_started`
- `call_ai.transcription_completed`
- `call_ai.analysis_completed`
- `call_ai.analysis_failed`
- `call_quality_review.created`
- `call_quality_review.updated`

## Implementation Checklist

### Phase 1: Schema and Backend Foundation

- Add Prisma enums/models/migration.
- Add recording storage adapter.
- Add RBAC helpers.
- Add mobile device service.
- Add call recording query service.
- Add OperationLog helpers.

### Phase 2: Upload and Playback

- Add upload session API.
- Add chunk upload API.
- Add upload complete/finalize API.
- Add audio stream API.
- Add retry-safe/idempotent finalize behavior.
- Add storage cleanup for failed temp chunks.

### Phase 3: Android Native Calling

- Add permissions.
- Add device registration.
- Add native SIM call bridge.
- Add foreground recording service.
- Add local encrypted file cache.
- Add resumable upload.
- Add retry on app launch.
- Add call-ended callback to open normal call result form.

### Phase 4: Customer UI

- Extend customer detail call records query.
- Add inline audio player.
- Add recording status.
- Add collapsed transcript/summary section.
- Keep existing call result and remark flow unchanged.

### Phase 5: AI Workers

- Add AI provider adapter.
- Add transcription worker.
- Add summary/scoring worker.
- Add AI retry/error state.
- Add reprocess action.
- Add AI output validation before DB write.

### Phase 6: Supervisor Review UI

- Add `/call-recordings` page.
- Add filters and dense table.
- Add detail drawer.
- Add manual review form.
- Add score/risk/opportunity filters.

### Phase 7: Device Management and Retention

- Add `/settings/mobile-devices`.
- Add enable/disable actions.
- Add retention worker with dry-run.
- Add docs/env examples.

### Phase 8: Hardening

- Add RBAC tests.
- Add upload checksum/idempotency tests.
- Add AI output parser tests.
- Add retention dry-run tests.
- Validate Android debug build.
- Manual QA on real devices.

## Validation

Backend:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

Migration safety:

```bash
npm run prisma:predeploy:check
npm run prisma:diff:migrations
```

Workers:

```bash
npm run worker:call-ai
npm run worker:call-recording-retention -- --dry-run
```

Android:

```bash
npm run mobile:sync
cd apps/mobile/android
./gradlew.bat assembleDebug
```

Manual QA:

- Sales calls customer from Android App using SIM card.
- Recording saves locally.
- Weak-network upload resumes.
- Customer call record shows audio player.
- AI transcript appears after worker completes.
- AI summary and quality score appear.
- Supervisor filters by employee and reviews call.
- Supervisor cannot see other teams.
- Sales cannot see other Sales recordings.
- OPS/SHIPPER cannot access recording pages or audio APIs.
- Playback writes `OperationLog`.
- AI reprocess writes `OperationLog`.
- Retention dry-run reports expected candidates without deleting files.

## Rollback Plan

Rollback must be feature-flag first, not destructive DB rollback.

1. Disable Android recording entrypoint.
2. Keep metadata and existing uploaded recordings readable.
3. Disable new uploads.
4. Disable AI worker.
5. Disable retention worker.
6. Keep `CallRecording`, `CallAiAnalysis`, and `CallQualityReview` tables until data export/retention decision is made.

Do not drop recording metadata while audio files exist.

## Recommended Execution

Implement this as one milestone, but do not code all files in one uncontrolled pass.

Recommended first execution session:

1. Phase 1 schema/backend foundation.
2. Phase 2 upload/playback.
3. Stop and validate.

Second execution session:

1. Android native calling/recording.
2. Customer UI playback.

Third execution session:

1. AI workers.
2. Supervisor review page.
3. Device management and retention.

This keeps the final product complete while reducing regression risk.
