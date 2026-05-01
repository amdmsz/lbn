# Call Flow And Recording Hardening Plan

## Status

- Date: 2026-05-01
- Scope: plan first, no code changes in this document
- Goal: re-audit and harden both call paths, so outbound CTI calls and Android local-phone calls are stable, observable, auditable, and recording-capable where the selected path allows it.

This is a high-risk production workflow. The next implementation must be split into bounded phases with measurable validation instead of changing CTI, Android native code, recording upload, and UI behavior in one pass.

## Current Baseline

The repository already has two call paths:

1. **外呼 / CTI path**
   - UI calls `POST /api/outbound-calls/start`.
   - CRM validates customer scope and creates `OutboundCallSession` / `CallRecord`.
   - CTI Gateway bridges WebRTC seat and customer through Asterisk / PBX.
   - Asterisk server-side `MixMonitor` recording is imported through webhook.
   - Recording and AI quality review are shown through `/call-recordings`.

2. **本机 / Android local-phone path**
   - Mobile UI can launch phone calls through native bridge or `tel:`.
   - Existing mobile call APIs include `/api/mobile/calls/start`, `/api/mobile/calls/[callRecordId]/end`, and chunked recording uploads.
   - Android has `LbnCallRecorderPlugin` and foreground recording service, but Android recording reliability depends on device / ROM / Android version.

## Non-Negotiable Invariants

- `Customer` remains the sales execution object.
- `Customer.ownerId` is the Sales ownership scope anchor.
- Sales can only call and create call records for scoped customers.
- Supervisor sees team data only; Admin sees all.
- OPS / SHIPPER do not gain call recording or customer-call privileges by mobile UI changes.
- SIP trunk / PBX / provider secrets never enter frontend, Electron, Android assets, or logs.
- Server-side CTI recording is the enterprise recording truth when 外呼 is used.
- Android local recording is a device-capability feature, not a universal guarantee.
- Every call attempt must have a correlation id and an auditable event trail.
- Failed, canceled, permission-denied, upload-failed, and recording-unsupported states must be visible, not silent.
- Important state transitions must write `OperationLog` or a dedicated call event ledger that is still scoped by RBAC.

## Key Product Decision

To truly guarantee “员工每一个呼出的动作都能记录” there are only two reliable strategies:

1. **Recommended production default: force customer calls through 外呼 / CTI.**
   - Every dial starts from CRM API.
   - PBX CDR and server recording are the truth.
   - Most stable recording and audit chain.

2. **Managed-device strict mode for Android 本机.**
   - Company-owned devices.
   - CRM app becomes default dialer or uses managed policy.
   - Call-log reconciliation and recording capability are device controlled.

BYOD local-phone calls can only be “App 内发起可审计”; calls made outside the app cannot be fully detected or recorded by a normal Android app.

## Phase 0: Baseline Inventory And Repro Matrix

### Implementation checklist

- Inventory current call entrypoints:
  - `/mobile` dialpad call button
  - `/mobile` contact detail call button
  - customer detail call CTA
  - customer call history retry buttons
- Trace every path to one of:
  - `POST /api/outbound-calls/start`
  - `POST /api/mobile/calls/start`
  - native plugin call method
  - `tel:` fallback
- Document current event sequence for success and failure.
- Verify no path creates duplicate `CallRecord` rows for one user action.
- Add a test matrix table for:
  - 外呼 success / busy / no answer / provider failure
  - 本机 permission denied / call launched / call ended / recording failed / upload resumed

### Deliverable

- `docs/call-flow-audit-matrix.md`
- A current-state sequence diagram for both paths.

## Phase 1: Unified Call Action Ledger

### Implementation checklist

- Add or reuse a server-side event log for call actions.
- Minimum event names:
  - `call.intent_requested`
  - `call.intent_authorized`
  - `call.intent_rejected`
  - `call.provider_requested`
  - `call.provider_accepted`
  - `call.provider_failed`
  - `call.native_dispatched`
  - `call.native_permission_denied`
  - `call.offhook_detected`
  - `call.idle_detected`
  - `call.recording_started`
  - `call.recording_failed`
  - `call.upload_started`
  - `call.upload_completed`
  - `call.upload_failed`
  - `call.followup_prompted`
  - `call.followup_saved`
- Every event carries:
  - `correlationId`
  - `callRecordId` when known
  - `outboundSessionId` when 外呼
  - `customerId`
  - `salesId`
  - `deviceId` when Android
  - `callMode`: `crm-outbound | local-phone`
  - app version / device model / Android version when available
  - client timestamp and server receive timestamp
  - failure code and message when relevant
- Make start APIs idempotent with a client-generated correlation id.
- Surface last event state in mobile call history and customer detail.

### Validation

- Unit test event writer.
- API test duplicate `correlationId` does not create duplicate call records.
- RBAC test Sales cannot create ledger events for another Sales customer.

## Phase 2: 外呼 / CTI Path Hardening

### Implementation checklist

- Verify `POST /api/outbound-calls/start` ownership scope, seat binding, and provider disabled states.
- Ensure provider adapter timeout, retry, and failure messages are explicit.
- Confirm webhook handler idempotency for repeated events.
- Confirm webhook signature validation is enforced in production.
- Confirm `OutboundCallSession` and `CallRecord` statuses converge after:
  - accepted
  - ringing
  - answered
  - ended
  - failed
  - canceled
