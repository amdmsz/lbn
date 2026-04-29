type LbnDesktopNetworkStatus = {
  state: "resume" | "unlock-screen" | "load-failed" | "loaded" | "online" | "offline";
  at?: string;
  errorCode?: number;
  errorDescription?: string;
  url?: string;
};

type LbnDesktopSoftphoneCommand = {
  command: "focusDialpad" | "focusGlobalSearch" | "hangupActiveCall" | string;
  requestedAt?: string;
};

type LbnDesktopBridge = {
  setCallActive(active: boolean): Promise<{
    callActive: boolean;
    powerSaveBlockerActive: boolean;
  }>;
  notify(payload: { title?: string; body?: string }): Promise<{ shown: boolean }>;
  onNetworkStatus(listener: (payload: LbnDesktopNetworkStatus) => void): () => void;
  window: {
    minimize(): Promise<{ handled: boolean }>;
    maximize(): Promise<{ handled: boolean }>;
    close(): Promise<{ handled: boolean }>;
  };
  softphone: {
    focusDialpad(): Promise<{ handled: boolean }>;
    focusGlobalSearch(): Promise<{ handled: boolean }>;
    hangupActiveCall(): Promise<{ handled: boolean }>;
    onCommand(listener: (payload: LbnDesktopSoftphoneCommand) => void): () => void;
  };
  autoLaunch: {
    get(): Promise<{ configurable: boolean; enabled: boolean }>;
    set(enabled: boolean): Promise<{ configurable: boolean; enabled: boolean }>;
  };
};

declare global {
  interface Window {
    lbnDesktop?: LbnDesktopBridge;
  }
}

export {};
