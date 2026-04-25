const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("path");

const DEFAULT_CRM_URL = "http://crm.cclbn.com";
const CRM_URL = process.env.CRM_SERVER_URL || DEFAULT_CRM_URL;
const UPDATE_MANIFEST_URL =
  process.env.CRM_UPDATE_MANIFEST_URL || new URL("/client-update.json", CRM_URL).toString();

let mainWindow = null;

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
    const crm = new URL(CRM_URL);

    return target.origin === crm.origin;
  } catch {
    return false;
  }
}

async function checkForUpdates({ manual = false } = {}) {
  try {
    const response = await fetch(UPDATE_MANIFEST_URL, {
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

  mainWindow.loadURL(CRM_URL);
}

const menuTemplate = [
  {
    label: "操作",
    submenu: [
      { label: "刷新", accelerator: "F5", click: () => mainWindow?.reload() },
      {
        label: "重新打开 CRM",
        accelerator: "Ctrl+R",
        click: () => mainWindow?.loadURL(CRM_URL),
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
