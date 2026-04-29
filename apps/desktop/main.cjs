const {
  app,
  BrowserWindow,
  shell,
  Menu,
  nativeImage,
  dialog,
  ipcMain,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  session,
  Tray,
} = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULT_CRM_URL = "https://crm.cclbn.com";

let mainWindow = null;
let tray = null;
let crmUrl = DEFAULT_CRM_URL;
let callActive = false;
let isQuitting = false;
let powerSaveBlockerId = null;

function getConfigPath() {
  return path.join(app.getPath("userData"), "connection.json");
}

function normalizeCrmUrl(value) {
  let normalized = String(value || "").trim();

  if (!normalized) {
    normalized = DEFAULT_CRM_URL;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  while (normalized.endsWith("/") && normalized.length > "https://x".length) {
    normalized = normalized.slice(0, -1);
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return DEFAULT_CRM_URL;
  }
}

function loadCrmUrl() {
  if (process.env.CRM_SERVER_URL) {
    return normalizeCrmUrl(process.env.CRM_SERVER_URL);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(getConfigPath(), "utf8"));
    return normalizeCrmUrl(parsed.crmUrl);
  } catch {
    return DEFAULT_CRM_URL;
  }
}

function saveCrmUrl(nextCrmUrl) {
  crmUrl = normalizeCrmUrl(nextCrmUrl);
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(
    getConfigPath(),
    JSON.stringify({ crmUrl, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

function getCrmUrl() {
  return crmUrl;
}

function getUpdateManifestUrl() {
  return (
    process.env.CRM_UPDATE_MANIFEST_URL ||
    new URL("/client-update.json", getCrmUrl()).toString()
  );
}

function compareVersions(currentVersion, nextVersion) {
  const currentParts = currentVersion.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const nextParts = nextVersion.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(currentParts.length, nextParts.length);

  for (let index = 0; index < length; index += 1) {
    const current = currentParts[index] || 0;
    const next = nextParts[index] || 0;

    if (next > current) return 1;
    if (next < current) return -1;
  }

  return 0;
}

function isAllowedNavigation(url) {
  try {
    const target = new URL(url);
    const crm = new URL(getCrmUrl());

    return target.origin === crm.origin;
  } catch {
    return false;
  }
}

function isTrustedUrl(url) {
  return typeof url === "string" && isAllowedNavigation(url);
}

function isTrustedSender(event) {
  return isTrustedUrl(event.senderFrame?.url) || isTrustedUrl(event.sender.getURL());
}

function sendRendererEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function sendSoftphoneCommand(command) {
  sendRendererEvent("desktop:softphone-command", {
    command,
    requestedAt: new Date().toISOString(),
  });
}

function getDesktopIcon() {
  const iconPath = path.join(__dirname, "assets", "icon.ico");

  if (!fs.existsSync(iconPath)) {
    return nativeImage.createEmpty();
  }

  return nativeImage.createFromPath(iconPath);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function quitApplication() {
  isQuitting = true;
  app.quit();
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) {
    return;
  }

  tray.setToolTip(callActive ? "Lbn CRM - 通话中" : "Lbn CRM");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开主界面",
        click: () => showMainWindow(),
      },
      {
        label: "挂断当前通话",
        enabled: callActive,
        click: () => sendSoftphoneCommand("hangupActiveCall"),
      },
      { type: "separator" },
      {
        label: "退出应用",
        click: () => quitApplication(),
      },
    ]),
  );
}

function createTray() {
  if (tray && !tray.isDestroyed()) {
    refreshTrayMenu();
    return;
  }

  const icon = getDesktopIcon();
  tray = new Tray(icon);
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
  refreshTrayMenu();
}

function setCallActive(nextActive) {
  callActive = Boolean(nextActive);

  if (callActive && powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  }

  if (!callActive && powerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }

    powerSaveBlockerId = null;
  }

  refreshTrayMenu();

  return {
    callActive,
    powerSaveBlockerActive:
      powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId),
  };
}

function configurePermissions() {
  const allowedPermissions = new Set(["media", "speaker-selection", "notifications"]);

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingUrl = details.requestingUrl || webContents.getURL();
      const allowed = allowedPermissions.has(permission) && isTrustedUrl(requestingUrl);

      callback(allowed);
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      const origin = requestingOrigin || webContents.getURL();

      return allowedPermissions.has(permission) && isTrustedUrl(origin);
    },
  );
}

