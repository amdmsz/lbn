"use client";

import type { RoleCode } from "@prisma/client";
import {
  ChevronDown,
  Clock3,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SimpleUser = import("sip.js/lib/platform/web").SimpleUser;
type SimpleUserDelegate = import("sip.js/lib/platform/web").SimpleUserDelegate;

type WebRtcIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type WebRtcConfig = {
  enabled: boolean;
  unavailableReason: string | null;
  ctiEnabled: boolean;
  user: {
    name: string;
    username: string;
    role: RoleCode;
  };
  seatNo: string | null;
  authorizationUser: string | null;
  displayName: string | null;
  sipUri: string | null;
  sipDomain: string | null;
  webSocketServer: string | null;
  password: string | null;
  iceServers: WebRtcIceServer[];
  preferredCodecs: string[];
  registrationExpiresSeconds: number;
  secureContextRequired: boolean;
};

type SoftphoneStatus =
  | "loading"
  | "disabled"
  | "idle"
  | "connecting"
  | "online"
  | "incoming"
  | "in_call"
  | "failed";

type WebRtcSoftphoneVariant = "desktop" | "mobile";

const statusCopy: Record<SoftphoneStatus, string> = {
  loading: "读取坐席",
  disabled: "未启用",
  idle: "未上线",
  connecting: "注册中",
  online: "坐席在线",
  incoming: "来电中",
  in_call: "通话中",
  failed: "异常",
};

const pillStatusCopy: Record<SoftphoneStatus, string> = {
  loading: "Agent Sync",
  disabled: "Agent Off",
  idle: "Agent Idle",
  connecting: "Connecting",
  online: "Agent Ready",
  incoming: "Incoming",
  in_call: "In Call",
  failed: "Agent Error",
};

const preferredAudioInputStorageKey = "lbncrm.webrtc.preferredAudioInputId";

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(
    2,
    "0",
  )}`;
}

function getStatusDotClassName(status: SoftphoneStatus) {
  if (status === "online" || status === "in_call") {
    return "bg-[var(--color-success)] animate-pulse";
  }

  if (status === "incoming") {
    return "bg-primary animate-pulse";
  }

  if (status === "connecting" || status === "loading") {
    return "bg-[var(--color-warning)]";
  }

  return "bg-[var(--color-danger)]";
}

function getStatusBadgeClassName(status: SoftphoneStatus) {
  if (status === "online" || status === "in_call") {
    return "border-border bg-muted/55 text-[var(--color-success)]";
  }

  if (status === "incoming") {
    return "border-primary/20 bg-primary/10 text-primary";
  }

  if (status === "connecting" || status === "loading") {
    return "border-border bg-muted/55 text-[var(--color-warning)]";
  }

  return "border-border bg-muted/55 text-[var(--color-danger)]";
}

function StatusIcon({ status }: Readonly<{ status: SoftphoneStatus }>) {
  if (status === "loading" || status === "connecting") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  }

  if (status === "online" || status === "in_call") {
    return <Wifi className="h-3.5 w-3.5" />;
  }

  if (status === "incoming") {
    return <PhoneIncoming className="h-3.5 w-3.5" />;
  }

  if (status === "failed") {
    return <WifiOff className="h-3.5 w-3.5" />;
  }

  return <Radio className="h-3.5 w-3.5" />;
}

function canUseSoftphone(role: RoleCode) {
  return role === "ADMIN" || role === "SALES";
}

function getPreferredAudioInputId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(preferredAudioInputStorageKey);
  } catch {
    return null;
  }
}

function savePreferredAudioInputId(deviceId: string | null | undefined) {
  if (typeof window === "undefined" || !deviceId) {
    return;
  }

  try {
    window.localStorage.setItem(preferredAudioInputStorageKey, deviceId);
  } catch {
    // Browser privacy settings may block storage; WebRTC still works with default input.
  }
}

function clearPreferredAudioInputId() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(preferredAudioInputStorageKey);
  } catch {
    // Ignore storage failures; the next permission flow can rediscover devices.
  }
}

function buildAudioConstraints(deviceId?: string | null): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

function getWebRtcSoftphoneErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "网页坐席注册失败";
  }

  const name = error.name;
  const message = error.message.toLowerCase();

  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    message.includes("requested device not found") ||
    message.includes("device not found")
  ) {
    return "未检测到麦克风或耳麦，请插入并启用输入设备后重新启用坐席。";
  }

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "浏览器麦克风权限被拒绝，请在地址栏站点权限中允许麦克风。";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "麦克风被系统或其他软件占用，请关闭占用程序后重新启用坐席。";
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "已保存的麦克风不可用，系统已重置设备选择，请重新启用坐席。";
  }

  if (name === "SecurityError") {
    return "浏览器安全策略阻止麦克风，请使用 HTTPS 的 crm.cclbn.com 访问。";
  }

  return error.message || "网页坐席注册失败";
}

function isLocalSecureEnough() {
  if (typeof window === "undefined") {
    return true;
  }

  if (window.isSecureContext) {
    return true;
  }

  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
    window.location.hostname,
  );
}

async function fetchWebRtcConfig() {
  const response = await fetch("/api/outbound-calls/webrtc-config", {
    cache: "no-store",
  });
  const payload = (await response.json()) as WebRtcConfig & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "网页坐席配置读取失败。");
  }

  return payload;
}

export function WebRtcSoftphone({
  role,
  variant = "desktop",
}: Readonly<{
  role: RoleCode;
  variant?: WebRtcSoftphoneVariant;
}>) {
  const [config, setConfig] = useState<WebRtcConfig | null>(null);
  const [status, setStatus] = useState<SoftphoneStatus>("idle");
  const [message, setMessage] = useState("点击展开后读取网页坐席配置");
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [incomingStartedAt, setIncomingStartedAt] = useState<number | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [lastCallSeconds, setLastCallSeconds] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userRef = useRef<SimpleUser | null>(null);
  const mountedRef = useRef(true);
  const callStartedAtRef = useRef<number | null>(null);
  const statusRef = useRef<SoftphoneStatus>("idle");
  const configRef = useRef<WebRtcConfig | null>(null);
  const configLoadPromiseRef = useRef<Promise<WebRtcConfig | null> | null>(null);
  const preferredAudioInputIdRef = useRef<string | null>(null);
  const lastAudioInputIdsRef = useRef<Set<string>>(new Set());

  const safeSetStatus = useCallback(
    (nextStatus: SoftphoneStatus, nextMessage?: string) => {
      if (!mountedRef.current) {
        return;
      }

      setStatus(nextStatus);

      if (nextMessage) {
        setMessage(nextMessage);
      }
    },
    [],
  );

  const activeStartedAt =
    status === "incoming"
      ? incomingStartedAt
      : status === "in_call"
        ? callStartedAt
        : null;
  const activeSeconds = activeStartedAt
    ? Math.floor((now - activeStartedAt) / 1000)
    : null;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const ensureConfigLoaded = useCallback(async () => {
    if (!canUseSoftphone(role)) {
      safeSetStatus("disabled", "当前角色不需要网页坐席");
      return null;
    }

    if (configRef.current) {
      return configRef.current;
    }

    if (configLoadPromiseRef.current) {
      return configLoadPromiseRef.current;
    }

    safeSetStatus("loading", "正在读取网页坐席配置");

    const promise = fetchWebRtcConfig()
      .then((nextConfig) => {
        configRef.current = nextConfig;

        if (!mountedRef.current) {
          return nextConfig;
        }

        setConfig(nextConfig);

        if (!nextConfig.enabled) {
          safeSetStatus("disabled", nextConfig.unavailableReason ?? "网页坐席尚未启用");
          return nextConfig;
        }

        if (!nextConfig.ctiEnabled) {
          safeSetStatus("idle", "CTI 网关未启用，坐席可注册但不能发起外呼");
          return nextConfig;
        }

        safeSetStatus("idle", "点击启用后接收 CRM 外呼");
        return nextConfig;
      })
      .catch((error) => {
        if (mountedRef.current) {
          safeSetStatus(
            "failed",
            error instanceof Error ? error.message : "网页坐席配置异常",
          );
        }

        return null;
      })
      .finally(() => {
        configLoadPromiseRef.current = null;
      });

    configLoadPromiseRef.current = promise;
    return promise;
  }, [role, safeSetStatus]);

  useEffect(() => {
    const activeCall = status === "incoming" || status === "in_call";

    void window.lbnDesktop?.setCallActive(activeCall).catch(() => undefined);

    if (status === "incoming") {
      void window.lbnDesktop
        ?.notify({
          title: "CRM 外呼来电",
          body: "请在桌面坐席接听。",
        })
        .catch(() => undefined);
    }
  }, [status]);

  useEffect(() => {
    return () => {
      void window.lbnDesktop?.setCallActive(false).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (status !== "incoming" && status !== "in_call") {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "incoming" || status === "in_call") {
      setExpanded(true);
    }
  }, [status]);

  useEffect(() => {
    if (!expanded || configRef.current || status === "loading" || status === "failed") {
      return;
    }

    void ensureConfigLoaded();
  }, [ensureConfigLoaded, expanded, status]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      const currentUser = userRef.current;
      userRef.current = null;

      if (currentUser?.isConnected()) {
        void currentUser
          .unregister()
          .catch(() => undefined)
          .finally(() => {
            void currentUser.disconnect().catch(() => undefined);
          });
      }
    };
  }, []);

  const attachRemoteAudio = useCallback(() => {
    const currentAudio = audioRef.current;
    const currentUser = userRef.current;

    if (!currentAudio || !currentUser?.remoteMediaStream) {
      return;
    }

    currentAudio.srcObject = currentUser.remoteMediaStream;
    void currentAudio.play().catch(() => {
      setMessage("浏览器阻止了自动播放，请点击接听后保持页面激活");
    });
  }, []);

  const refreshAudioInputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput");
      const nextIds = new Set(
        audioInputs
          .map((device) => device.deviceId)
          .filter((deviceId) => deviceId && deviceId !== "default"),
      );
      const storedDeviceId = getPreferredAudioInputId();

      if (storedDeviceId && nextIds.size > 0 && !nextIds.has(storedDeviceId)) {
        clearPreferredAudioInputId();
        preferredAudioInputIdRef.current = null;

        if (statusRef.current !== "loading" && statusRef.current !== "disabled") {
          setMessage("麦克风设备已变更，请确认当前耳麦后重新启用坐席");
        }
      } else if (!storedDeviceId) {
        const preferredDevice = audioInputs.find(
          (device) => device.deviceId && device.deviceId !== "default",
        );

        if (preferredDevice?.deviceId) {
          savePreferredAudioInputId(preferredDevice.deviceId);
          preferredAudioInputIdRef.current = preferredDevice.deviceId;
        }
      }

      lastAudioInputIdsRef.current = nextIds;
    } catch {
      // enumerateDevices can fail before permission is granted; getUserMedia will surface the real error.
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void refreshAudioInputDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [refreshAudioInputDevices]);

  const connect = useCallback(async () => {
    const currentConfig = configRef.current ?? (await ensureConfigLoaded());

    if (!currentConfig?.enabled) {
      return;
    }

    if (
      !currentConfig.webSocketServer ||
      !currentConfig.sipUri ||
      !currentConfig.authorizationUser ||
      !currentConfig.password
    ) {
      safeSetStatus("failed", "网页坐席配置不完整");
      return;
    }

    if (currentConfig.secureContextRequired && !isLocalSecureEnough()) {
      safeSetStatus(
        "failed",
        "浏览器麦克风需要 HTTPS；本地请用 localhost，生产请用 crm.cclbn.com",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      safeSetStatus("failed", "当前浏览器不支持网页通话");
      return;
    }

    safeSetStatus("connecting", "正在授权麦克风并注册坐席");

    try {
      let preferredAudioInputId = getPreferredAudioInputId();
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(preferredAudioInputId),
          video: false,
        });
      } catch (error) {
        if (!preferredAudioInputId) {
          throw error;
        }

        clearPreferredAudioInputId();
        preferredAudioInputId = null;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(),
          video: false,
        });
      }

      const selectedAudioInputId =
        stream.getAudioTracks()[0]?.getSettings().deviceId ?? preferredAudioInputId;

      preferredAudioInputIdRef.current = selectedAudioInputId ?? null;
      savePreferredAudioInputId(selectedAudioInputId);
      stream.getTracks().forEach((track) => track.stop());
      void refreshAudioInputDevices();

      const sipModule = await import("sip.js");
      const delegate: SimpleUserDelegate = {
        onServerConnect: () => {
          safeSetStatus("connecting", "已连接 Asterisk，正在注册");
        },
        onServerDisconnect: (error) => {
          safeSetStatus(
            "failed",
            error ? `坐席连接断开：${error.message}` : "坐席连接已断开",
          );
        },
        onRegistered: () => {
          safeSetStatus("online", "可接收 CRM 外呼");
        },
        onUnregistered: () => {
          safeSetStatus("idle", "坐席已下线");
        },
        onCallReceived: () => {
          const startedAt = Date.now();
          setIncomingStartedAt(startedAt);
          setCallStartedAt(null);
          callStartedAtRef.current = null;
          setLastCallSeconds(null);
          safeSetStatus("incoming", "CRM 外呼来电，请接听");
        },
        onCallAnswered: () => {
          const startedAt = Date.now();
          setIncomingStartedAt(null);
          setCallStartedAt(startedAt);
          callStartedAtRef.current = startedAt;
          setLastCallSeconds(null);
          setMuted(false);
          attachRemoteAudio();
          safeSetStatus("in_call", "通话已接通，录音由 Asterisk 服务端保存");
        },
        onCallHangup: () => {
          setLastCallSeconds(
            callStartedAtRef.current
              ? Math.floor((Date.now() - callStartedAtRef.current) / 1000)
              : null,
          );
          setIncomingStartedAt(null);
          setCallStartedAt(null);
          callStartedAtRef.current = null;
          setMuted(false);
          safeSetStatus("online", "通话结束，坐席在线");
        },
      };

      const nextUser: SimpleUser = new sipModule.Web.SimpleUser(
        currentConfig.webSocketServer,
        {
          aor: currentConfig.sipUri,
          delegate,
          media: {
            constraints: {
              audio: true,
              video: false,
            },
            remote: {
              audio: audioRef.current ?? undefined,
            },
          },
          reconnectionAttempts: 5,
          reconnectionDelay: 3,
          registererOptions: {
            expires: currentConfig.registrationExpiresSeconds,
          },
          userAgentOptions: {
            authorizationPassword: currentConfig.password,
            authorizationUsername: currentConfig.authorizationUser,
            contactName: currentConfig.seatNo ?? currentConfig.authorizationUser,
            displayName: currentConfig.displayName ?? currentConfig.authorizationUser,
            logBuiltinEnabled: false,
            sessionDescriptionHandlerFactoryOptions: {
              iceGatheringTimeout: 5000,
              peerConnectionConfiguration: {
                iceServers: currentConfig.iceServers,
              },
            },
            userAgentString: "JiuzhuangCRM-WebRTC-Seat",
          },
        },
      );

      userRef.current = nextUser;

      await nextUser.connect();
      await nextUser.register();
      safeSetStatus("online", "可接收 CRM 外呼");
    } catch (error) {
      const currentUser = userRef.current;
      userRef.current = null;
      setMuted(false);
      setIncomingStartedAt(null);
      setCallStartedAt(null);
      callStartedAtRef.current = null;

      if (currentUser?.isConnected()) {
        void currentUser.disconnect().catch(() => undefined);
      }

      safeSetStatus(
        "failed",
        getWebRtcSoftphoneErrorMessage(error),
      );
    }
  }, [attachRemoteAudio, ensureConfigLoaded, refreshAudioInputDevices, safeSetStatus]);

  const reconnectIfReady = useCallback(
    (reason: "network" | "desktop") => {
      const currentConfig = configRef.current;
      const currentStatus = statusRef.current;

      if (!currentConfig?.enabled) {
        return;
      }

      if (
        currentStatus === "loading" ||
        currentStatus === "disabled" ||
        currentStatus === "connecting" ||
        currentStatus === "incoming" ||
        currentStatus === "in_call"
      ) {
        return;
      }

      if (currentStatus === "online" && userRef.current?.isConnected()) {
        return;
      }

      setMessage(
        reason === "desktop"
          ? "桌面端已恢复，正在重新注册坐席"
          : "网络已恢复，正在重新注册坐席",
      );
      void connect();
    },
    [connect],
  );

  useEffect(() => {
    const handleOnline = () => reconnectIfReady("network");
    const handleOffline = () => {
      if (statusRef.current !== "loading" && statusRef.current !== "disabled") {
        setMessage("网络已断开，恢复后会尝试重新注册坐席");
      }
    };
    const removeDesktopListener = window.lbnDesktop?.onNetworkStatus((event) => {
      if (
        event.state === "resume" ||
        event.state === "unlock-screen" ||
        event.state === "loaded"
      ) {
        reconnectIfReady("desktop");
        return;
      }

      if (event.state === "load-failed") {
        setMessage("桌面端网络加载异常，请检查 CRM 连接后重试");
      }
    });

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      removeDesktopListener?.();
    };
  }, [reconnectIfReady]);

  useEffect(() => {
    if (!config?.enabled || status !== "idle") {
      return;
    }

    if (!navigator.permissions?.query || !isLocalSecureEnough()) {
      return;
    }

    let canceled = false;

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((permission) => {
        if (!canceled && permission.state === "granted") {
          void connect();
        }
      })
      .catch(() => undefined);

    return () => {
      canceled = true;
    };
  }, [config?.enabled, connect, status]);

  const disconnect = useCallback(async () => {
    const currentUser = userRef.current;

    if (!currentUser) {
      safeSetStatus("idle", "坐席已下线");
      return;
    }

    try {
      if (status === "incoming" || status === "in_call") {
        await currentUser.hangup();
      }

      await currentUser.unregister().catch(() => undefined);
      await currentUser.disconnect().catch(() => undefined);
      userRef.current = null;
      setMuted(false);
      setIncomingStartedAt(null);
      setCallStartedAt(null);
      callStartedAtRef.current = null;
      safeSetStatus("idle", "坐席已下线");
    } catch (error) {
      safeSetStatus(
        "failed",
        error instanceof Error ? error.message : "坐席下线失败",
      );
    }
  }, [safeSetStatus, status]);

  const answer = useCallback(async () => {
    const currentUser = userRef.current;

    if (!currentUser) {
      return;
    }

    try {
      await currentUser.answer();
      attachRemoteAudio();
    } catch (error) {
      safeSetStatus(
        "failed",
        error instanceof Error ? error.message : "接听失败",
      );
    }
  }, [attachRemoteAudio, safeSetStatus]);

  const decline = useCallback(async () => {
    const currentUser = userRef.current;

    if (!currentUser) {
      return;
    }

    try {
      await currentUser.decline();
      setIncomingStartedAt(null);
      callStartedAtRef.current = null;
      safeSetStatus("online", "已拒接，坐席在线");
    } catch (error) {
      safeSetStatus(
        "failed",
        error instanceof Error ? error.message : "拒接失败",
      );
    }
  }, [safeSetStatus]);

  const hangup = useCallback(async () => {
    const currentUser = userRef.current;

    if (!currentUser) {
      return;
    }

    try {
      await currentUser.hangup();
      setLastCallSeconds(
        callStartedAtRef.current
          ? Math.floor((Date.now() - callStartedAtRef.current) / 1000)
          : null,
      );
      setIncomingStartedAt(null);
      setCallStartedAt(null);
      callStartedAtRef.current = null;
      setMuted(false);
      safeSetStatus("online", "通话已挂断，坐席在线");
    } catch (error) {
      safeSetStatus(
        "failed",
        error instanceof Error ? error.message : "挂断失败",
      );
    }
  }, [safeSetStatus]);

  useEffect(() => {
    const removeCommandListener = window.lbnDesktop?.softphone.onCommand((event) => {
      if (event.command === "focusDialpad") {
        setExpanded(true);
        void ensureConfigLoaded();
        return;
      }

      if (event.command === "hangupActiveCall") {
        setExpanded(true);

        if (statusRef.current === "incoming") {
          void decline();
          return;
        }

        if (statusRef.current === "in_call") {
          void hangup();
        }
      }
    });

    return () => {
      removeCommandListener?.();
    };
  }, [decline, ensureConfigLoaded, hangup]);

  const toggleMute = useCallback(() => {
    const currentUser = userRef.current;

    if (!currentUser) {
      return;
    }

    if (currentUser.isMuted()) {
      currentUser.unmute();
      setMuted(false);
      return;
    }

    currentUser.mute();
    setMuted(true);
  }, []);

  if (!canUseSoftphone(role)) {
    return null;
  }

  const activeCall = status === "incoming" || status === "in_call";
  const widgetExpanded = expanded || activeCall;
  const statusDotClassName = getStatusDotClassName(status);
  const statusBadgeClassName = getStatusBadgeClassName(status);
  const pillLabel = activeSeconds !== null ? formatElapsed(activeSeconds) : pillStatusCopy[status];
  const seatLabel = config?.seatNo ?? config?.authorizationUser ?? "No seat";
  const mobileVariant = variant === "mobile";

  return (
    <div
      className={cn(
        "fixed flex justify-end text-[13px]",
        mobileVariant
          ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 max-w-[calc(100vw-1.5rem)]"
          : "bottom-6 right-6 max-w-[calc(100vw-3rem)]",
        activeCall ? "z-[10010]" : mobileVariant ? "z-[70]" : "z-40",
      )}
    >
      <audio ref={audioRef} autoPlay />

      {!widgetExpanded ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            void ensureConfigLoaded();
          }}
          aria-expanded="false"
          aria-label={`打开网页坐席，当前状态：${statusCopy[status]}`}
          className="group inline-flex max-w-full items-center gap-2 rounded-full border border-border/50 bg-background/85 px-4 py-2 text-left text-foreground shadow-2xl backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:bg-background/95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClassName}`} />
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition group-hover:bg-muted">
            <StatusIcon status={status} />
          </span>
          <span className="min-w-0 truncate text-xs font-semibold">{pillLabel}</span>
          {config?.seatNo ? (
            <span className="hidden max-w-20 truncate font-mono text-[11px] text-muted-foreground sm:inline">
              {config.seatNo}
            </span>
          ) : null}
        </button>
      ) : (
        <div
          className={cn(
            "rounded-2xl border border-border/50 bg-background/85 p-4 text-foreground shadow-2xl backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
            mobileVariant ? "w-72 max-w-[calc(100vw-1.5rem)]" : "w-72",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClassName}`} />
                <p className="truncate text-sm font-semibold">WebRTC Agent</p>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium ${statusBadgeClassName}`}>
                  {statusCopy[status]}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {seatLabel}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              disabled={activeCall}
              aria-label="收起网页坐席"
              aria-expanded="true"
              title={activeCall ? "通话中保持展开" : "收起"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-border/60 bg-muted/35 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Session
                </p>
                <p className="mt-1 truncate font-mono text-lg font-semibold tabular-nums text-foreground">
                  {activeSeconds !== null
                    ? formatElapsed(activeSeconds)
                    : lastCallSeconds !== null
                      ? formatElapsed(lastCallSeconds)
                      : "--:--"}
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-muted-foreground">
                <Clock3 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {message}
            </p>
            {lastCallSeconds !== null && activeSeconds === null ? (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                Last call {formatElapsed(lastCallSeconds)}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            {status === "idle" || status === "failed" ? (
              <button
                type="button"
                disabled={config !== null && !config.enabled}
                onClick={() => void connect()}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                启用坐席
              </button>
            ) : null}

            {status === "incoming" ? (
              <>
                <button
                  type="button"
                  onClick={() => void answer()}
                  aria-label="接听"
                  title="接听"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-success)] text-white shadow-lg transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void decline()}
                  aria-label="拒接"
                  title="拒接"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition hover:bg-muted hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}

            {status === "in_call" ? (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? "取消静音" : "静音"}
                  title={muted ? "取消静音" : "静音"}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                >
                  {muted ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="转接暂未接入"
                  title="转接暂未接入"
                  className="inline-flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-full border border-border bg-background/50 text-muted-foreground opacity-45"
                >
                  <PhoneIncoming className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void hangup()}
                  aria-label="挂断"
                  title="挂断"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow-lg transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}

            {status === "online" ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                aria-label="坐席下线"
                title="坐席下线"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/70 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <WifiOff className="h-3.5 w-3.5" />
                下线
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
