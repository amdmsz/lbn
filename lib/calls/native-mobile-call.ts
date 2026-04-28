"use client";

type NativePermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

type NativeCallRecorderPlugin = {
  getDeviceProfile: () => Promise<{
    deviceFingerprint?: string;
    deviceModel?: string;
    androidVersion?: string;
    appVersion?: string;
    recordingCapability?: "UNKNOWN" | "SUPPORTED" | "UNSUPPORTED" | "BLOCKED";
  }>;
  requestPermissions?: (input?: {
    permissions?: string[];
  }) => Promise<Record<string, NativePermissionState>>;
  startRecordedSimCall: (input: {
    phone: string;
    callRecordId: string;
    customerId: string;
    customerName: string;
    deviceId: string;
    apiBaseUrl: string;
    chunkSizeBytes: number;
    forceSpeakerphone: boolean;
  }) => Promise<{ started?: boolean; callRecordId?: string; deviceId?: string }>;
  getCallSessionSnapshot: (input?: {
    callRecordId?: string;
  }) => Promise<NativeCallSessionSnapshot>;
  getConnectionProfile?: () => Promise<NativeConnectionProfile>;
  saveConnectionProfile?: (input: {
    serverUrl: string;
  }) => Promise<NativeConnectionProfile>;
  testConnection?: (input: {
    serverUrl?: string;
  }) => Promise<NativeConnectionTestResult>;
  reloadApp?: () => Promise<NativeConnectionProfile>;
  addListener?: (
    eventName: "callRecordingSessionUpdated",
    listener: (snapshot: NativeCallSessionSnapshot) => void,
  ) => Promise<{ remove: () => Promise<void> | void }>;
};

type CapacitorGlobal = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  Plugins?: {
    LbnCallRecorder?: NativeCallRecorderPlugin;
  };
};

export type NativeCallSessionSnapshot = {
  callRecordId?: string;
  customerId?: string;
  customerName?: string;
  phone?: string;
  deviceId?: string;
  recordingStatus?: string;
  uploadStatus?: string;
  recordingId?: string | null;
  failureMessage?: string | null;
  durationSeconds?: number;
  audioSource?: string;
  forceSpeakerphone?: boolean;
  updatedAt?: number;
};

export type NativeRecordedCallStartResult = {
  nativeAvailable: boolean;
  nativeStarted: boolean;
  callRecordId?: string;
  deviceId?: string;
  phone?: string;
  errorMessage?: string;
};

export type NativeConnectionProfile = {
  serverUrl?: string;
  defaultServerUrl?: string;
  updateManifestUrl?: string;
};

export type NativeConnectionTestResult = {
  ok?: boolean;
  status?: number;
  serverUrl?: string;
  preview?: string;
  message?: string;
};

function getCapacitor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (window as typeof window & { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

export function getNativeCallRecorderPlugin() {
  const capacitor = getCapacitor();
  return capacitor?.Plugins?.LbnCallRecorder ?? null;
}

export function canUseNativeCallRecorder() {
  const capacitor = getCapacitor();
  const plugin = getNativeCallRecorderPlugin();
  const platform = capacitor?.getPlatform?.();

  return Boolean(plugin && (platform === "android" || capacitor?.isNativePlatform?.()));
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === "string" && body.message.trim()
      ? body.message
      : fallback;
  } catch {
    return fallback;
  }
}

async function registerNativeMobileDevice(plugin: NativeCallRecorderPlugin) {
  const profile = await plugin.getDeviceProfile();
  const response = await fetch("/api/mobile/devices/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceFingerprint: profile.deviceFingerprint,
      deviceModel: profile.deviceModel ?? "",
      androidVersion: profile.androidVersion ?? "",
      appVersion: profile.appVersion ?? "",
      recordingCapability: profile.recordingCapability ?? "UNKNOWN",
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "设备登记失败。"));
  }

  const body = (await response.json()) as {
    device?: { id?: string; recordingEnabled?: boolean; disabledAt?: string | null };
  };
  const device = body.device;
  const deviceId = device?.id;

  if (!device || !deviceId || device.disabledAt || device.recordingEnabled === false) {
    throw new Error("移动设备未启用录音。");
  }

  return deviceId;
}

async function createMobileCallRecord(customerId: string) {
  const response = await fetch("/api/mobile/calls/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerId,
      callTime: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "移动端通话发起失败。"));
  }

  const body = (await response.json()) as {
    call?: {
      callRecordId?: string;
      phone?: string;
      customerId?: string;
      customerName?: string;
    };
  };

  if (!body.call?.callRecordId) {
    throw new Error("移动端通话记录创建失败。");
  }

  return {
    ...body.call,
    callRecordId: body.call.callRecordId,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "原生拨号失败。";
}

export async function startNativeRecordedSimCall(input: {
  customerId: string;
  customerName: string;
  phone: string;
}): Promise<NativeRecordedCallStartResult> {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin || !canUseNativeCallRecorder()) {
    return {
      nativeAvailable: false,
      nativeStarted: false,
    };
  }

  let callRecordId: string | undefined;
  let deviceId: string | undefined;
  let phone = input.phone;

  try {
    await plugin.requestPermissions?.({ permissions: ["callRecording"] });
    deviceId = await registerNativeMobileDevice(plugin);
    const call = await createMobileCallRecord(input.customerId);
    const nextCallRecordId = call.callRecordId;
    callRecordId = nextCallRecordId;
    phone = call.phone?.trim() || input.phone;

    await plugin.startRecordedSimCall({
      phone,
      callRecordId: nextCallRecordId,
      customerId: input.customerId,
      customerName: call.customerName?.trim() || input.customerName,
      deviceId,
      apiBaseUrl: window.location.origin,
      chunkSizeBytes: 1024 * 1024,
      forceSpeakerphone: false,
    });

    return {
      nativeAvailable: true,
      nativeStarted: true,
      callRecordId,
      deviceId,
      phone,
    };
  } catch (error) {
    return {
      nativeAvailable: true,
      nativeStarted: false,
      callRecordId,
      deviceId,
      phone,
      errorMessage: getErrorMessage(error),
    };
  }
}

export async function readNativeCallSessionSnapshot(callRecordId?: string | null) {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin || !canUseNativeCallRecorder()) {
    return null;
  }

  try {
    const snapshot = await plugin.getCallSessionSnapshot({
      callRecordId: callRecordId ?? undefined,
    });

    return snapshot.callRecordId ? snapshot : null;
  } catch {
    return null;
  }
}

export async function readNativeConnectionProfile() {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin?.getConnectionProfile || !canUseNativeCallRecorder()) {
    return null;
  }

  try {
    return await plugin.getConnectionProfile();
  } catch {
    return null;
  }
}

export async function saveNativeConnectionProfile(serverUrl: string) {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin?.saveConnectionProfile || !canUseNativeCallRecorder()) {
    throw new Error("当前客户端不支持代理地址设置。");
  }

  return plugin.saveConnectionProfile({ serverUrl });
}

export async function testNativeConnection(serverUrl?: string) {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin?.testConnection || !canUseNativeCallRecorder()) {
    throw new Error("当前客户端不支持连接检测。");
  }

  return plugin.testConnection({ serverUrl });
}

export async function reloadNativeApp() {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin?.reloadApp || !canUseNativeCallRecorder()) {
    window.location.reload();
    return null;
  }

  return plugin.reloadApp();
}
