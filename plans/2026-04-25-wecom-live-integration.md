# WeCom Live Integration Plan

Date: 2026-04-25

Status: planning only, revised after API-name and matching-strategy review

## Goal

Connect the existing CRM live-session workflow to real Enterprise WeChat锛堜紒涓氬井淇?/ WeCom锛塴ive data, so the system can:

- import real live sessions instead of relying on empty manual records
- sync live room metadata, status, start/end time, and watch statistics
- align employee invitations锛堝憳宸ラ個绾︼級with the same live-session truth
- show real viewers entering the live room when WeCom returns usable viewer identity
- keep `Customer` as the sales execution mainline and `LiveInvitation` as CRM invitation truth
- preserve RBAC锛堟湇鍔＄鏉冮檺锛塧nd `OperationLog` auditability

## Current Repository Facts

- `/live-sessions` already exists and is guarded by `canAccessLiveSessionModule` / `canManageLiveSessions`.
- `LiveSession` currently stores manual fields: `title`, `hostName`, `startAt`, `roomId`, `roomLink`, `targetProduct`, `remark`, `status`.
- `LiveInvitation` already stores customer invitation and attendance truth: `customerId`, `salesId`, `invitationStatus`, `invitedAt`, `attendanceStatus`, `watchDurationMinutes`, `giftQualified`.
- Customer detail already reads live records from `LiveInvitation` and selectable sessions from `LiveSession`.
- Dashboard / reports already count live invitation and attendance data from internal tables.
- `Customer.phone` is unique; `Customer.wechatId` exists but current `WechatRecord` does not store a stable WeCom `external_userid`.

Key files inspected:

- `prisma/schema.prisma`
- `app/(dashboard)/live-sessions/page.tsx`
- `app/(dashboard)/live-sessions/actions.ts`
- `lib/live-sessions/queries.ts`
- `lib/live-sessions/mutations.ts`
- `components/live-sessions/live-sessions-section.tsx`
- `components/customers/customer-live-records-section.tsx`
- `app/(dashboard)/customers/[id]/engagement-actions.ts`
- `lib/customers/queries.ts`
- `lib/auth/access.ts`

## External API Checkpoint

The previous plan used `get_livingid_list` as a likely endpoint name. After review, the safer assumption is:

- `POST /cgi-bin/living/get_user_all_livingid?access_token=...` 鈥?likely correct endpoint for 鈥滆幏鍙栨垚鍛樼洿鎾?ID 鍒楄〃鈥?
- `POST /cgi-bin/living/get_living_info?access_token=...` 鈥?fetch live room detail by `livingid`.
- `POST /cgi-bin/living/get_watch_stat?access_token=...` 鈥?fetch watch statistics / viewer details by `livingid`.
- `GET /cgi-bin/gettoken?corpid=...&corpsecret=...` 鈥?app access token.

Implementation rules:

- Treat `get_livingid_list` as suspicious / unofficial until proven by current official docs or a successful staging request.
- Name the adapter method `listUserAllLivingIds`, not generic `listLivingIds`, so code reflects the WeCom API name.
- Keep endpoint paths as constants in `lib/wecom/live.ts`; if staging proves a different current path, only the adapter changes.
- Add mocked contract tests for `get_user_all_livingid`, `get_living_info`, and `get_watch_stat` request/response shapes before wiring sync into production data.

Important unknowns to verify with official docs or staging credentials:

- whether `get_watch_stat` returns `userid`, `external_userid`, union id, nickname, phone, masked phone, or only anonymous stats
- whether phone is full, masked, encrypted, or unavailable
- whether live APIs require a normal app secret, customer-contact secret, or special live permission scope
- pagination, date-window limits, and rate limits for live ID and watch-stat sync
- whether WeCom returns employee invite attribution or only viewer/source/share stats
- how far back historic live sessions can be queried for backfill

## Scope

Phase 1 should deliver one bounded milestone:

1. Add WeCom-backed live session import / sync.
2. Store external live IDs, sync metadata, and safe raw snapshots.
3. Automatically update attendance only for deterministic identity matches.
4. Put phone / nickname candidates into an employee confirmation queue, not direct auto-link.
5. Keep manual session fallback for records not connected to WeCom.
6. Add operator-visible sync status, pending confirmation count, and sync errors.

Out of scope for Phase 1:

- no automatic order creation
- no gift auto-approval unless existing rules explicitly support it
- no new customer visibility for OPS / SHIPPER
- no replacing `Customer` as the sales execution mainline
- no EasyWeChat PHP dependency in this Node/Next.js repo
- no destructive cleanup of old manual sessions

## Invariants锛堜笉鍙橀噺锛?
- `Customer` remains the sales execution object.
- `LiveInvitation` remains CRM invitation and attendance truth.
- WeCom is an external source; CRM keeps normalized, auditable records.
- Server-side RBAC protects sync actions and viewer data.
- Important sync, confirm, and reject actions write `OperationLog`.
- Auto-link is allowed only for deterministic identifiers such as stored `external_userid` / known WeCom customer ID.
- Phone can create a suggested candidate锛堝€欓€夊尮閰嶏級only if exact and unique; employee confirmation is still required by default.
- Nickname / display name never auto-links customers; it is only low-confidence context.
- Unknown viewers stay as external audience rows and must not automatically become customers.
- Manual records remain editable but show source (`MANUAL` vs `WECOM_SYNC`) to avoid confusing truth.

