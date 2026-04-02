import {
  CallResult,
  CustomerStatus,
  FollowUpTaskStatus,
  LeadSource,
  LeadStatus,
  LiveSessionStatus,
  SalesOrderReviewStatus,
  WechatAddStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canAccessCustomerModule } from "@/lib/auth/access";
import {
  CUSTOMERS_PAGE_SIZE,
  customerPageSizeOptions,
  type CustomerDetailTab,
  type CustomerPageSize,
  type CustomerQueueKey,
  type CustomerWorkStatusKey,
} from "@/lib/customers/metadata";
import { prisma } from "@/lib/db/prisma";
import { getActiveTagOptions } from "@/lib/master-data/queries";

type SearchParamsValue = string | string[] | undefined;

type CustomerCenterActor = {
  id: string;
  name: string;
  username: string;
  role: RoleCode;
  teamId: string | null;
};

type CustomerSnapshot = Prisma.CustomerGetPayload<{
  select: typeof customerSnapshotSelect;
}>;

type CustomerSnapshotState = {
  latestLeadAt: Date | null;
  latestFollowUpAt: Date | null;
  newImported: boolean;
  pendingFirstCall: boolean;
  pendingFollowUp: boolean;
  pendingWechat: boolean;
  pendingInvitation: boolean;
  pendingDeal: boolean;
  workingStatuses: CustomerWorkStatusKey[];
  latestInterestedProduct: string | null;
  latestPurchasedProduct: string | null;
  productKeys: string[];
  tagIds: string[];
};

type CustomerProductFilterSource = "interested" | "purchased";

type CustomerProductFilterOption = {
  key: string;
  label: string;
  source: CustomerProductFilterSource;
  count: number;
};

type ActiveTagOption = Awaited<ReturnType<typeof getActiveTagOptions>>[number];

export type CustomerTagFilterOption = ActiveTagOption & {
  count: number;
};

export type CustomerViewer = {
  id: string;
  role: RoleCode;
};

export type CustomerCenterFilters = {
  queue: CustomerQueueKey;
  statuses: CustomerWorkStatusKey[];
  teamId: string;
  salesId: string;
  search: string;
  productKeys: string[];
  productKeyword: string;
  tagIds: string[];
  importedFrom: string;
  importedTo: string;
  page: number;
  pageSize: CustomerPageSize;
};

export type CustomerSummaryStats = {
  customerCount: number;
  todayNewCustomerCount: number;
  todayNewImportedCount: number;
  pendingFirstCallCount: number;
  pendingFollowUpCount: number;
  pendingWechatCount: number;
  pendingInvitationCount: number;
  pendingDealCount: number;
  latestFollowUpAt: Date | null;
};

export type TeamOverviewItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  supervisor:
    | {
        id: string;
        name: string;
        username: string;
      }
    | null;
  salesCount: number;
  customerCount: number;
  todayNewImportedCount: number;
  pendingFirstCallCount: number;
  pendingFollowUpCount: number;
  pendingInvitationCount: number;
  pendingDealCount: number;
};

export type SalesRepBoardItem = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
  teamName: string | null;
  customerCount: number;
  todayNewImportedCount: number;
  pendingFirstCallCount: number;
  pendingFollowUpCount: number;
  pendingDealCount: number;
  latestFollowUpAt: Date | null;
};

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  status: CustomerStatus;
  createdAt: Date;
  latestImportAt: Date | null;
  latestFollowUpAt: Date | null;
  latestInterestedProduct: string | null;
  latestPurchasedProduct: string | null;
  workingStatuses: CustomerWorkStatusKey[];
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  leads: Array<{
    id: string;
    source: LeadSource;
    status: string;
    interestedProduct: string | null;
    createdAt: Date;
  }>;
  callRecords: Array<{
    id: string;
    callTime: Date;
    durationSeconds: number;
    result: CallResult;
    remark: string | null;
    nextFollowUpAt: Date | null;
    sales: {
      name: string;
      username: string;
    };
  }>;
  _count: {
    leads: number;
    callRecords: number;
  };
  customerTags: Array<{
    id: string;
    tagId: string;
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
};

export type CustomerCenterData = {
  actor: CustomerCenterActor;
  filters: CustomerCenterFilters;
  scopeMode: "organization" | "team" | "sales" | "personal" | "team_unassigned";
  selectedTeam: TeamOverviewItem | null;
  selectedSales: SalesRepBoardItem | null;
  summary: CustomerSummaryStats;
  queueCounts: Record<CustomerQueueKey, number>;
  teamOverview: TeamOverviewItem[];
  salesBoard: SalesRepBoardItem[];
  productOptions: CustomerProductFilterOption[];
  tagOptions: CustomerTagFilterOption[];
  queueItems: CustomerListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

const customerQueueValues = [
  "all",
  "new_imported",
  "pending_first_call",
  "pending_follow_up",
  "pending_wechat",
  "pending_invitation",
  "pending_deal",
] as const satisfies CustomerQueueKey[];

const customerWorkStatusValues = [
  "new_imported",
  "pending_first_call",
  "pending_follow_up",
  "pending_wechat",
  "pending_invitation",
  "pending_deal",
] as const satisfies CustomerWorkStatusKey[];

const pendingFirstCallLeadStatuses: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.ASSIGNED,
  LeadStatus.FIRST_CALL_PENDING,
];

const pendingDealLeadStatuses: LeadStatus[] = [
  LeadStatus.LIVE_INVITED,
  LeadStatus.LIVE_WATCHED,
  LeadStatus.ORDERED,
];

const legacyQueueAliasMap: Partial<Record<string, CustomerQueueKey>> = {
  all: "all",
  mine: "all",
  pending_first_call: "pending_first_call",
  wechat_pending: "pending_wechat",
  wechat_added: "pending_invitation",
};

const customerCenterFiltersSchema = z.object({
  queue: z.enum(customerQueueValues).default("all"),
  statuses: z.array(z.enum(customerWorkStatusValues)).default([]),
  teamId: z.string().trim().default(""),
  salesId: z.string().trim().default(""),
  search: z.string().trim().default(""),
  productKeys: z.array(z.string().trim().min(1)).default([]),
  productKeyword: z.string().trim().default(""),
  tagIds: z.array(z.string().trim().min(1)).default([]),
  importedFrom: z.string().trim().default(""),
  importedTo: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z
    .coerce
    .number()
    .int()
    .refine(
      (value): value is CustomerPageSize =>
        customerPageSizeOptions.includes(value as CustomerPageSize),
      { message: "Invalid page size." },
    )
    .default(CUSTOMERS_PAGE_SIZE),
});

