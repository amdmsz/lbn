import type { OutboundCallProvider, RoleCode } from "@prisma/client";
import { canCreateCallRecord } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  isRuntimeProviderEnabled,
  resolveOutboundCallRuntimeConfig,
} from "@/lib/outbound-calls/config";

export type OutboundCallWebRtcIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type OutboundCallWebRtcConfig = {
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
  iceServers: OutboundCallWebRtcIceServer[];
  preferredCodecs: string[];
  registrationExpiresSeconds: number;
  secureContextRequired: boolean;
};

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeSeatNo(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]/g, "_");
}

function seatEnvSuffix(seatNo: string) {
  return sanitizeSeatNo(seatNo).toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function getBooleanEnv(key: string, fallback = false) {
  const value = process.env[key]?.trim().toLowerCase();

  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }

  if (value === "0" || value === "false" || value === "no") {
    return false;
  }

  return fallback;
}

function getWebRtcPublicHost() {
  return (
    normalizeOptional(process.env.OUTBOUND_CALL_WEBRTC_PUBLIC_HOST) ??
    normalizeOptional(process.env.CTI_ASTERISK_WEBRTC_PUBLIC_HOST) ??
    normalizeOptional(process.env.CTI_ASTERISK_PUBLIC_HOST) ??
    normalizeOptional(process.env.CTI_ASTERISK_HOST) ??
    "127.0.0.1"
  );
}

function getWebRtcSipDomain() {
  return (
    normalizeOptional(process.env.OUTBOUND_CALL_WEBRTC_SIP_DOMAIN) ??
    normalizeOptional(process.env.CTI_ASTERISK_WEBRTC_SIP_DOMAIN) ??
    getWebRtcPublicHost()
  );
}

function getWebRtcWebSocketServer() {
  const explicit =
    normalizeOptional(process.env.OUTBOUND_CALL_WEBRTC_WS_URL) ??
    normalizeOptional(process.env.CTI_ASTERISK_WEBRTC_WS_URL);

  if (explicit) {
    return explicit;
  }

  const protocol =
    normalizeOptional(process.env.CTI_ASTERISK_WEBRTC_WS_PROTOCOL) ??
    (process.env.NODE_ENV === "production" ? "wss" : "ws");
  const port =
    normalizeOptional(process.env.CTI_ASTERISK_WEBRTC_WS_PORT) ??
    (protocol === "wss" ? "8089" : "8088");
  const path = normalizeOptional(process.env.CTI_ASTERISK_WEBRTC_WS_PATH) ?? "/ws";

  return `${protocol}://${getWebRtcPublicHost()}:${port}${path}`;
}

function getSeatPassword(seatNo: string) {
  const suffix = seatEnvSuffix(seatNo);

  return (
    normalizeOptional(process.env[`OUTBOUND_CALL_WEBRTC_SEAT_${suffix}_PASSWORD`]) ??
    normalizeOptional(process.env[`CTI_ASTERISK_SEAT_${suffix}_PASSWORD`]) ??
    normalizeOptional(process.env.OUTBOUND_CALL_WEBRTC_DEFAULT_SEAT_PASSWORD) ??
    normalizeOptional(process.env.CTI_ASTERISK_DEFAULT_SEAT_PASSWORD)
  );
}

function parseIceServers(): OutboundCallWebRtcIceServer[] {
  const raw =
    normalizeOptional(process.env.OUTBOUND_CALL_WEBRTC_ICE_SERVERS_JSON) ??
    normalizeOptional(process.env.CTI_ASTERISK_WEBRTC_ICE_SERVERS_JSON);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    const iceServers: OutboundCallWebRtcIceServer[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const row = item as Record<string, unknown>;
      const urls = row.urls;
      const normalizedUrls =
        typeof urls === "string" && urls.trim()
          ? urls.trim()
          : Array.isArray(urls) &&
              urls.every((url) => typeof url === "string" && url.trim())
            ? urls.map((url) => url.trim())
            : null;

      if (!normalizedUrls) {
        continue;
      }

      iceServers.push({
        urls: normalizedUrls,
        username:
          typeof row.username === "string" && row.username.trim()
            ? row.username.trim()
            : undefined,
        credential:
          typeof row.credential === "string" && row.credential.trim()
            ? row.credential.trim()
            : undefined,
      });
    }

    return iceServers;
  } catch {
    return [];
  }
}

