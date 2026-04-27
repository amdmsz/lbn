# WebRTC Call Center And Server Recording Plan

日期：2026-04-27

## Scope

把当前已验证的 `CRM -> CTI Gateway -> Asterisk -> SIP trunk` 外呼底座升级为正式的浏览器坐席方案：

```text
员工登录 CRM
  -> CRM 发放当前员工的 WebRTC 坐席注册配置
  -> 浏览器通过 WSS 注册到 Asterisk
  -> 员工点击 CRM 外呼
  -> Asterisk 先呼叫网页坐席
  -> 坐席在网页内接听
  -> Asterisk 通过 SIP trunk 呼叫客户
  -> Asterisk 服务端录音
  -> CDR / hangup event 回传 CRM
  -> CRM 保存录音引用 / 导入录音文件
  -> Call AI worker 执行转写、说话人分离、质检分析
```

本阶段目标是去掉员工电脑对 MicroSIP / WayMi 这类本机软件的依赖。无盘电脑重启后，只要打开 `crm.cclbn.com` 并登录 CRM，就能注册坐席、接听和外呼。

## Non-Goals

- 不把 SIP trunk 账号、线路密码或供应商鉴权下发到浏览器。
- 不把浏览器录音作为正式录音真相；正式录音以 Asterisk 服务端录音为准。
- 不在本阶段重做 `Customer / TradeOrder / Payment / Fulfillment` 主线。
- 不把 WebRTC 坐席做成第三方云呼叫中心；仍然由我们控制 Asterisk / CTI Gateway / CRM 数据链。
- 不要求手机 Android App 也立刻接 WebRTC；移动端仍可后续单独接同一 CTI Gateway。

## Invariants

- `Customer` 仍是销售执行主对象，外呼必须绑定 `Customer` 和 `CallRecord`。
- 坐席号默认仍等于 CRM `User.username`，例如 `sales2`。
- 所有外呼请求必须经过 CRM 权限检查和 `OperationLog`。
- 浏览器只能拿到当前登录员工自己的 WebRTC 坐席资料。
- WebRTC 坐席密码必须是系统生成 / 可轮换 / 不在代码仓库里。
- Asterisk 服务端录音文件名必须带 `callRecordId / sessionId / seatNo`，方便回填。
- 录音保存必须落到已规划的 recording storage 层，后续主管查看与 AI 分析都只读 CRM 的录音记录。
- 生产域名固定考虑 `https://crm.cclbn.com`，WebRTC 必须走 HTTPS/WSS。

## Architecture Decisions

### Asterisk

- 启用 PJSIP WebRTC endpoint：
  - `transport=wss`
  - `webrtc=yes`
  - `media_encryption=dtls`
  - `use_avpf=yes`
  - `rtp_symmetric=yes`
  - `force_rport=yes`
  - `rewrite_contact=yes`
  - `direct_media=no`
- 保留现有 SIP trunk / PCMA(G.711A) 出局线路配置。
- 坐席 endpoint 支持两类：
  - local SIP endpoint：仅本地调试 / fallback
  - WebRTC endpoint：正式员工网页坐席
- `MixMonitor` 继续在 Asterisk 服务端执行，录音路径统一到录音存储挂载目录。

### CRM Web

- 增加“网页坐席”状态组件：
  - 未授权麦克风
  - 未注册
  - 注册中
  - 在线
  - 来电中
  - 通话中
  - 失败 / 重连
- 客户详情外呼按钮不再只显示“已提交”，而要显示完整外呼状态。
- 使用成熟 SIP WebRTC client library，优先评估 `sip.js`；如果与 Asterisk 兼容性差，再切 `jssip`。
- 前端只负责坐席注册、接听、挂断、静音和状态展示；业务创建、权限和审计仍走 server API。

### CTI Gateway

- 从“HTTP 发起 originate”升级为“HTTP + AMI event bridge”：
  - `/calls/start`：发起坐席呼叫和客户桥接
  - AMI 事件消费：`OriginateResponse / DialBegin / DialEnd / BridgeEnter / Hangup / Cdr`
  - 回调 CRM webhook 更新 `OutboundCallSession`
  - 通话结束后回传录音路径、CDR、时长、失败原因
- Gateway 仍不接触 CRM session cookie，只用 server-to-server token。

### Recording

- Asterisk 录音目录建议：
  - `/mnt/recordings/lbn-crm/YYYYMMDD/*.wav`
  - 或 production 挂载到独立 5T 存储机 / NAS / MinIO bucket
- Asterisk `MixMonitor` 写入 wav，后续可由 worker 转码成 mp3/m4a 以降低存储。
- CRM 记录：
  - `OutboundCallSession.recordingUrl / recordingExternalId / rawCdrJson`
  - 关联或创建 `CallRecording`
  - 入队 `CallAiAnalysis`
- 主管查看客户详情和录音工作台时，读取 CRM 权限后的录音播放接口，不直接暴露真实文件路径。

## Implementation Checklist

### Phase 0: stabilize current CTI baseline before WebRTC

- 确认当前已完成的 CTI foundation migration 可部署。
- 服务器部署前确认生产库 `npm run prisma:predeploy:check` 通过。
- 当前 MicroSIP 方案仅作为 fallback，不作为最终员工使用路径。

### Phase 1: schema / settings additions

- 增加 WebRTC 坐席配置字段：
  - 是否启用 WebRTC 坐席
  - WSS URL
  - SIP domain
  - ICE servers / TURN 配置
  - 坐席注册有效策略