## Proposed Schema Changes

Add enums:

- `LiveSessionSource`: `MANUAL`, `WECOM`
- `LiveSyncStatus`: `NEVER_SYNCED`, `SYNCING`, `SYNCED`, `FAILED`
- `LiveAudienceMatchStatus`: `UNMATCHED`, `AUTO_MATCHED_CUSTOMER`, `PENDING_CONFIRMATION`, `CONFIRMED_CUSTOMER`, `IGNORED`, `CONFLICT`
- `LiveAudienceMatchMethod`: `WECOM_EXTERNAL_USER_ID`, `WECOM_USER_ID`, `PHONE_EXACT`, `PHONE_MANUAL`, `MANUAL_SEARCH`

Extend `LiveSession`:

- `source`
- `wecomLivingId` unique nullable
- `wecomAnchorUserId` nullable
- `wecomLiveStatus` nullable string or enum after API confirmation
- `actualStartAt`, `actualEndAt` nullable
- `viewerCount`, `totalWatchDurationSeconds`, `peakOnlineCount` nullable after API confirmation
- `lastSyncedAt`, `syncStatus`, `syncError` nullable
- `wecomRaw` JSON nullable for safe debug / audit snapshot

Add `LiveAudienceRecord`:

- `id`
- `liveSessionId`
- `wecomLivingId`
- `wecomUserId` nullable
- `wecomExternalUserId` nullable
- `viewerPhoneMasked` nullable
- `viewerPhoneEncrypted` nullable only if returned and needed
- `phoneHash` nullable for exact candidate lookup without exposing full phone
- `nickname` nullable
- `watchDurationSeconds` nullable
- `firstEnterAt`, `lastLeaveAt` nullable when API supports it
- `raw` JSON nullable, with sensitive fields minimized
- `matchStatus`
- `matchMethod` nullable
- `candidateCustomerId` nullable
- `candidateConfidence` nullable
- `confirmedById` nullable
- `confirmedAt` nullable
- `customerId` nullable
- `liveInvitationId` nullable
- timestamps

Index / uniqueness notes:

- index `LiveSession.wecomLivingId`
- index `LiveSession.lastSyncedAt`
- index `LiveAudienceRecord.liveSessionId`
- index `LiveAudienceRecord.customerId`
- index `LiveAudienceRecord.candidateCustomerId`
- avoid relying blindly on nullable composite unique constraints in MySQL; if needed, do provider-specific upsert with normalized dedupe keys

Optional later:

- `WecomIntegrationConfig` table if env vars are not enough
- `WecomSyncRun` table if detailed sync history is needed beyond `OperationLog`

## Implementation Checklist

### 1. Credential and HTTP client

- Add env vars: `WECOM_CORP_ID`, `WECOM_LIVE_SECRET` or the confirmed app/customer-contact secret.
- Add `WECOM_LIVE_SYNC_ENABLED` feature flag.
- Add `lib/wecom/client.ts` with token retrieval, timeout, retry, and normalized error handling.
- Cache access token server-side with expiry skew.
- Never log secrets or full access tokens.

### 2. Live API adapter

- Add `lib/wecom/live.ts`.
- Implement `listUserAllLivingIds`, `getLivingInfo`, `getWatchStat` after confirming exact request/response shapes.
- Normalize API data into internal DTOs.
- Mask or omit private fields in raw snapshots.
- Add mocked adapter tests so API-name drift is visible.

### 3. Prisma migration

- Extend `LiveSession` and add `LiveAudienceRecord`.
- Add indexes for external ID, sync status/time, session, customer, candidate customer.
- Generate migration with `prisma migrate dev` only in local dev, never production/preprod.
- Validate with `npx prisma validate` and `npx prisma generate`.

### 4. Sync service

- Add `lib/live-sessions/wecom-sync.ts`.
- Admin/OPS sync should:
  - list or accept live IDs for a time window / anchor using `get_user_all_livingid`
  - upsert `LiveSession` by `wecomLivingId`
  - fetch watch stats for each session
  - upsert `LiveAudienceRecord`
  - update `LiveInvitation` attendance only for deterministic matches
  - create `PENDING_CONFIRMATION` audience candidates for phone / nickname hints
  - write `OperationLog` summary and per-session error payload
- Keep idempotency锛堝箓绛夛級: repeated sync must not duplicate sessions, audience records, or invitation records.

### 5. Identity matching and confirmation

Matching priority锛堝尮閰嶄紭鍏堢骇锛?

1. `external_userid` / stored WeCom customer ID exact match: auto-match and update attendance.
2. internal WeCom `userid` exact match for staff viewers: map to CRM user only if needed, not to a customer.
3. exact + unique phone candidate: set `PENDING_CONFIRMATION`; do not update customer attendance yet.
4. nickname / display name: show only as hint; never auto-link.
5. no candidate: keep `UNMATCHED`.

