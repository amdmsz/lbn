const WECOM_API_BASE_URL = "https://qyapi.weixin.qq.com";
const ACCESS_TOKEN_SKEW_SECONDS = 120;

type AccessTokenCache = {
  token: string;
  expiresAt: number;
};

let accessTokenCache: AccessTokenCache | null = null;

export type WecomClientConfig = {
  corpId?: string;
  secret?: string;
  baseUrl?: string;
};

export class WecomApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly response?: unknown,
  ) {
    super(message);
    this.name = "WecomApiError";
  }
}

function getRequiredConfig(config: WecomClientConfig = {}) {
  const corpId = config.corpId ?? process.env.WECOM_CORP_ID?.trim();
  const secret = config.secret ?? process.env.WECOM_LIVE_SECRET?.trim();
  const baseUrl = config.baseUrl ?? WECOM_API_BASE_URL;

  if (!corpId || !secret) {
    throw new WecomApiError(
      "企业微信直播同步缺少 WECOM_CORP_ID 或 WECOM_LIVE_SECRET 配置。",
    );
  }

  return { corpId, secret, baseUrl };
}

export function isWecomLiveSyncEnabled() {
  return process.env.WECOM_LIVE_SYNC_ENABLED?.trim().toLowerCase() === "true";
}

export async function getWecomAccessToken(config: WecomClientConfig = {}) {
  const resolved = getRequiredConfig(config);
  const now = Date.now();

  if (accessTokenCache && accessTokenCache.expiresAt > now) {
    return accessTokenCache.token;
  }

  const url = new URL("/cgi-bin/gettoken", resolved.baseUrl);
  url.searchParams.set("corpid", resolved.corpId);
  url.searchParams.set("corpsecret", resolved.secret);

  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    throw new WecomApiError(`企业微信 token 请求失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    errcode?: number;
    errmsg?: string;
    access_token?: string;
    expires_in?: number;
  };

  if (payload.errcode && payload.errcode !== 0) {
    throw new WecomApiError(
      `企业微信 token 请求失败：${payload.errmsg ?? payload.errcode}`,
      payload.errcode,
      payload,
    );
  }

  if (!payload.access_token) {
    throw new WecomApiError("企业微信 token 响应缺少 access_token。", undefined, payload);
  }

  const expiresInSeconds = Math.max(
    60,
    (payload.expires_in ?? 7200) - ACCESS_TOKEN_SKEW_SECONDS,
  );

  accessTokenCache = {
    token: payload.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  };

  return payload.access_token;
}

export async function postWecomJson<TResponse>(
  path: string,
  body: unknown,
  config: WecomClientConfig = {},
): Promise<TResponse> {
  const resolved = getRequiredConfig(config);
  const accessToken = await getWecomAccessToken(config);
  const url = new URL(path, resolved.baseUrl);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new WecomApiError(`企业微信接口请求失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TResponse & {
    errcode?: number;
    errmsg?: string;
  };

  if (payload.errcode && payload.errcode !== 0) {
    throw new WecomApiError(
      `企业微信接口请求失败：${payload.errmsg ?? payload.errcode}`,
      payload.errcode,
      payload,
    );
  }

  return payload;
}

export async function getWecomJson<TResponse>(
  path: string,
  params: Record<string, string>,
  config: WecomClientConfig = {},
): Promise<TResponse> {
  const resolved = getRequiredConfig(config);
  const accessToken = await getWecomAccessToken(config);
  const url = new URL(path, resolved.baseUrl);
  url.searchParams.set("access_token", accessToken);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    throw new WecomApiError(`企业微信接口请求失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TResponse & {
    errcode?: number;
    errmsg?: string;
  };

  if (payload.errcode && payload.errcode !== 0) {
    throw new WecomApiError(
      `企业微信接口请求失败：${payload.errmsg ?? payload.errcode}`,
      payload.errcode,
      payload,
    );
  }

  return payload;
}
