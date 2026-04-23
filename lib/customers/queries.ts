import {
  CallResult,
  CustomerOwnershipMode,
  CustomerStatus,
  FollowUpTaskStatus,
  LeadSource,
  LeadStatus,
  LiveSessionStatus,
  SalesOrderReviewStatus,
  TradeOrderStatus,
  WechatAddStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canAccessCustomerModule } from "@/lib/auth/access";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  getEnabledCallResultOptions,
  hydrateCallResultLabels,
} from "@/lib/calls/settings";
import {
  CUSTOMERS_PAGE_SIZE,
  customerManualCreateOperationAction,
  customerPageSizeOptions,
  type CustomerExecutionClass,
  type CustomerDetailTab,
  type CustomerPageSize,
  type CustomerQueueKey,
  type CustomerWorkStatusKey,
} from "@/lib/customers/metadata";
import {
  findActiveCustomerRecycleEntry,
  listActiveCustomerIds,
} from "@/lib/customers/recycle";
import { parseCustomerImportOperationLogData } from "@/lib/customers/customer-import-operation-log";
import { resolveImportedCustomerDeletionGuard } from "@/lib/customers/imported-customer-deletion";
import { prisma } from "@/lib/db/prisma";
import {
  customerContinuationImportOperationActions,
  type CustomerImportOperationLogData,
} from "@/lib/lead-imports/metadata";
import {
  buildVisibleLeadWhereInput,
  withVisibleLeadWhere,
} from "@/lib/leads/visibility";
import { getActiveTagOptions } from "@/lib/master-data/queries";
import {
  buildCustomerFinalizePreview,
  getCustomerRecycleTarget,
} from "@/lib/recycle-bin/customer-adapter";
import type {
  RecycleFinalizePreview,
  RecycleMoveGuard,
} from "@/lib/recycle-bin/types";

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

type CustomerDashboardSnapshot = Prisma.CustomerGetPayload<{
  select: typeof customerDashboardSnapshotSelect;
}>;

type CustomerSnapshotState = {
  latestLeadAt: Date | null;
  latestFollowUpAt: Date | null;
  latestCustomerImportAt: Date | null;
  assignedAt: Date | null;
  executionClass: CustomerExecutionClass;
  newImported: boolean;
  pendingFirstCall: boolean;
  pendingFollowUp: boolean;
  pendingWechat: boolean;
  pendingInvitation: boolean;
  pendingDeal: boolean;
  migrationPendingFollowUp: boolean;
  workingStatuses: CustomerWorkStatusKey[];
  latestInterestedProduct: string | null;
  latestPurchasedProduct: string | null;
  productKeys: string[];
  tagIds: string[];
};

type CustomerDashboardState = Omit<
  CustomerSnapshotState,
  "latestInterestedProduct" | "latestPurchasedProduct" | "productKeys" | "tagIds"
>;

type CustomerStateSource = {
  id: string;
  createdAt: Date;
  lastEffectiveFollowUpAt: Date | null;
  ownerId: string | null;
  leads: Array<{
    id: string;
    createdAt: Date;
    status: LeadStatus;
    nextFollowUpAt: Date | null;
  }>;
  followUpTasks: Array<{
    createdAt: Date;
    dueAt: Date;
    completedAt: Date | null;
    status: FollowUpTaskStatus;
  }>;
  callRecords: Array<{
    callTime: Date;
    result: CallResult | null;
    nextFollowUpAt: Date | null;
  }>;
  wechatRecords: Array<{
    createdAt: Date;
    addedAt: Date | null;
    addedStatus: WechatAddStatus;
    nextFollowUpAt: Date | null;
  }>;
  liveInvitations: Array<{
    createdAt: Date;
    invitedAt: Date | null;
  }>;
  salesOrders: Array<{
    reviewStatus: SalesOrderReviewStatus;
  }>;
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
  teamId?: string | null;
};

export type CustomerCenterFilters = {
  queue: CustomerQueueKey;
  executionClasses: CustomerExecutionClass[];
  teamId: string;
  salesId: string;
  search: string;
  productKeys: string[];
  productKeyword: string;
  tagIds: string[];
  assignedFrom: string;
  assignedTo: string;
  page: number;
  pageSize: CustomerPageSize;
};

