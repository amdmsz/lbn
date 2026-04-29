# Desktop / Mobile CTI Client Roadmap

Date: 2026-04-29
Status: planning only

## Goal

把现有 Next.js 酒水私域 CRM 的客户端能力升级成两个稳定入口：

- Windows EXE：沉浸式销售工位工作台，稳定支持 WebRTC 坐席、CTI 软电话、系统托盘、快捷键和通话期间防休眠。
- Android App：销售外出和碎片化办公入口，支持客户作业、订单/履约查看、原生拨号/录音上传，并对员工外呼行为形成可审计链路。

核心业务、RBAC、审计、CTI 真相和录音 AI 仍保留在服务端，不把数据库、Prisma、PBX 密码或业务权限下放到客户端。

## Current Repo Facts

当前不是从 0 开始：

- `apps/desktop` 已存在 Electron 壳，版本 `0.1.1`，已能加载 `https://crm.cclbn.com`，支持服务器地址配置和更新检测。
- `apps/desktop/dist` 已有 Windows 安装包/便携包产物。
- `apps/mobile` 已存在 Capacitor Android 壳，版本 `0.1.1`，默认加载 `https://crm.cclbn.com/mobile`。
- `apps/mobile/android` 已有原生 `LbnCallRecorderPlugin`、`CallRecordingService`、前台 microphone service、SIM 拨号、录音文件上传逻辑。
- `app/mobile/page.tsx` 已存在移动 Web 工作台入口。
- `app/api/mobile/*` 已有设备注册、移动通话 start/end、录音分片上传/complete API。
- `app/api/outbound-calls/*`、`lib/outbound-calls/*`、`lib/calls/*` 已有正式 CTI / WebRTC / 录音 / AI 基线。

因此本计划不是 scaffold，而是从“可安装 WebView/壳应用”升级到“可管控、可审计、可运维的桌面/移动客户端”。

## Primary Decisions

1. Windows 继续使用 Electron。
   - 现有 CRM WebRTC/CTI 页面可以复用。
   - Electron 能补系统托盘、权限处理、快捷键、系统通知、防休眠和窗口控制。

2. Android 第一阶段继续强化当前 Capacitor 原生桥，不立即替换为 Expo。
   - 仓库已经有 Capacitor 原生录音/上传实现和 APK 产物。
   - Expo + React Native 是可行的第二客户端路线，但 native call recording / default dialer / foreground service 需要自定义 native code 和 development build，不是纯 Expo Go 能覆盖的范围。
   - 只有在 `/api/mobile/*` 读写接口稳定、并确认移动端要重写为原生 UI 时，再新建 `apps/mobile-expo`，不要直接删除当前 Capacitor 客户端。

3. “检测员工播出的一切行为动作”必须分模式，不承诺普通 Android App 全量监控。
   - CTI/PBX/WebRTC 线路：可以做到强审计，因为所有拨号从 CRM API 进入 PBX，CDR/录音由服务端回写。
   - Android App 内发起的 SIM 通话：可以审计 App 发起、电话状态、录音/上传状态和跟进动作。
   - 员工绕过 App 用系统电话拨号：普通第三方 App 不能可靠、合法、跨机型地全量检测和录音。若必须全量检测，需要企业自有设备 + 管理策略，至少要求 CRM App 成为默认拨号器或统一改走 PBX/CTI。

## Scope

### Include

- Electron 桌面壳硬化：frameless/custom title bar、tray、media permissions、power save blocker、shortcuts、IPC bridge、packaging metadata。
- 桌面 CTI integration：软电话面板状态、活跃通话防休眠、托盘挂断预留接口、系统通知。
- 移动 API 合同：为 Android/未来 Expo 提供标准 JSON read APIs，不直接复用 Server Actions。
- Android 原生通话审计：记录拨号 intent、权限状态、设备能力、电话状态、录音状态、上传状态、跟进闭环。
- 设备能力矩阵：记录机型、Android 版本、录音来源、是否能录到双方声音、上传可靠性。
- 文档和运维：客户端版本、更新 manifest、安装包分发、rollback/feature flags。

### Exclude

- 不把 CRM 业务逻辑、Prisma、MariaDB 或 PBX/SIP trunk secret 打包进客户端。
- 不改变 `Customer`、`TradeOrder`、payment、fulfillment、product truth layer。
- 不把移动端改造成离线 CRM。
- 不把 AI 结果自动写回客户分类或成交真相。
- 不为个人手机承诺“绕过系统限制的全量通话监控/录音”。