function registerIpcHandlers() {
  ipcMain.handle("desktop:set-call-active", (event, active) => {
    if (!isTrustedSender(event)) {
      return { callActive, powerSaveBlockerActive: false };
    }

    return setCallActive(active);
  });

  ipcMain.handle("desktop:notify", (event, payload) => {
    if (!isTrustedSender(event) || !Notification.isSupported()) {
      return { shown: false };
    }

    const title = String(payload?.title || "Lbn CRM").slice(0, 80);
    const body = String(payload?.body || "").slice(0, 240);

    new Notification({ title, body }).show();

    return { shown: true };
  });

  ipcMain.handle("desktop:window-control", (event, action) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;

    if (!isTrustedSender(event) || !targetWindow || targetWindow.isDestroyed()) {
      return { handled: false };
    }

    switch (action) {
      case "minimize":
        targetWindow.minimize();
        return { handled: true };
      case "maximize":
        if (targetWindow.isMaximized()) {
          targetWindow.unmaximize();
        } else {
          targetWindow.maximize();
        }
        return { handled: true };
      case "close":
        targetWindow.close();
        return { handled: true };
      default:
        return { handled: false };
    }
  });

  ipcMain.handle("desktop:softphone-command", (event, command) => {
    if (!isTrustedSender(event)) {
      return { handled: false };
    }

    sendSoftphoneCommand(command);

    return { handled: true };
  });
}

function registerPowerMonitorEvents() {
  powerMonitor.on("resume", () => {
    sendRendererEvent("desktop:network-status", {
      state: "resume",
      at: new Date().toISOString(),
    });
  });

  powerMonitor.on("unlock-screen", () => {
    sendRendererEvent("desktop:network-status", {
      state: "unlock-screen",
      at: new Date().toISOString(),
    });
  });
}

async function checkForUpdates({ manual = false } = {}) {
  try {
    const response = await fetch(getUpdateManifestUrl(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Update manifest returned ${response.status}`);
    }

    const manifest = await response.json();
    const latestVersion = String(manifest.version || "").trim();
    const downloadUrl = manifest.windows?.downloadUrl || manifest.downloadUrl;

    if (!latestVersion || compareVersions(app.getVersion(), latestVersion) <= 0) {
      if (manual) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Lbn CRM 更新检测",
          message: "当前已经是最新版本。",
          detail: `当前版本：${app.getVersion()}`,
        });
      }

      return;
    }

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "发现新版本",
      message: `发现 Lbn CRM 新版本 ${latestVersion}`,
      detail: manifest.notes || "请下载并安装新版客户端。",
      buttons: ["下载更新", "稍后再说"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0 && downloadUrl) {
      shell.openExternal(downloadUrl);
    }
  } catch (error) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "更新检测失败",
        message: "暂时无法检测更新。",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "Lbn CRM",
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.on("minimize", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          frame: false,
          autoHideMenuBar: true,
          titleBarStyle: "hidden",
          webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }

      sendRendererEvent("desktop:network-status", {
        state: "load-failed",
        errorCode,
        errorDescription,
        url: validatedURL,
        at: new Date().toISOString(),
      });
    },
  );

  mainWindow.webContents.once("did-finish-load", () => {
    checkForUpdates();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    sendRendererEvent("desktop:network-status", {
      state: "loaded",
      at: new Date().toISOString(),
    });
  });

  mainWindow.loadURL(getCrmUrl());
}

async function configureServerUrl() {
  if (!mainWindow) {
    return;
  }

  const current = getCrmUrl();
  const nextValue = await mainWindow.webContents.executeJavaScript(
    `window.prompt("请输入 CRM 服务器或公网代理地址", ${JSON.stringify(current)})`,
    true,
  );

  if (typeof nextValue !== "string" || !nextValue.trim()) {
    return;
  }

  saveCrmUrl(nextValue);
  await mainWindow.loadURL(getCrmUrl());
}

const menuTemplate = [
  {
    label: "操作",
    submenu: [
      {
        label: "打开拨号盘",
        accelerator: "CommandOrControl+D",
        click: () => {
          showMainWindow();
          sendSoftphoneCommand("focusDialpad");
        },
      },
      {
        label: "全局搜索",
        accelerator: "CommandOrControl+F",
        click: () => {
          showMainWindow();
          sendSoftphoneCommand("focusGlobalSearch");
        },
      },
      { type: "separator" },
      { label: "刷新", accelerator: "F5", click: () => mainWindow?.reload() },
      {
        label: "重新打开 CRM",
        accelerator: "CommandOrControl+R",
        click: () => mainWindow?.loadURL(getCrmUrl()),
      },
      {
        label: "设置服务器/代理地址",
        click: () => configureServerUrl(),
      },
      {
        label: "检查更新",
        click: () => checkForUpdates({ manual: true }),
      },
      { type: "separator" },
      { label: "退出", click: () => quitApplication() },
    ],
  },
];

app.whenReady().then(() => {
  crmUrl = loadCrmUrl();
  configurePermissions();
  registerIpcHandlers();
  registerPowerMonitorEvents();
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }

    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  setCallActive(false);

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  setCallActive(false);

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }

  tray = null;
});