export type CustomerSummaryStats = {
  customerCount: number;
  todayNewCustomerCount: number;
  todayNewImportedCount: number;
  todayAssignedCount: number;
  pendingFirstCallCount: number;
  pendingFollowUpCount: number;
  pendingWechatCount: number;
  pendingInvitationCount: number;
  pendingDealCount: number;
  migrationPendingFollowUpCount: number;
  executionClassCounts: Record<CustomerExecutionClass, number>;
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
  migrationPendingFollowUpCount: number;
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
  migrationPendingFollowUpCount: number;
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
  ownershipMode: CustomerOwnershipMode;
  createdAt: Date;
  latestImportAt: Date | null;
  latestFollowUpAt: Date | null;
  lastEffectiveFollowUpAt: Date | null;
  latestTradeAt: Date | null;
  lifetimeTradeAmount: string;
  approvedTradeOrderCount: number;
  executionClass: CustomerExecutionClass;
  newImported: boolean;
  pendingFirstCall: boolean;
  latestInterestedProduct: string | null;
  latestPurchasedProduct: string | null;
  remark: string | null;
  workingStatuses: CustomerWorkStatusKey[];
  recycleGuard: RecycleMoveGuard;
  recycleFinalizePreview: RecycleFinalizePreview | null;
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
    result: CallResult | null;
    resultCode: string | null;
    resultLabel: string;
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
  callResultOptions: CallResultOption[];
  queueItems: CustomerListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

export type CustomerOperatingDashboardMetric = {
  label: string;
  value: string;
  note: string;
  emphasis?: "default" | "info" | "success" | "warning";
};

export type CustomerOperatingDashboardEmployeeRow = {
  userId: string;
  name: string;
  username: string;
  teamId: string | null;
  teamName: string | null;
  customerCount: number;
  todayAssignedCount: number;
  todayCallCount: number;
  connectedAssignedCount: number;
  connectRate: string;
  todayWechatAddedCount: number;
  historicalWechatAddedCount: number;
  historicalWechatAddedRate: string;
  todayAssignedWechatCount: number;
  todayAssignedWechatRate: string;
  todayInvitationCount: number;
  todayDealCount: number;
  todayRevenueAmount: number;
  todayRevenue: string;
  executionClassCounts: Record<CustomerExecutionClass, number>;
  latestFollowUpAt: Date | null;
};

export type CustomerOperatingDashboardData = {
  scopeLabel: string;
  asOfDateLabel: string;
  summary: CustomerOperatingDashboardMetric[];
  employees: CustomerOperatingDashboardEmployeeRow[];
};

const customerQueueValues = [
  "all",
  "new_imported",
  "pending_first_call",
  "pending_follow_up",
  "pending_wechat",
  "pending_invitation",
  "pending_deal",
  "migration_pending_follow_up",
] as const satisfies CustomerQueueKey[];

const customerWorkStatusValues = [
  "new_imported",
  "pending_first_call",
  "pending_follow_up",
  "pending_wechat",
  "pending_invitation",
  "pending_deal",
  "migration_pending_follow_up",
] as const satisfies CustomerWorkStatusKey[];

const customerExecutionClassValues = ["A", "B", "C", "D", "E"] as const satisfies CustomerExecutionClass[];

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

const connectedCallResults: CallResult[] = [
  CallResult.CONNECTED_NO_TALK,
  CallResult.INTERESTED,
  CallResult.WECHAT_PENDING,
  CallResult.WECHAT_ADDED,
  CallResult.REFUSED_WECHAT,
  CallResult.NEED_CALLBACK,
  CallResult.REFUSED_TO_BUY,
  CallResult.BLACKLIST,
];

const nonConnectedCallResultCodes = [
  "NOT_CONNECTED",
  "INVALID_NUMBER",
  "HUNG_UP",
] as const;

const activeCustomerOwnershipModes = [
  CustomerOwnershipMode.PRIVATE,
  CustomerOwnershipMode.LOCKED,
] as const;

const publicPoolCustomerDetailModes = [
  CustomerOwnershipMode.PUBLIC,
  CustomerOwnershipMode.LOCKED,
] as const;

const legacyQueueAliasMap: Partial<Record<string, CustomerQueueKey>> = {
  all: "all",
  mine: "all",
  pending_first_call: "pending_first_call",
  wechat_pending: "pending_wechat",
  wechat_added: "pending_invitation",
};

const customerCenterFiltersSchema = z.object({
  queue: z.enum(customerQueueValues).default("all"),
  executionClasses: z.array(z.enum(customerExecutionClassValues)).default([]),
  teamId: z.string().trim().default(""),
  salesId: z.string().trim().default(""),
  search: z.string().trim().default(""),
  productKeys: z.array(z.string().trim().min(1)).default([]),
  productKeyword: z.string().trim().default(""),
  tagIds: z.array(z.string().trim().min(1)).default([]),
  assignedFrom: z.string().trim().default(""),
  assignedTo: z.string().trim().default(""),
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
  lastEffectiveFollowUpAt: true,
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
    where: buildVisibleLeadWhereInput(),
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

const customerDashboardSnapshotSelect = {
  id: true,
  createdAt: true,
  lastEffectiveFollowUpAt: true,
  ownerId: true,
  leads: {
    where: buildVisibleLeadWhereInput(),
    select: {
      id: true,
      createdAt: true,
      status: true,
      nextFollowUpAt: true,
    },
  },
  followUpTasks: {
    select: {
      createdAt: true,
      dueAt: true,
      completedAt: true,
      status: true,
    },
  },
  callRecords: {
    select: {
      callTime: true,
      result: true,
      nextFollowUpAt: true,
    },
  },
  wechatRecords: {
    select: {
      createdAt: true,
      addedAt: true,
      addedStatus: true,
      nextFollowUpAt: true,
    },
  },
  liveInvitations: {
    select: {
      createdAt: true,
      invitedAt: true,
    },
  },
  salesOrders: {
    select: {
      reviewStatus: true,
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

async function getLatestCustomerImportMap(customerIds: string[]) {
  if (customerIds.length === 0) {
    return new Map<string, { createdAt: Date; data: CustomerImportOperationLogData }>();
  }

  const logs = await prisma.operationLog.findMany({
    where: {
      targetType: "CUSTOMER",
      targetId: {
        in: customerIds,
      },
      action: {
        in: [...customerContinuationImportOperationActions],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      targetId: true,
      createdAt: true,
      afterData: true,
    },
  });

  const latestMap = new Map<string, { createdAt: Date; data: CustomerImportOperationLogData }>();

  for (const log of logs) {
    if (latestMap.has(log.targetId)) {
      continue;
    }

    const parsed = parseCustomerImportOperationLogData(log.afterData);
    if (!parsed) {
      continue;
    }

    latestMap.set(log.targetId, {
      createdAt: log.createdAt,
      data: parsed,
    });
  }

  return latestMap;
}

async function getLatestCustomerAssignmentMap<
  T extends Pick<CustomerStateSource, "id" | "ownerId" | "leads">,
>(customerSnapshots: T[]) {
  if (customerSnapshots.length === 0) {
    return new Map<string, Date>();
  }

  const customerIds = customerSnapshots.map((snapshot) => snapshot.id);
  const leadIds = [...new Set(customerSnapshots.flatMap((snapshot) => snapshot.leads.map((lead) => lead.id)))];
  const currentOwnerByCustomerId = new Map(
    customerSnapshots.map((snapshot) => [snapshot.id, snapshot.ownerId] as const),
  );

  const [ownershipEvents, leadAssignments, manualCreateLogs] = await Promise.all([
    prisma.customerOwnershipEvent.findMany({
      where: {
        customerId: {
          in: customerIds,
        },
        toOwnerId: {
          not: null,
        },
        toOwnershipMode: CustomerOwnershipMode.PRIVATE,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        customerId: true,
        toOwnerId: true,
        createdAt: true,
      },
    }),
    leadIds.length > 0
      ? prisma.leadAssignment.findMany({
          where: {
            leadId: {
              in: leadIds,
            },
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            createdAt: true,
            toUserId: true,
            lead: {
              select: {
                customerId: true,
              },
            },
          },
        })
      : Promise.resolve(
          [] as Array<{
            createdAt: Date;
            toUserId: string;
            lead: {
              customerId: string | null;
            };
          }>,
        ),
    prisma.operationLog.findMany({
      where: {
        targetType: "CUSTOMER",
        targetId: {
          in: customerIds,
        },
        action: customerManualCreateOperationAction,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        targetId: true,
        createdAt: true,
        afterData: true,
      },
    }),
  ]);

  const latestMap = new Map<string, Date>();

  for (const event of ownershipEvents) {
    const expectedOwnerId = currentOwnerByCustomerId.get(event.customerId);

    if (!expectedOwnerId || event.toOwnerId !== expectedOwnerId || latestMap.has(event.customerId)) {
      continue;
    }

    latestMap.set(event.customerId, event.createdAt);
  }

  for (const assignment of leadAssignments) {
    const customerId = assignment.lead.customerId;

    if (!customerId || latestMap.has(customerId)) {
      continue;
    }

    const expectedOwnerId = currentOwnerByCustomerId.get(customerId);

    if (!expectedOwnerId || assignment.toUserId !== expectedOwnerId) {
      continue;
    }

    latestMap.set(customerId, assignment.createdAt);
  }

  for (const log of manualCreateLogs) {
    if (latestMap.has(log.targetId)) {
      continue;
    }

    const expectedOwnerId = currentOwnerByCustomerId.get(log.targetId);

    if (!expectedOwnerId) {
      continue;
    }

    const ownerId =
      log.afterData &&
      typeof log.afterData === "object" &&
      "ownerId" in log.afterData &&
      typeof log.afterData.ownerId === "string"
        ? log.afterData.ownerId
        : null;

    if (ownerId !== expectedOwnerId) {
      continue;
    }

    latestMap.set(log.targetId, log.createdAt);
  }

  return latestMap;
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

function formatPercentValue(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatCurrencyValue(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDashboardDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function createExecutionClassCountMap() {
  return customerExecutionClassValues.reduce<Record<CustomerExecutionClass, number>>(
    (result, value) => {
      result[value] = 0;
      return result;
    },
    {} as Record<CustomerExecutionClass, number>,
  );
}

function isConnectedCallRecord(record: {
  result: CallResult | null;
  resultCode: string | null;
}) {
  if (record.resultCode) {
    return !nonConnectedCallResultCodes.includes(
      record.resultCode as (typeof nonConnectedCallResultCodes)[number],
    );
  }

  return record.result ? connectedCallResults.includes(record.result) : false;
}

function getCustomerVisibilityWhereInput(actor: CustomerCenterActor): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {
      ownerId: {
        not: null,
      },
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
    };
  }

  if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      return {
        id: "__missing_team_scope__",
      };
    }

    return {
      ownerId: {
        not: null,
      },
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
      owner: {
        is: {
          teamId: actor.teamId,
        },
      },
    };
  }

  if (actor.role === "SALES") {
    return {
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
      ownerId: actor.id,
    };
  }

  return {
    id: "__forbidden_customer_scope__",
  };
}

function getCustomerPublicPoolDetailWhereInput(
  actor: CustomerCenterActor,
): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {
      ownerId: null,
      ownershipMode: {
        in: [...publicPoolCustomerDetailModes],
      },
    };
  }

  if ((actor.role === "SUPERVISOR" || actor.role === "SALES") && actor.teamId) {
    return {
      ownerId: null,
      ownershipMode: {
        in: [...publicPoolCustomerDetailModes],
      },
      publicPoolTeamId: actor.teamId,
    };
  }

  return {
    id: "__forbidden_public_pool_customer_detail__",
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
  const executionClasses = getParamValues(rawSearchParams?.executionClasses).filter(
    (value): value is CustomerExecutionClass =>
      customerExecutionClassValues.includes(value as CustomerExecutionClass),
  );
  const rawPageSize = Number(getParamValue(rawSearchParams?.pageSize) || CUSTOMERS_PAGE_SIZE);
  const pageSize = customerPageSizeOptions.includes(rawPageSize as CustomerPageSize)
    ? rawPageSize
    : CUSTOMERS_PAGE_SIZE;

  return customerCenterFiltersSchema.parse({
    queue: rawQueue,
    executionClasses: [...new Set(executionClasses)],
    teamId: getParamValue(rawSearchParams?.teamId),
    salesId: getParamValue(rawSearchParams?.salesId),
    search,
    productKeys: getParamValues(rawSearchParams?.productKeys),
    productKeyword: getParamValue(rawSearchParams?.productKeyword),
    tagIds: getParamValues(rawSearchParams?.tagIds),
    assignedFrom:
      getParamValue(rawSearchParams?.assignedFrom) || getParamValue(rawSearchParams?.importedFrom),
    assignedTo:
      getParamValue(rawSearchParams?.assignedTo) || getParamValue(rawSearchParams?.importedTo),
    page: getParamValue(rawSearchParams?.page) || "1",
    pageSize,
  });
}

async function getCustomerCenterWorkspaceBase(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const recycledCustomerIds = await listActiveCustomerIds(prisma);
  const [teams, salesUsers, customerSnapshots] = await Promise.all([
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
      where: {
        AND: [
          visibleWhere,
          ...(recycledCustomerIds.length > 0
            ? [
                {
                  id: {
                    notIn: recycledCustomerIds,
                  },
                } satisfies Prisma.CustomerWhereInput,
              ]
            : []),
        ],
      },
      select: customerSnapshotSelect,
    }),
  ]);
  const [latestCustomerImportMap, latestCustomerAssignmentMap] = await Promise.all([
    getLatestCustomerImportMap(customerSnapshots.map((snapshot) => snapshot.id)),
    getLatestCustomerAssignmentMap(customerSnapshots),
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
    executionClasses: parsedFilters.executionClasses,
    teamId,
    salesId,
    search: parsedFilters.search,
    productKeys: parsedFilters.productKeys,
    productKeyword: parsedFilters.productKeyword,
    tagIds: parsedFilters.tagIds,
    assignedFrom: parsedFilters.assignedFrom,
    assignedTo: parsedFilters.assignedTo,
    page: parsedFilters.page,
    pageSize: parsedFilters.pageSize,
  };

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const stateMap = new Map(
    customerSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotState(
        snapshot,
        latestCustomerImportMap.get(snapshot.id)?.createdAt ?? null,
        latestCustomerAssignmentMap.get(snapshot.id) ?? null,
        now,
        todayStart,
        todayEnd,
      ),
    ]),
  );

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

  return {
    actor,
    filters,
    teams,
    salesUsers,
    customerSnapshots,
    stateMap,
    scopeSnapshots,
    todayStart,
    todayEnd,
  };
}

function getCustomerCenterFilteredSnapshots(input: {
  scopeSnapshots: CustomerSnapshot[];
  stateMap: Map<string, CustomerSnapshotState>;
  filters: CustomerCenterFilters;
}) {
  return input.scopeSnapshots
    .filter((snapshot) => matchesCustomerSearch(snapshot, input.filters.search))
    .filter((snapshot) =>
      matchesCustomerExecutionClasses(
        input.stateMap.get(snapshot.id),
        input.filters.executionClasses,
      ),
    )
    .filter((snapshot) =>
      matchesCustomerProducts(
        snapshot,
        input.stateMap.get(snapshot.id),
        input.filters.productKeys,
        input.filters.productKeyword,
      ),
    )
    .filter((snapshot) => matchesCustomerTags(input.stateMap.get(snapshot.id), input.filters.tagIds))
    .filter((snapshot) =>
      matchesAssignedDateRange(
        input.stateMap.get(snapshot.id),
        input.filters.assignedFrom,
        input.filters.assignedTo,
      ),
    )
    .sort((left, right) => compareCustomerSnapshots(left, right, input.stateMap));
}

export async function listVisibleCustomerCenterCustomerIds(
  viewer: CustomerViewer,
  customerIds: string[],
) {
  if (customerIds.length === 0) {
    return [];
  }

  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const hiddenCustomerIds = await listActiveCustomerIds(prisma);
  const rows = await prisma.customer.findMany({
    where: {
      AND: [
        visibleWhere,
        {
          id: {
            in: customerIds,
          },
        },
        ...(hiddenCustomerIds.length > 0
          ? [
              {
                id: {
                  notIn: hiddenCustomerIds,
                },
              } satisfies Prisma.CustomerWhereInput,
            ]
          : []),
      ],
    },
    select: {
      id: true,
    },
  });

  return rows.map((row) => row.id);
}

export async function listFilteredCustomerCenterCustomerIds(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  const workspace = await getCustomerCenterWorkspaceBase(viewer, rawSearchParams);
  return getCustomerCenterFilteredSnapshots({
    scopeSnapshots: workspace.scopeSnapshots,
    stateMap: workspace.stateMap,
    filters: workspace.filters,
  }).map((snapshot) => snapshot.id);
}

function buildPendingFollowUpMatcher(snapshot: CustomerStateSource, now: Date) {
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

function buildSuccessfulWechatMatcher(snapshot: CustomerStateSource) {
  return (
    snapshot.wechatRecords.some((record) => record.addedStatus === WechatAddStatus.ADDED) ||
    snapshot.callRecords.some((record) => record.result === CallResult.WECHAT_ADDED)
  );
}

function getLatestCallResult(snapshot: CustomerStateSource) {
  const latestRecord = snapshot.callRecords.reduce<(typeof snapshot.callRecords)[number] | null>(
    (currentLatest, candidate) => {
      if (!candidate.result) {
        return currentLatest;
      }

      if (!currentLatest || candidate.callTime.getTime() > currentLatest.callTime.getTime()) {
        return candidate;
      }

      return currentLatest;
    },
    null,
  );

  return latestRecord?.result ?? null;
}

function deriveCustomerExecutionClassFromSignals(input: {
  approvedSalesOrderCount: number;
  hasLiveInvitation: boolean;
  hasSuccessfulWechatSignal: boolean;
  latestCallResult: CallResult | null;
}): CustomerExecutionClass {
  if (input.approvedSalesOrderCount >= 2) {
    return "A";
  }

  if (input.hasLiveInvitation) {
    return "C";
  }

  if (input.hasSuccessfulWechatSignal) {
    return "B";
  }

  if (input.latestCallResult === CallResult.REFUSED_WECHAT) {
    return "E";
  }

  return "D";
}

function deriveCustomerExecutionClass(snapshot: CustomerStateSource): CustomerExecutionClass {
  return deriveCustomerExecutionClassFromSignals({
    approvedSalesOrderCount: snapshot.salesOrders.filter(
      (record) => record.reviewStatus === SalesOrderReviewStatus.APPROVED,
    ).length,
    hasLiveInvitation: snapshot.liveInvitations.length > 0,
    hasSuccessfulWechatSignal: buildSuccessfulWechatMatcher(snapshot),
    latestCallResult: getLatestCallResult(snapshot),
  });
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

function getCustomerSnapshotCoreState(
  snapshot: CustomerStateSource,
  latestCustomerImportAt: Date | null,
  assignedAt: Date | null,
  now: Date,
  todayStart: Date,
  todayEnd: Date,
): CustomerDashboardState {
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
  const executionClass = deriveCustomerExecutionClass(snapshot);
  const migrationPendingFollowUp = Boolean(
    latestCustomerImportAt &&
      (!snapshot.lastEffectiveFollowUpAt ||
        snapshot.lastEffectiveFollowUpAt.getTime() < latestCustomerImportAt.getTime()),
  );
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
      case "migration_pending_follow_up":
        return migrationPendingFollowUp;
      default:
        return false;
    }
  });
  return {
    latestLeadAt,
    latestFollowUpAt,
    latestCustomerImportAt,
    assignedAt,
    executionClass,
    newImported,
    pendingFirstCall,
    pendingFollowUp,
    pendingWechat,
    pendingInvitation,
    pendingDeal,
    migrationPendingFollowUp,
    workingStatuses,
  };
}

function getCustomerSnapshotState(
  snapshot: CustomerSnapshot,
  latestCustomerImportAt: Date | null,
  assignedAt: Date | null,
  now: Date,
  todayStart: Date,
  todayEnd: Date,
): CustomerSnapshotState {
  return {
    ...getCustomerSnapshotCoreState(
      snapshot,
      latestCustomerImportAt,
      assignedAt,
      now,
      todayStart,
      todayEnd,
    ),
    latestInterestedProduct: getLatestInterestedProduct(snapshot),
    latestPurchasedProduct: getLatestPurchasedProduct(snapshot),
    productKeys: getSnapshotProductEntries(snapshot).map((item) => item.key),
    tagIds: [...new Set(snapshot.customerTags.map((item) => item.tagId))],
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
    case "migration_pending_follow_up":
      return state.migrationPendingFollowUp;
    case "all":
    default:
      return true;
  }
}

function buildSummaryStats<T extends Pick<CustomerStateSource, "id" | "createdAt">>(
  snapshots: T[],
  stateMap: Map<string, CustomerDashboardState | CustomerSnapshotState>,
  todayStart: Date,
  todayEnd: Date,
): CustomerSummaryStats {
  const executionClassCounts = createExecutionClassCountMap();

  for (const snapshot of snapshots) {
    const executionClass = stateMap.get(snapshot.id)?.executionClass;

    if (executionClass) {
      executionClassCounts[executionClass] += 1;
    }
  }

  return {
    customerCount: snapshots.length,
    todayNewCustomerCount: snapshots.filter((item) =>
      isWithinToday(item.createdAt, todayStart, todayEnd),
    ).length,
    todayNewImportedCount: snapshots.filter((item) => stateMap.get(item.id)?.newImported).length,
    todayAssignedCount: snapshots.filter((item) => {
      const assignedAt = stateMap.get(item.id)?.assignedAt;
      return assignedAt ? isWithinToday(assignedAt, todayStart, todayEnd) : false;
    }).length,
    pendingFirstCallCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingFirstCall)
      .length,
    pendingFollowUpCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingFollowUp)
      .length,
    pendingWechatCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingWechat).length,
    pendingInvitationCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingInvitation)
      .length,
    pendingDealCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingDeal).length,
    migrationPendingFollowUpCount: snapshots.filter(
      (item) => stateMap.get(item.id)?.migrationPendingFollowUp,
    ).length,
    executionClassCounts,
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