function getPreferredCodecs() {
  return (
    normalizeOptional(process.env.OUTBOUND_CALL_WEBRTC_PREFERRED_CODECS) ??
    "opus,pcma"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getProviderForSeatBinding(provider: string): OutboundCallProvider | null {
  return provider === "MOCK" || provider === "FREESWITCH" || provider === "CUSTOM_HTTP"
    ? provider
    : null;
}

export async function resolveOutboundCallWebRtcConfig(actorId: string) {
  const [runtimeConfig, user] = await Promise.all([
    resolveOutboundCallRuntimeConfig(),
    prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        username: true,
        name: true,
        userStatus: true,
        role: {
          select: {
            code: true,
          },
        },
      },
    }),
  ]);

  if (!user) {
    throw new Error("当前用户不存在。");
  }

  const baseUser = {
    name: user.name ?? user.username,
    username: user.username,
    role: user.role.code,
  };

  const ctiEnabled =
    runtimeConfig.enabled && isRuntimeProviderEnabled(runtimeConfig.provider);
  const webRtcEnabled = getBooleanEnv("OUTBOUND_CALL_WEBRTC_ENABLED", false);

  if (user.userStatus !== "ACTIVE") {
    return disabledConfig(baseUser, ctiEnabled, "当前账号已停用。");
  }

  if (!canCreateCallRecord(user.role.code)) {
    return disabledConfig(baseUser, ctiEnabled, "当前角色不能使用网页坐席。");
  }

  if (!webRtcEnabled) {
    return disabledConfig(baseUser, ctiEnabled, "网页坐席尚未启用。");
  }

  const bindingProvider = getProviderForSeatBinding(runtimeConfig.provider);
  const binding = bindingProvider
    ? await prisma.outboundCallSeatBinding.findFirst({
        where: {
          userId: user.id,
          provider: bindingProvider,
        },
        select: {
          seatNo: true,
          enabled: true,
        },
      })
    : null;

  if (binding && !binding.enabled) {
    return disabledConfig(baseUser, ctiEnabled, "当前账号的外呼坐席已被禁用。");
  }

  const seatNo = sanitizeSeatNo(binding?.seatNo || user.username);
  const password = getSeatPassword(seatNo);
  const sipDomain = getWebRtcSipDomain();
  const webSocketServer = getWebRtcWebSocketServer();

  if (!password) {
    return disabledConfig(baseUser, ctiEnabled, "网页坐席注册密码未配置。");
  }

  return {
    enabled: true,
    unavailableReason: null,
    ctiEnabled,
    user: baseUser,
    seatNo,
    authorizationUser: seatNo,
    displayName: user.name ?? user.username,
    sipUri: `sip:${seatNo}@${sipDomain}`,
    sipDomain,
    webSocketServer,
    password,
    iceServers: parseIceServers(),
    preferredCodecs: getPreferredCodecs(),
    registrationExpiresSeconds: parsePositiveInt(
      process.env.OUTBOUND_CALL_WEBRTC_REGISTER_EXPIRES_SECONDS,
      300,
    ),
    secureContextRequired: true,
  } satisfies OutboundCallWebRtcConfig;
}

function disabledConfig(
  user: OutboundCallWebRtcConfig["user"],
  ctiEnabled: boolean,
  unavailableReason: string,
): OutboundCallWebRtcConfig {
  return {
    enabled: false,
    unavailableReason,
    ctiEnabled,
    user,
    seatNo: null,
    authorizationUser: null,
    displayName: null,
    sipUri: null,
    sipDomain: null,
    webSocketServer: null,
    password: null,
    iceServers: [],
    preferredCodecs: [],
    registrationExpiresSeconds: 300,
    secureContextRequired: true,
  };
}
