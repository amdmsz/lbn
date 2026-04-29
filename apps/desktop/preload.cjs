const { contextBridge, ipcRenderer } = require("electron");

const softphoneListeners = new Set();
const networkListeners = new Set();

function emitToListeners(listeners, payload) {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch {
      // Keep one broken renderer listener from blocking the desktop bridge.
    }
  }
}

ipcRenderer.on("desktop:softphone-command", (_event, payload) => {
  emitToListeners(softphoneListeners, payload);
  window.dispatchEvent(
    new CustomEvent("lbn-desktop-softphone-command", { detail: payload }),
  );
});

ipcRenderer.on("desktop:network-status", (_event, payload) => {
  emitToListeners(networkListeners, payload);
  window.dispatchEvent(
    new CustomEvent("lbn-desktop-network-status", { detail: payload }),
  );
});

contextBridge.exposeInMainWorld("lbnDesktop", {
  setCallActive(active) {
    return ipcRenderer.invoke("desktop:set-call-active", Boolean(active));
  },
  notify(payload) {
    return ipcRenderer.invoke("desktop:notify", {
      title: String(payload?.title || "Lbn CRM"),
      body: String(payload?.body || ""),
    });
  },
  onNetworkStatus(listener) {
    if (typeof listener !== "function") {
      return () => undefined;
    }

    networkListeners.add(listener);

    return () => {
      networkListeners.delete(listener);
    };
  },
  window: {
    minimize() {
      return ipcRenderer.invoke("desktop:window-control", "minimize");
    },
    maximize() {
      return ipcRenderer.invoke("desktop:window-control", "maximize");
    },
    close() {
      return ipcRenderer.invoke("desktop:window-control", "close");
    },
  },
  softphone: {
    focusDialpad() {
      return ipcRenderer.invoke("desktop:softphone-command", "focusDialpad");
    },
    focusGlobalSearch() {
      return ipcRenderer.invoke("desktop:softphone-command", "focusGlobalSearch");
    },
    hangupActiveCall() {
      return ipcRenderer.invoke("desktop:softphone-command", "hangupActiveCall");
    },
    onCommand(listener) {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      softphoneListeners.add(listener);

      return () => {
        softphoneListeners.delete(listener);
      };
    },
  },
  autoLaunch: {
    get() {
      return ipcRenderer.invoke("desktop:get-auto-launch-enabled");
    },
    set(enabled) {
      return ipcRenderer.invoke("desktop:set-auto-launch-enabled", Boolean(enabled));
    },
  },
});
