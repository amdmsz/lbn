const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULT_CRM_URL = "https://crm.cclbn.com";

let mainWindow = null;
let crmUrl = DEFAULT_CRM_URL;

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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      return { action: "allow" };
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

  mainWindow.webContents.once("did-finish-load", () => {
    checkForUpdates();
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
      { label: "刷新", accelerator: "F5", click: () => mainWindow?.reload() },
      {
        label: "重新打开 CRM",
        accelerator: "Ctrl+R",
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
      { label: "退出", role: "quit" },
    ],
  },
];

app.whenReady().then(() => {
  crmUrl = loadCrmUrl();
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