## Invariants

- `Customer` 仍是销售执行主对象，`Customer.ownerId` 仍是销售承接主字段。
- 外呼业务入口必须走服务端 RBAC：Sales 只能打/记录自己的客户，Supervisor 只能看团队范围，Admin 全量。
- 录音正式真相优先来自 PBX/Asterisk 服务端录音；Android SIM 录音属于受设备能力限制的补充通道。
- SIP trunk / VOS / PBX 密码不进入 Electron、Android、Expo 或前端 bundle。
- 重要动作必须写 `OperationLog` 或现有 ownership/call audit 链。
- 客户端只做入口和 native capability bridge，不能成为权限边界。
- `OPS` / `SHIPPER` 不因移动或桌面客户端获得销售客户/录音视图。
- 所有客户端读写 API 都要服务端裁剪字段，不能把 supplier/finance 敏感字段默认下发给 Sales。

## Architecture

```text
Windows EXE / Android App / Future Expo App
  -> HTTPS CRM URL
  -> Next.js App Router pages and /api/mobile JSON APIs
  -> server-side RBAC / OperationLog
  -> CTI Gateway
  -> Asterisk / PBX / SIP provider
  -> webhook back to CRM
  -> CallRecord / OutboundCallSession / CallRecording / CallAiAnalysis
```

Desktop WebRTC path:

```text
Electron
  -> load CRM /desktop or normal dashboard route
  -> browser WebRTC seat registers to Asterisk endpoint
  -> outbound call starts through /api/outbound-calls/start
  -> PBX records and sends webhook
```

Android native SIM path:

```text
Capacitor Android
  -> /api/mobile/calls/start
  -> native ACTION_CALL
  -> foreground recording service
  -> /api/mobile/calls/:id/end
  -> /api/mobile/call-recordings/uploads/*
  -> Call AI worker
```

Strict managed-dialer path if full outbound detection is required:

```text
Company-owned Android device
  -> CRM app requested as ROLE_DIALER / default dialer
  -> call intent and call-log reconciliation
  -> CRM audit events
  -> optional native recording only where device/OS supports it
```

## Desktop Implementation Checklist

### Phase D1: Reconcile Existing Electron Shell

- Keep `apps/desktop` as the desktop package.
- Decide whether to keep lightweight `main.cjs` or move to `src/main.ts` + compiled output. TypeScript is preferred once frameless/tray/IPC grows.
- Preserve current server URL config and update manifest behavior.
- Add explicit navigation allowlist and block unknown origins from loading inside the app.
- Keep `nodeIntegration: false`, `contextIsolation: true`, and no business logic in preload.

### Phase D2: Frameless Window + Desktop Chrome

- Add Electron `frame: false` only after the web app has a first-party title bar.
- Add a desktop-only CRM route or mode, for example `/desktop` or `?client=desktop`, with:
  - draggable top bar using CSS app-region
  - minimize / maximize / close buttons calling preload IPC
  - compact online status and global search entry points
- Do not inject title bar HTML into arbitrary CRM pages from Electron; that is brittle and hard to test.
- Existing CRM left nav remains the business navigation source. Electron should not duplicate dashboard/customers/orders/products/fulfillment navigation.

### Phase D3: Media Permissions And CTI Runtime

- Use Electron session permission handlers to allow `media` only for the configured CRM origin.
- Do not globally approve permissions for all origins.
- Keep WebRTC device selection inside the web softphone layer, but make the desktop shell friendly to device changes:
  - refresh `navigator.mediaDevices.enumerateDevices()` after permission is granted
  - listen for `devicechange`
  - persist the preferred headset/microphone by device id where the browser exposes it
  - show a clear fallback state when a USB headset is unplugged
- Add a desktop/network status signal for softphone recovery:
  - detect online/offline and renderer reload/reconnect events
  - let the WebRTC seat re-register after network resume or sleep/wake
  - never silently place a call while the seat is not registered
- Add a small preload API:
  - `window.lbnDesktop.setCallActive(active: boolean)`
  - `window.lbnDesktop.notify(title, body)`
  - `window.lbnDesktop.window.minimize/maximize/close`
  - `window.lbnDesktop.softphone.focusDialpad()`
  - `window.lbnDesktop.softphone.hangupActiveCall()` as reserved bridge