const detailTabSchema = z.enum([
  "profile",
  "calls",
  "wechat",
  "live",
  "orders",
  "gifts",
  "logs",
]);

const customerSnapshotSelect = {
  id: true,
  name: true,
  phone: true,
  remark: true,
  createdAt: true,
  ownerId: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
  leads: {
    select: {
      id: true,
      createdAt: true,
      source: true,
      status: true,
      remark: true,
      interestedProduct: true,
      nextFollowUpAt: true,
    },
  },
  followUpTasks: {
    select: {
      id: true,
      createdAt: true,
      dueAt: true,
      completedAt: true,
      content: true,
      status: true,
    },
  },
  callRecords: {
    select: {
      id: true,
      callTime: true,
      result: true,
      remark: true,
      nextFollowUpAt: true,
    },
  },
  wechatRecords: {
    select: {
      id: true,
      createdAt: true,
      addedAt: true,
      addedStatus: true,
      nextFollowUpAt: true,
    },
  },
  liveInvitations: {
    select: {
      id: true,
      createdAt: true,
      invitedAt: true,
    },
  },
  salesOrders: {
    select: {
      id: true,
      createdAt: true,
      reviewStatus: true,
      items: {
        select: {
          productNameSnapshot: true,
        },
      },
    },
  },
  customerTags: {
    select: {
      tagId: true,
    },
  },
} satisfies Prisma.CustomerSelect;

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getParamValues(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isSameOrBefore(value: Date, boundary: Date) {
  return value.getTime() <= boundary.getTime();
}

function isWithinToday(value: Date, todayStart: Date, todayEnd: Date) {
  return value.getTime() >= todayStart.getTime() && value.getTime() <= todayEnd.getTime();
}

function getMaxDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) {
      return latest;
    }

    if (!latest || value.getTime() > latest.getTime()) {
      return value;
    }

    return latest;
  }, null);
}

function parseDateOnly(value: string, boundary: "start" | "end") {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return boundary === "start" ? startOfDay(parsed) : endOfDay(parsed);
}

function normalizeTextValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildProductFilterKey(source: CustomerProductFilterSource, label: string) {
  return `${source}:${normalizeTextValue(label).toLowerCase()}`;
}

function getCustomerVisibilityWhereInput(actor: CustomerCenterActor): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      return {
        id: "__missing_team_scope__",
      };
    }

    return {
      owner: {
        is: {
          teamId: actor.teamId,
        },
      },
    };
  }

  if (actor.role === "SALES") {
    return {
      ownerId: actor.id,
    };
  }

  return {
    id: "__forbidden_customer_scope__",
  };
}

async function getCustomerCenterActor(userId: string): Promise<CustomerCenterActor> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("当前账号不存在或已失效。");
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role.code,
    teamId: user.teamId,
  };
}

function parseCustomerCenterFilters(
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  const rawQueue =
    getParamValue(rawSearchParams?.queue) ||
    legacyQueueAliasMap[getParamValue(rawSearchParams?.view)] ||
    "all";
  const search =
    getParamValue(rawSearchParams?.search) ||
    getParamValue(rawSearchParams?.name) ||
    getParamValue(rawSearchParams?.phone);
  const rawStatuses = getParamValues(rawSearchParams?.statuses).filter(
    (value): value is CustomerWorkStatusKey =>
      customerWorkStatusValues.includes(value as CustomerWorkStatusKey),
  );
  const statuses =
    rawStatuses.length > 0
      ? [...new Set(rawStatuses)]
      : rawQueue !== "all" && customerWorkStatusValues.includes(rawQueue as CustomerWorkStatusKey)
        ? [rawQueue as CustomerWorkStatusKey]
        : [];

  return customerCenterFiltersSchema.parse({
    queue: statuses.length === 1 ? statuses[0] : rawQueue,
    statuses,
    teamId: getParamValue(rawSearchParams?.teamId),
    salesId: getParamValue(rawSearchParams?.salesId),
    search,
    productKeys: getParamValues(rawSearchParams?.productKeys),
    productKeyword: getParamValue(rawSearchParams?.productKeyword),
    tagIds: getParamValues(rawSearchParams?.tagIds),
    importedFrom: getParamValue(rawSearchParams?.importedFrom),
    importedTo: getParamValue(rawSearchParams?.importedTo),
    page: getParamValue(rawSearchParams?.page) || "1",
    pageSize: getParamValue(rawSearchParams?.pageSize) || String(CUSTOMERS_PAGE_SIZE),
  });
}

function buildPendingFollowUpMatcher(snapshot: CustomerSnapshot, now: Date) {
  return (
    snapshot.followUpTasks.some(
      (task) =>
        task.status === FollowUpTaskStatus.PENDING &&
        isSameOrBefore(task.dueAt, now),
    ) ||
    snapshot.leads.some(
      (lead) => lead.nextFollowUpAt && isSameOrBefore(lead.nextFollowUpAt, now),
    ) ||
    snapshot.callRecords.some(
      (record) =>
        record.nextFollowUpAt && isSameOrBefore(record.nextFollowUpAt, now),
    ) ||
    snapshot.wechatRecords.some(
      (record) =>
        record.nextFollowUpAt && isSameOrBefore(record.nextFollowUpAt, now),
    )
  );
}

function buildSuccessfulWechatMatcher(snapshot: CustomerSnapshot) {
  return (
    snapshot.wechatRecords.some((record) => record.addedStatus === WechatAddStatus.ADDED) ||
    snapshot.callRecords.some((record) => record.result === CallResult.WECHAT_ADDED)
  );
}

function getLatestInterestedProduct(snapshot: CustomerSnapshot) {
  const record = snapshot.leads.reduce<{
    createdAt: Date;
    interestedProduct: string;
  } | null>((latest, lead) => {
    const interestedProduct = lead.interestedProduct?.trim();

    if (!interestedProduct) {
      return latest;
    }

    if (!latest || lead.createdAt.getTime() > latest.createdAt.getTime()) {
      return {
        createdAt: lead.createdAt,
        interestedProduct,
      };
    }

    return latest;
  }, null);

  return record?.interestedProduct ?? null;
}