function matchesCustomerExecutionClasses(
  state: CustomerSnapshotState | undefined,
  executionClasses: CustomerExecutionClass[],
) {
  if (executionClasses.length === 0) {
    return true;
  }

  if (!state) {
    return false;
  }

  return executionClasses.includes(state.executionClass);
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

function matchesAssignedDateRange(
  state: CustomerSnapshotState | undefined,
  assignedFrom: string,
  assignedTo: string,
) {
  if (!assignedFrom && !assignedTo) {
    return true;
  }

  const assignedAt = state?.assignedAt ?? null;
  if (!assignedAt) {
    return false;
  }

  const from = parseDateOnly(assignedFrom, "start");
  const to = parseDateOnly(assignedTo, "end");

  if (from && assignedAt.getTime() < from.getTime()) {
    return false;
  }

  if (to && assignedAt.getTime() > to.getTime()) {
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
  // Keep the customer center stable after follow-up actions; sort by assignment/entry time instead.
  const leftAnchor =
    leftState?.assignedAt ??
    leftState?.latestCustomerImportAt ??
    leftState?.latestLeadAt ??
    left.createdAt;
  const rightAnchor =
    rightState?.assignedAt ??
    rightState?.latestCustomerImportAt ??
    rightState?.latestLeadAt ??
    right.createdAt;

  if (rightAnchor.getTime() !== leftAnchor.getTime()) {
    return rightAnchor.getTime() - leftAnchor.getTime();
  }

  if (right.createdAt.getTime() !== left.createdAt.getTime()) {
    return right.createdAt.getTime() - left.createdAt.getTime();
  }

  return left.id.localeCompare(right.id);
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

  const fallbackRecycleGuard: RecycleMoveGuard = {
    canMoveToRecycleBin: false,
    fallbackAction: "/customers",
    fallbackActionLabel: "返回客户工作台",
    blockerSummary: "当前客户回收判断暂时不可用，请刷新后重试。",
    blockers: [],
    futureRestoreBlockers: [],
  };

  const [items, tradeOrderSummaries, recycleSnapshots] = await Promise.all([
    prisma.customer.findMany({
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
        remark: true,
        status: true,
        ownershipMode: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        leads: {
          where: buildVisibleLeadWhereInput(),
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
            resultCode: true,
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
            leads: {
              where: buildVisibleLeadWhereInput(),
            },
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
    }),
    prisma.tradeOrder.groupBy({
      by: ["customerId"],
      where: {
        customerId: {
          in: customerIds,
        },
        tradeStatus: TradeOrderStatus.APPROVED,
      },
      _sum: {
        finalAmount: true,
      },
      _max: {
        createdAt: true,
      },
      _count: {
        _all: true,
      },
    }),
    Promise.all(
      customerIds.map(async (customerId) => {
        const [target, finalizePreview] = await Promise.all([
          getCustomerRecycleTarget(prisma, "CUSTOMER", customerId),
          buildCustomerFinalizePreview(prisma, {
            targetType: "CUSTOMER",
            targetId: customerId,
            domain: "CUSTOMER",
          }),
        ]);

        return [
          customerId,
          {
            recycleGuard: target?.guard ?? fallbackRecycleGuard,
            recycleFinalizePreview: finalizePreview,
          },
        ] as const;
      }),
    ),
  ]);

  const recycleSnapshotMap = new Map(recycleSnapshots);
  const labeledCallRecords = await hydrateCallResultLabels(
    items.flatMap((item) => item.callRecords),
  );
  const labeledCallRecordMap = new Map(
    labeledCallRecords.map((item) => [item.id, item]),
  );
  const tradeOrderSummaryMap = new Map(
    tradeOrderSummaries.map((item) => [
      item.customerId,
      {
        lifetimeTradeAmount: item._sum.finalAmount?.toString() ?? "0",
        latestTradeAt: item._max.createdAt ?? null,
        approvedTradeOrderCount: item._count._all ?? 0,
      },
    ]),
  );
  const itemMap = new Map(items.map((item) => [item.id, item]));
  return customerIds.reduce<CustomerListItem[]>((result, id) => {
    const item = itemMap.get(id);
    const state = stateMap.get(id);
    const tradeOrderSummary = tradeOrderSummaryMap.get(id);
    const recycleSnapshot = recycleSnapshotMap.get(id);

    if (item) {
      result.push({
        ...item,
        callRecords: item.callRecords.map((record) => {
          const labeled = labeledCallRecordMap.get(record.id);

          return {
            id: record.id,
            callTime: record.callTime,
            durationSeconds: record.durationSeconds,
            result: record.result,
            resultCode: labeled?.resultCode ?? record.resultCode ?? record.result ?? null,
            resultLabel:
              labeled?.resultLabel ?? record.resultCode ?? record.result ?? "未记录",
            remark: record.remark,
            nextFollowUpAt: record.nextFollowUpAt,
            sales: record.sales,
          };
        }),
        latestImportAt: state?.latestLeadAt ?? null,
        latestFollowUpAt: state?.latestFollowUpAt ?? null,
        lastEffectiveFollowUpAt: state?.latestFollowUpAt ?? null,
        latestTradeAt: tradeOrderSummary?.latestTradeAt ?? null,
        lifetimeTradeAmount: tradeOrderSummary?.lifetimeTradeAmount ?? "0",
        approvedTradeOrderCount: tradeOrderSummary?.approvedTradeOrderCount ?? 0,
        executionClass: state?.executionClass ?? "D",
        newImported: state?.newImported ?? false,
        pendingFirstCall: state?.pendingFirstCall ?? false,
        latestInterestedProduct: state?.latestInterestedProduct ?? null,
        latestPurchasedProduct: state?.latestPurchasedProduct ?? null,
        remark: item.remark,
        workingStatuses: state?.workingStatuses ?? [],
        recycleGuard: recycleSnapshot?.recycleGuard ?? fallbackRecycleGuard,
        recycleFinalizePreview: recycleSnapshot?.recycleFinalizePreview ?? null,
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
        rolledBackAt: null,
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
            rolledBackAt: null,
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
  const [workspace, activeTags] = await Promise.all([
    getCustomerCenterWorkspaceBase(viewer, rawSearchParams),
    getActiveTagOptions(),
  ]);
  const {
    actor,
    filters,
    teams,
    salesUsers,
    customerSnapshots,
    stateMap,
    scopeSnapshots,
    todayStart,
    todayEnd,
  } = workspace;

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
      migrationPendingFollowUpCount: stats.migrationPendingFollowUpCount,
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
        migrationPendingFollowUpCount: stats.migrationPendingFollowUpCount,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      if (right.customerCount !== left.customerCount) {
        return right.customerCount - left.customerCount;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });

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
  const filteredQueueSnapshots = getCustomerCenterFilteredSnapshots({
    scopeSnapshots,
    stateMap,
    filters,
  });
  const totalCount = filteredQueueSnapshots.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const pageCustomerIds = filteredQueueSnapshots
    .slice((currentPage - 1) * filters.pageSize, currentPage * filters.pageSize)
    .map((item) => item.id);
  const [queueItems, callResultOptions] = await Promise.all([
    fetchCustomerListItems(pageCustomerIds, stateMap),
    getEnabledCallResultOptions(),
  ]);

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
    callResultOptions,
    queueItems,
    pagination: {
      page: currentPage,
      pageSize: filters.pageSize,
      totalCount,
      totalPages,
    },
  } satisfies CustomerCenterData;
}

export async function getCustomerOperatingDashboardData(
  viewer: CustomerViewer,
): Promise<CustomerOperatingDashboardData> {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const recycledCustomerIds = await listActiveCustomerIds(prisma);
  const [teams, salesUsers, customerSnapshots] = await Promise.all([
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
      where: {
        AND: [
          visibleWhere,
          ...(recycledCustomerIds.length > 0
            ? [
                {
                  id: {
                    notIn: recycledCustomerIds,
                  },
                } satisfies Prisma.CustomerWhereInput,
              ]
            : []),
        ],
      },
      select: customerDashboardSnapshotSelect,
    }),
  ]);
  const [latestCustomerImportMap, latestCustomerAssignmentMap] = await Promise.all([
    getLatestCustomerImportMap(customerSnapshots.map((snapshot) => snapshot.id)),
    getLatestCustomerAssignmentMap(customerSnapshots),
  ]);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const stateMap = new Map(
    customerSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotCoreState(
        snapshot,
        latestCustomerImportMap.get(snapshot.id)?.createdAt ?? null,
        latestCustomerAssignmentMap.get(snapshot.id) ?? null,
        now,
        todayStart,
        todayEnd,
      ),
    ]),
  );
  const scopeSalesUsers =
    actor.role === "ADMIN" || actor.role === "SUPERVISOR" ? salesUsers : [];
  const scopeLabel =
    actor.role === "ADMIN" ? "组织范围" : teams[0]?.name ?? "团队范围";
  const asOfDateLabel = formatDashboardDate(todayStart);

  if (scopeSalesUsers.length === 0) {
    return {
      scopeLabel,
      asOfDateLabel,
      summary: [
        {
          label: "今日分配",
          value: "0",
          note: `${asOfDateLabel} 暂无在岗销售进入驾驶舱统计口径。`,
          emphasis: "info",
        },
      ],
      employees: [],
    };
  }

  const salesUserIds = scopeSalesUsers.map((item) => item.id);
  const [todayCallRecords, todayWechatRecords, todayLiveInvitations, todayTradeOrders] =
    await Promise.all([
      prisma.callRecord.findMany({
        where: {
          salesId: {
            in: salesUserIds,
          },
          callTime: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        select: {
          salesId: true,
          customerId: true,
          result: true,
          resultCode: true,
        },
      }),
      prisma.wechatRecord.findMany({
        where: {
          salesId: {
            in: salesUserIds,
          },
          addedStatus: WechatAddStatus.ADDED,
          OR: [
            {
              addedAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            {
              createdAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
          ],
        },
        select: {
          salesId: true,
          customerId: true,
        },
      }),
      prisma.liveInvitation.findMany({
        where: {
          salesId: {
            in: salesUserIds,
          },
          OR: [
            {
              invitedAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            {
              createdAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
          ],
        },
        select: {
          salesId: true,
          customerId: true,
        },
      }),
      prisma.tradeOrder.findMany({
        where: {
          ownerId: {
            in: salesUserIds,
          },
          tradeStatus: TradeOrderStatus.APPROVED,
          createdAt: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        select: {
          ownerId: true,
          finalAmount: true,
        },
      }),
    ]);

  const customerSnapshotsByOwnerId = new Map<string, CustomerDashboardSnapshot[]>();
  const todayAssignedCustomerIdsByOwnerId = new Map<string, Set<string>>();

  for (const snapshot of customerSnapshots) {
    if (!snapshot.ownerId) {
      continue;
    }

    const ownerSnapshots = customerSnapshotsByOwnerId.get(snapshot.ownerId) ?? [];
    ownerSnapshots.push(snapshot);
    customerSnapshotsByOwnerId.set(snapshot.ownerId, ownerSnapshots);

    const assignedAt = stateMap.get(snapshot.id)?.assignedAt;
    if (!assignedAt || !isWithinToday(assignedAt, todayStart, todayEnd)) {
      continue;
    }

    const assignedIds = todayAssignedCustomerIdsByOwnerId.get(snapshot.ownerId) ?? new Set<string>();
    assignedIds.add(snapshot.id);
    todayAssignedCustomerIdsByOwnerId.set(snapshot.ownerId, assignedIds);
  }

  const todayCallCountBySalesId = new Map<string, number>();
  const connectedAssignedCustomerIdsBySalesId = new Map<string, Set<string>>();

  for (const record of todayCallRecords) {
    todayCallCountBySalesId.set(
      record.salesId,
      (todayCallCountBySalesId.get(record.salesId) ?? 0) + 1,
    );

    if (!record.customerId) {
      continue;
    }

    const assignedCustomerIds = todayAssignedCustomerIdsByOwnerId.get(record.salesId);
    if (!assignedCustomerIds?.has(record.customerId) || !isConnectedCallRecord(record)) {
      continue;
    }

    const connectedIds =
      connectedAssignedCustomerIdsBySalesId.get(record.salesId) ?? new Set<string>();
    connectedIds.add(record.customerId);
    connectedAssignedCustomerIdsBySalesId.set(record.salesId, connectedIds);
  }

  const todayWechatCustomerIdsBySalesId = new Map<string, Set<string>>();

  for (const record of todayWechatRecords) {
    if (!record.customerId) {
      continue;
    }

    const customerIds = todayWechatCustomerIdsBySalesId.get(record.salesId) ?? new Set<string>();
    customerIds.add(record.customerId);
    todayWechatCustomerIdsBySalesId.set(record.salesId, customerIds);
  }

  const todayInvitationCustomerIdsBySalesId = new Map<string, Set<string>>();

  for (const record of todayLiveInvitations) {
    if (!record.customerId) {
      continue;
    }

    const customerIds =
      todayInvitationCustomerIdsBySalesId.get(record.salesId) ?? new Set<string>();
    customerIds.add(record.customerId);
    todayInvitationCustomerIdsBySalesId.set(record.salesId, customerIds);
  }

  const todayDealCountBySalesId = new Map<string, number>();
  const todayRevenueBySalesId = new Map<string, number>();

  for (const record of todayTradeOrders) {
    if (!record.ownerId) {
      continue;
    }

    todayDealCountBySalesId.set(
      record.ownerId,
      (todayDealCountBySalesId.get(record.ownerId) ?? 0) + 1,
    );
    todayRevenueBySalesId.set(
      record.ownerId,
      (todayRevenueBySalesId.get(record.ownerId) ?? 0) + Number(record.finalAmount ?? 0),
    );
  }

  const employees = scopeSalesUsers
    .map<CustomerOperatingDashboardEmployeeRow>((sales) => {
      const salesSnapshots = customerSnapshotsByOwnerId.get(sales.id) ?? [];
      const stats = buildSummaryStats(salesSnapshots, stateMap, todayStart, todayEnd);
      const todayAssignedCustomerIds =
        todayAssignedCustomerIdsByOwnerId.get(sales.id) ?? new Set<string>();
      const connectedAssignedCustomerIds =
        connectedAssignedCustomerIdsBySalesId.get(sales.id) ?? new Set<string>();
      const todayWechatCustomerIds =
        todayWechatCustomerIdsBySalesId.get(sales.id) ?? new Set<string>();
      const historicalWechatAddedCount = [...todayWechatCustomerIds].filter(
        (customerId) => !todayAssignedCustomerIds.has(customerId),
      ).length;
      const todayAssignedWechatCount = [...todayWechatCustomerIds].filter((customerId) =>
        todayAssignedCustomerIds.has(customerId),
      ).length;
      const todayInvitationCount =
        todayInvitationCustomerIdsBySalesId.get(sales.id)?.size ?? 0;
      const todayDealCount = todayDealCountBySalesId.get(sales.id) ?? 0;
      const todayRevenue = todayRevenueBySalesId.get(sales.id) ?? 0;

      return {
        userId: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayAssignedCount: stats.todayAssignedCount,
        todayCallCount: todayCallCountBySalesId.get(sales.id) ?? 0,
        connectedAssignedCount: connectedAssignedCustomerIds.size,
        connectRate: formatPercentValue(
          connectedAssignedCustomerIds.size,
          stats.todayAssignedCount,
        ),
        todayWechatAddedCount: todayWechatCustomerIds.size,
        historicalWechatAddedCount,
        historicalWechatAddedRate: formatPercentValue(
          historicalWechatAddedCount,
          todayWechatCustomerIds.size,
        ),
        todayAssignedWechatCount,
        todayAssignedWechatRate: formatPercentValue(
          todayAssignedWechatCount,
          stats.todayAssignedCount,
        ),
        todayInvitationCount,
        todayDealCount,
        todayRevenueAmount: todayRevenue,
        todayRevenue: formatCurrencyValue(todayRevenue),
        executionClassCounts: stats.executionClassCounts,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      if (right.todayAssignedCount !== left.todayAssignedCount) {
        return right.todayAssignedCount - left.todayAssignedCount;
      }

      if (right.todayCallCount !== left.todayCallCount) {
        return right.todayCallCount - left.todayCallCount;
      }

      if (right.todayDealCount !== left.todayDealCount) {
        return right.todayDealCount - left.todayDealCount;
      }

      if (right.customerCount !== left.customerCount) {
        return right.customerCount - left.customerCount;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });

  const totals = employees.reduce(
    (result, row) => {
      result.todayAssignedCount += row.todayAssignedCount;
      result.connectedAssignedCount += row.connectedAssignedCount;
      result.todayWechatAddedCount += row.todayWechatAddedCount;
      result.historicalWechatAddedCount += row.historicalWechatAddedCount;
      result.todayAssignedWechatCount += row.todayAssignedWechatCount;
      result.todayInvitationCount += row.todayInvitationCount;
      result.todayDealCount += row.todayDealCount;
      result.todayRevenue += row.todayRevenueAmount;
      return result;
    },
    {
      todayAssignedCount: 0,
      connectedAssignedCount: 0,
      todayWechatAddedCount: 0,
      historicalWechatAddedCount: 0,
      todayAssignedWechatCount: 0,
      todayInvitationCount: 0,
      todayDealCount: 0,
      todayRevenue: 0,
    },
  );

  return {
    scopeLabel,
    asOfDateLabel,
    summary: [
      {
        label: "今日分配",
        value: String(totals.todayAssignedCount),
        note: `${asOfDateLabel} 分配到当前统计范围销售名下`,
        emphasis: "info",
      },
      {
        label: "接通率",
        value: formatPercentValue(
          totals.connectedAssignedCount,
          totals.todayAssignedCount,
        ),
        note: `按已分配客户计算 · 已接通 ${totals.connectedAssignedCount} / ${totals.todayAssignedCount}`,
      },
      {
        label: "加微数",
        value: String(totals.todayWechatAddedCount),
        note: `${asOfDateLabel} 今日形成 ADDED`,
      },
      {
        label: "历史加微率",
        value: formatPercentValue(
          totals.historicalWechatAddedCount,
          totals.todayWechatAddedCount,
        ),
        note: `非当日分配但今日加微 ${totals.historicalWechatAddedCount} / ${totals.todayWechatAddedCount}`,
      },
      {
        label: "邀约进场",
        value: String(totals.todayInvitationCount),
        note: "直播邀约口径",
        emphasis: "success",
      },
      {
        label: "出单",
        value: String(totals.todayDealCount),
        note: "今日审批通过主单",
        emphasis: "success",
      },
      {
        label: "销售额",
        value: formatCurrencyValue(totals.todayRevenue),
        note: "今日审批通过主单金额",
      },
      {
        label: "当日线索加微率",
        value: formatPercentValue(
          totals.todayAssignedWechatCount,
          totals.todayAssignedCount,
        ),
        note: `今日分配客户中已加微 ${totals.todayAssignedWechatCount} / ${totals.todayAssignedCount}`,
        emphasis: "warning",
      },
    ],
    employees,
  };
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
        where: buildVisibleLeadWhereInput(),
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
          leads: {
            where: buildVisibleLeadWhereInput(),
          },
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

  const recycledEntry = await findActiveCustomerRecycleEntry(prisma, customerId);

  if (recycledEntry) {
    return null;
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const publicPoolDetailWhere = getCustomerPublicPoolDetailWhereInput(actor);

  const customer = await prisma.customer.findFirst({
    where: {
      AND: [
        { id: customerId },
        {
          OR: [visibleWhere, publicPoolDetailWhere],
        },
      ],
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
      ownershipMode: true,
      publicPoolEnteredAt: true,
      publicPoolReason: true,
      claimLockedUntil: true,
      lastEffectiveFollowUpAt: true,
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
      lastOwner: {
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
      publicPoolTeam: {
        select: {
          id: true,
          name: true,
          code: true,
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

  const [
    firstLead,
    latestLead,
    latestCall,
    latestWechat,
    latestLive,
    successfulWechatRecord,
    successfulWechatCall,
    operationLogCount,
    logisticsFollowUpCount,
    approvedTradeOrderSummary,
    approvedTradeOrderCount,
    approvedSalesOrderCount,
  ] =
    await Promise.all([
      prisma.lead.findFirst({
        where: withVisibleLeadWhere({ customerId: detail.customer.id }),
        orderBy: { createdAt: "asc" },
        select: { source: true, createdAt: true },
      }),
      prisma.lead.findFirst({
        where: withVisibleLeadWhere({ customerId: detail.customer.id }),
        orderBy: { createdAt: "desc" },
        select: { source: true, createdAt: true },
      }),
      prisma.callRecord.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { callTime: "desc" },
        select: { callTime: true, result: true },
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
      prisma.wechatRecord.findFirst({
        where: {
          customerId: detail.customer.id,
          addedStatus: WechatAddStatus.ADDED,
        },
        select: { id: true },
      }),
      prisma.callRecord.findFirst({
        where: {
          customerId: detail.customer.id,
          result: CallResult.WECHAT_ADDED,
        },
        select: { id: true },
      }),
      prisma.operationLog.count({
        where: await buildCustomerDetailOperationLogWhere(detail.customer.id),
      }),
      prisma.logisticsFollowUpTask.count({
        where: {
          customerId: detail.customer.id,
        },
      }),
      prisma.tradeOrder.aggregate({
        where: {
          customerId: detail.customer.id,
          tradeStatus: TradeOrderStatus.APPROVED,
        },
        _sum: {
          finalAmount: true,
        },
        _max: {
          createdAt: true,
        },
      }),
      prisma.tradeOrder.count({
        where: {
          customerId: detail.customer.id,
          tradeStatus: TradeOrderStatus.APPROVED,
        },
      }),
      prisma.salesOrder.count({
        where: {
          customerId: detail.customer.id,
          reviewStatus: SalesOrderReviewStatus.APPROVED,
        },
      }),
    ]);

  const executionClass = deriveCustomerExecutionClassFromSignals({
    approvedSalesOrderCount,
    hasLiveInvitation: Boolean(latestLive),
    hasSuccessfulWechatSignal: Boolean(successfulWechatRecord || successfulWechatCall),
    latestCallResult: latestCall?.result ?? null,
  });
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const newImported = Boolean(
    latestLead?.createdAt && isWithinToday(latestLead.createdAt, todayStart, todayEnd),
  );
  const pendingFirstCall = !latestCall;

  return {
    ...detail.customer,
    viewerScope: detail.actor.role,
    executionClass,
    newImported,
    pendingFirstCall,
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
    tradeOrderSummary: {
      approvedCount: approvedTradeOrderCount,
      lifetimeAmount: approvedTradeOrderSummary._sum.finalAmount?.toString() ?? "0",
      latestTradeAt: approvedTradeOrderSummary._max.createdAt ?? null,
    },
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

  const [
    leads,
    mergeLogs,
    customerTags,
    availableTags,
    latestCustomerImportLog,
    importedCustomerDeletion,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: withVisibleLeadWhere({ customerId: detail.customer.id }),
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
        leadIdSnapshot: true,
        leadNameSnapshot: true,
        leadPhoneSnapshot: true,
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
            rolledBackAt: true,
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
    prisma.operationLog.findFirst({
      where: {
        targetType: "CUSTOMER",
        targetId: detail.customer.id,
        action: {
          in: [...customerContinuationImportOperationActions],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        afterData: true,
      },
    }),
    resolveImportedCustomerDeletionGuard(viewer, detail.customer.id),
  ]);

  return {
    leads,
    mergeLogs,
    customerTags,
    availableTags,
    importedCustomerDeletion,
    customerImportSummary: latestCustomerImportLog
      ? {
          createdAt: latestCustomerImportLog.createdAt,
          data: parseCustomerImportOperationLogData(latestCustomerImportLog.afterData),
        }
      : null,
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

  const [records, callResultOptions] = await Promise.all([
    prisma.callRecord.findMany({
      where: { customerId: detail.customer.id },
      orderBy: { callTime: "desc" },
      take: 20,
      select: {
        id: true,
        callTime: true,
        durationSeconds: true,
        result: true,
        resultCode: true,
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
    getEnabledCallResultOptions(),
  ]);

  return {
    records: await hydrateCallResultLabels(records),
    callResultOptions,
  };
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