- Confirm Asterisk recording import maps `recordingPath` into configured recording storage.
- Add a reconciler check for sessions with ended call but missing recording.
- Ensure mobile 外呼 uses the same CTI start path and not a separate unaudited path.

### Advanced validation

- Run local CTI mock gateway:
  ```bash
  npm run dev:local-cti-smoke
  npm run check:outbound-provider -- --endpoint=http://127.0.0.1:8790/calls/start
  ```
- Replay webhook twice and verify idempotency:
  ```bash
  npm run check:outbound-webhook -- --endpoint=http://127.0.0.1:3000/api/outbound-calls/webhooks/freeswitch --secret=<local-secret>
  ```
- Production server smoke:
  ```bash
  curl http://127.0.0.1:8790/health
  sudo journalctl -u jiuzhuang-crm-cti-gateway.service -n 120 --no-pager
  sudo asterisk -rx "pjsip show contacts"
  sudo asterisk -rx "pjsip show channels"
  ```

## Phase 3: Android 本机 Path Hardening

### Implementation checklist

- Treat native local-phone calls as a state machine:
  - `IDLE -> INTENT_CREATED -> CALL_DISPATCHED -> OFFHOOK -> ENDED -> FOLLOWUP_PENDING -> FOLLOWUP_SAVED`
  - recording sub-state:
    `UNKNOWN -> PERMISSION_GRANTED -> RECORDING -> LOCAL_FILE_READY -> UPLOADING -> UPLOADED | FAILED | UNSUPPORTED`
- Persist session state before opening phone call UI.
- If native plugin is available, create `CallRecord` before dispatch and pass `callRecordId` into native session.
- If native plugin is unavailable, keep the browser fallback pre-create request but mark recording capability as `UNAVAILABLE`.
- Add retry queue for unfinished uploads on app launch and network reconnect.
- Detect and record permission denied separately from recording failed.
- Record device capability:
  - launch call supported
  - observe call state supported
  - recording started
  - recording produced non-empty file
  - upload completed
  - captures both sides / own voice only / silent
- Android 14+ foreground service:
  - must declare microphone FGS type
  - must show ongoing notification before capture
  - crash / killed service must write failure on next app resume

### Device validation matrix

- Xiaomi / Redmi
- Huawei / Honor
- Oppo / Vivo
- Samsung
- Android 11, 12, 13, 14, 15+

Each test row must record:

- call launched
- call state observed
- recording file exists
- file size
- duration
- playback quality
- both sides captured
- upload resume after network drop
- follow-up saved

## Phase 4: UX Closure For Call Flow

### Implementation checklist

- Keep one clear “始终使用：外呼 / 本机” switch.
- Show capability warning only when needed:
  - 本机录音不支持
  - 未授权麦克风
  - 上传队列待同步
- After any launched call, show follow-up prompt even if recording fails.
- In call history, show:
  - call mode: 外呼 / 本机
  - result: 未接通 / 已加微 / 拒加 / 未填写
  - recording state: 已录音 / 上传中 / 失败 / 不支持
- Do not block Sales follow-up because recording or AI is delayed.
- Add a small diagnostics panel in `/mobile` or settings for device readiness.

## Phase 5: Recording And AI Verification

### Implementation checklist

- For 外呼:
  - verify PBX recording imports into `CallRecording`
  - verify playback API supports Range
  - verify AI worker picks up uploaded/ready recordings
- For 本机:
  - verify upload complete marks recording ready
  - verify corrupted/empty file is rejected with visible failure
  - verify retries are idempotent
- Add a script that checks newest recording end-to-end:
  - metadata exists
  - storage file exists
  - audio length > 0
  - playback API returns `206`
  - AI job exists or is queued

### Validation commands

```bash
npx prisma validate
npx prisma generate
npm run prisma:predeploy:check
npm run lint
npm run build
npm run check:outbound-provider -- --endpoint=http://127.0.0.1:8790/calls/start
npm run check:outbound-webhook -- --endpoint=http://127.0.0.1:3000/api/outbound-calls/webhooks/freeswitch --secret=<local-secret>
npm run worker:call-ai -- --enqueue-missing --dry-run --limit=3
cd apps/mobile/android
./gradlew.bat assembleDebug
```

## Observability

Add admin/supervisor diagnostics that answer:

- How many calls were requested today?
- How many were rejected by RBAC?
- How many provider calls failed?
- How many local-phone calls reached offhook?
- How many recordings are missing after ended calls?
- How many uploads are stuck?
- How many AI jobs are pending or failed?
- Which device models are producing failed or silent recordings?

## Rollback Strategy

- Feature-flag 本机 recording off without disabling app calls.
- Feature-flag 本机 calls to use `tel:` fallback while preserving follow-up prompt.
- Feature-flag mobile calls to force 外呼 only.
- Disable CTI provider setting to fall back to manual call record.
- Keep existing `CallRecord`, `OutboundCallSession`, `CallRecording`, and AI records readable.
- Do not drop event ledger or recording metadata while recordings exist.

## Recommended Execution Order

1. Phase 0 audit + matrix.
2. Phase 1 unified call ledger and idempotency.
3. Phase 2 外呼 hardening with mock/webhook replay.
4. Phase 3 Android native hardening on real devices.
5. Phase 4 UX diagnostics.
6. Phase 5 recording/AI end-to-end verifier.

The first coding session should implement only Phase 0 + Phase 1. That creates the audit backbone before changing the risky native and PBX behavior.
