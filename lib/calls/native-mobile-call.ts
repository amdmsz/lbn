"use client";

export type NativePermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";
export type NativeRecordingCapability =
  | "UNKNOWN"
  | "SUPPORTED"
  | "UNSUPPORTED"
  | "BLOCKED";
export type NativeRecorderPermissionMap = Record<string, NativePermissionState>;
export type NativeDeviceProfile = {
  deviceFingerprint?: string;
  deviceModel?: string;
  androidVersion?: string;
  appVersion?: string;
  recordingCapability?: NativeRecordingCapability;
  permissions?: NativeRecorderPermissionMap;
};
export type NativeRecorderReadinessStatus =
  | "browser-fallback"
  | "ready"
  | "needs-permission"
  | "blocked"
  | "unknown";
export type NativeRecorderReadiness = {
  nativeAvailable: boolean;
  status: NativeRecorderReadinessStatus;
  title: string;
  description: string;
  detail: string | null;
  profile: NativeDeviceProfile | null;
  permissions: NativeRecorderPermissionMap | null;
};
type NativePluginListenerHandle = {
  remove: () => Promise<void> | void;
};

type NativeCallRecorderPlugin = {
  getDeviceProfile: () => Promise<NativeDeviceProfile>;
  checkPermissions?: () => Promise<NativeRecorderPermissionMap>;
  requestPermissions?: (input?: {
    permissions?: string[];
  }) => Promise<NativeRecorderPermissionMap>;
  checkRecorderPermissions?: () => Promise<NativeRecorderPermissionMap>;
  requestRecorderPermissions?: () => Promise<NativeRecorderPermissionMap>;
  retryPendingUploads?: (input: {
    apiBaseUrl: string;
    chunkSizeBytes: number;
  }) => Promise<{ queued?: number }>;
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
  ) => NativePluginListenerHandle | Promise<NativePluginListenerHandle>;
};

const CALL_RECORDING_PERMISSION_ALIAS = "callRecording";
const NATIVE_RECORDER_PERMISSION_MESSAGE =
  "缺少电话、通话状态、麦克风、系统录音读取或通知权限。";

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

