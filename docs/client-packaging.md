# Windows EXE / Android APP 内网打包说明

当前客户端固定访问：

```text
http://crm.cclbn.com
```

客户端只是安装壳，业务逻辑、数据库、权限和审计仍然在内网 CRM 服务端。

## 前置条件

先确认内网服务端可访问：

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run dev
```

在同一内网电脑或手机浏览器打开：

```text
http://crm.cclbn.com
```

如果浏览器打不开，EXE / APP 也打不开，需要先处理 DNS、反向代理、防火墙、端口或服务端绑定地址。

## Windows EXE

首次安装桌面壳依赖：

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run desktop:install
```

开发预览：

```powershell
npm run desktop:dev
```

生成 Electron 免安装目录：

```powershell
npm run pack --prefix apps/desktop
```

当前项目使用 Inno Setup 生成安装包，脚本在：

```text
apps/desktop/installer/lbn-crm.iss
```

## Android APP

需要本机安装：

- Android Studio
- Android SDK
- JDK 21

首次安装移动端壳依赖：

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run mobile:install
```

首次生成 Android 工程：

```powershell
npm run mobile:add:android
```

同步配置：

```powershell
npm run mobile:sync
```

生成 debug APK：

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm\apps\mobile\android
.\gradlew.bat assembleDebug
```

正式分发不要长期使用 debug APK。先生成一次本机 release keystore：

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run mobile:release-keystore
```

然后构建签名 release APK，并同步到 CRM 下载目录：

```powershell
npm run mobile:release:android
```

生成后的正式 APK：

```text
public/downloads/Lbn-CRM-Android.apk
```

必须备份这些本机签名文件，后续升级要继续用同一个签名：

```text
apps/mobile/android/release/lbn-crm-release.jks
apps/mobile/android/release-signing.properties
```

## 客户端更新检测

客户端启动时会读取 CRM 服务端静态文件：

```text
http://crm.cclbn.com/client-update.json
```

当 `version` 高于当前客户端版本时：

- Windows EXE 会弹窗提示下载新安装包。
- Android APP 会弹窗提示下载新 APK。

发布新版本时需要同步做三件事：

1. 更新 `apps/desktop/package.json` 里的 `version`。
2. 更新 `apps/mobile/android/app/build.gradle` 里的 `versionCode` / `versionName`。
3. 更新 `public/client-update.json` 的 `version`、`notes` 和下载地址。

GitHub Release 资产建议固定命名：

```text
Lbn-CRM-Setup.exe
Lbn-CRM-Android-debug.apk
```

这样客户端可以一直使用 `releases/latest/download/...` 下载最新安装包。

## 修改内网地址

如果服务地址以后变了，需要改两个文件：

- `apps/desktop/main.cjs`
- `apps/mobile/capacitor.config.json`

把 `http://crm.cclbn.com` 换成新的内网地址后重新打包。

## 不要放进客户端的东西

不要把这些写进 Electron / Android 客户端：

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- 企业微信 `Secret`
- 任何数据库账号密码

这些只属于服务端 `.env`。
