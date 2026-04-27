# CTI Outbound Call Center Rebuild Plan

## Status

- Date: 2026-04-27
- Owner: CRM / telephony integration milestone
- Scope: rebuild outbound calling as an enterprise CTI/API call-center layer for the liquor CRM
- Execution mode: plan first, then implement in bounded phases

## Interpretation

The business direction is to stop relying on a separate WayMi desktop softphone and rebuild the outbound capability around a mature call-center architecture:

```text
CRM -> CTI outbound gateway -> PBX / softswitch -> VOS / carrier routes
    -> server-side recording / CDR / event callbacks
    -> CRM CallRecord / CallRecording / CallAiAnalysis
```

This is not a browser-SIP-first rebuild. The browser and Android app should initiate calls through CRM APIs, while telephony control, bridging, recording, and CDR truth remain server-side.

## Goals

1. Let sales call customers directly from CRM desktop and Android app.
2. Remove the daily dependency on WayMi as the user-facing dialing tool.
3. Keep VOS / PBX as the telephony foundation when it is the best available line base.
4. Add a CRM-owned CTI integration layer that can later switch providers without rewriting customer workflows.
5. Store every outbound call as auditable CRM data.
6. Reuse the existing recording storage, transcription, diarization, AI analysis, and quality-review workbench.
7. Preserve the current `Customer` sales mainline and `TradeOrder` transaction mainline.

## Non-Goals

- Do not rebuild the CRM around Lead.
- Do not rewrite `Customer`, `TradeOrder`, payment, fulfillment, or recycle lifecycle.
- Do not make browser WebRTC the first dependency for production outbound calls.
- Do not rely on local browser or phone-side recording as the enterprise truth when PBX server-side recording is available.
- Do not expose SIP passwords to frontend JavaScript.
- Do not store telephony provider secrets in plain text.
- Do not introduce predictive dialing in phase 1.

## Invariants

- `Customer` remains the sales execution object.
- `CallRecord` remains the CRM business call record visible from customer history.
- `CallRecording` remains the CRM recording metadata object.
- `CallAiAnalysis` remains the AI analysis object.
- Important actions must write `OperationLog`.
- RBAC must be enforced server-side:
  - `SALES`: can initiate calls only for owned customers.
  - `SUPERVISOR`: can view team calls and recordings.
  - `ADMIN`: can configure CTI and view all calls.
- The CRM must own idempotency. Provider callback retries must not duplicate call records or recordings.
- Every external call must have a CRM correlation id and provider call id.
- Production schema changes must use Prisma migrations and `npm run prisma:predeploy:check`.

## Target Architecture

### Components

1. CRM Web / Android
   - Customer detail call button
   - Customer list call button
   - Mobile dialpad call button
   - Call status drawer / compact call bar

2. CRM Backend CTI Domain
   - Outbound call session service
   - Provider adapter interface
   - SIPD / PBX adapter implementation
   - Webhook receiver
   - CDR reconciler
   - Recording importer

3. Telephony Layer
   - PBX or CTI gateway controls call setup and hangup
   - VOS / carrier routes handle outbound lines
   - PBX / VOS produces server-side recordings and CDR

4. Recording / AI Layer
   - Existing recording storage adapter
   - Existing call AI worker
   - Existing ASR / diarization / LLM provider config
   - Existing quality-review workbench

### Seat Rule

Current CRM rule:

- Default CTI seat number is the CRM user `username`.
- `/settings/outbound-call` seat binding is only for override, extension/routing metadata, or disabling a user.
- Real SIP passwords stay on CTI Gateway / PBX, not in CRM seat rows.

### Call Flow

```text
Sales clicks Call in CRM
  -> POST /api/outbound-calls/start
  -> CRM validates customer scope and creates OutboundCallSession + CallRecord
  -> CRM calls CTI provider API
  -> Provider calls sales seat / extension / phone
  -> Provider bridges customer call
  -> Provider sends webhook events
  -> CRM updates OutboundCallSession + CallRecord duration/result status
  -> Provider sends CDR and recording URL
  -> CRM imports recording into CallRecording
  -> CRM queues CallAiAnalysis
```

