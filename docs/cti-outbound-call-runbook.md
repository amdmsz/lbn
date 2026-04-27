# CTI 外呼接入 Runbook

更新时间：2026-04-27

## 目标

CRM 只负责业务入口、权限、审计、客户关联、通话记录和录音/AI 后续处理。

SIP/VOS/线路账号、注册、桥接、服务端录音和 CDR 采集必须放在 CTI Gateway / PBX / FreeSWITCH / Asterisk 侧，不进入浏览器、Android 或前端包。

## 推荐生产拓扑

```text
CRM Web / Android
  -> POST /api/outbound-calls/start
  -> CRM CTI provider adapter
  -> CTI Gateway HTTP API
  -> FreeSWITCH / Asterisk / PBX
  -> SIP provider trunk / VOS
  -> CRM webhook: /api/outbound-calls/webhooks/freeswitch
  -> CallRecord / OutboundCallSession / CallRecording / CallAiAnalysis
```

## CRM 配置

优先在 `/settings/outbound-call` 配置。也可以使用环境变量作为 fallback：

```bash
OUTBOUND_CALL_ENABLED=1
OUTBOUND_CALL_PROVIDER=FREESWITCH
OUTBOUND_CALL_GATEWAY_BASE_URL=http://cti-gateway.internal:8790
OUTBOUND_CALL_START_PATH=/calls/start
OUTBOUND_CALL_WEBHOOK_BASE_URL=https://crm.cclbn.com/api/outbound-calls/webhooks/freeswitch
OUTBOUND_CALL_WEBHOOK_SECRET=replace-with-long-random-secret
OUTBOUND_CALL_CODEC=PCMA
OUTBOUND_CALL_RECORD_ON_SERVER=1
OUTBOUND_CALL_RECORDING_IMPORT_MODE=WEBHOOK_URL
OUTBOUND_CALL_TIMEOUT_SECONDS=30
OUTBOUND_CALL_REQUIRE_WEBHOOK_SECRET=1
OUTBOUND_CALL_WEBHOOK_TOLERANCE_SECONDS=300
```

说明：

- `PCMA` 对应 G.711A / A-law，适合当前国内 SIP/VOS 对接要求。
- `OUTBOUND_CALL_WEBHOOK_SECRET` 只放环境文件或系统设置 secret 字段，不写入代码和文档。
- `crm.cclbn.com` 是正式 CRM 域名，webhook 和 NextAuth 生产地址都应保持这个域名。
- 坐席号默认使用销售的 CRM 登录账号 `username`；`/settings/outbound-call` 只用于覆盖坐席号、分机、路由组或禁用某个账号。
- 真实 SIP 密码不在 CRM 坐席绑定里保存。

## CTI Gateway 配置

仓库已提供独立 gateway 进程：

```bash
npm run cti-gateway
```

本地 mock 模式：

```bash
CTI_GATEWAY_MODE=MOCK
CTI_GATEWAY_HOST=127.0.0.1
CTI_GATEWAY_PORT=8790
CTI_GATEWAY_API_TOKEN=replace-with-same-secret-as-crm-outbound-setting
```

FreeSWITCH ESL 模式：

```bash
CTI_GATEWAY_MODE=FREESWITCH_ESL
CTI_GATEWAY_HOST=127.0.0.1
CTI_GATEWAY_PORT=8790
CTI_GATEWAY_API_TOKEN=replace-with-same-secret-as-crm-outbound-setting
CTI_GATEWAY_DEFAULT_ROUTING_GROUP=your-freeswitch-gateway-name
CTI_GATEWAY_FREESWITCH_HOST=127.0.0.1
CTI_GATEWAY_FREESWITCH_PORT=8021
CTI_GATEWAY_FREESWITCH_PASSWORD=replace-with-freeswitch-event-socket-password
CTI_GATEWAY_FREESWITCH_AGENT_ENDPOINT_TEMPLATE=user/{seatNo}
CTI_GATEWAY_FREESWITCH_CUSTOMER_ENDPOINT_TEMPLATE=sofia/gateway/{routingGroup}/{dialedNumber}
```

对应关系：