function getLatestPurchasedProduct(snapshot: CustomerSnapshot) {
  const record = snapshot.salesOrders.reduce<{
    createdAt: Date;
    productName: string;
  } | null>((latest, salesOrder) => {
    const productName =
      salesOrder.items
        .map((item) => item.productNameSnapshot.trim())
        .find(Boolean) ?? null;

    if (!productName) {
      return latest;
    }

    if (!latest || salesOrder.createdAt.getTime() > latest.createdAt.getTime()) {
      return {
        createdAt: salesOrder.createdAt,
        productName,
      };
    }

    return latest;
  }, null);

  return record?.productName ?? null;
}

function getSnapshotProductEntries(snapshot: CustomerSnapshot) {
  const entries = new Map<string, CustomerProductFilterOption>();

  for (const lead of snapshot.leads) {
    const interestedProduct = lead.interestedProduct?.trim();
    if (!interestedProduct) {
      continue;
    }

    const key = buildProductFilterKey("interested", interestedProduct);
    entries.set(key, {
      key,
      label: interestedProduct,
      source: "interested",
      count: 0,
    });
  }

  for (const salesOrder of snapshot.salesOrders) {
    for (const item of salesOrder.items) {
      const productName = item.productNameSnapshot.trim();
      if (!productName) {
        continue;
      }

      const key = buildProductFilterKey("purchased", productName);
      entries.set(key, {
        key,
        label: productName,
        source: "purchased",
        count: 0,
      });
    }
  }

  return [...entries.values()];
}

function getCustomerSnapshotState(
  snapshot: CustomerSnapshot,
  now: Date,
  todayStart: Date,
  todayEnd: Date,
): CustomerSnapshotState {
  const latestLeadAt = getMaxDate(snapshot.leads.map((lead) => lead.createdAt));
  const latestFollowUpAt = getMaxDate([
    ...snapshot.followUpTasks.map((task) => task.completedAt ?? task.createdAt),
    ...snapshot.callRecords.map((record) => record.callTime),
    ...snapshot.wechatRecords.map((record) => record.addedAt ?? record.createdAt),
    ...snapshot.liveInvitations.map((record) => record.invitedAt ?? record.createdAt),
  ]);
  const newImported = snapshot.leads.some((lead) =>
    isWithinToday(lead.createdAt, todayStart, todayEnd),
  );
  const pendingFirstCall =
    snapshot.callRecords.length === 0 &&
    snapshot.leads.some((lead) => pendingFirstCallLeadStatuses.includes(lead.status));
  const pendingFollowUp = buildPendingFollowUpMatcher(snapshot, now);
  const successfulWechat = buildSuccessfulWechatMatcher(snapshot);
  const pendingWechat =
    !successfulWechat &&
    (snapshot.wechatRecords.some((record) => record.addedStatus === WechatAddStatus.PENDING) ||
      snapshot.callRecords.some((record) => record.result === CallResult.WECHAT_PENDING));
  const hasInvitation = snapshot.liveInvitations.length > 0;
  const hasApprovedSalesOrder = snapshot.salesOrders.some(
    (record) => record.reviewStatus === SalesOrderReviewStatus.APPROVED,
  );
  const pendingInvitation = successfulWechat && !hasInvitation && !hasApprovedSalesOrder;
  const pendingDeal =
    !hasApprovedSalesOrder &&
    (hasInvitation ||
      snapshot.leads.some((lead) => pendingDealLeadStatuses.includes(lead.status)));
  const workingStatuses = customerWorkStatusValues.filter((status) => {
    switch (status) {
      case "new_imported":
        return newImported;
      case "pending_first_call":
        return pendingFirstCall;
      case "pending_follow_up":
        return pendingFollowUp;
      case "pending_wechat":
        return pendingWechat;
      case "pending_invitation":
        return pendingInvitation;
      case "pending_deal":
        return pendingDeal;
      default:
        return false;
    }
  });
  const latestInterestedProduct = getLatestInterestedProduct(snapshot);
  const latestPurchasedProduct = getLatestPurchasedProduct(snapshot);
  const productKeys = getSnapshotProductEntries(snapshot).map((item) => item.key);
  const tagIds = [...new Set(snapshot.customerTags.map((item) => item.tagId))];

  return {
    latestLeadAt,
    latestFollowUpAt,
    newImported,
    pendingFirstCall,
    pendingFollowUp,
    pendingWechat,
    pendingInvitation,
    pendingDeal,
    workingStatuses,
    latestInterestedProduct,
    latestPurchasedProduct,
    productKeys,
    tagIds,
  };
}

function getQueueMatch(state: CustomerSnapshotState, queue: CustomerQueueKey) {
  switch (queue) {
    case "new_imported":
      return state.newImported;
    case "pending_first_call":
      return state.pendingFirstCall;
    case "pending_follow_up":
      return state.pendingFollowUp;
    case "pending_wechat":
      return state.pendingWechat;
    case "pending_invitation":
      return state.pendingInvitation;
    case "pending_deal":
      return state.pendingDeal;
    case "all":
    default:
      return true;
  }
}

function buildSummaryStats(
  snapshots: CustomerSnapshot[],
  stateMap: Map<string, CustomerSnapshotState>,
  todayStart: Date,
  todayEnd: Date,
): CustomerSummaryStats {
  return {
    customerCount: snapshots.length,
    todayNewCustomerCount: snapshots.filter((item) =>
      isWithinToday(item.createdAt, todayStart, todayEnd),
    ).length,
    todayNewImportedCount: snapshots.filter((item) => stateMap.get(item.id)?.newImported).length,
    pendingFirstCallCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingFirstCall)
      .length,
    pendingFollowUpCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingFollowUp)
      .length,
    pendingWechatCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingWechat).length,
    pendingInvitationCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingInvitation)
      .length,
    pendingDealCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingDeal).length,
    latestFollowUpAt: getMaxDate(
      snapshots.map((item) => stateMap.get(item.id)?.latestFollowUpAt ?? null),
    ),
  };
}

function buildQueueCounts(
  snapshots: CustomerSnapshot[],
  stateMap: Map<string, CustomerSnapshotState>,
) {
  return customerQueueValues.reduce<Record<CustomerQueueKey, number>>((result, queue) => {
    result[queue] = snapshots.filter((item) => {
      const state = stateMap.get(item.id);
      return state ? getQueueMatch(state, queue) : false;
    }).length;
    return result;
  }, {} as Record<CustomerQueueKey, number>);
}

function matchesCustomerStatuses(
  state: CustomerSnapshotState | undefined,
  statuses: CustomerWorkStatusKey[],
) {
  if (statuses.length === 0) {
    return true;
  }

  if (!state) {
    return false;
  }

  return statuses.some((status) => state.workingStatuses.includes(status));
}