## Data Model Plan

Additive schema only. Do not modify current call tables destructively.

### New Model: OutboundCallProviderAccount

Purpose: bind CRM user to a telephony seat.

Suggested fields:

- `id`
- `userId`
- `provider`
- `seatNo`
- `extensionNo`
- `authUsername`
- `displayNumber`
- `routingGroup`
- `enabled`
- `lastRegisteredAt`
- `metadataJson`
- `createdAt`
- `updatedAt`

Secrets such as SIP password or API token should use system settings secret storage, not plain model fields, unless a per-user encrypted secret mechanism is added deliberately.

### New Model: OutboundCallSession

Purpose: keep provider lifecycle separate from CRM business call record.

Suggested fields:

- `id`
- `callRecordId`
- `customerId`
- `salesId`
- `teamId`
- `provider`
- `providerCallId`
- `providerTraceId`
- `dialedNumber`
- `displayNumber`
- `seatNo`
- `direction`
- `status`
- `failureCode`
- `failureMessage`
- `requestedAt`
- `ringingAt`
- `answeredAt`
- `endedAt`
- `durationSeconds`
- `recordingUrl`
- `recordingExternalId`
- `recordingImportedAt`
- `rawCdrJson`
- `rawEventsJson`
- `createdAt`
- `updatedAt`

Unique constraints:

- `provider + providerCallId`
- `callRecordId`

Indexes:

- `salesId + requestedAt`
- `customerId + requestedAt`
- `teamId + requestedAt`
- `status + requestedAt`

### New System Settings Namespace

Add `outbound_call.provider`:

- provider: `DISABLED | SIPD | PBX_HTTP | CUSTOM_HTTP`
- endpoint
- webhookBaseUrl
- webhookSecret
- defaultRoutingGroup
- dialPrefix
- recordOnServer
- recordingImportMode: `WEBHOOK_URL | CDR_PULL | FILE_DROP`
- timeoutSeconds
- callbackRetryWindowMinutes

## Provider Adapter Contract

Create a small server-side interface:

```ts
type StartOutboundCallInput = {
  correlationId: string;
  customerId: string;
  salesId: string;
  seatNo: string;
  customerPhone: string;
  displayNumber?: string | null;
};

type StartOutboundCallResult = {
  providerCallId: string;
  providerTraceId?: string | null;
  initialStatus: "REQUESTED" | "RINGING" | "FAILED";
};
```

Required provider methods:

- `startOutboundCall`
- `hangupOutboundCall`
- `verifyWebhookSignature`
- `parseWebhookEvent`
- `fetchCdr`
- `fetchRecording`

Phase 1 can implement only `startOutboundCall`, webhook parsing, and recording import. Keep the interface ready for hangup and CDR reconciliation.

## Implementation Phases

### Phase 0: Telephony Discovery

Collect from the current VOS / PBX / SIPD owner:

- PBX type and version
- Whether SIPD already exposes HTTP click-to-call APIs
- Whether PBX exposes AMI / ARI / ESL / CDR database / HTTP API
- Current WayMi registration target
- Extension list and route rules
- Current recording path and format
- Whether recordings are available through HTTP, SMB/NFS mount, or file drop
- CDR schema or export format
- Required outbound prefix
- Caller ID rules

Deliverable:

- `docs/cti-provider-discovery.md`
- Decision: `SIPD API`, `PBX native API`, or `custom CTI gateway`.

### Phase 1: CRM CTI Foundation

Scope:

- Add Prisma models and migration.
- Add system setting schema for outbound call provider.
- Add admin settings surface for provider config.
- Add user/seat binding surface under settings users or a dedicated CTI config page.
- Add provider adapter interface with mock provider.
- Add `POST /api/outbound-calls/start`.
- Add `POST /api/outbound-calls/webhooks/[provider]`.
- Add `OperationLog` for start, provider accepted, event received, failed, ended, recording imported.