- CRM `/settings/outbound-call` 的 secret 会作为 `Authorization: Bearer <secret>` 发给 CTI Gateway。
- `CTI_GATEWAY_API_TOKEN` 必须与 CRM 外呼配置 secret 一致。
- `routingGroup` 没有从 CRM 坐席绑定传入时，gateway 使用 `CTI_GATEWAY_DEFAULT_ROUTING_GROUP`。
- `seatNo` 默认就是 CRM 用户登录账号，例如销售账号是 `6001`，FreeSWITCH originate 会使用 `user/6001`。
- `PCMA` 只是 CRM/Gateway 传递的 codec intent；真实 SIP codec 仍要在 FreeSWITCH gateway/profile 上限制为 G.711A。

Asterisk AMI 本地模式：

```bash
CTI_GATEWAY_MODE=ASTERISK_AMI
CTI_GATEWAY_ASTERISK_HOST=127.0.0.1
CTI_GATEWAY_ASTERISK_PORT=5038
CTI_GATEWAY_ASTERISK_USERNAME=lbn_cti_gateway
CTI_GATEWAY_ASTERISK_PASSWORD=replace-with-ami-secret
CTI_GATEWAY_ASTERISK_AGENT_ENDPOINT_TEMPLATE=PJSIP/{seatNo}
CTI_GATEWAY_ASTERISK_CONTEXT=crm-outbound
CTI_GATEWAY_ASTERISK_CUSTOMER_EXTEN_TEMPLATE={dialedNumber}
CTI_ASTERISK_TRUNK_QUALIFY_FREQUENCY=0
CTI_ASTERISK_RECORDING_DIR=/var/spool/asterisk/monitor/lbn-crm
CTI_ASTERISK_POST_CALL_WEBHOOK_SCRIPT=/usr/local/bin/lbn-crm-post-call-webhook.sh
CTI_POST_CALL_WEBHOOK_URL=https://crm.cclbn.com/api/outbound-calls/webhooks/freeswitch
CTI_POST_CALL_WEBHOOK_LOG_FILE=/var/log/asterisk/lbn-crm-post-call-webhook.log
CTI_ASTERISK_DEFAULT_SEAT_NO=6001
CTI_ASTERISK_SEAT_NOS=6001,sales,sales2,zhansan
```

说明：

- `ASTERISK_AMI` 适合 Ubuntu/WSL 本地快速搭建，因为 Ubuntu 源可直接安装 Asterisk。
- `seatNo` 仍然默认等于 CRM 登录账号；`CTI_ASTERISK_SEAT_NOS` 要填允许注册的 CRM 销售账号，例如 `sales2`。
- `PCMA/G.711A` 在 Asterisk PJSIP 中对应 `alaw`。
- 很多国内 SIP/VOS 线路不稳定响应 OPTIONS；trunk 默认 `qualify_frequency=0`，用 `pjsip show registrations` 判断注册状态，坐席端仍保留 qualify。
- Asterisk `MixMonitor` 写入 `CTI_ASTERISK_RECORDING_DIR`，挂机后执行 `lbn-crm-post-call-webhook.sh`，以 HMAC 签名把 CDR、通话时长和 `recordingPath` 回传给 CRM。

网页 WebRTC 坐席模式：

```bash
OUTBOUND_CALL_WEBRTC_ENABLED=1
OUTBOUND_CALL_WEBRTC_PUBLIC_HOST=crm.cclbn.com
OUTBOUND_CALL_WEBRTC_SIP_DOMAIN=crm.cclbn.com
OUTBOUND_CALL_WEBRTC_WS_URL=wss://crm.cclbn.com/asterisk/ws
OUTBOUND_CALL_WEBRTC_DEFAULT_SEAT_PASSWORD=replace-with-generated-seat-secret
OUTBOUND_CALL_WEBRTC_PREFERRED_CODECS=opus,pcma
OUTBOUND_CALL_WEBRTC_ICE_SERVERS_JSON=[]
CTI_ASTERISK_WEBRTC_ENABLED=1
CTI_ASTERISK_WEBRTC_TRANSPORT_NAME=lbn-crm-wss
CTI_ASTERISK_WEBRTC_TRANSPORT_PROTOCOL=wss
CTI_ASTERISK_WEBRTC_TRANSPORT_BIND=0.0.0.0
CTI_ASTERISK_WEBRTC_CODECS=opus,alaw,ulaw
CTI_ASTERISK_HTTP_TLS_ENABLED=yes
CTI_ASTERISK_HTTP_TLS_BIND_ADDR=0.0.0.0:8089
CTI_ASTERISK_HTTP_TLS_CERT_FILE=/etc/asterisk/keys/fullchain.pem
CTI_ASTERISK_HTTP_TLS_PRIVATE_KEY=/etc/asterisk/keys/privkey.pem
```

