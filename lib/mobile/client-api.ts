"use client";

export class MobileApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
  }
}

export type MobileApiDashboard = {
  todayFollowUps: number;
  monthlyCalls: number;
  monthlySalesVolume: string;
};

export type MobileApiCustomerListItem = {
  id: string;
  name: string;
  phoneMasked: string;
  level: "A" | "B" | "C" | "D" | "E";
  status: string;
  ownershipMode: string;
  ownerId: string | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  region: string;
  lastFollowUpAt: string | null;
  latestFollowUpTask: {
    id: string;
    type: string;
    status: string;
    dueAt: string;
    completedAt: string | null;
  } | null;
  latestCall: {
    id: string;
    callTime: string;
    durationSeconds: number;
    result: string | null;
    resultCode: string | null;
    nextFollowUpAt: string | null;
  } | null;
  latestWechatRecord: {
    id: string;
    addedStatus: string;
    addedAt: string | null;
    nextFollowUpAt: string | null;
    createdAt: string;
  } | null;
  latestLiveInvitation: {
    id: string;
    invitationStatus: string;
    attendanceStatus: string;
    invitedAt: string | null;
    createdAt: string;
  } | null;
  latestOrder: {
    id: string;
    tradeNo: string;
    reviewStatus: string;
    tradeStatus: string;
    finalAmount: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileApiPagination = {
  page: number;
  limit: number;
  total: number | null;
  hasMore: boolean;
};

export type MobileCustomerDetail = {
  id: string;
  name: string;
  phone: string;
  wechatId: string | null;
  level: "A" | "B" | "C" | "D" | "E";
  status: string;
  ownershipMode: string;
  ownerId: string | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  profile: {
    province: string | null;
    city: string | null;
    district: string | null;
    address: string | null;
    remark: string | null;
    lastEffectiveFollowUpAt: string | null;
  };
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  timeline: {
    followUpTasks: Array<{
      id: string;
      type: string;
      status: string;
      priority: string;
      subject: string;
      content: string | null;
      dueAt: string;
      completedAt: string | null;
      createdAt: string;
    }>;
    callRecords: Array<{
      id: string;
      callTime: string;
      durationSeconds: number;
      result: string | null;
      resultCode: string | null;
      remark: string | null;
      nextFollowUpAt: string | null;
    }>;
    wechatRecords: Array<{
      id: string;
      addedStatus: string;
      addedAt: string | null;
      wechatAccount: string | null;
      wechatNickname: string | null;
      wechatRemarkName: string | null;
      summary: string | null;
      nextFollowUpAt: string | null;
      createdAt: string;
    }>;
    liveInvitations: Array<{
      id: string;
      invitationStatus: string;
      invitationMethod: string;
      attendanceStatus: string;
      invitedAt: string | null;
      watchDurationMinutes: number | null;
      giftQualified: boolean;
      remark: string | null;
      createdAt: string;
      liveSession: {
        id: string;
        title: string;
        hostName: string;
        startAt: string;
        status: string;
      };
    }>;
  };
  orders: Array<{
    id: string;
    tradeNo: string;
    reviewStatus: string;
    tradeStatus: string;
    finalAmount: string;
    createdAt: string;
    updatedAt: string;
    items: Array<{
      id: string;
      lineNo: number;
      itemType: string;
      title: string;
      qty: number;
      subtotal: string;
    }>;
  }>;
  createdAt: string;
  updatedAt: string;
};

async function readMobileApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;

  if (!response.ok) {
    throw new MobileApiError(
      payload?.message ?? `Mobile API request failed with HTTP ${response.status}.`,
      response.status,
    );
  }

  if (!payload) {
    throw new MobileApiError("Mobile API returned an empty response.", response.status);
  }

  return payload;
}

export async function fetchMobileDashboard() {
  return readMobileApiJson<{ dashboard: MobileApiDashboard }>("/api/mobile/dashboard");
}

export async function fetchMobileCustomers(input: {
  page?: number;
  limit?: number;
  level?: string | null;
  levels?: readonly string[];
  queue?: string | null;
  search?: string | null;
} = {}) {
  const params = new URLSearchParams();

  if (input.page) {
    params.set("page", String(input.page));
  }

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  if (input.levels && input.levels.length > 0) {
    params.set("level", input.levels.join(","));
  } else if (input.level) {
    params.set("level", input.level);
  }

  if (input.queue && input.queue !== "all") {
    params.set("queue", input.queue);
  }

  if (input.search) {
    params.set("search", input.search);
  }

  const query = params.toString();
  return readMobileApiJson<{
    customers: MobileApiCustomerListItem[];
    pagination: MobileApiPagination;
  }>(query ? `/api/mobile/customers?${query}` : "/api/mobile/customers");
}

export async function fetchMobileCustomerDetail(customerId: string) {
  return readMobileApiJson<{ customer: MobileCustomerDetail }>(
    `/api/mobile/customers/${encodeURIComponent(customerId)}`,
  );
}