Validation:

- Mock provider can start a call.
- Webhook replay is idempotent.
- Sales cannot call another sales person's customer.
- Supervisor can inspect team sessions but cannot configure provider unless admin.

### Phase 2: SIPD / PBX Provider Adapter

Scope depends on discovery result.

Option A: SIPD has HTTP API:

- Implement `SIPD` adapter directly.
- CRM calls SIPD click-to-call.
- SIPD posts status and recording callbacks to CRM.

Option B: PBX has AMI / ARI / ESL:

- Add a small CTI gateway process near PBX.
- CRM calls CTI gateway over HTTP.
- Gateway talks to PBX internal protocol.
- Gateway normalizes events into CRM webhook contract.

Option C: CDR/file-drop only:

- CRM starts calls through provider API if available.
- A worker reconciles CDR rows and recording files by call id / phone / time window.
- This is viable but less real-time and must include stricter matching rules.

Validation:

- One real seat can call one test phone.
- CRM receives start, answer, end.
- Duration matches PBX CDR within acceptable tolerance.
- Recording imports and plays in CRM.

### Phase 3: Desktop UX Cutover

Scope:

- Customer detail: replace manual call record primary CTA with CTI call CTA.
- Customer list/table: add one-click call action.
- Add compact active-call bar.
- Hangup button only if provider supports it.
- After end event, show follow-up result drawer.
- Keep manual call-record form as fallback, not primary.

Validation:

- Sales can start call from customer detail.
- Sales can complete follow-up after hangup.
- Customer call history updates.
- Failed calls show useful reason.

### Phase 4: Android App Cutover

Scope:

- Mobile `/mobile` call buttons call CRM CTI endpoint instead of native SIM recording by default.
- Keep native SIM call recorder as fallback behind config, not production default.
- Show last call status and follow-up sheet.
- Reuse existing mobile call result flow.

Validation:

- Android app can initiate CTI call.
- Follow-up sheet opens after call end.
- Recording appears in recording workbench.

### Phase 5: Recording Import And AI Hardening

Scope:

- Import PBX recordings to configured recording storage.
- Normalize audio mime type and duration.
- Create / update `CallRecording`.
- Queue `CallAiAnalysis`.
- Support diarization result display.
- Add recording import retry worker.
- Add failed import dashboard filters.

Validation:

- Recording storage path works on production server and separate 5T storage machine.
- AI worker picks up imported recordings.
- Transcript and speaker roles display correctly.

### Phase 6: Operations And Observability

Scope:

- Add health checks:
  - provider config valid
  - webhook secret configured
  - CTI provider reachable
  - CDR lag
  - recording import lag
  - AI backlog
- Add smoke scripts:
  - provider start-call dry-run
  - webhook signature test
  - recording import test
- Add runbook:
  - deploy
  - rollback
  - provider outage
  - recording backlog
  - CDR mismatch

Validation:

- Admin can see CTI status.
- Production deployment has repeatable preflight.
- Outage falls back to manual call record without breaking customer workflow.

## UI Entry Points To Update

- `/settings`: add outbound call configuration entry.
- `/settings/users/[id]` or dedicated CTI seat binding page.
- `/customers`: table/card call action.
- `/customers/[id]`: primary call action and call history.
- `/mobile`: call action path.
- `/call-recordings`: no new mainline required; consume imported recordings.

Update `UI_ENTRYPOINTS.md` when the CTI call path becomes the official call mainline.

## Security Requirements

- Provider secrets must be encrypted or environment-backed.
- Webhook signature verification is mandatory in production.
- Webhook handlers must be idempotent and reject stale timestamps when provider supports timestamp signing.
- Do not expose provider API keys or SIP passwords to frontend.
- Mask customer phone numbers in logs unless needed for debugging.
- Use allowlist or reverse proxy controls for provider webhooks if possible.