Employee confirmation workflow锛堝憳宸ョ‘璁わ級:

- Show candidate customer, phone basis, live room, watch duration, viewer nickname, and source fields.
- Let the responsible sales owner confirm / reject the candidate.
- Allow ADMIN / SUPERVISOR / OPS override only where existing role boundaries allow it.
- On confirm: set `customerId`, `confirmedById`, `confirmedAt`, `matchStatus=CONFIRMED_CUSTOMER`, then upsert/update `LiveInvitation` attendance.
- On reject: set `matchStatus=IGNORED` or `CONFLICT` with reason; do not repeatedly prompt the same candidate.
- Every confirm/reject writes `OperationLog` with before/after data.

### 6. Server actions and worker entry

- Add a manual sync action under `/live-sessions` for authorized roles.
- Add confirmation actions for pending audience matches.
- Optionally add `scripts/sync-wecom-live-sessions.ts` for scheduled runs.
- Add package script only after the service is implemented, e.g. `worker:wecom-live-sync`.

### 7. UI updates

- Update `/live-sessions` list with source, WeCom ID, sync status, last sync time, viewer count, matched count, pending confirmation count, unmatched count.
- Add a detail / expandable panel for audience records and a 鈥滃緟鍛樺伐纭鈥?queue.
- Keep loading / empty / error states.
- In customer detail, distinguish manual invite, WeCom auto-confirmed attendance, and employee-confirmed attendance.
- Add copy: 鈥滅湡瀹炶繘鍦轰汉鏁颁緷璧?WeCom 杩斿洖鐨勫彲璇嗗埆鐢ㄦ埛锛涙湭鍖归厤瑙備紬涓嶄細鑷姩鍙樻垚瀹㈡埛銆傗€?- Add copy: 鈥滄墜鏈哄彿 / 鏄电О鍙細杩涘叆纭闃熷垪锛涘憳宸ョ‘璁ゅ悗鎵嶄細鍐欏叆瀹㈡埛鐩存挱璁板綍銆傗€?
### 8. RBAC and audit

- Only `ADMIN`, `SUPERVISOR`, `OPS`, or `LIVE_SESSION_MANAGE` can run global sync.
- `SALES` can view usable sessions and own customer live records.
- `SALES` can confirm pending matches only for customers they own / can access.
- `SALES` cannot pull global WeCom audience data.
- Every sync run writes `OperationLog` counts: sessions upserted, viewers upserted, auto-matched, pending, unmatched, failed.
- Every manual confirmation writes `OperationLog`.

## Validation Strategy

Local validation:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

Targeted tests / repros to add:

- WeCom adapter unit tests with mocked responses
- endpoint-name test: live ID listing uses `get_user_all_livingid`, not `get_livingid_list`
- sync idempotency test: same `livingid` sync twice creates one session and one audience record per viewer
- deterministic match test: known `external_userid` updates the correct `LiveInvitation`
- phone candidate test: exact phone match creates `PENDING_CONFIRMATION` and does not update attendance before confirmation
- employee confirmation test: confirmed candidate updates `LiveInvitation` and writes `OperationLog`
- nickname-only test: nickname never auto-links
- no-match test: unknown viewer stays unmatched and does not create a customer
- RBAC test or targeted action-level check for sync / confirmation permissions

Manual staging checklist:

- configure staging WeCom credentials
- sync a narrow date range with one known test live room
- verify `/live-sessions` shows real title/time/status/view counts
- invite a test customer, enter live room, sync stats, verify deterministic match behavior
- test a phone-only viewer match and verify it enters confirmation queue first
- confirm the candidate as the responsible sales employee and verify customer attendance updates after confirmation
- verify unmatched viewers remain visible only to authorized roles
- verify `OperationLog` records sync and confirmation actions

## Rollback Notes

- Disable all sync and confirmation entry points with `WECOM_LIVE_SYNC_ENABLED=false`.
- Manual sessions continue to work.
- Schema changes are additive, so rollback should not require data deletion.
- If sync corrupts attendance, restore from `OperationLog.beforeData` / saved snapshots and disable the worker.

## Risks

- WeCom may not expose enough viewer identity to match CRM customers without customer-contact integration.
- Phone may be masked or unavailable; phone candidate matching may be impossible in some live contexts.
- API permissions may require a different app secret or enterprise-level approval.
- Watch stats may be delayed, paginated, rate-limited, or unavailable for old sessions.
- Employee invite attribution may not survive link sharing outside tracked channels.
- Raw viewer data can contain privacy-sensitive identifiers; storage and visibility must be minimized.

## Recommended Next Session

Execute Phase 1 only:

1. Confirm official WeCom API response shapes using real enterprise credentials or official docs, especially `get_user_all_livingid` and `get_watch_stat` viewer identity fields.
2. Add additive Prisma migration and DTO types.
3. Implement mocked WeCom adapter and idempotent sync service.
4. Add `/live-sessions` manual sync UI, sync status, and pending confirmation queue.
5. Validate with mocked tests, `npx prisma validate`, `npx prisma generate`, `npm run lint`, and `npm run build`.