function matchesCustomerProducts(
  snapshot: CustomerSnapshot,
  state: CustomerSnapshotState | undefined,
  productKeys: string[],
  productKeyword: string,
) {
  if (productKeys.length === 0 && !productKeyword) {
    return true;
  }

  if (!state) {
    return false;
  }

  const hasSelectedProduct =
    productKeys.length === 0 || productKeys.some((key) => state.productKeys.includes(key));

  if (!hasSelectedProduct) {
    return false;
  }

  if (!productKeyword) {
    return true;
  }

  const normalizedKeyword = productKeyword.toLowerCase();
  return getSnapshotProductEntries(snapshot).some((entry) =>
    entry.label.toLowerCase().includes(normalizedKeyword),
  );
}

function matchesCustomerTags(state: CustomerSnapshotState | undefined, tagIds: string[]) {
  if (tagIds.length === 0) {
    return true;
  }

  if (!state) {
    return false;
  }

  return tagIds.some((tagId) => state.tagIds.includes(tagId));
}

function matchesImportedDateRange(
  state: CustomerSnapshotState | undefined,
  importedFrom: string,
  importedTo: string,
) {
  if (!importedFrom && !importedTo) {
    return true;
  }

  const latestLeadAt = state?.latestLeadAt;
  if (!latestLeadAt) {
    return false;
  }

  const from = parseDateOnly(importedFrom, "start");
  const to = parseDateOnly(importedTo, "end");

  if (from && latestLeadAt.getTime() < from.getTime()) {
    return false;
  }

  if (to && latestLeadAt.getTime() > to.getTime()) {
    return false;
  }

  return true;
}

function matchesCustomerSearch(snapshot: CustomerSnapshot, search: string) {
  if (!search) {
    return true;
  }

  const keyword = search.toLowerCase();
  const searchableTexts = [
    snapshot.name,
    snapshot.phone,
    snapshot.remark ?? "",
    snapshot.owner?.name ?? "",
    snapshot.owner?.username ?? "",
    ...snapshot.leads.flatMap((lead) => [
      lead.interestedProduct ?? "",
      lead.remark ?? "",
    ]),
    ...snapshot.followUpTasks.map((task) => task.content ?? ""),
    ...snapshot.callRecords.map((record) => record.remark ?? ""),
    ...snapshot.salesOrders.flatMap((order) =>
      order.items.map((item) => item.productNameSnapshot),
    ),
  ];

  return searchableTexts.some((value) => value.toLowerCase().includes(keyword));
}

function compareCustomerSnapshots(
  left: CustomerSnapshot,
  right: CustomerSnapshot,
  stateMap: Map<string, CustomerSnapshotState>,
) {
  const leftState = stateMap.get(left.id);
  const rightState = stateMap.get(right.id);
  const leftAnchor = leftState?.latestFollowUpAt ?? leftState?.latestLeadAt ?? left.createdAt;
  const rightAnchor = rightState?.latestFollowUpAt ?? rightState?.latestLeadAt ?? right.createdAt;

  if (rightAnchor.getTime() !== leftAnchor.getTime()) {
    return rightAnchor.getTime() - leftAnchor.getTime();
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
}

function buildProductFilterOptions(snapshots: CustomerSnapshot[]) {
  const options = new Map<string, CustomerProductFilterOption>();

  for (const snapshot of snapshots) {
    for (const entry of getSnapshotProductEntries(snapshot)) {
      const existing = options.get(entry.key);

      if (existing) {
        existing.count += 1;
        continue;
      }

      options.set(entry.key, {
        ...entry,
        count: 1,
      });
    }
  }

  return [...options.values()]
    .sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === "purchased" ? -1 : 1;
      }

      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label, "zh-CN");
    });
}

function buildTagFilterOptions(
  snapshots: CustomerSnapshot[],
  activeTags: ActiveTagOption[],
) {
  const counts = new Map<string, number>();

  for (const snapshot of snapshots) {
    const seen = new Set(snapshot.customerTags.map((item) => item.tagId));

    for (const tagId of seen) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
  }

  return activeTags
    .map((tag) => ({
      ...tag,
      count: counts.get(tag.id) ?? 0,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });
}

async function fetchCustomerListItems(
  customerIds: string[],
  stateMap: Map<string, CustomerSnapshotState>,
): Promise<CustomerListItem[]> {
  if (customerIds.length === 0) {
    return [];
  }

  const items = await prisma.customer.findMany({
    where: {
      id: {
        in: customerIds,
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      province: true,
      city: true,
      district: true,
      address: true,
      status: true,
      createdAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      leads: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          source: true,
          status: true,
          interestedProduct: true,
          createdAt: true,
        },
      },
      callRecords: {
        orderBy: [{ callTime: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          callTime: true,
          durationSeconds: true,
          result: true,
          remark: true,
          nextFollowUpAt: true,
          sales: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      },
      _count: {
        select: {
          leads: true,
          callRecords: true,
        },
      },
      customerTags: {
        orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
        take: 5,
        select: {
          id: true,
          tagId: true,
          tag: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      },
    },
  });

  const itemMap = new Map(items.map((item) => [item.id, item]));
  return customerIds.reduce<CustomerListItem[]>((result, id) => {
    const item = itemMap.get(id);
    const state = stateMap.get(id);

    if (item) {
      result.push({
        ...item,
        latestImportAt: state?.latestLeadAt ?? null,
        latestFollowUpAt: state?.latestFollowUpAt ?? null,
        latestInterestedProduct: state?.latestInterestedProduct ?? null,
        latestPurchasedProduct: state?.latestPurchasedProduct ?? null,
        workingStatuses: state?.workingStatuses ?? [],
      });
    }

    return result;
  }, []);
}

export function buildPendingFirstCallCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    callRecords: {
      none: {},
    },
    leads: {
      some: {
        status: {
          in: [LeadStatus.NEW, LeadStatus.ASSIGNED, LeadStatus.FIRST_CALL_PENDING],
        },
      },
    },
  };
}

export function buildPendingFollowUpCustomerWhereInput(now = new Date()): Prisma.CustomerWhereInput {
  return {
    OR: [
      {
        followUpTasks: {
          some: {
            status: FollowUpTaskStatus.PENDING,
            dueAt: {
              lte: now,
            },
          },
        },
      },
      {
        leads: {
          some: {
            nextFollowUpAt: {
              lte: now,
            },
          },
        },
      },
      {
        callRecords: {
          some: {
            nextFollowUpAt: {
              lte: now,
            },
          },
        },
      },
      {
        wechatRecords: {
          some: {
            nextFollowUpAt: {
              lte: now,
            },
          },
        },
      },
    ],
  };
}

export function buildWechatPendingCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    AND: [
      {
        NOT: {
          OR: [
            {
              wechatRecords: {
                some: {
                  addedStatus: WechatAddStatus.ADDED,
                },
              },
            },
            {
              callRecords: {
                some: {
                  result: CallResult.WECHAT_ADDED,
                },
              },
            },
          ],
        },
      },
      {
        OR: [
          {
            wechatRecords: {
              some: {
                addedStatus: WechatAddStatus.PENDING,
              },
            },
          },
          {
            callRecords: {
              some: {
                result: CallResult.WECHAT_PENDING,
              },
            },
          },
        ],
      },
    ],
  };
}