## Rollback Strategy

Phase 1 rollback:

- Disable `outbound_call.provider`.
- Hide CTI call button.
- Keep existing manual call record and mobile native fallback.

Phase 2+ rollback:

- Stop CTI provider adapter / gateway.
- Keep webhook receiver harmless and idempotent.
- Existing imported recordings remain readable.
- Do not delete `CallRecord`, `CallRecording`, or `CallAiAnalysis`.

Database rollback:

- Additive tables can remain unused.
- Do not drop CTI tables while provider callback retries may still arrive.

## Validation Commands

Standard validation:

```bash
npx prisma validate
npx prisma generate
npm run prisma:predeploy:check
npm run lint
npm run build
```

CTI-specific validation to add:

```bash
npm run dev:local-cti-smoke
npm run check:outbound-provider
npm run check:outbound-webhook
npm run check:recording-import
```

Current Phase 1 ships the first two CTI smoke tools:

- `npm run dev:local-cti-smoke`: starts a local normalized CTI Gateway on `127.0.0.1:8790`.
- `npm run check:outbound-provider -- --endpoint=http://127.0.0.1:8790/calls/start`: verifies the CRM provider adapter can call a CTI Gateway contract.
- `npm run check:outbound-webhook -- --endpoint=http://127.0.0.1:3000/api/outbound-calls/webhooks/freeswitch --secret=<webhook-secret>`: verifies webhook HMAC signing against a running CRM instance.

## External Vendor Wording

Use this wording when talking to the outbound/PBX vendor:

```text
我们是自研 Web CRM，要重建成 CRM + CTI/API 外呼体系。
底层可以继续接 VOS + PBX，也可以通过你们的 SIPD / CTI 网关接入。

我们不希望员工单独打开 WayMi。
CRM 需要通过 HTTP API 发起外呼，坐席/分机由后台绑定。
通话状态、CDR 话单、录音地址或录音文件需要通过 webhook/API/file-drop 回传。
每通电话必须有唯一 callId，方便 CRM 关联客户、销售、录音和 AI 质检。

请提供：
1. 点击外呼 API 文档；
2. 坐席/分机绑定方式；
3. 通话状态回调格式；
4. CDR 话单接口或数据库结构；
5. 录音文件获取方式；
6. 签名/鉴权方式；
7. 当前 VOS + PBX + WayMi 的连接拓扑。
```

## First Implementation Milestone

Do not start by rewriting Android or browser call UI.

Start with:

1. Provider discovery document.
2. Additive CTI schema and settings.
3. Mock outbound provider.
4. One CRM start-call API.
5. One webhook receiver.
6. One customer-detail call button behind config.

This produces a safe vertical slice before touching the full mobile and recording cutover.

## Discovery Addendum: Existing VOS / PBX / SIP Facts

Date: 2026-04-27

Known legacy implementation:

- Seat binding: `GatewayWorker + sys.agent`
- Call status: FreeSWITCH ESL polling + WebSocket push
- CDR: `mod_json_cdr -> /var/www/html/cdr.php -> sys.cdr_YYYYMMDD`
- Recording: `/var/record/YYYYMMDD/*.wav`, with file path written into `CDR.url`
- Auth: `callapi.php` MD5 date signature; `dialapi.php` local-only access

Known provider connection type:

- The external provider supplied SIP trunk / direct-connect style parameters, not a full CRM click-to-call HTTP API.
- Port: `5060`
- Codec requirement: `G.711A / PCMA / A-law`
- Trunk mode: IP trunk / direct SIP interconnect.
- Concurrency: multiple concurrent calls are supported by the provider.
- Caller id sent by PBX: `origination_caller_id_number = seatNo`, for example `6001`.
- Customer-visible caller id is ultimately decided by VOS / carrier side and may become a fixed enterprise number, number pool number, or allowlisted number.
- Credentials must not be committed to repository files, plans, migrations, frontend bundles, or logs.