说明：

- 浏览器坐席密码只用于员工网页注册自己的 Asterisk endpoint，不是 SIP trunk 线路密码。
- 坐席号默认等于 CRM 登录账号，例如 `sales2`，Asterisk endpoint 也渲染成 `[sales2]`。
- 生产必须走 HTTPS/WSS；`http://192.168.x.x` 这类 LAN IP 会被浏览器阻止麦克风。
- 音质优先使用 WebRTC `opus`，Asterisk 出局到国内线路仍按 `alaw/PCMA/G.711A` 转码。
- 录音仍由 Asterisk `MixMonitor` 在服务端保存，浏览器不保存正式录音。

生产 systemd 模板：

- [deploy/systemd/jiuzhuang-crm-cti-gateway.service](../deploy/systemd/jiuzhuang-crm-cti-gateway.service)

## 本地 smoke

首次准备本地 CTI 环境：

```bash
npm run cti:setup:local
```

这会生成被 git 忽略的 `runtime/cti/local.env`。默认是 `MOCK` 模式，CRM 会强制使用这份本地 CTI 配置，不被数据库里的 `/settings/outbound-call` 覆盖。

启动 CRM + CTI Gateway：

```bash
npm run cti:dev:local
```

只启动 CTI Gateway：

```bash
npm run cti:dev:local -- --gateway-only
```

检查本地 CTI Gateway：

```bash
npm run cti:check:local
```

生成 FreeSWITCH gateway XML：

```bash
npm run cti:render:freeswitch
```

输出文件在 `runtime/cti/freeswitch/lbn-provider-gateway.xml`。把它复制到 FreeSWITCH 的 `conf/sip_profiles/external/` 后执行：

```bash
fs_cli -x "reloadxml"
fs_cli -x "sofia profile external rescan"
```

生成 Asterisk 本地配置：

```bash
npm run cti:render:asterisk
```

输出文件在 `runtime/cti/asterisk/`：

- `manager_lbn_crm.conf`
- `pjsip_lbn_crm.conf`
- `http_lbn_crm.conf`
- `extensions_lbn_crm.conf`
- `lbn-crm-post-call-webhook.sh`

把 4 个 `.conf` 文件复制到 `/etc/asterisk/`，并分别在 `/etc/asterisk/manager.conf`、`/etc/asterisk/pjsip.conf`、`/etc/asterisk/http.conf`、`/etc/asterisk/extensions.conf` 末尾 include 后 reload：

```bash
asterisk -rx "core reload"
asterisk -rx "pjsip reload"
asterisk -rx "http reload"
asterisk -rx "manager reload"
```

挂机回调脚本不要放进 `/etc/asterisk/*.conf` include，复制到脚本路径并限制权限：

```bash
sudo install -m 700 runtime/cti/asterisk/lbn-crm-post-call-webhook.sh /usr/local/bin/lbn-crm-post-call-webhook.sh
```

## 录音存储与 AI 入队

生产建议把 5T 录音盘挂载到 PBX 和 CRM 都能看到的同一路径，例如：

```bash
CALL_RECORDING_STORAGE_PROVIDER=LOCAL_MOUNT
CALL_RECORDING_STORAGE_DIR=/data/lbn-call-recordings
CALL_RECORDING_UPLOAD_TMP_DIR=/data/lbn-call-recordings/.uploads
CTI_ASTERISK_RECORDING_DIR=/data/lbn-call-recordings
```