- 增加坐席密钥管理：
  - 每个用户一个 WebRTC password hash/secret reference
  - 支持管理员重置坐席密码
  - 不在前端长期保存 trunk secret
- 如果现有 `OutboundCallSeatBinding` 足够承接，优先扩展字段；不重复建一套坐席表。

### Phase 2: Asterisk WebRTC templates

- 新增或扩展 `deploy/asterisk/pjsip_lbn_crm.conf.template`：
  - WSS transport
  - WebRTC endpoint 模板
  - 多坐席渲染
  - DTLS cert 配置
- 新增 Asterisk HTTP/TLS 说明：
  - `http.conf`
  - `pjsip.conf`
  - 证书路径
  - 生产建议走 Nginx TLS terminate 或 Asterisk 原生 TLS 二选一
- 本地验证浏览器注册到 Asterisk。

### Phase 3: CRM WebRTC softphone

- 新增 client-side softphone module：
  - 封装 SIP client 初始化
  - register / unregister
  - incoming invite
  - answer / hangup / mute
  - audio element playback
- 新增 API：
  - `GET /api/outbound-calls/webrtc-config`
  - 只返回当前登录用户的坐席信息
  - 权限与账号状态校验
- 将 softphone 状态挂到 dashboard/customers shell 内，员工登录后自动注册。

### Phase 4: call start flow cutover

- 客户详情点击外呼：
  - CRM 创建 `CallRecord + OutboundCallSession`
  - CTI Gateway originate 到 `PJSIP/{seatNo}` 的 WebRTC endpoint
  - 浏览器坐席来电响铃
  - 员工网页内点击接听
  - Asterisk 进入 `crm-outbound` dialplan 并呼叫客户
- UI 需要展示：
  - 坐席未在线时禁止外呼或提示“网页坐席未注册”
  - 正在呼叫坐席
  - 坐席已接听，正在呼叫客户
  - 客户接通 / 未接 / 失败

### Phase 5: recording / CDR import

- 在 Asterisk dialplan 中固化：
  - `RECORDING_FILE`
  - `CRM_SESSION_ID`
  - `CRM_CALL_RECORD_ID`
  - `CRM_SEAT_NO`
  - `CRM_CUSTOMER_ID`
- CTI Gateway AMI event bridge 监听 hangup/CDR 后回调 CRM webhook。
- CRM webhook 更新：
  - session status
  - duration
  - recording path/url
  - failure reason
  - raw CDR
- 增加录音导入 worker：
  - 从本地挂载路径或 storage path 读取录音
  - 创建/关联 `CallRecording`
  - 触发现有 `worker:call-ai`
- 播放接口仍走 `/api/call-recordings/[id]/audio`，保持主管权限控制。

### Phase 6: production storage

- 5T 存储优先方案：
  - 单独 Linux 存储机挂载 5T 磁盘
  - XFS/ext4
  - 挂载点：`/mnt/lbn-recordings`
  - NFS/Samba 给 Asterisk/CRM 只读或读写挂载
  - CRM 只通过应用接口播放，不开放公网目录列表
- 可选方案：
  - MinIO on storage VM
  - Asterisk 本地录音后 worker 上传 MinIO
  - CRM 通过 signed URL 或应用代理播放
- 第一版建议本地挂载文件系统，复杂度最低；后续再升级 MinIO。

### Phase 7: validation / hardening

- 本地：
  - 浏览器 microphone permission
  - WebRTC register success
  - CRM click outbound
  - browser rings
  - answer
  - customer rings
  - recording file created
  - CRM record updated
  - audio playback
  - AI queue receives job
- 生产：
  - HTTPS/WSS certificate valid
  - firewall only opens required ports
  - SIP trunk registered
  - WebRTC RTP audio works from sales network
  - TURN fallback works if NAT blocks direct audio
- 回归：
  - `npm run lint`
  - `npm run build`
  - `npx prisma validate`
  - `npx prisma generate`
  - `npm run prisma:predeploy:check`

## Rollback

- 保留当前 CTI Gateway + Asterisk AMI 基础能力。
- 保留 MicroSIP/SIP endpoint 作为临时 fallback，不作为员工正式操作要求。
- WebRTC 切换开关必须可在 `/settings/outbound-call` 或 env 中关闭。
- 若 WebRTC 注册或音频穿透失败，可临时回退到：
  - 坐席外部软电话
  - 或只禁用外呼按钮，不影响客户跟进、订单、录音工作台其他功能

## Risks

- 浏览器 WebRTC 需要 HTTPS/WSS；HTTP 环境无法作为正式生产链路。
- 部分员工网络 NAT 可能导致单向音频，生产建议准备 TURN。
- Asterisk WebRTC 配置对证书、DTLS、codec 比普通 SIP 更敏感。
- Asterisk 录音路径和 CRM 存储路径必须统一，否则会出现“已通话但无录音可播”。
- 当前 `OutboundCallSession` 已能记录 session/CDR 基础字段，但 `CallRecording` 自动创建与 AI 入队需要单独实现。

## First Execution Slice

下一次实施建议只做一个可验证切片：

1. Asterisk WebRTC transport + 单坐席 `sales2` 浏览器注册。
2. CRM 暴露当前用户 WebRTC config API。
3. 页面内显示“网页坐席在线/离线”。
4. 仍用现有 `cti-gateway` 发起呼叫到 `PJSIP/sales2`。
5. 验证浏览器响铃和接听。

录音/CDR/AI 在第二个切片实现，避免 WebRTC 音频调通和录音导入两个高风险点混在一起。