export function parseCustomerDetailTab(
  searchParams: Record<string, SearchParamsValue> | undefined,
  fallbackTab: CustomerDetailTab = "profile",
): CustomerDetailTab {
  const parsed = detailTabSchema.safeParse(getParamValue(searchParams?.tab));
  return parsed.success ? parsed.data : fallbackTab;
}

export async function getCustomerCenterData(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const [teams, salesUsers, customerSnapshots, activeTags] = await Promise.all([
    actor.role === "ADMIN"
      ? prisma.team.findMany({
          orderBy: [{ name: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            supervisor: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
          },
        })
      : actor.teamId
        ? prisma.team.findMany({
            where: { id: actor.teamId },
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              supervisor: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    prisma.user.findMany({
      where: {
        role: {
          code: "SALES",
        },
        userStatus: "ACTIVE",
        ...(actor.role === "ADMIN"
          ? {}
          : actor.teamId
            ? { teamId: actor.teamId }
            : { id: "__missing_team_scope__" }),
      },
      orderBy: [{ name: "asc" }, { username: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        teamId: true,
        team: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    }),
    prisma.customer.findMany({
      where: visibleWhere,
      select: customerSnapshotSelect,
    }),
    getActiveTagOptions(),
  ]);

  const parsedFilters = parseCustomerCenterFilters(rawSearchParams);
  const salesById = new Map(salesUsers.map((item) => [item.id, item]));
  const teamsById = new Map(teams.map((item) => [item.id, item]));
  const teamId =
    actor.role === "ADMIN"
      ? teamsById.has(parsedFilters.teamId)
        ? parsedFilters.teamId
        : salesById.get(parsedFilters.salesId)?.teamId ?? ""
      : actor.teamId ?? "";
  const salesId = (() => {
    if (actor.role === "SALES") {
      return actor.id;
    }

    const selectedSales = salesById.get(parsedFilters.salesId);

    if (!selectedSales) {
      return "";
    }

    if (teamId && selectedSales.teamId !== teamId) {
      return "";
    }

    return selectedSales.id;
  })();
  const filters: CustomerCenterFilters = {
    queue: parsedFilters.queue,
    statuses: parsedFilters.statuses,
    teamId,
    salesId,
    search: parsedFilters.search,
    productKeys: parsedFilters.productKeys,
    productKeyword: parsedFilters.productKeyword,
    tagIds: parsedFilters.tagIds,
    importedFrom: parsedFilters.importedFrom,
    importedTo: parsedFilters.importedTo,
    page: parsedFilters.page,
    pageSize: parsedFilters.pageSize,
  };

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const stateMap = new Map(
    customerSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotState(snapshot, now, todayStart, todayEnd),
    ]),
  );

  const teamOverview = teams.map<TeamOverviewItem>((team) => {
    const teamSnapshots = customerSnapshots.filter(
      (snapshot) => snapshot.owner?.team?.id === team.id,
    );
    const stats = buildSummaryStats(teamSnapshots, stateMap, todayStart, todayEnd);
    const salesCount = new Set(
      teamSnapshots
        .map((snapshot) => snapshot.ownerId)
        .filter((value): value is string => Boolean(value)),
    ).size;

    return {
      id: team.id,
      code: team.code,
      name: team.name,
      description: team.description,
      supervisor: team.supervisor,
      salesCount,
      customerCount: stats.customerCount,
      todayNewImportedCount: stats.todayNewImportedCount,
      pendingFirstCallCount: stats.pendingFirstCallCount,
      pendingFollowUpCount: stats.pendingFollowUpCount,
      pendingInvitationCount: stats.pendingInvitationCount,
      pendingDealCount: stats.pendingDealCount,
    };
  });

  const salesBoard = salesUsers
    .filter((item) => !filters.teamId || item.teamId === filters.teamId)
    .map<SalesRepBoardItem>((sales) => {
      const salesSnapshots = customerSnapshots.filter((snapshot) => snapshot.ownerId === sales.id);
      const stats = buildSummaryStats(salesSnapshots, stateMap, todayStart, todayEnd);

      return {
        id: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayNewImportedCount: stats.todayNewImportedCount,
        pendingFirstCallCount: stats.pendingFirstCallCount,
        pendingFollowUpCount: stats.pendingFollowUpCount,
        pendingDealCount: stats.pendingDealCount,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      if (right.customerCount !== left.customerCount) {
        return right.customerCount - left.customerCount;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });

  const scopeSnapshots =
    actor.role === "ADMIN"
      ? filters.salesId
        ? customerSnapshots.filter((snapshot) => snapshot.ownerId === filters.salesId)
        : filters.teamId
          ? customerSnapshots.filter((snapshot) => snapshot.owner?.team?.id === filters.teamId)
          : customerSnapshots
      : actor.role === "SUPERVISOR"
        ? filters.salesId
          ? customerSnapshots.filter((snapshot) => snapshot.ownerId === filters.salesId)
          : customerSnapshots
        : customerSnapshots;

  const summary = buildSummaryStats(scopeSnapshots, stateMap, todayStart, todayEnd);
  const queueCounts = buildQueueCounts(scopeSnapshots, stateMap);
  const productOptions = buildProductFilterOptions(scopeSnapshots);
  const tagOptions = buildTagFilterOptions(scopeSnapshots, activeTags);
  const selectedTeam =
    filters.teamId !== ""
      ? teamOverview.find((item) => item.id === filters.teamId) ?? null
      : actor.role === "SUPERVISOR"
        ? teamOverview[0] ?? null
        : null;
  const selectedSales =
    filters.salesId !== ""
      ? salesBoard.find((item) => item.id === filters.salesId) ?? null
      : actor.role === "SALES"
        ? salesBoard.find((item) => item.id === actor.id) ?? null
        : null;
  const filteredQueueSnapshots = scopeSnapshots
    .filter((snapshot) => matchesCustomerSearch(snapshot, filters.search))
    .filter((snapshot) =>
      matchesCustomerStatuses(stateMap.get(snapshot.id), filters.statuses),
    )
    .filter((snapshot) =>
      matchesCustomerProducts(
        snapshot,
        stateMap.get(snapshot.id),
        filters.productKeys,
        filters.productKeyword,
      ),
    )
    .filter((snapshot) => matchesCustomerTags(stateMap.get(snapshot.id), filters.tagIds))
    .filter((snapshot) =>
      matchesImportedDateRange(
        stateMap.get(snapshot.id),
        filters.importedFrom,
        filters.importedTo,
      ),
    )
    .sort((left, right) => compareCustomerSnapshots(left, right, stateMap));
  const totalCount = filteredQueueSnapshots.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const pageCustomerIds = filteredQueueSnapshots
    .slice((currentPage - 1) * filters.pageSize, currentPage * filters.pageSize)
    .map((item) => item.id);
  const queueItems = await fetchCustomerListItems(pageCustomerIds, stateMap);

  return {
    actor,
    filters: {
      ...filters,
      page: currentPage,
    },
    scopeMode:
      actor.role === "ADMIN"
        ? filters.salesId
          ? "sales"
          : filters.teamId
            ? "team"
            : "organization"
        : actor.role === "SUPERVISOR"
          ? actor.teamId
            ? filters.salesId
              ? "sales"
              : "team"
            : "team_unassigned"
          : "personal",
    selectedTeam,
    selectedSales,
    summary,
    queueCounts,
    teamOverview,
    salesBoard,
    productOptions,
    tagOptions,
    queueItems,
    pagination: {
      page: currentPage,
      pageSize: filters.pageSize,
      totalCount,
      totalPages,
    },
  } satisfies CustomerCenterData;
}

export async function getCustomerDetail(viewer: CustomerViewer, customerId: string) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);

  const customer = await prisma.customer.findFirst({
    where: {
      AND: [visibleWhere, { id: customerId }],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      wechatId: true,
      province: true,
      city: true,
      district: true,
      address: true,
      status: true,
      level: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      leads: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          phone: true,
          source: true,
          status: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          leads: true,
          callRecords: true,
          wechatRecords: true,
          liveInvitations: true,
          salesOrders: true,
          giftRecords: true,
          mergeLogs: true,
        },
      },
      customerTags: {
        orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
        select: {
          id: true,
          tagId: true,
          tag: {
            select: {
              id: true,
              name: true,
              code: true,
              color: true,
            },
          },
        },
      },
      mergeLogs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          action: true,
          source: true,
          tagSynced: true,
          createdAt: true,
          batch: {
            select: {
              id: true,
              fileName: true,
            },
          },
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return null;
  }

  const [
    callRecords,
    wechatRecords,
    liveInvitations,
    salesOrders,
    giftRecords,
    availableLiveSessions,
    availableTags,
  ] = await Promise.all([
    prisma.callRecord.findMany({
      where: { customerId: customer.id },
      orderBy: { callTime: "desc" },
      take: 20,
      select: {
        id: true,
        callTime: true,
        durationSeconds: true,
        result: true,
        remark: true,
        nextFollowUpAt: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    prisma.wechatRecord.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        addedStatus: true,
        addedAt: true,
        wechatAccount: true,
        wechatNickname: true,
        wechatRemarkName: true,
        tags: true,
        summary: true,
        nextFollowUpAt: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    prisma.liveInvitation.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        invitationStatus: true,
        invitedAt: true,
        invitationMethod: true,
        attendanceStatus: true,
        watchDurationMinutes: true,
        giftQualified: true,
        remark: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        liveSession: {
          select: {
            id: true,
            title: true,
            hostName: true,
            startAt: true,
            status: true,
            roomId: true,
            roomLink: true,
            targetProduct: true,
          },
        },
      },
    }),
    prisma.salesOrder.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        orderNo: true,
        reviewStatus: true,
        paymentMode: true,
        paymentScheme: true,
        finalAmount: true,
        receiverNameSnapshot: true,
        receiverPhoneSnapshot: true,
        receiverAddressSnapshot: true,
        createdAt: true,
        owner: {
          select: {
            name: true,
            username: true,
          },
        },
        supplier: {
          select: {
            name: true,
          },
        },
        shippingTask: {
          select: {
            id: true,
            reportStatus: true,
            shippingStatus: true,
            shippingProvider: true,
            trackingNumber: true,
            logisticsFollowUpTasks: {
              orderBy: { createdAt: "desc" },
              take: 3,
              select: {
                id: true,
                status: true,
                intervalDays: true,
                nextTriggerAt: true,
                lastFollowedUpAt: true,
                owner: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                  },
                },
              },
            },
            codCollectionRecords: {
              orderBy: { createdAt: "desc" },
              take: 3,
              select: {
                id: true,
                status: true,
                expectedAmount: true,
                collectedAmount: true,
                occurredAt: true,
                remark: true,
                paymentRecord: {
                  select: {
                    id: true,
                    amount: true,
                    status: true,
                    occurredAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.giftRecord.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        giftName: true,
        qualificationSource: true,
        freightAmount: true,
        reviewStatus: true,
        shippingStatus: true,
        receiverInfo: true,
        receiverName: true,
        receiverPhone: true,
        receiverAddress: true,
        remark: true,
        createdAt: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        liveSession: {
          select: {
            title: true,
          },
        },
        shippingTask: {
          select: {
            id: true,
            status: true,
            trackingNumber: true,
            shippedAt: true,
            remark: true,
          },
        },
        paymentPlans: {
          orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            subjectType: true,
            stageType: true,
            collectionChannel: true,
            plannedAmount: true,
            confirmedAmount: true,
            remainingAmount: true,
            status: true,
            collectionTasks: {
              where: {
                status: {
                  in: ["PENDING", "IN_PROGRESS"],
                },
              },
              take: 1,
              orderBy: [{ createdAt: "desc" }],
              select: {
                id: true,
                taskType: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    prisma.liveSession.findMany({
      where: {
        status: {
          in: [
            LiveSessionStatus.SCHEDULED,
            LiveSessionStatus.LIVE,
            LiveSessionStatus.ENDED,
            LiveSessionStatus.DRAFT,
          ],
        },
      },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        hostName: true,
        startAt: true,
        status: true,
      },
    }),
    getActiveTagOptions(),
  ]);

  const salesOrderIds = salesOrders.map((record) => record.id);
  const shippingTaskIds = salesOrders
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const logisticsFollowUpTaskIds = salesOrders
    .flatMap((record) => record.shippingTask?.logisticsFollowUpTasks ?? [])
    .map((task) => task.id);
  const codCollectionRecordIds = salesOrders
    .flatMap((record) => record.shippingTask?.codCollectionRecords ?? [])
    .map((record) => record.id);
  const giftRecordIds = giftRecords.map((record) => record.id);
  const giftShippingTaskIds = giftRecords
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const giftPaymentPlanIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .map((plan) => plan.id);
  const giftCollectionTaskIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .flatMap((plan) => plan.collectionTasks ?? [])
    .map((task) => task.id);
  const operationLogWhere: Prisma.OperationLogWhereInput = {
    OR: [
      {
        targetType: "CUSTOMER",
        targetId: customer.id,
      },
      ...(salesOrderIds.length > 0
        ? [
            {
              targetType: "SALES_ORDER",
              targetId: {
                in: salesOrderIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(shippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: shippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(logisticsFollowUpTaskIds.length > 0
        ? [
            {
              targetType: "LOGISTICS_FOLLOW_UP_TASK",
              targetId: {
                in: logisticsFollowUpTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(codCollectionRecordIds.length > 0
        ? [
            {
              targetType: "COD_COLLECTION_RECORD",
              targetId: {
                in: codCollectionRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftRecordIds.length > 0
        ? [
            {
              targetType: "GIFT_RECORD",
              targetId: {
                in: giftRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftShippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: giftShippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftPaymentPlanIds.length > 0
        ? [
            {
              targetType: "PAYMENT_PLAN",
              targetId: {
                in: giftPaymentPlanIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftCollectionTaskIds.length > 0
        ? [
            {
              targetType: "COLLECTION_TASK",
              targetId: {
                in: giftCollectionTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
    ],
  };

  const [operationLogs, operationLogCount] = await Promise.all([
    prisma.operationLog.findMany({
      where: operationLogWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        module: true,
        action: true,
        description: true,
        createdAt: true,
        actor: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    prisma.operationLog.count({
      where: operationLogWhere,
    }),
  ]);

  const latestFollowUpAt = getMaxDate([
    ...callRecords.map((record) => record.callTime),
    ...wechatRecords.map((record) => record.addedAt ?? null),
    ...liveInvitations.map((record) => record.invitedAt ?? null),
  ]);

  return {
    ...customer,
    viewerScope: actor.role,
    latestFollowUpAt,
    importSummary: {
      firstSource:
        customer.leads.length > 0 ? customer.leads[customer.leads.length - 1]?.source ?? null : null,
      latestSource: customer.leads.length > 0 ? customer.leads[0]?.source ?? null : null,
      linkedLeadCount: customer._count.leads,
      importEventCount: customer._count.mergeLogs,
      latestImportAt: customer.leads[0]?.createdAt ?? null,
    },
    callRecords,
    wechatRecords,
    liveInvitations,
    salesOrders,
    giftRecords,
    operationLogs,
    operationLogCount,
    availableLiveSessions,
    availableTags,
  };
}

async function getVisibleCustomerDetailBase(viewer: CustomerViewer, customerId: string) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);

  const customer = await prisma.customer.findFirst({
    where: {
      AND: [visibleWhere, { id: customerId }],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      wechatId: true,
      province: true,
      city: true,
      district: true,
      address: true,
      status: true,
      level: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      _count: {
        select: {
          leads: true,
          callRecords: true,
          wechatRecords: true,
          liveInvitations: true,
          salesOrders: true,
          giftRecords: true,
          mergeLogs: true,
        },
      },
    },
  });

  if (!customer) {
    return null;
  }

  return {
    actor,
    customer,
  };
}

async function buildCustomerDetailOperationLogWhere(customerId: string) {
  const [salesOrders, giftRecords] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { customerId },
      select: {
        id: true,
        tradeOrderId: true,
        shippingTask: {
          select: {
            id: true,
            logisticsFollowUpTasks: {
              select: { id: true },
            },
            codCollectionRecords: {
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.giftRecord.findMany({
      where: { customerId },
      select: {
        id: true,
        shippingTask: {
          select: { id: true },
        },
        paymentPlans: {
          select: {
            id: true,
            collectionTasks: {
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);

  const salesOrderIds = salesOrders.map((record) => record.id);
  const tradeOrderIds = [
    ...new Set(
      salesOrders
        .map((record) => record.tradeOrderId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const shippingTaskIds = salesOrders
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const logisticsFollowUpTaskIds = salesOrders
    .flatMap((record) => record.shippingTask?.logisticsFollowUpTasks ?? [])
    .map((task) => task.id);
  const codCollectionRecordIds = salesOrders
    .flatMap((record) => record.shippingTask?.codCollectionRecords ?? [])
    .map((record) => record.id);
  const giftRecordIds = giftRecords.map((record) => record.id);
  const giftShippingTaskIds = giftRecords
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const giftPaymentPlanIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .map((plan) => plan.id);
  const giftCollectionTaskIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .flatMap((plan) => plan.collectionTasks ?? [])
    .map((task) => task.id);

  return {
    OR: [
      {
        targetType: "CUSTOMER",
        targetId: customerId,
      },
      ...(salesOrderIds.length > 0
        ? [
            {
              targetType: "SALES_ORDER",
              targetId: {
                in: salesOrderIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(tradeOrderIds.length > 0
        ? [
            {
              targetType: "TRADE_ORDER",
              targetId: {
                in: tradeOrderIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(shippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: shippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(logisticsFollowUpTaskIds.length > 0
        ? [
            {
              targetType: "LOGISTICS_FOLLOW_UP_TASK",
              targetId: {
                in: logisticsFollowUpTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(codCollectionRecordIds.length > 0
        ? [
            {
              targetType: "COD_COLLECTION_RECORD",
              targetId: {
                in: codCollectionRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftRecordIds.length > 0
        ? [
            {
              targetType: "GIFT_RECORD",
              targetId: {
                in: giftRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftShippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: giftShippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftPaymentPlanIds.length > 0
        ? [
            {
              targetType: "PAYMENT_PLAN",
              targetId: {
                in: giftPaymentPlanIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftCollectionTaskIds.length > 0
        ? [
            {
              targetType: "COLLECTION_TASK",
              targetId: {
                in: giftCollectionTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
    ],
  } satisfies Prisma.OperationLogWhereInput;
}

export async function getCustomerDetailShell(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const [firstLead, latestLead, latestCall, latestWechat, latestLive, operationLogCount, logisticsFollowUpCount] =
    await Promise.all([
      prisma.lead.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { createdAt: "asc" },
        select: { source: true, createdAt: true },
      }),
      prisma.lead.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { createdAt: "desc" },
        select: { source: true, createdAt: true },
      }),
      prisma.callRecord.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { callTime: "desc" },
        select: { callTime: true },
      }),
      prisma.wechatRecord.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { createdAt: "desc" },
        select: { addedAt: true },
      }),
      prisma.liveInvitation.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { createdAt: "desc" },
        select: { invitedAt: true },
      }),
      prisma.operationLog.count({
        where: await buildCustomerDetailOperationLogWhere(detail.customer.id),
      }),
      prisma.logisticsFollowUpTask.count({
        where: {
          customerId: detail.customer.id,
        },
      }),
    ]);

  return {
    ...detail.customer,
    viewerScope: detail.actor.role,
    latestFollowUpAt: getMaxDate([
      latestCall?.callTime ?? null,
      latestWechat?.addedAt ?? null,
      latestLive?.invitedAt ?? null,
    ]),
    importSummary: {
      firstSource: firstLead?.source ?? null,
      latestSource: latestLead?.source ?? null,
      linkedLeadCount: detail.customer._count.leads,
      importEventCount: detail.customer._count.mergeLogs,
      latestImportAt: latestLead?.createdAt ?? null,
    },
    operationLogCount,
    logisticsFollowUpCount,
  };
}

export async function getCustomerDetailProfileData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const [leads, mergeLogs, customerTags, availableTags] = await Promise.all([
    prisma.lead.findMany({
      where: { customerId: detail.customer.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        source: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.leadCustomerMergeLog.findMany({
      where: { customerId: detail.customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        source: true,
        tagSynced: true,
        createdAt: true,
        batch: {
          select: {
            id: true,
            fileName: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    }),
    prisma.customerTag.findMany({
      where: { customerId: detail.customer.id },
      orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
      select: {
        id: true,
        tagId: true,
        tag: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
      },
    }),
    getActiveTagOptions(),
  ]);

  return {
    leads,
    mergeLogs,
    customerTags,
    availableTags,
  };
}

export async function getCustomerDetailCallsData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  return prisma.callRecord.findMany({
    where: { customerId: detail.customer.id },
    orderBy: { callTime: "desc" },
    take: 20,
    select: {
      id: true,
      callTime: true,
      durationSeconds: true,
      result: true,
      remark: true,
      nextFollowUpAt: true,
      sales: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  });
}

export async function getCustomerDetailWechatData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  return prisma.wechatRecord.findMany({
    where: { customerId: detail.customer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      addedStatus: true,
      addedAt: true,
      wechatAccount: true,
      wechatNickname: true,
      wechatRemarkName: true,
      tags: true,
      summary: true,
      nextFollowUpAt: true,
      sales: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  });
}

export async function getCustomerDetailLiveData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const [records, liveSessions] = await Promise.all([
    prisma.liveInvitation.findMany({
      where: { customerId: detail.customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        invitationStatus: true,
        invitedAt: true,
        invitationMethod: true,
        attendanceStatus: true,
        watchDurationMinutes: true,
        giftQualified: true,
        remark: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        liveSession: {
          select: {
            id: true,
            title: true,
            hostName: true,
            startAt: true,
            status: true,
            roomId: true,
            roomLink: true,
            targetProduct: true,
          },
        },
      },
    }),
    prisma.liveSession.findMany({
      where: {
        status: {
          in: [
            LiveSessionStatus.SCHEDULED,
            LiveSessionStatus.LIVE,
            LiveSessionStatus.ENDED,
            LiveSessionStatus.DRAFT,
          ],
        },
      },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        hostName: true,
        startAt: true,
        status: true,
      },
    }),
  ]);

  return {
    records,
    liveSessions,
  };
}

export async function getCustomerDetailOrdersData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  return prisma.salesOrder.findMany({
    where: { customerId: detail.customer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      orderNo: true,
      tradeOrderId: true,
      subOrderNo: true,
      reviewStatus: true,
      paymentMode: true,
      paymentScheme: true,
      finalAmount: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
      receiverAddressSnapshot: true,
      createdAt: true,
      owner: {
        select: {
          name: true,
          username: true,
        },
      },
      supplier: {
        select: {
          name: true,
        },
      },
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          reportStatus: true,
          shippingStatus: true,
          shippingProvider: true,
          trackingNumber: true,
          logisticsFollowUpTasks: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              status: true,
              intervalDays: true,
              nextTriggerAt: true,
              lastFollowedUpAt: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
          codCollectionRecords: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              status: true,
              expectedAmount: true,
              collectedAmount: true,
              occurredAt: true,
              remark: true,
              paymentRecord: {
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  occurredAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getCustomerDetailGiftsData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  return prisma.giftRecord.findMany({
    where: { customerId: detail.customer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      giftName: true,
      qualificationSource: true,
      freightAmount: true,
      reviewStatus: true,
      shippingStatus: true,
      receiverInfo: true,
      receiverName: true,
      receiverPhone: true,
      receiverAddress: true,
      remark: true,
      createdAt: true,
      sales: {
        select: {
          name: true,
          username: true,
        },
      },
      liveSession: {
        select: {
          title: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          status: true,
          trackingNumber: true,
          shippedAt: true,
          remark: true,
        },
      },
      paymentPlans: {
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          subjectType: true,
          stageType: true,
          collectionChannel: true,
          plannedAmount: true,
          confirmedAmount: true,
          remainingAmount: true,
          status: true,
          collectionTasks: {
            where: {
              status: {
                in: ["PENDING", "IN_PROGRESS"],
              },
            },
            take: 1,
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              taskType: true,
              status: true,
            },
          },
        },
      },
    },
  });
}

export async function getCustomerDetailLogsData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const where = await buildCustomerDetailOperationLogWhere(detail.customer.id);

  return prisma.operationLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      module: true,
      action: true,
      description: true,
      createdAt: true,
      actor: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  });
}