- Use `powerSaveBlocker.start("prevent-app-suspension")` while call state is active, then stop when the call ends.
- The web softphone component should be the owner of call state; Electron only reacts to a narrow IPC signal.

### Phase D4: Tray, Shortcuts, Notifications

- Add Windows tray icon and context menu:
  - 打开主界面
  - 坐席状态
  - 挂断当前通话（if active call exists and hangup API exists）
  - 退出应用
- Minimize to tray on close/minimize based on setting.
- Add accelerators:
  - `Ctrl+D`: focus dialpad
  - `Ctrl+F`: focus global search
  - `Esc`: dismiss transient desktop softphone focus only where safe
- Prefer local app accelerators over system-wide global shortcuts unless business requires global behavior.
- Add system notifications for incoming status changes and missed follow-up prompts, not for noisy every-row events.

### Phase D5: Packaging And Distribution

- Add icon assets under `apps/desktop/assets`.
- Configure NSIS installer, versioned artifact, and portable zip if still needed.
- Add code signing as production release gate.
- Keep update manifest at `https://crm.cclbn.com/client-update.json`.
- Add root scripts only if names stay consistent with existing scripts:
  - `npm run desktop:dev`
  - `npm run desktop:dist`

## Android / Mobile Implementation Checklist

### Phase M1: Keep Capacitor Client As V1

- Keep `apps/mobile` and current APK path.
- Harden current native plugin instead of starting a parallel Expo rewrite immediately.
- Add explicit feature flag for native SIM recording:
  - server setting: `mobile.nativeSimCallingEnabled`
  - device-level capability: `SUPPORTED | UNSUPPORTED | BLOCKED | UNKNOWN`
- Keep fallback `tel:` flow, but mark it as best-effort and not fully recorded.
- Surface recording/upload state inside `/mobile` after returning from call.

### Phase M2: JSON APIs For Mobile UI

Add read APIs that a Capacitor WebView or future Expo app can consume:

- `GET /api/mobile/dashboard`
- `GET /api/mobile/customers`
- `GET /api/mobile/customers/:id`
- `GET /api/mobile/customers/:id/timeline`
- `GET /api/mobile/customers/:id/orders`
- `GET /api/mobile/orders`
- `GET /api/mobile/profile`

Rules:

- Use server-side auth and RBAC on every route.
- Reuse `lib/customers/*`, `lib/trade-orders/*`, `lib/shipping/*` query rules where possible.
- Return stable DTOs, not raw Prisma records.
- Mask phone numbers and sensitive supplier/finance fields according to role.
- Keep pagination, cursor/offset, search, ABCDE filter, and `updatedAt` metadata explicit.

### Phase M3: Native Call Event Audit

Add a mobile call action ledger. If a new table is needed, do it in a separate schema milestone; otherwise use `OperationLog` plus existing call models first.

Events to record:

- `mobile_call.device_permission_requested`
- `mobile_call.device_permission_granted`
- `mobile_call.device_permission_denied`
- `mobile_call.intent_requested`
- `mobile_call.intent_dispatched`
- `mobile_call.offhook_detected`
- `mobile_call.idle_detected`
- `mobile_call.recording_started`
- `mobile_call.recording_failed`
- `mobile_call.upload_started`
- `mobile_call.upload_completed`
- `mobile_call.upload_failed`
- `mobile_call.followup_prompted`
- `mobile_call.followup_saved`

Each event should include:

- `callRecordId`
- `customerId`
- `salesId`
- `deviceId`
- app version
- Android version
- device model
- event time from client and server receive time
- failure code/message when relevant

Android runtime hardening:

- Android 14+ foreground service rules are strict. The recording service must declare microphone foreground service type and show an ongoing notification before using microphone capture.
- Treat service crash/kill as an auditable failure, not a silent local state. Persist session state before starting call/recording so `/mobile` can recover and prompt follow-up.
- Upload must be eventually consistent. If the user swipes away the app or the network drops after hangup, unfinished recordings should be retried through WorkManager or an equivalent native background queue.
- Keep the foreground service focused on call/recording lifecycle; move long upload retry work out of the active microphone service where possible.

### Phase M4: Device Matrix And Capability Control

- Add `/settings/mobile-devices` or fold into existing settings if a page already exists.
- Track device capability:
  - can launch call
  - can observe offhook/idle
  - can record local audio
  - can upload on weak network
  - captures own voice only vs both sides