export type NativeRecordedCallSessionReady = {
  callRecordId: string;
  deviceId?: string | null;
  phone?: string | null;
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

function hasPermissionState(
  permissions: NativeRecorderPermissionMap | null | undefined,
  states: NativePermissionState[],
) {
  return Object.values(permissions ?? {}).some((state) => states.includes(state));
}

function allKnownPermissionsGranted(
  permissions: NativeRecorderPermissionMap | null | undefined,
) {
  const values = Object.values(permissions ?? {});

  return values.length > 0 && values.every((state) => state === "granted");
}

function nativeRecorderPermissionsReady(
  permissions: NativeRecorderPermissionMap | null | undefined,
) {
  return !permissions || allKnownPermissionsGranted(permissions);
}

async function checkNativeRecorderPermissionMap(plugin: NativeCallRecorderPlugin) {
  return (
    (await plugin.checkRecorderPermissions?.()) ??
    (await plugin.checkPermissions?.()) ??
    null
  );
}

async function requestNativeRecorderPermissionMap(plugin: NativeCallRecorderPlugin) {
  return (
    (await plugin.requestRecorderPermissions?.()) ??
    (await plugin.requestPermissions?.({
      permissions: [CALL_RECORDING_PERMISSION_ALIAS],
    })) ??
    null
  );
}

function formatNativeDeviceDetail(profile: NativeDeviceProfile | null) {
  if (!profile) {
    return null;
  }

  const parts = [
    profile.deviceModel,
    profile.androidVersion,
    profile.appVersion ? `App ${profile.appVersion}` : null,
  ].filter((value): value is string => Boolean(value?.trim()));

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function summarizeNativeRecorderReadiness(input: {
  nativeAvailable: boolean;
  profile?: NativeDeviceProfile | null;
  permissions?: NativeRecorderPermissionMap | null;
}): NativeRecorderReadiness {
  const profile = input.profile ?? null;
  const permissions = input.permissions ?? null;
  const capability = profile?.recordingCapability ?? "UNKNOWN";
  const detail = formatNativeDeviceDetail(profile);

  if (!input.nativeAvailable) {
    return {
      nativeAvailable: false,
      status: "browser-fallback",
      title: "浏览器拨号模式",
      description: "当前不是 Android 原生壳，本机通话会回退到系统拨号和手动补记。",
      detail,
      profile,
      permissions,
    };
  }

  if (
    capability === "BLOCKED" ||
    capability === "UNSUPPORTED" ||
    hasPermissionState(permissions, ["denied"])
  ) {
    return {
      nativeAvailable: true,
      status: "blocked",
      title: "原生录音未就绪",
      description:
        "电话、通话状态、麦克风、系统录音读取或通知权限未放开，请到系统权限中处理。",
      detail,
      profile,
      permissions,
    };
  }

  if (hasPermissionState(permissions, ["prompt", "prompt-with-rationale"])) {
    return {
      nativeAvailable: true,
      status: "needs-permission",
      title: "等待授权",
      description: "需要授权电话、通话状态、麦克风、系统录音读取和通知权限后才能本机拨号录音。",
      detail,
      profile,
      permissions,
    };
  }

  if (allKnownPermissionsGranted(permissions) || capability === "SUPPORTED") {
    return {
      nativeAvailable: true,
      status: "ready",
      title: "原生录音已就绪",
      description: "Android 原生拨号、前台录音服务和上传链路可用。",
      detail,
      profile,
      permissions,
    };
  }

  return {
    nativeAvailable: true,
    status: "needs-permission",
    title: "原生录音待初始化",
    description: "插件已加载，尚未确认完整权限；初始化后会重新检测设备能力。",
    detail,
    profile,
    permissions,
  };
}

export async function readNativeRecorderReadiness() {
  const plugin = getNativeCallRecorderPlugin();
  const nativeAvailable = Boolean(plugin && canUseNativeCallRecorder());

  if (!plugin || !nativeAvailable) {
    return summarizeNativeRecorderReadiness({ nativeAvailable: false });
  }

  try {
    const profile = await plugin.getDeviceProfile();
    const permissions = await checkNativeRecorderPermissionMap(plugin);

    return summarizeNativeRecorderReadiness({
      nativeAvailable: true,
      profile,
      permissions,
    });
  } catch (error) {
    return {
      ...summarizeNativeRecorderReadiness({ nativeAvailable: true }),
      status: "unknown" as const,
      title: "原生检测失败",
      description: getErrorMessage(error),
    };
  }
}

export async function requestNativeRecorderPermissions() {
  const plugin = getNativeCallRecorderPlugin();
  const nativeAvailable = Boolean(plugin && canUseNativeCallRecorder());

  if (!plugin || !nativeAvailable) {
    return summarizeNativeRecorderReadiness({ nativeAvailable: false });
  }

  let permissions: NativeRecorderPermissionMap | null = null;

  try {
    permissions = await requestNativeRecorderPermissionMap(plugin);

    const profile = await plugin.getDeviceProfile();

    return summarizeNativeRecorderReadiness({
      nativeAvailable: true,
      profile,
      permissions,
    });
  } catch (error) {
    return {
      ...summarizeNativeRecorderReadiness({
        nativeAvailable: true,
        permissions,
      }),
      status: "blocked" as const,
      title: "权限初始化失败",
      description: getErrorMessage(error),
    };
  }
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

  return {
    deviceId,
    profile,
  };
}

async function createMobileCallRecord(input: {
  customerId: string;
  correlationId: string;
  triggerSource?: string | null;
  deviceId?: string | null;
  profile?: NativeDeviceProfile | null;
}) {
  const response = await fetch("/api/mobile/calls/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerId: input.customerId,
      correlationId: input.correlationId,
      callTime: new Date().toISOString(),
      clientEventAt: new Date().toISOString(),
      triggerSource: input.triggerSource ?? undefined,
      deviceId: input.deviceId ?? undefined,
      deviceModel: input.profile?.deviceModel ?? undefined,
      androidVersion: input.profile?.androidVersion ?? undefined,
      appVersion: input.profile?.appVersion ?? undefined,
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

export async function recordNativeCallEvent(input: {
  callRecordId: string;
  action:
    | "call.native_dispatched"
    | "call.native_permission_denied"
    | "call.offhook_detected"
    | "call.idle_detected"
    | "call.recording_started"
    | "call.recording_file_ready"
    | "call.recording_unsupported"
    | "call.recording_failed"
    | "call.upload_failed";
  eventId?: string | null;
  deviceId?: string | null;
  profile?: NativeDeviceProfile | null;
  recordingCapability?: NativeRecordingCapability | null;
  durationSeconds?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const response = await fetch(
    `/api/mobile/calls/${encodeURIComponent(input.callRecordId)}/events`,
    {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: input.action,
        eventId: input.eventId ?? undefined,
        clientEventAt: new Date().toISOString(),
        deviceId: input.deviceId ?? undefined,
        deviceModel: input.profile?.deviceModel ?? undefined,
        androidVersion: input.profile?.androidVersion ?? undefined,
        appVersion: input.profile?.appVersion ?? undefined,
        recordingCapability: input.recordingCapability ?? undefined,
        durationSeconds: input.durationSeconds ?? undefined,
        failureCode: input.failureCode ?? undefined,
        failureMessage: input.failureMessage ?? undefined,
        metadata: input.metadata ?? undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "移动端通话事件记录失败。"));
  }
}

async function recordNativeCallEventBestEffort(
  input: Parameters<typeof recordNativeCallEvent>[0],
) {
  try {
    await recordNativeCallEvent(input);
  } catch {
    // Native telemetry should not block launching the user's phone call.
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "原生拨号失败。";
}

export async function startNativeRecordedSimCall(input: {
  customerId: string;
  customerName: string;
  phone: string;
  correlationId: string;
  triggerSource?: string | null;
  onSessionReady?: (session: NativeRecordedCallSessionReady) => void;
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
  let profile: NativeDeviceProfile | null = null;

  try {
    profile = await plugin.getDeviceProfile().catch(() => null);
    const call = await createMobileCallRecord({
      customerId: input.customerId,
      correlationId: input.correlationId,
      triggerSource: input.triggerSource,
      profile,
    });
    const nextCallRecordId = call.callRecordId;
    callRecordId = nextCallRecordId;
    phone = call.phone?.trim() || input.phone;
    input.onSessionReady?.({
      callRecordId,
      phone,
    });

    const permissions = await requestNativeRecorderPermissionMap(plugin);

    if (!nativeRecorderPermissionsReady(permissions)) {
      await recordNativeCallEventBestEffort({
        callRecordId,
        action: "call.native_permission_denied",
        eventId: `permission-denied:${callRecordId}`,
        profile,
        recordingCapability: "BLOCKED",
        failureCode: "NATIVE_PERMISSION_DENIED",
        failureMessage: NATIVE_RECORDER_PERMISSION_MESSAGE,
        metadata: {
          permissions,
          launchCallSupported: false,
          observeCallStateSupported: false,
          recordingSupported: false,
        },
      });

      return {
        nativeAvailable: true,
        nativeStarted: false,
        callRecordId,
        phone,
        errorMessage: NATIVE_RECORDER_PERMISSION_MESSAGE,
      };
    }

    const registeredDevice = await registerNativeMobileDevice(plugin);
    deviceId = registeredDevice.deviceId;
    profile = registeredDevice.profile;
    input.onSessionReady?.({
      callRecordId,
      deviceId,
      phone,
    });

    await plugin.startRecordedSimCall({
      phone,
      callRecordId,
      customerId: input.customerId,
      customerName: call.customerName?.trim() || input.customerName,
      deviceId,
      apiBaseUrl: window.location.origin,
      chunkSizeBytes: 1024 * 1024,
      forceSpeakerphone: false,
    });

    await recordNativeCallEventBestEffort({
      callRecordId,
      action: "call.native_dispatched",
      eventId: `native-dispatched:${callRecordId}`,
      deviceId,
      profile,
      recordingCapability: profile.recordingCapability ?? "UNKNOWN",
      metadata: {
        dispatchSource: "native-recorder",
        launchCallSupported: true,
        observeCallStateSupported: true,
        recordingSupported: true,
      },
    });

    return {
      nativeAvailable: true,
      nativeStarted: true,
      callRecordId,
      deviceId,
      phone,
    };
  } catch (error) {
    const message = getErrorMessage(error);

    if (callRecordId) {
      await recordNativeCallEventBestEffort({
        callRecordId,
        action: message.includes("权限")
          ? "call.native_permission_denied"
          : "call.recording_failed",
        eventId: `native-start-failed:${callRecordId}`,
        deviceId,
        profile,
        recordingCapability: message.includes("权限") ? "BLOCKED" : "UNKNOWN",
        failureCode: message.includes("权限")
          ? "NATIVE_PERMISSION_DENIED"
          : "NATIVE_DISPATCH_FAILED",
        failureMessage: message,
        metadata: {
          launchCallSupported: false,
          observeCallStateSupported: Boolean(deviceId),
          recordingSupported: false,
        },
      });
    }

    return {
      nativeAvailable: true,
      nativeStarted: false,
      callRecordId,
      deviceId,
      phone,
      errorMessage: message,
    };
  }
}

export async function retryNativePendingUploads() {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin?.retryPendingUploads || !canUseNativeCallRecorder()) {
    return { queued: 0 };
  }

  return plugin.retryPendingUploads({
    apiBaseUrl: window.location.origin,
    chunkSizeBytes: 1024 * 1024,
  });
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

export function subscribeNativeCallSessionUpdates(
  listener: (snapshot: NativeCallSessionSnapshot) => void,
) {
  const plugin = getNativeCallRecorderPlugin();

  if (!plugin?.addListener || !canUseNativeCallRecorder()) {
    return () => undefined;
  }

  let removed = false;
  let subscription: NativePluginListenerHandle | null = null;

  try {
    const nextSubscription = plugin.addListener("callRecordingSessionUpdated", (snapshot) => {
      if (!snapshot?.callRecordId) {
        return;
      }

      listener(snapshot);
    });

    void Promise.resolve(nextSubscription)
      .then((resolvedSubscription) => {
        if (!resolvedSubscription?.remove) {
          return;
        }

        if (removed) {
          void resolvedSubscription.remove();
          return;
        }

        subscription = resolvedSubscription;
      })
      .catch(() => {
        subscription = null;
      });
  } catch {
    subscription = null;
  }

  return () => {
    removed = true;
    void subscription?.remove();
    subscription = null;
  };
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
