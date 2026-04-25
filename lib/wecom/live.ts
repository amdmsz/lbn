import {
  getWecomJson,
  postWecomJson,
  type WecomClientConfig,
} from "@/lib/wecom/client";

export const WECOM_LIVE_ENDPOINTS = {
  listUserAllLivingIds: "/cgi-bin/living/get_user_all_livingid",
  getLivingInfo: "/cgi-bin/living/get_living_info",
  getWatchStat: "/cgi-bin/living/get_watch_stat",
} as const;

export type WecomLivingIdItem = {
  livingid: string;
  status?: number | string;
  start_time?: number;
  end_time?: number;
};

export type WecomLivingInfo = {
  livingid: string;
  theme?: string;
  living_start?: number;
  living_duration?: number;
  status?: number | string;
  description?: string;
  anchor_userid?: string;
  main_department?: number;
  viewer_num?: number;
  comment_num?: number;
  mic_num?: number;
  open_replay?: number;
  replay_status?: number;
  online_count?: number;
  subscribe_count?: number;
  [key: string]: unknown;
};

type WecomLivingInfoResponse = WecomLivingInfo & {
  living_info?: WecomLivingInfo;
};

export type WecomWatchStatViewer = {
  userid?: string;
  external_userid?: string;
  name?: string;
  nickname?: string;
  phone?: string;
  mobile?: string;
  watch_time?: number;
  watch_duration?: number;
  enter_time?: number;
  leave_time?: number;
  [key: string]: unknown;
};

export type WecomWatchStat = {
  livingid?: string;
  viewer_num?: number;
  total_watch_time?: number;
  peak_online_count?: number;
  next_key?: string;
  ending?: number;
  viewers?: WecomWatchStatViewer[];
  stat_info?: WecomWatchStatViewer[];
  watch_stat?: WecomWatchStatViewer[];
  [key: string]: unknown;
};

function fromUnixSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(value * 1000);
}

function unwrapLivingInfo(payload: WecomLivingInfoResponse) {
  return payload.living_info ?? payload;
}

function getViewerRows(payload: WecomWatchStat) {
  return payload.viewers ?? payload.stat_info ?? payload.watch_stat ?? [];
}

export function normalizeWecomLivingInfo(
  livingid: string,
  rawPayload: WecomLivingInfoResponse,
) {
  const payload = unwrapLivingInfo(rawPayload);
  const startAt = fromUnixSeconds(payload.living_start) ?? new Date();
  const durationSeconds =
    typeof payload.living_duration === "number" ? payload.living_duration : null;

  return {
    livingid: payload.livingid || livingid,
    title: payload.theme?.trim() || `企业微信直播 ${livingid}`,
    hostName: payload.anchor_userid?.trim() || "企业微信主播",
    startAt,
    actualStartAt: fromUnixSeconds(payload.living_start),
    actualEndAt:
      startAt && durationSeconds && durationSeconds > 0
        ? new Date(startAt.getTime() + durationSeconds * 1000)
        : null,
    anchorUserId: payload.anchor_userid?.trim() || null,
    status: payload.status == null ? null : String(payload.status),
    viewerCount: typeof payload.viewer_num === "number" ? payload.viewer_num : null,
    peakOnlineCount:
      typeof payload.online_count === "number" ? payload.online_count : null,
    raw: rawPayload,
  };
}

export function normalizeWecomWatchStat(livingid: string, payload: WecomWatchStat) {
  const viewers = getViewerRows(payload).map((viewer) => ({
    wecomUserId: viewer.userid?.trim() || null,
    wecomExternalUserId: viewer.external_userid?.trim() || null,
    nickname: viewer.nickname?.trim() || viewer.name?.trim() || null,
    phone: viewer.phone?.trim() || viewer.mobile?.trim() || null,
    watchDurationSeconds:
      typeof viewer.watch_duration === "number"
        ? viewer.watch_duration
        : typeof viewer.watch_time === "number"
          ? viewer.watch_time
          : null,
    firstEnterAt: fromUnixSeconds(viewer.enter_time),
    lastLeaveAt: fromUnixSeconds(viewer.leave_time),
    raw: viewer,
  }));

  return {
    livingid: payload.livingid || livingid,
    viewerCount: typeof payload.viewer_num === "number" ? payload.viewer_num : null,
    totalWatchDurationSeconds:
      typeof payload.total_watch_time === "number" ? payload.total_watch_time : null,
    peakOnlineCount:
      typeof payload.peak_online_count === "number" ? payload.peak_online_count : null,
    nextKey: typeof payload.next_key === "string" ? payload.next_key : null,
    ending: payload.ending === 1,
    viewers,
    raw: payload,
  };
}

export function extractLivingIds(response: {
  livingids?: string[];
  livingid_list?: WecomLivingIdItem[];
}) {
  const direct = response.livingids ?? [];
  const listed = response.livingid_list?.map((item) => item.livingid) ?? [];

  return [...new Set([...direct, ...listed].filter(Boolean))];
}

export async function listUserAllLivingIds(
  input: { userid: string; cursor?: string; limit?: number },
  config?: WecomClientConfig,
) {
  return postWecomJson<{
    errcode?: number;
    errmsg?: string;
    livingids?: string[];
    livingid_list?: WecomLivingIdItem[];
    next_cursor?: string;
  }>(
    WECOM_LIVE_ENDPOINTS.listUserAllLivingIds,
    {
      userid: input.userid,
      cursor: input.cursor ?? "",
      limit: input.limit ?? 100,
    },
    config,
  );
}

export async function getLivingInfo(livingid: string, config?: WecomClientConfig) {
  const response = await getWecomJson<WecomLivingInfoResponse>(
    WECOM_LIVE_ENDPOINTS.getLivingInfo,
    { livingid },
    config,
  );

  return normalizeWecomLivingInfo(livingid, response);
}

export async function getWatchStat(
  livingid: string,
  input: { nextKey?: string; limit?: number } = {},
  config?: WecomClientConfig,
) {
  const response = await postWecomJson<WecomWatchStat>(
    WECOM_LIVE_ENDPOINTS.getWatchStat,
    {
      livingid,
      next_key: input.nextKey ?? "",
      limit: input.limit ?? 100,
    },
    config,
  );

  return normalizeWecomWatchStat(livingid, response);
}