- Build a real-device matrix before rollout:
  - Xiaomi / Redmi
  - Huawei / Honor
  - Oppo / Vivo
  - Samsung
  - Android 11-15+
- Block native recording for devices that consistently create empty/bad audio.

### Phase M5: Strict Outbound Detection Options

If the business requirement is “所有员工外呼必须可检测”:

Option A, recommended:

- Force all customer calls through CRM CTI/PBX, including mobile.
- Mobile “一键拨号” calls `/api/outbound-calls/start`; PBX bridges employee endpoint and customer.
- Source of truth is PBX CDR + recording webhook.
- This is the most reliable audit path.

Option B, managed Android dialer:

- Use company-owned devices.
- Ask user/admin to set CRM App as default dialer (`ROLE_DIALER`).
- Reconcile outbound call log where permission and device policy allow it.
- Require MDM / enterprise policy for rollout and offboarding.
- Still treat recording as device/ROM dependent.

Option C, BYOD best-effort:

- Allow employees to use personal phones.
- Audit only calls initiated inside CRM App.
- Do not claim full detection of calls made outside CRM App.

## Future Expo / React Native Option

Only start Expo after M2 APIs are stable.

Suggested structure:

```text
apps/mobile-expo/
  app.json
  eas.json
  package.json
  App.tsx
  src/api/*
  src/navigation/*
  src/screens/dashboard/*
  src/screens/customers/*
  src/screens/orders/*
  src/screens/profile/*
```

Core dependencies:

- Expo / React Native
- React Navigation
- NativeWind
- TanStack Query or React Query
- Axios/fetch API client
- Expo SecureStore for session/token only if the auth model supports mobile tokens

Important constraint:

- Native SIM recording/default-dialer functionality needs custom native code and a development build / prebuild flow. Expo Go is not enough for that class of native module.
- The existing `LbnCallRecorderPlugin` Java implementation cannot be reused directly in Expo. It would need to be ported to an Expo Module and paired with a Config Plugin for Android manifest, permissions, services, and foreground-service declarations.
- Because of that migration cost, start Expo only when native UI quality or React Native ergonomics clearly justify a new client milestone.

Migration rule:

- Do not remove `apps/mobile` until `apps/mobile-expo` reaches feature parity for login, customers, call flow, recording upload, and update distribution.

## Data And Auth Notes

- Current NextAuth browser session works for WebView shells.
- A pure Expo app may need a mobile token/session strategy instead of relying on browser cookies only.
- Do not introduce long-lived bearer tokens without server-side revoke, device binding, and audit.
- Mobile APIs should accept same auth first; add token auth only as a separate security milestone.

## Security / Compliance Notes

- Employee monitoring and call recording require a written internal policy and clear user notice.
- Customer call recording may require consent/notice depending on jurisdiction and deployment location.
- Do not hide recording indicators. Android foreground recording service must show a notification.
- Retention and deletion policy must cover audio, transcript, AI summary, and manual quality review separately.
- Lost/stolen device disablement must be available before broad rollout.

## Files Likely Touched In Execution

Desktop:

- `apps/desktop/package.json`
- `apps/desktop/main.cjs` or `apps/desktop/src/main.ts`
- `apps/desktop/preload.cjs` or `apps/desktop/src/preload.ts`
- `apps/desktop/assets/*`
- `app/desktop/*` or desktop mode in existing app shell
- CTI/softphone components under `components/*`

Mobile:

