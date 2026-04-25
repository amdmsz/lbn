# Windows EXE and Android APP Packaging Plan

Date: 2026-04-25
Status: planning only

## Goal

把当前 CRM 做成：

- Windows 可安装 EXE
- Android 可安装 APK / AAB

但核心业务、数据库、权限、审计仍然保持在当前 Next.js + MariaDB 服务端，不把业务逻辑拆到客户端。

## Current App Facts

当前仓库是服务端 Web CRM：

- Next.js App Router
- NextAuth 登录态
- Prisma + MariaDB
- 服务端 actions / API routes
- 上传文件、导出、worker、Redis 等都依赖服务端环境
- 数据库连接通过 `DATABASE_URL`
- 业务权限在服务端校验

因此它不是纯前端 SPA，也不是可以直接打进 Android 离线运行的应用。

## Key Decision

推荐方案：

```text
中央 CRM 服务端（内网服务器）
        ↑
Windows EXE / Android APP 只是客户端壳（WebView / Browser Shell）
```

不要做：

```text
每台电脑/手机各自内置 Next.js + MariaDB + Prisma
```

原因：

- 多员工协作必须共享同一套数据
- 权限和审计必须在服务端统一执行
- Android 不能直接跑当前 Node + Prisma + MariaDB 服务端栈
- Windows 本地内置服务端会带来升级、端口、杀毒、数据库一致性和备份问题

## Recommended Architecture

### 1. Server remains central

在内网部署当前 CRM：

```text
http://crm.local:3000
```

或：

```text
https://crm.company.lan
```

Windows / Android 只访问这个地址。

### 2. Windows EXE

推荐用 Electron 做安装包：

- 打开固定 CRM URL
- 提供桌面图标
- 保持登录 cookie / session
- 可配置内网服务器地址
- 可以后续加自动更新

备选：Tauri

- 更轻，但 Windows WebView2 / 打包配置和 Next 服务端联动需要更多验证
- 如果只做 WebView 壳，Electron 更直接

### 3. Android APP

推荐用 Capacitor 做 Android 壳：

- WebView 打开内网 CRM URL
- 支持 APK / AAB
- 后续可接相机、扫码、推送、文件上传等原生能力
- 员工手机必须能访问内网地址：同 Wi-Fi / VPN / 零信任网关

备选：PWA

- 最轻，无需应用商店
- Android 可“添加到主屏幕”
- 但不像真正 APK，企业分发、权限能力有限

## Network Invariant

Android APP 能不能用，关键不是 APK，而是网络：

- 手机必须能访问内网 CRM 服务端
- 如果员工在外网，需要 VPN / 零信任 / 专线 / 公网网关
- 如果 CRM 只在办公室内网，APP 只能在办公室网络或 VPN 下使用

## Phase 1 Scope

只做可安装客户端壳，不改业务主线：

- Windows EXE 打开 CRM
- Android APK 打开 CRM
- 支持配置服务端地址
- 保持登录态
- 支持文件上传基础能力
- 不做离线模式
- 不重写页面为原生 UI
- 不改 Prisma / DB / RBAC

## Proposed Repo Structure

```text
apps/
  desktop/
    package.json
    electron-main.ts
    preload.ts
    assets/
      icon.ico
  mobile/
    package.json
    capacitor.config.ts
    android/
```

或者如果想保持简单，也可以：

```text
clients/
  desktop-electron/
  android-capacitor/
```

推荐 `apps/`，便于未来 monorepo 化。

## Windows EXE Implementation Checklist

1. Add Electron desktop package
2. Add `electron-builder`
3. Add main process:
   - read CRM URL from config/env
   - create BrowserWindow
   - load CRM URL
   - handle certificate / navigation guard carefully
4. Add install target:
   - NSIS installer
   - app icon
   - app name: `Lbn CRM`
5. Add scripts:
   - `desktop:dev`
   - `desktop:pack`
   - `desktop:dist`
6. Validate:
   - install on clean Windows user
   - login works
   - upload/export works
   - session persists after app restart

## Android APP Implementation Checklist

1. Add Capacitor package
2. Configure Android package id, e.g.:
   - `com.lbn.crm`
3. Configure app name:
   - `Lbn CRM`
4. Configure server URL:
   - dev: `http://<LAN-IP>:3000`
   - production: `https://crm.company.lan`
5. Generate Android project
6. Build APK / AAB via Android Studio or Gradle
7. Validate:
   - Android phone can reach CRM URL
   - login works
   - upload works
   - back button behavior correct
   - downloads / exports acceptable

## Server Requirements Before Packaging

Before packaging clients, stabilize CRM server URL:

- fixed LAN IP or internal DNS
- consistent `NEXTAUTH_URL`
- HTTPS recommended, especially Android WebView
- valid session cookie config
- database migration applied
- uploads / exports directories stable
- worker process documented if lead imports are used

## Environment Variables

Server `.env` remains in main CRM server:

```env
DATABASE_URL=...
NEXTAUTH_URL=https://crm.company.lan
NEXTAUTH_SECRET=...
```

Client app only needs public client config, e.g.:

```env
CRM_SERVER_URL=https://crm.company.lan
```

不要把数据库密码、企业微信 Secret、NextAuth Secret 打进 Windows / Android 客户端。

## Security Notes

- 客户端不能保存 DB 密码
- 客户端不能保存企业微信 Secret
- 客户端只是入口，不是权限边界
- 所有 RBAC 继续由服务端执行
- Android 外网访问必须通过 VPN / 零信任网关，不建议直接裸露 CRM

## Recommended Delivery Order

1. 先固定内网 CRM 服务端地址
2. 做 Windows Electron 壳
3. 做 Android Capacitor 壳
4. 做安装包图标、名称、版本号
5. 做内网/VPN 可访问性测试
6. 再考虑自动更新、推送、扫码等增强能力

## Validation Commands

Main CRM:

```bash
npm run lint
npm run build
npx prisma validate
```

Desktop client, planned:

```bash
npm run desktop:dev
npm run desktop:dist
```

Android client, planned:

```bash
npm run mobile:sync
npm run mobile:android
```

## Open Questions

1. CRM 内网服务端最终地址是什么？例如 `http://192.168.1.10:3000` 或 `https://crm.xxx.lan`。
2. Android 手机是在公司 Wi-Fi 使用，还是外出也要用？
3. Windows 是否需要自动更新？
4. Android 是内部 APK 分发，还是要上架应用商店 / 企业分发？
5. 是否需要扫码、拍照、推送通知等原生能力？

## Recommendation

先做最小可用版：

- Windows：Electron EXE，固定打开内网 CRM
- Android：Capacitor APK，固定打开内网 CRM
- 不做离线、不打包数据库、不复制服务端逻辑

这样最快、风险最低，也符合当前 CRM 的服务端业务架构。