关键不变量（Invariant）：`CTI_ASTERISK_RECORDING_DIR` 必须等于或位于 `CALL_RECORDING_STORAGE_DIR` 下面。这样 Asterisk 回调 `/data/lbn-call-recordings/20260427/xxx.wav` 时，CRM 能自动映射成 `20260427/xxx.wav` 的 `storageKey`，主管在客户通话记录里就能播放录音。

AI worker 开启后会自动消费 CTI 导入的录音：

```bash
CALL_AI_ENABLED=1
npm run worker:call-ai
```

如果在后台设置页启用了 `runtime.worker.callAiWorkerEnabled`，也可以不写 `CALL_AI_ENABLED=1`，以数据库配置为准。

要接真实外呼时，只改 `runtime/cti/local.env`：

```bash
CTI_GATEWAY_MODE=FREESWITCH_ESL
CTI_GATEWAY_FREESWITCH_PASSWORD=你的FreeSWITCH_ESL密码
CTI_SIP_USERNAME=你的外呼账号
CTI_SIP_PASSWORD=你的外呼密码
```

如果外呼账号就是 SIP gateway 名，也把：

```bash
CTI_SIP_GATEWAY_NAME=你的外呼账号
CTI_GATEWAY_DEFAULT_ROUTING_GROUP=你的外呼账号
OUTBOUND_CALL_DEFAULT_ROUTING_GROUP=你的外呼账号
```

改成同一个值。

启动本地 CTI Gateway 模拟器：

```bash
npm run dev:local-cti-smoke
```

另开终端验证 provider adapter：

```bash
npm run check:outbound-provider -- --endpoint=http://127.0.0.1:8790/calls/start
```

验证真实 `cti-gateway` mock 模式：

```bash
CTI_GATEWAY_MODE=MOCK CTI_GATEWAY_ALLOW_NO_AUTH=1 npm run cti-gateway
npm run check:outbound-provider -- --endpoint=http://127.0.0.1:8790/calls/start
```

验证 CRM webhook 签名，需要 CRM Web 正在运行，并使用和 CRM 一致的 webhook secret：

```bash
npm run check:outbound-webhook -- --endpoint=http://127.0.0.1:3000/api/outbound-calls/webhooks/freeswitch --secret=replace-with-local-secret
```

如果没有真实 `OutboundCallSession`，webhook 可以返回 `handled=false`，这表示签名和 API 入口可达，但没有匹配的通话会话。

带录音路径验证时，需要填真实的 `sessionId` / `callRecordId`：

```bash
npm run check:outbound-webhook -- --endpoint=http://127.0.0.1:3000/api/outbound-calls/webhooks/freeswitch --secret=replace-with-local-secret --session-id=<sessionId> --call-record-id=<callRecordId> --status=ENDED --duration-seconds=35 --recording-path=/data/lbn-call-recordings/20260427/test.wav --recording-mime-type=audio/wav --recording-codec=alaw
```

## 上线前检查

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
npm run lint
npm run build
```

如果执行 `npm run prisma:predeploy:check` 时只出现 legacy 索引/外键物理命名 drift，先不要直接跑修复 SQL。标准顺序是：

1. 备份生产 MySQL。
2. 使用 `npm run db:reconcile-prisma-names -- --output reports/lbn-prisma-name-reconcile.sql` 生成 SQL 并人工检查。
3. 确认只有 name-only rename 后，再在维护窗口执行 `npm run db:reconcile-prisma-names -- --apply`。
4. 重新执行 `npm run prisma:predeploy:check`。

## 下一阶段

Phase 2 需要在 CTI Gateway / PBX 侧实现：

- HTTP `/calls/start`，接受 CRM 标准 JSON。（已完成基础版）
- FreeSWITCH ESL `bgapi originate` 发起呼叫。（已完成基础版）
- FreeSWITCH ESL / Asterisk AMI/ARI 持久事件消费，不再依赖轮询。
- FreeSWITCH ESL / Asterisk AMI/ARI 持久事件消费，不再依赖只在挂机时上报。
- 生产录音盘挂载、备份、容量告警和定期巡检脚本。