- `app/mobile/page.tsx`
- `components/mobile/*`
- `lib/calls/native-mobile-call.ts`
- `lib/calls/mobile-call-followup.ts`
- `app/api/mobile/*`
- `lib/customers/*`, `lib/trade-orders/*`, `lib/shipping/*` DTO/query helpers
- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/android/app/src/main/java/com/lbn/crm/*`

Docs:

- `README.md` client scripts section if scripts change
- `docs/cti-outbound-call-runbook.md`
- `docs/call-ai-production-runbook.md`
- New client rollout runbook if packaging/distribution changes

## Validation Strategy

Main CRM:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

CTI:

```bash
npm run check:outbound-provider -- --endpoint=http://127.0.0.1:8790/calls/start
npm run check:outbound-webhook -- --endpoint=http://127.0.0.1:3000/api/outbound-calls/webhooks/freeswitch --secret=replace-with-local-secret
```

Desktop:

```bash
npm run desktop:dev
npm run desktop:dist
```

Desktop manual QA:

- Login persists after restart.
- Mic permission is granted only for CRM origin.
- WebRTC seat registers.
- Active call starts power save blocker.
- Power save blocker stops after hangup.
- Close/minimize behavior matches tray setting.
- Tray “打开主界面” restores window.
- `Ctrl+D` focuses dialpad and `Ctrl+F` focuses search.
- Unknown external links open in system browser, not inside CRM shell.

Android:

```bash
npm run mobile:sync
cd apps/mobile/android
./gradlew.bat assembleDebug
```

Android manual QA:

- Device registers.
- Permission denied path is clear and recoverable.
- App-initiated call creates `CallRecord`.
- Offhook/idle state is recorded where available.
- Recording starts or device is marked unsupported.
- Upload resumes or reports failure.
- Customer detail shows call and recording state.
- Follow-up form appears after hangup.
- Sales cannot access another sales person's customer/recording.
- Supervisor cannot see other teams.
- OPS/SHIPPER cannot access recording APIs.

Future Expo:

```bash
cd apps/mobile-expo
npx expo start
eas build --platform android --profile preview
```

Only run Expo validation after the app exists and native modules are defined.

## Rollback Notes

Desktop:

- Keep current `apps/desktop` versioned installer available.
- If frameless/tray breaks, release a patch reverting to standard window frame while keeping URL config.
- Disable desktop-only softphone IPC from the web app by feature flag.

Android:

- Feature-flag native SIM recording off.
- Keep `/mobile` WebView usable as normal CRM mobile workbench.
- Disable upload completion/AI enqueue if native recordings cause operational issues.
- Preserve uploaded metadata and files; do not drop recording tables or delete audio during rollback.

API:

- New mobile read APIs should be additive.
- If DTO shape changes, version endpoints or keep backward-compatible fields until old clients are retired.

## Execution Order

Recommended first execution session:

1. Desktop D1-D3: Electron permission/power-save/preload foundation, no broad UI rewrite.
2. Add desktop call-active IPC from existing CTI softphone component.
3. Validate desktop WebRTC call with local or staging CTI.

Recommended second execution session:

1. Mobile M2 APIs for dashboard/customers/customer detail.
2. Add DTO tests and RBAC checks.
3. Keep current Capacitor client consuming Web route until APIs prove stable.

Recommended third execution session:

1. Mobile M3-M4 event audit and device capability matrix.
2. Add device management surface.
3. Run real-device QA.

Recommended fourth execution session:

1. Decide strict outbound detection mode.
2. If full detection is mandatory, prioritize CTI/PBX mobile bridge or managed default dialer rollout.
3. Only after this decision, consider Expo native UI rewrite.

## Open Decisions Before Coding Strict Detection

1. Are Android devices company-owned or employee personal phones?
2. Can the company require CRM App as default dialer, or must normal phone dialer remain available?
3. Should mobile calls use PBX bridge by default, or employee SIM by default?
4. Is call recording legally/operationally approved for all sales calls?
5. Is Expo native UI a hard requirement, or is Capacitor WebView acceptable while call/recording capability is hardened?

## Reference Notes

- Existing CRM CTI baseline: `docs/cti-outbound-call-runbook.md`
- Existing Call AI baseline: `docs/call-ai-production-runbook.md`
- Prior packaging plan: `plans/2026-04-25-windows-exe-android-app-packaging.md`
- Prior SIM recording plan: `plans/2026-04-26-mobile-sim-call-recording.md`
- Android `ROLE_DIALER`: https://developer.android.com/reference/android/app/role/RoleManager#ROLE_DIALER
- Android `READ_CALL_LOG` is dangerous and hard restricted: https://developer.android.com/reference/android/Manifest.permission#READ_CALL_LOG
- Android microphone foreground service requirements: https://developer.android.com/develop/background-work/services/fgs/service-types#microphone
- Android `VOICE_CALL` capture requires system-only `CAPTURE_AUDIO_OUTPUT`: https://developer.android.com/reference/android/media/MediaRecorder.AudioSource#VOICE_CALL
- Electron permission handlers: https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler
- Electron power save blocker: https://www.electronjs.org/docs/latest/api/power-save-blocker
- Electron tray: https://www.electronjs.org/docs/latest/api/tray
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- EAS Build: https://docs.expo.dev/build/introduction/