Conclusion:

The provider side should be treated as a SIP carrier / trunk endpoint. The CRM should not register this SIP trunk directly from browser or Android. The correct production architecture is:

```text
CRM HTTP API
  -> CRM CTI gateway API
  -> FreeSWITCH / Asterisk as server-side B2BUA
  -> SIP provider trunk using G.711A
  -> server-side ESL/CDR/recording pipeline
  -> CRM CallRecord / CallRecording / CallAiAnalysis
```

Recommended replacement for the unstable legacy pattern:

1. Keep FreeSWITCH or Asterisk as the telephony core, but make it a dedicated CTI gateway, not a loose PHP + polling sidecar.
2. Replace ESL polling with a persistent event consumer:
   - subscribe to `CHANNEL_CREATE`, `CHANNEL_ANSWER`, `CHANNEL_HANGUP_COMPLETE`, `RECORD_STOP`, and call custom variables.
   - push normalized events into CRM through an internal HTTP endpoint or queue.
3. Replace daily dynamic CDR tables as the CRM integration truth:
   - use `mod_json_cdr` as an event source, but post directly to the CTI gateway / CRM webhook.
   - still archive raw CDR for audit.
4. Keep recordings server-side:
   - record both legs on PBX/FreeSWITCH.
   - write stable recording metadata to CRM.
   - import/copy recordings into CRM recording storage for playback and AI.
5. Add a provider adapter boundary:
   - SIP provider credentials live only on the CTI gateway / PBX host.
   - CRM stores only call sessions, seat mappings, status, and recording metadata.

This gives a more stable and maintainable version of the existing stack while preserving the already-working VOS / PBX operating knowledge.

## Network Addendum: Fixed SIP Egress For IP Trunk

Problem:

IP trunk / direct SIP interconnects are usually bound to the customer's fixed public egress IP. If the office router restarts, ISP changes the public IP, or the line moves to another network, the provider-side IP allowlist breaks and outbound calls fail.

Decision:

Do not bind the provider trunk to a dynamic office broadband IP. Build a fixed-IP SIP edge.

Recommended topology:

```text
Provider VOS / SIP trunk
  <-> fixed public IP cloud SBC / CTI edge
      - Kamailio / OpenSIPS + RTPengine, or FreeSWITCH / Asterisk in SBC mode
      - public SIP/RTP endpoint
      - provider allowlists this fixed IP
  <-> WireGuard private tunnel
  <-> CRM / recording storage / internal services
```

Why this solves router IP changes:

- The provider only sees the cloud SBC fixed public IP.
- The office / VMware side only creates outbound WireGuard traffic to the cloud SBC.
- If the local router public IP changes, WireGuard reconnects from the new IP; the provider trunk does not need to change.
- CRM calls the CTI gateway over private tunnel or internal HTTPS, not over exposed SIP.

Acceptable alternatives:

1. Enterprise broadband / dedicated line with static public IP.
   - Simple if available.
   - Still depends on the office network.
2. Put the whole PBX / FreeSWITCH CTI gateway on a fixed-IP cloud server.
   - Best for SIP stability.
   - Record temporarily on cloud disk, then asynchronously sync recordings to the 5T storage machine.
3. DDNS.
   - Not recommended for IP-bound SIP trunks unless the provider explicitly supports FQDN allowlisting and fast re-resolution.

Firewall baseline:

- Provider SIP source IPs -> allow only SIP port 5060/5061 to SBC.
- Provider RTP ranges -> allow only configured RTP UDP range to SBC.
- CRM / CTI internal API -> allow only over WireGuard/private network.
- Block public access to CTI admin ports, ESL, AMI, ARI, databases, and recording directories.

Operational requirement:

- The provider should bind the trunk to the fixed public IP of the SBC / CTI edge, not the office router IP.
- Store the fixed egress IP, provider IP allowlist, SIP/RTP port ranges, and codec requirements in the deployment runbook.
