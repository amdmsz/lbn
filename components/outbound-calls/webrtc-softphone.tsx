"use client";

import type { RoleCode } from "@prisma/client";
import {
  ChevronDown,
  ChevronUp,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(
    2,
    "0",
  )}`;
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
}: Readonly<{
  role: RoleCode;
}>) {
  const [config, setConfig] = useState<WebRtcConfig | null>(null);
  const [status, setStatus] = useState<SoftphoneStatus>("loading");
  const [message, setMessage] = useState("正在读取网页坐席配置");
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

  const statusTone = useMemo(() => {
    if (status === "online" || status === "in_call") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (status === "incoming") {
      return "border-sky-200 bg-sky-50 text-sky-700";
    }

    if (status === "failed") {
      return "border-red-200 bg-red-50 text-red-700";
    }

    return "border-neutral-200 bg-white text-neutral-600";
  }, [status]);

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
    mountedRef.current = true;

    if (!canUseSoftphone(role)) {
      setStatus("disabled");
      setMessage("当前角色不需要网页坐席");
      return;
    }

    let canceled = false;

    void fetchWebRtcConfig()
      .then((nextConfig) => {
        if (canceled) {
          return;
        }

        setConfig(nextConfig);

        if (!nextConfig.enabled) {
          setStatus("disabled");
          setMessage(nextConfig.unavailableReason ?? "网页坐席尚未启用");
          return;
        }

        if (!nextConfig.ctiEnabled) {
          setStatus("idle");
          setMessage("CTI 网关未启用，坐席可注册但不能发起外呼");
          return;
        }

        setStatus("idle");
        setMessage("点击启用后接收 CRM 外呼");
      })
      .catch((error) => {
        if (canceled) {
          return;
        }

        setStatus("failed");
        setMessage(error instanceof Error ? error.message : "网页坐席配置异常");
      });

    return () => {
      canceled = true;
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
  }, [role]);

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

  const connect = useCallback(async () => {
    if (!config?.enabled) {
      return;
    }

    if (
      !config.webSocketServer ||
      !config.sipUri ||
      !config.authorizationUser ||
      !config.password
    ) {
      safeSetStatus("failed", "网页坐席配置不完整");
      return;
    }

    if (config.secureContextRequired && !isLocalSecureEnough()) {
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      stream.getTracks().forEach((track) => track.stop());

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
        config.webSocketServer,
        {
          aor: config.sipUri,
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
            expires: config.registrationExpiresSeconds,
          },
          userAgentOptions: {
            authorizationPassword: config.password,
            authorizationUsername: config.authorizationUser,
            contactName: config.seatNo ?? config.authorizationUser,
            displayName: config.displayName ?? config.authorizationUser,
            logBuiltinEnabled: false,
            sessionDescriptionHandlerFactoryOptions: {
              iceGatheringTimeout: 5000,
              peerConnectionConfiguration: {
                iceServers: config.iceServers,
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
        error instanceof Error ? error.message : "网页坐席注册失败",
      );
    }
  }, [attachRemoteAudio, config, safeSetStatus]);

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

  return (
    <div className="fixed bottom-4 right-4 z-40 flex w-[min(21rem,calc(100vw-2rem))] justify-end text-[13px]">
      <audio ref={audioRef} autoPlay />

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded="false"
          aria-label={`打开网页坐席，当前状态：${statusCopy[status]}`}
          className="inline-flex h-11 max-w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 text-left shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur transition hover:border-neutral-300 hover:bg-white"
        >
          <span
            className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${statusTone}`}
          >
            <StatusIcon status={status} />
            {statusCopy[status]}
          </span>
          <span className="min-w-0 truncate text-xs font-medium text-neutral-800">
            网页坐席
          </span>
          {config?.seatNo ? (
            <span className="hidden max-w-20 truncate text-xs text-neutral-500 sm:inline">
              {config.seatNo}
            </span>
          ) : null}
          <ChevronUp className="h-4 w-4 shrink-0 text-neutral-400" />
        </button>
      ) : (
        <div className="w-full rounded-lg border border-neutral-200 bg-white/95 p-3 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${statusTone}`}
                >
                  <StatusIcon status={status} />
                  {statusCopy[status]}
                </span>
                {config?.seatNo ? (
                  <span className="truncate text-xs text-neutral-500">
                    {config.seatNo}
                  </span>
                ) : null}
                {activeSeconds !== null ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs tabular-nums text-neutral-600">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatElapsed(activeSeconds)}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">
                {message}
              </p>
              {lastCallSeconds !== null ? (
                <p className="mt-1 text-xs tabular-nums text-neutral-500">
                  上次坐席通话 {formatElapsed(lastCallSeconds)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="收起网页坐席"
              aria-expanded="true"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status === "idle" || status === "failed" ? (
              <button
                type="button"
                disabled={!config?.enabled}
                onClick={() => void connect()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-950 px-3 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                启用网页坐席
              </button>
            ) : null}

            {status === "incoming" ? (
              <>
                <button
                  type="button"
                  onClick={() => void answer()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  接听
                </button>
                <button
                  type="button"
                  onClick={() => void decline()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                  拒接
                </button>
              </>
            ) : null}

            {status === "in_call" ? (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  {muted ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                  {muted ? "取消静音" : "静音"}
                </button>
                <button
                  type="button"
                  onClick={() => void hangup()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white transition hover:bg-red-700"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                  挂断
                </button>
              </>
            ) : null}

            {status === "online" ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
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
