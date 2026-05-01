# Call Flow Audit Matrix

## Scope

Date: 2026-05-01

This document captures the current call entrypoints and the Phase 1 audit contract for the mobile call workspace. It covers only the two supported call modes:

- `crm-outbound`: 外呼 through the CRM CTI gateway. Server-side PBX/CTI records and recordings are the enterprise truth.
- `local-phone`: 本机通话 launched from the Android shell or `tel:` fallback. Recording is device/ROM dependent and must be treated as best-effort unless the device is managed.

## Invariants

- `Customer.ownerId` remains the Sales ownership anchor.
- SALES can only create call records for customers they own.
- ADMIN can create calls when needed; SUPERVISOR can inspect scoped data but does not gain mobile call creation by UI-only changes.
- CTI provider secrets and PBX credentials stay server-side.
- Every app-initiated call attempt should carry a `correlationId`.
- Duplicate start requests with the same `correlationId` must not create duplicate `CallRecord` rows.
- Recording or upload failure must not block follow-up saving.

## Entrypoints

| Entrypoint | UI origin | Call mode | Primary API / bridge | Expected persistence |
| --- | --- | --- | --- | --- |
| `/mobile` dialpad call button | `DialpadTab` | current "始终使用" mode | `POST /api/outbound-calls/start` or native/tel flow | `CallRecord`, `OutboundCallSession` for 外呼; `CallRecord` for 本机 |
| `/mobile` customer row call | `CustomerCard` / phone history row | explicit or current mode | same as above | same as above |
| `/mobile` customer detail call | `CustomerDetailDrawer` | current mode | same as above | same as above |
| `/mobile` recent retry | phone history row | current mode | same as above | same as above |
| Android native recorder | `LbnCallRecorder` plugin | `local-phone` | native `startRecordedSimCall` plus upload APIs | `MobileDevice`, `CallRecording`, `CallRecordingUpload` |
| Browser fallback | non-native or unsupported shell | `local-phone` | `tel:` plus `POST /api/mobile/calls/start` | `CallRecord`, follow-up prompt |

## Current Success Sequences

### 外呼 / CTI

1. User taps call in the mobile workspace.
2. Web UI resolves the full customer phone if the list only has a masked number.
3. Client sends `POST /api/outbound-calls/start` with `customerId` and `correlationId`.
4. Server checks role, customer scope, recycle-bin guard, CTI config, seat binding, and phone validity.
5. Server creates one `CallRecord` and one `OutboundCallSession`.
6. Server writes call action events and existing operation logs.
7. Server calls the CTI provider adapter.
8. Provider accepted/failed state is written back to `OutboundCallSession`.
9. Provider webhook later converges ringing/answered/ended status and imports server recording when available.

### 本机 / Android

1. User taps call in the mobile workspace.
2. Web UI resolves the full customer phone if needed and creates a pending follow-up marker.
3. If native plugin is available, the app requests recording/call permissions and registers the device.
4. Client sends `POST /api/mobile/calls/start` with `customerId`, `correlationId`, and device profile metadata when available.
5. Server checks role, customer scope, recycle-bin guard, and ownership.
6. Server creates one `CallRecord`, then writes call action events and existing operation logs.
7. Native plugin launches the phone call and starts the foreground recording flow when supported.
8. When the call returns, mobile prompts the employee to save the follow-up result.
9. Recording upload starts, chunks upload, and completion marks the recording ready or failed.

## Failure And Duplicate Risks

| Risk | Current baseline | Phase 1 mitigation |
| --- | --- | --- |
| Double tap / network retry creates duplicate `CallRecord` | Start APIs previously created records unconditionally | Client-generated `correlationId` plus server-side unique call action event |
| CTI provider accepts but client retries before UI updates | Possible duplicate external start | Duplicate correlation returns the existing session instead of creating a new one |
| Native plugin retries after WebView resumes | Possible duplicate local call record | Same correlation returns the existing local `CallRecord` |
| Permission denied before local call dispatch | Could be silent in server audit | `call.native_permission_denied` event is reserved for Phase 3 native instrumentation |
| Recording unsupported or empty | Device/ROM dependent | Phase 1 ledger reserves explicit recording/upload failure events; Phase 3 verifies device support |
| Upload interrupted after app is swiped away | Upload may stay pending | Phase 3 adds retry queue and WorkManager/native hardening |

## Test Matrix

| Mode | Scenario | Expected server result | Expected UI result |
| --- | --- | --- | --- |
| 外呼 | Success / provider accepted | one `CallRecord`, one `OutboundCallSession`, `call.intent_authorized`, `call.provider_requested`, `call.provider_accepted` | "外呼已提交", then status polling converges |
| 外呼 | Provider failure | one `CallRecord`, one failed `OutboundCallSession`, `call.provider_failed` | visible failure notice |
| 外呼 | Duplicate same `correlationId` | returns the first session; no duplicate `CallRecord` | same session state reused |
| 外呼 | Sales dials another owner's customer | no call record; `call.intent_rejected` when customer id is known | 400/403-style failure message |
| 本机 | Native call launched | one `CallRecord`, `call.intent_authorized`, `call.native_dispatched` when native confirms | phone app opens, follow-up prompt remains pending |
| 本机 | Browser fallback | one `CallRecord`, no recording guarantee | `tel:` opens, follow-up prompt remains pending |
| 本机 | Duplicate same `correlationId` | returns the first `CallRecord` | pending follow-up keeps the same call id |
| 本机 | Recording upload starts | `CallRecording`, `CallRecordingUpload`, `call.upload_started` | upload queue can continue |
| 本机 | Upload completed | recording ready/processing, `call.upload_completed` | recording visible when playback API allows |
| 本机 | Upload failed | recording/upload failed, `call.upload_failed` | follow-up still saveable |

## Phase Boundaries

Phase 1 adds the event ledger, correlation ids, idempotent start APIs, and minimal history state exposure. It does not change the CTI provider adapter, Android foreground recording service, WorkManager retry behavior, or the recording verifier.
