# Windows EXE / Android APP 打包与分发说明

当前客户端固定访问：

```text
https://crm.cclbn.com
```

客户端只是安装壳，业务逻辑、数据库、权限和审计仍然在 CRM 服务端。
同一局域网可以通过内网 DNS / 路由优先走内网；手机在外网时通过公网 FRP 入口访问同一个域名。

## 前置条件

先确认本地或服务器端可访问：

```powershell
cd C:\Users\amdmsz\Documents\LbnCrm
npm run dev
```

在同一内网电脑或手机浏览器打开：

```text
https://crm.cclbn.com
```

如果浏览器打不开，EXE / APP 也打不开，需要先处理 DNS、FRP、反向代理、防火墙、端口或服务端绑定地址。

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

当前服务端更新清单版本为 `0.1.4`，Android release APK 也必须保持：

```text
versionCode 4
versionName "0.1.4"
```

必须备份这些本机签名文件，后续升级要继续用同一个签名：

```text
apps/mobile/android/release/lbn-crm-release.jks
apps/mobile/android/release-signing.properties
```

## 客户端更新检测

客户端启动时会读取 CRM 服务端静态文件：

```text
https://crm.cclbn.com/client-update.json
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
Lbn-CRM-<version>-x64.exe
Lbn-CRM-<version>-x64.zip
Lbn-CRM-Android.apk
```

CRM 对外分发地址固定为：

```text
https://crm.cclbn.com/downloads/Lbn-CRM-Android.apk
https://crm.cclbn.com/downloads/Lbn-CRM-<version>-x64.zip
https://crm.cclbn.com/downloads/Lbn-CRM-<version>-x64.exe
```

服务器从 GitHub Release 同步安装包到自己的下载目录：

```bash
cd /var/www/jiuzhuang-crm
bash scripts/sync-client-downloads.sh v0.1.4
sudo chown -R crm:crm public/downloads
sudo chmod 644 public/downloads/Lbn-CRM-Android.apk
sudo chmod 644 public/downloads/Lbn-CRM-0.1.4-x64.zip
sudo chmod 644 public/downloads/Lbn-CRM-0.1.4-x64.exe
```

如果服务器访问 GitHub 不稳定，可以从本地 Windows 上传 APK：

```powershell
scp "C:\Users\amdmsz\Documents\LbnCrm\public\downloads\Lbn-CRM-Android.apk" crm@<内网服务器IP>:/tmp/Lbn-CRM-Android.apk
```

再到服务器放入 CRM 下载目录：

```bash
cd /var/www/jiuzhuang-crm
sudo mkdir -p public/downloads
sudo mv /tmp/Lbn-CRM-Android.apk public/downloads/Lbn-CRM-Android.apk
sudo chown -R crm:crm public/downloads
sudo chmod 644 public/downloads/Lbn-CRM-Android.apk
```

## 修改内网地址

如果服务地址以后变了，需要改两个文件：

- `apps/desktop/main.cjs`
- `apps/mobile/capacitor.config.json`

把 `https://crm.cclbn.com` 换成新的服务地址后重新打包。

## 不要放进客户端的东西

不要把这些写进 Electron / Android 客户端：

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- 企业微信 `Secret`
- 任何数据库账号密码

这些只属于服务端 `.env`。
