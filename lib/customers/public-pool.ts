import {
  CallResult,
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  PublicPoolReason,
  SalesOrderReviewStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import {
  getDefaultSystemCallResultDefinition,
  isSystemCallResultCode,
  resolveStoredCallResultCode,
} from "@/lib/calls/metadata";
import { z } from "zod";
import {
  canAccessCustomerPublicPool,
  canClaimPublicPoolCustomer,
  canManageCustomerPublicPool,
} from "@/lib/auth/access";
import {
  CUSTOMERS_PAGE_SIZE,
  customerPageSizeOptions,
  type CustomerPageSize,
} from "@/lib/customers/metadata";
import { getCustomerOwnershipActorContext } from "@/lib/customers/ownership";
import { getResolvedTeamPublicPoolSetting } from "@/lib/customers/public-pool-settings";
import {
  ownershipEventReasonLabels,
  publicPoolReasonLabels,
  type PublicPoolAutoAssignStrategyValue,
} from "@/lib/customers/public-pool-metadata";
import { prisma } from "@/lib/db/prisma";
import { buildVisibleLeadWhereInput } from "@/lib/leads/visibility";
import { getLeadSourceLabel } from "@/lib/leads/metadata";

type SearchParamsValue = string | string[] | undefined;

type PublicPoolView = "pool" | "recycle" | "records";
type PublicPoolSegment =
  | "all"
  | "claimable"
  | "locked"
  | "today_new"
  | "expiring_soon"
  | "unreachable";

type PublicPoolActor = Awaited<ReturnType<typeof getCustomerOwnershipActorContext>>;

const publicPoolViewValues = ["pool", "recycle", "records"] as const satisfies PublicPoolView[];
const publicPoolSegmentValues = [
  "all",
  "claimable",
  "locked",
  "today_new",
  "expiring_soon",
  "unreachable",
] as const satisfies PublicPoolSegment[];

// 拨打关系分桶 (回收工作台 + 公海工作台共用口径): 以选定的业务员/目标销售为参照,
// 看"她对这个号码的拨打关系" — never=从未拨打过, withinXX=该窗口内打过.
// 回收侧没选业务员时退化为"任意人拨打过".
const publicPoolCalledRangeValues = ["any", "never", "within1d", "within7d", "within30d"] as const;
const publicPoolCallOutcomeValues = ["all", "unreachable"] as const;
const publicPoolDialBucketValues = ["all", "never", "within1d", "within7d", "within30d"] as const;

export type PublicPoolCalledRange = (typeof publicPoolCalledRangeValues)[number];
export type PublicPoolCallOutcome = (typeof publicPoolCallOutcomeValues)[number];
export type PublicPoolDialBucket = (typeof publicPoolDialBucketValues)[number];

const publicPoolFiltersSchema = z.object({
  view: z.enum(publicPoolViewValues).default("pool"),
  segment: z.enum(publicPoolSegmentValues).default("all"),
  search: z.string().trim().default(""),
  reason: z.string().trim().default(""),
  teamId: z.string().trim().default(""),
  hasOrders: z.enum(["all", "yes", "no"]).default("all"),
  ownerId: z.string().trim().default(""),
  calledRange: z.enum(publicPoolCalledRangeValues).default("any"),
  callOutcome: z.enum(publicPoolCallOutcomeValues).default("all"),
  targetSalesId: z.string().trim().default(""),
  dialBucket: z.enum(publicPoolDialBucketValues).default("all"),
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

const publicPoolCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  createdAt: true,
  ownershipMode: true,
  publicPoolEnteredAt: true,
  publicPoolReason: true,
  claimLockedUntil: true,
  lastEffectiveFollowUpAt: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
      team: {
        select: {
          id: true,
          name: true,
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
        },
      },
    },
  },
  publicPoolTeam: {
    select: {
      id: true,
      name: true,
    },
  },
  leads: {
    where: buildVisibleLeadWhereInput(),
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      source: true,
      createdAt: true,
    },
  },
  customerTags: {
    orderBy: [{ createdAt: "asc" }],
    take: 3,
    select: {
      id: true,
      tag: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
  salesOrders: {
    where: {
      reviewStatus: SalesOrderReviewStatus.APPROVED,
    },
    take: 1,
    select: {
      id: true,
    },
  },
  _count: {
    select: {
      salesOrders: true,
      tradeOrders: true,
    },
  },
} satisfies Prisma.CustomerSelect;

const recycleCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  createdAt: true,
  claimLockedUntil: true,
  lastEffectiveFollowUpAt: true,
  callCount: true,
  callRecords: {
    orderBy: [{ callTime: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      callTime: true,
      result: true,
      resultCode: true,
    },
  },
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  leads: {
    where: buildVisibleLeadWhereInput(),
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      source: true,
      createdAt: true,
    },
  },
  customerTags: {
    orderBy: [{ createdAt: "asc" }],
    take: 3,
    select: {
      id: true,
      tag: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
  salesOrders: {
    where: {
      reviewStatus: SalesOrderReviewStatus.APPROVED,
    },
    take: 1,
    select: {
      id: true,
    },
  },
  _count: {
    select: {
      salesOrders: true,
      tradeOrders: true,
    },
  },
} satisfies Prisma.CustomerSelect;

export type CustomerPublicPoolFilters = z.infer<typeof publicPoolFiltersSchema>;

export type CustomerPublicPoolListItem = {
  id: string;
  name: string;
  phone: string;
  region: string;
  latestLeadSource: string | null;
  latestLeadAt: Date | null;
  lastEffectiveFollowUpAt: Date | null;
  publicPoolEnteredAt: Date | null;
  publicPoolReason: PublicPoolReason | null;
  publicPoolReasonLabel: string | null;
  claimLockedUntil: Date | null;
  isLocked: boolean;
  isClaimable: boolean;
  // 选定"目标销售"筛选时: 该销售最近一次拨打这位客户的时间 (null=从未拨打)
  targetSalesLastCalledAt: Date | null;
  lastOwner: {
    id: string;
    name: string;
    username: string;
    teamName: string | null;
  } | null;
  publicPoolTeam: {
    id: string;
    name: string;
  } | null;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  orderSummary: {
    salesOrderCount: number;
    tradeOrderCount: number;
    hasApprovedSalesOrder: boolean;
  };
};

export type CustomerRecycleListItem = {
  id: string;
  name: string;
  phone: string;
  region: string;
  latestLeadSource: string | null;
  latestLeadAt: Date | null;
  lastEffectiveFollowUpAt: Date | null;
  claimLockedUntil: Date | null;
  isLocked: boolean;
  // 未接通回流: 累计拨打 / 最近一次拨打(时间+结果) / 所选时间范围内的拨打次数
  // (calledRange=any 时为 null, 列表显示累计值)
  totalCallCount: number;
  latestCall: {
    callTime: Date;
    resultLabel: string;
  } | null;
  rangeCallCount: number | null;
  owner: {
    id: string;
    name: string;
    username: string;
    teamName: string | null;
  } | null;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  orderSummary: {
    salesOrderCount: number;
    tradeOrderCount: number;
    hasApprovedSalesOrder: boolean;
  };
};

export type CustomerOwnershipRecordListItem = {
  id: string;
  createdAt: Date;
  reason: CustomerOwnershipEventReason;
  reasonLabel: string;
  note: string | null;
  fromOwnershipMode: CustomerOwnershipMode | null;
  toOwnershipMode: CustomerOwnershipMode;
  effectiveFollowUpAt: Date | null;
  claimLockedUntil: Date | null;
  fromOwner: {
    id: string;
    name: string;
    username: string;
  } | null;
  toOwner: {
    id: string;
    name: string;
    username: string;
  } | null;
  actor: {
    id: string;
    name: string;
    username: string;
  } | null;
  team: {
    id: string;
    name: string;
  } | null;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
};

export type CustomerPublicPoolData = {
  actor: PublicPoolActor;
  filters: CustomerPublicPoolFilters;
  canClaim: boolean;
  canManage: boolean;
  activeTeamAutoAssign: {
    teamId: string | null;
    teamName: string | null;
    autoAssignEnabled: boolean;
    autoAssignStrategy: PublicPoolAutoAssignStrategyValue;
    autoAssignBatchSize: number;
    maxActiveCustomersPerSales: number | null;
  } | null;
  summary: {
    publicCount: number;
    claimableCount: number;
    lockedCount: number;
    todayNewCount: number;
    expiringSoonCount: number;
    unreachableCount: number;
    myClaimCount: number;
    recycleCandidateCount: number;
    recordCount: number;
  };
  teamOptions: Array<{
    id: string;
    name: string;
  }>;
  salesOptions: Array<{
    id: string;
    name: string;
    username: string;
    teamId: string | null;
  }>;
  poolItems: CustomerPublicPoolListItem[];
  recycleItems: CustomerRecycleListItem[];
  recordItems: CustomerOwnershipRecordListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatRegion(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" / ") || "未填写";
}

function parseCustomerPublicPoolFilters(
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  return publicPoolFiltersSchema.parse({
    view: getParamValue(rawSearchParams?.view) || "pool",
    segment: getParamValue(rawSearchParams?.segment) || "all",
    search: getParamValue(rawSearchParams?.search),
    reason: getParamValue(rawSearchParams?.reason),
    teamId: getParamValue(rawSearchParams?.teamId),
    hasOrders: getParamValue(rawSearchParams?.hasOrders) || "all",
    ownerId: getParamValue(rawSearchParams?.ownerId),
    calledRange: getParamValue(rawSearchParams?.calledRange) || "any",
    callOutcome: getParamValue(rawSearchParams?.callOutcome) || "all",
    targetSalesId: getParamValue(rawSearchParams?.targetSalesId),
    dialBucket: getParamValue(rawSearchParams?.dialBucket) || "all",
    page: getParamValue(rawSearchParams?.page) || "1",
    pageSize: getParamValue(rawSearchParams?.pageSize) || String(CUSTOMERS_PAGE_SIZE),
  });
}

// "X 内打过"分桶 → callTime 下限. never / any / all 由调用方单独处理.
function resolveRecencyCutoff(
  value: PublicPoolCalledRange | PublicPoolDialBucket,
  now: Date,
) {
  switch (value) {
    case "within1d":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "within7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "within30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function getCallResultDisplayLabel(result: CallResult | null, resultCode: string | null) {
  const code = resolveStoredCallResultCode({ result, resultCode });

  if (!code) {
    return "未记录";
  }

  return isSystemCallResultCode(code)
    ? getDefaultSystemCallResultDefinition(code).label
    : code;
}

function buildSearchClause(search: string): Prisma.CustomerWhereInput[] {
  if (!search) {
    return [];
  }

  return [
    {
      OR: [
        {
          name: {
            contains: search,
          },
        },
        {
          phone: {
            contains: search,
          },
        },
      ],
    },
  ];
}

function buildOrderFilter(hasOrders: CustomerPublicPoolFilters["hasOrders"]): Prisma.CustomerWhereInput[] {
  if (hasOrders === "yes") {
    return [
      {
        salesOrders: {
          some: {},
        },
      },
    ];
  }

  if (hasOrders === "no") {
    return [
      {
        salesOrders: {
          none: {},
        },
      },
    ];
  }

  return [];
}

function buildVisiblePublicCustomerWhere(
  actor: PublicPoolActor,
  filters: CustomerPublicPoolFilters,
  now: Date,
) {
  const clauses: Prisma.CustomerWhereInput[] = [
    {
      ownerId: null,
    },
    {
      OR: [
        {
          ownershipMode: CustomerOwnershipMode.PUBLIC,
        },
        {
          ownershipMode: CustomerOwnershipMode.LOCKED,
        },
        {
          ownershipMode: CustomerOwnershipMode.PRIVATE,
        },
      ],
    },
    // 回收站"仅封存"的客户壳 (姓名→已封存客户#X, phone→ARCHIVED:id, 无法拨打)
    // ownerId 也是 null, 会漏进公海列表和计数 — 一律排除.
    {
      NOT: {
        phone: {
          startsWith: "ARCHIVED:",
        },
      },
    },
    ...buildSearchClause(filters.search),
    ...buildOrderFilter(filters.hasOrders),
  ];

  if (actor.role !== "ADMIN") {
    if (!actor.teamId) {
      return {
        id: "__missing_public_pool_team__",
      } satisfies Prisma.CustomerWhereInput;
    }

    clauses.push({
      publicPoolTeamId: actor.teamId,
    });
  } else if (filters.teamId) {
    clauses.push({
      publicPoolTeamId: filters.teamId,
    });
  }

  if (filters.reason) {
    clauses.push({
      publicPoolReason: filters.reason as PublicPoolReason,
    });
  }

  if (filters.segment === "claimable") {
    clauses.push({
      OR: [
        {
          claimLockedUntil: null,
        },
        {
          claimLockedUntil: {
            lte: now,
          },
        },
      ],
    });
  }

  if (filters.segment === "locked") {
    clauses.push({
      claimLockedUntil: {
        gt: now,
      },
    });
  }

  if (filters.segment === "today_new") {
    clauses.push({
      publicPoolEnteredAt: {
        gte: startOfDay(now),
      },
    });
  }

  if (filters.segment === "expiring_soon") {
    const soon = new Date(now);
    soon.setHours(soon.getHours() + 24);
    clauses.push({
      claimLockedUntil: {
        gt: now,
        lte: soon,
      },
    });
  }

  // 未接通池: 主管回流回来的未接通客户, 配合"目标销售拨打关系"分桶做次日再分配
  if (filters.segment === "unreachable") {
    clauses.push({
      publicPoolReason: PublicPoolReason.UNREACHABLE_RECYCLE,
    });
  }

  // 目标销售拨打关系: never=该销售从未拨打过 (可放心指派);
  // withinXX=该销售在窗口内打过 (主管可见可选, 自行决定要不要再分给她).
  // 仅在选定目标销售后生效, all 完全不过滤.
  if (filters.targetSalesId && filters.dialBucket !== "all") {
    if (filters.dialBucket === "never") {
      clauses.push({
        callRecords: {
          none: {
            salesId: filters.targetSalesId,
          },
        },
      });
    } else {
      const recencyCutoff = resolveRecencyCutoff(filters.dialBucket, now);

      if (recencyCutoff) {
        clauses.push({
          callRecords: {
            some: {
              salesId: filters.targetSalesId,
              callTime: {
                gte: recencyCutoff,
              },
            },
          },
        });
      }
    }
  }

  return {
    AND: clauses,
  } satisfies Prisma.CustomerWhereInput;
}

function buildVisibleRecycleCustomerWhere(
  actor: PublicPoolActor,
  filters: CustomerPublicPoolFilters,
  now: Date,
): Prisma.CustomerWhereInput {
  if (!canManageCustomerPublicPool(actor.role)) {
    return {
      id: "__forbidden_public_pool_recycle__",
    };
  }

  const clauses: Prisma.CustomerWhereInput[] = [
    {
      ownerId: {
        not: null,
      },
    },
    {
      ownershipMode: {
        in: [CustomerOwnershipMode.PRIVATE, CustomerOwnershipMode.LOCKED],
      },
    },
    ...buildSearchClause(filters.search),
    ...buildOrderFilter(filters.hasOrders),
  ];

  if (actor.role === "ADMIN") {
    if (filters.teamId) {
      clauses.push({
        owner: {
          is: {
            teamId: filters.teamId,
          },
        },
      });
    }
  } else {
    clauses.push({
      owner: {
        is: {
          teamId: actor.teamId,
        },
      },
    });
  }

  // 未接通回流筛选: 业务员 + 该业务员拨打关系分桶 + 拨打结果口径
  if (filters.ownerId) {
    clauses.push({
      ownerId: filters.ownerId,
    });
  }

  // 分桶以选定业务员为参照; 没选业务员时退化为"任意人拨打过"
  const salesScope = filters.ownerId ? { salesId: filters.ownerId } : {};
  const recencyCutoff = resolveRecencyCutoff(filters.calledRange, now);

  if (filters.calledRange === "never") {
    clauses.push({
      callRecords: {
        none: {
          ...salesScope,
        },
      },
    });
  } else if (recencyCutoff) {
    clauses.push({
      callRecords: {
        some: {
          ...salesScope,
          callTime: {
            gte: recencyCutoff,
          },
        },
      },
    });
  }

  if (filters.callOutcome === "unreachable") {
    // 口径: 窗口内有未接通拨打, 且窗口内没有其他结果的拨打 (全是未接通).
    // 未接通看客户全量拨打记录 (不限定业务员) — 只要有人打通过就不算未接通客户.
    // 自定义 resultCode 行 (result=null) 不计为"其他结果" — 宁可多显给主管人工
    // 判断, 也不漏掉应回流的客户.
    clauses.push({
      callRecords: {
        some: {
          ...(recencyCutoff ? { callTime: { gte: recencyCutoff } } : {}),
          OR: [
            { result: CallResult.NOT_CONNECTED },
            { resultCode: CallResult.NOT_CONNECTED },
          ],
        },
      },
    });
    clauses.push({
      NOT: {
        callRecords: {
          some: {
            ...(recencyCutoff ? { callTime: { gte: recencyCutoff } } : {}),
            AND: [
              { result: { not: null } },
              { result: { not: CallResult.NOT_CONNECTED } },
            ],
          },
        },
      },
    });
  }

  return {
    AND: clauses,
  } satisfies Prisma.CustomerWhereInput;
}

function buildVisibleOwnershipRecordWhere(
  actor: PublicPoolActor,
  filters: CustomerPublicPoolFilters,
): Prisma.CustomerOwnershipEventWhereInput {
  if (canManageCustomerPublicPool(actor.role)) {
    return {
      AND: [
        actor.role === "ADMIN"
          ? filters.teamId
            ? {
                teamId: filters.teamId,
              }
            : {}
          : {
              teamId: actor.teamId,
            },
        filters.reason
          ? {
              reason: filters.reason as CustomerOwnershipEventReason,
            }
          : {},
        filters.search
          ? {
              customer: {
                is: {
                  OR: [
                    {
                      name: {
                        contains: filters.search,
                      },
                    },
                    {
                      phone: {
                        contains: filters.search,
                      },
                    },
                  ],
                },
              },
            }
          : {},
      ],
    };
  }

  return {
    actorId: actor.id,
    reason: CustomerOwnershipEventReason.SALES_CLAIM,
  };
}

function buildPagination(page: number, pageSize: number, totalCount: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return {
    page: Math.min(page, totalPages),
    pageSize,
    totalCount,
    totalPages,
  };
}

function mapPoolItem(
  item: Prisma.CustomerGetPayload<{
    select: typeof publicPoolCustomerSelect;
  }>,
  now: Date,
  targetSalesLastCalledAt: Date | null = null,
): CustomerPublicPoolListItem {
  const latestLead = item.leads[0] ?? null;
  const isLocked = Boolean(item.claimLockedUntil && item.claimLockedUntil.getTime() > now.getTime());

  return {
    id: item.id,
    name: item.name,
    phone: item.phone,
    region: formatRegion(item.province, item.city, item.district),
    latestLeadSource: latestLead ? getLeadSourceLabel(latestLead.source) : null,
    latestLeadAt: latestLead?.createdAt ?? null,
    lastEffectiveFollowUpAt: item.lastEffectiveFollowUpAt,
    publicPoolEnteredAt: item.publicPoolEnteredAt,
    publicPoolReason: item.publicPoolReason,
    publicPoolReasonLabel: item.publicPoolReason ? publicPoolReasonLabels[item.publicPoolReason] : null,
    claimLockedUntil: item.claimLockedUntil,
    isLocked,
    isClaimable: !isLocked,
    targetSalesLastCalledAt,
    lastOwner: item.lastOwner
      ? {
          id: item.lastOwner.id,
          name: item.lastOwner.name,
          username: item.lastOwner.username,
          teamName: item.lastOwner.team?.name ?? null,
        }
      : null,
    publicPoolTeam: item.publicPoolTeam,
    tags: item.customerTags.map((tagLink) => ({
      id: tagLink.tag.id,
      name: tagLink.tag.name,
      color: tagLink.tag.color,
    })),
    orderSummary: {
      salesOrderCount: item._count.salesOrders,
      tradeOrderCount: item._count.tradeOrders,
      hasApprovedSalesOrder: item.salesOrders.length > 0,
    },
  };
}

function mapRecycleItem(
  item: Prisma.CustomerGetPayload<{
    select: typeof recycleCustomerSelect;
  }>,
  now: Date,
  rangeCallCount: number | null = null,
): CustomerRecycleListItem {
  const latestLead = item.leads[0] ?? null;
  const latestCall = item.callRecords[0] ?? null;

  return {
    id: item.id,
    name: item.name,
    phone: item.phone,
    region: formatRegion(item.province, item.city, item.district),
    latestLeadSource: latestLead ? getLeadSourceLabel(latestLead.source) : null,
    latestLeadAt: latestLead?.createdAt ?? null,
    lastEffectiveFollowUpAt: item.lastEffectiveFollowUpAt,
    claimLockedUntil: item.claimLockedUntil,
    isLocked: Boolean(item.claimLockedUntil && item.claimLockedUntil.getTime() > now.getTime()),
    totalCallCount: item.callCount,
    latestCall: latestCall
      ? {
          callTime: latestCall.callTime,
          resultLabel: getCallResultDisplayLabel(latestCall.result, latestCall.resultCode),
        }
      : null,
    rangeCallCount,
    owner: item.owner
      ? {
          id: item.owner.id,
          name: item.owner.name,
          username: item.owner.username,
          teamName: item.owner.team?.name ?? null,
        }
      : null,
    tags: item.customerTags.map((tagLink) => ({
      id: tagLink.tag.id,
      name: tagLink.tag.name,
      color: tagLink.tag.color,
    })),
    orderSummary: {
      salesOrderCount: item._count.salesOrders,
      tradeOrderCount: item._count.tradeOrders,
      hasApprovedSalesOrder: item.salesOrders.length > 0,
    },
  };
}

export function buildCustomerPublicPoolHref(
  filters: CustomerPublicPoolFilters,
  overrides: Partial<CustomerPublicPoolFilters> = {},
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.view !== "pool") {
    params.set("view", next.view);
  }

  if (next.segment !== "all") {
    params.set("segment", next.segment);
  }

  if (next.search) {
    params.set("search", next.search);
  }

  if (next.reason) {
    params.set("reason", next.reason);
  }

  if (next.teamId) {
    params.set("teamId", next.teamId);
  }

  if (next.hasOrders !== "all") {
    params.set("hasOrders", next.hasOrders);
  }

  if (next.ownerId) {
    params.set("ownerId", next.ownerId);
  }

  if (next.calledRange !== "any") {
    params.set("calledRange", next.calledRange);
  }

  if (next.callOutcome !== "all") {
    params.set("callOutcome", next.callOutcome);
  }

  if (next.targetSalesId) {
    params.set("targetSalesId", next.targetSalesId);
  }

  if (next.dialBucket !== "all") {
    params.set("dialBucket", next.dialBucket);
  }

  if (next.pageSize !== CUSTOMERS_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/customers/public-pool?${query}` : "/customers/public-pool";
}

export async function getCustomerPublicPoolData(
  viewer: {
    id: string;
    role: RoleCode;
  },
  rawSearchParams?: Record<string, SearchParamsValue>,
): Promise<CustomerPublicPoolData> {
  if (!canAccessCustomerPublicPool(viewer.role)) {
    throw new Error("You do not have access to the customer public pool.");
  }

  const actor = await getCustomerOwnershipActorContext(viewer.id);
  const filters = parseCustomerPublicPoolFilters(rawSearchParams);
  const now = new Date();
  const actorTeamSetting = await getResolvedTeamPublicPoolSetting(actor.teamId);
  const activeSettingTeamId =
    viewer.role === "ADMIN" ? filters.teamId || null : actor.teamId;
  const activeTeamSetting = await getResolvedTeamPublicPoolSetting(activeSettingTeamId);
  const visiblePublicWhere = buildVisiblePublicCustomerWhere(actor, filters, now);
  const visibleRecycleWhere = buildVisibleRecycleCustomerWhere(actor, filters, now);
  const visibleRecordWhere = buildVisibleOwnershipRecordWhere(actor, filters);

  const [teamOptions, salesOptions] = await Promise.all([
    viewer.role === "ADMIN"
      ? prisma.team.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
          },
        })
      : actor.teamId
        ? prisma.team.findMany({
            where: { id: actor.teamId },
            select: {
              id: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    canManageCustomerPublicPool(viewer.role)
      ? prisma.user.findMany({
          where: {
            userStatus: "ACTIVE",
            role: {
              code: "SALES",
            },
            ...(viewer.role === "ADMIN"
              ? filters.teamId
                ? { teamId: filters.teamId }
                : {}
              : {
                  teamId: actor.teamId,
                }),
          },
          orderBy: [{ name: "asc" }, { username: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
            teamId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const [
    publicCount,
    claimableCount,
    lockedCount,
    todayNewCount,
    expiringSoonCount,
    unreachableCount,
    recycleCandidateCount,
    recordCount,
    myClaimRows,
  ] = await Promise.all([
    prisma.customer.count({
      where: buildVisiblePublicCustomerWhere(actor, { ...filters, segment: "all" }, now),
    }),
    prisma.customer.count({
      where: buildVisiblePublicCustomerWhere(actor, { ...filters, segment: "claimable" }, now),
    }),
    prisma.customer.count({
      where: buildVisiblePublicCustomerWhere(actor, { ...filters, segment: "locked" }, now),
    }),
    prisma.customer.count({
      where: buildVisiblePublicCustomerWhere(actor, { ...filters, segment: "today_new" }, now),
    }),
    prisma.customer.count({
      where: buildVisiblePublicCustomerWhere(actor, { ...filters, segment: "expiring_soon" }, now),
    }),
    prisma.customer.count({
      where: buildVisiblePublicCustomerWhere(actor, { ...filters, segment: "unreachable" }, now),
    }),
    canManageCustomerPublicPool(viewer.role)
      ? prisma.customer.count({
          where: buildVisibleRecycleCustomerWhere(actor, { ...filters, view: "recycle" }, now),
        })
      : Promise.resolve(0),
    prisma.customerOwnershipEvent.count({
      where: buildVisibleOwnershipRecordWhere(actor, { ...filters, view: "records" }),
    }),
    viewer.role === "SALES"
      ? prisma.customerOwnershipEvent.findMany({
          where: {
            actorId: actor.id,
            reason: CustomerOwnershipEventReason.SALES_CLAIM,
            customer: {
              is: {
                ownerId: actor.id,
              },
            },
          },
          distinct: ["customerId"],
          select: {
            customerId: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const activeTeamAutoAssign =
    canManageCustomerPublicPool(viewer.role)
      ? {
          teamId: activeSettingTeamId,
          teamName:
            (activeSettingTeamId
              ? teamOptions.find((team) => team.id === activeSettingTeamId)?.name ?? null
              : null) ??
            (viewer.role === "ADMIN" ? null : actor.teamId ? teamOptions[0]?.name ?? null : null),
          autoAssignEnabled: activeTeamSetting.autoAssignEnabled,
          autoAssignStrategy: activeTeamSetting.autoAssignStrategy,
          autoAssignBatchSize: activeTeamSetting.autoAssignBatchSize,
          maxActiveCustomersPerSales: activeTeamSetting.maxActiveCustomersPerSales,
        }
      : null;

  if (filters.view === "records") {
    const totalCount = recordCount;
    const pagination = buildPagination(filters.page, filters.pageSize, totalCount);
    const rows = await prisma.customerOwnershipEvent.findMany({
      where: visibleRecordWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: {
        id: true,
        createdAt: true,
        reason: true,
        note: true,
        fromOwnershipMode: true,
        toOwnershipMode: true,
        effectiveFollowUpAt: true,
        claimLockedUntil: true,
        fromOwner: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        toOwner: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    return {
      actor,
      filters,
      canClaim:
        canClaimPublicPoolCustomer(viewer.role) && actorTeamSetting.salesCanClaim,
      canManage: canManageCustomerPublicPool(viewer.role),
      activeTeamAutoAssign,
      summary: {
        publicCount,
        claimableCount,
        lockedCount,
        todayNewCount,
        expiringSoonCount,
        unreachableCount,
        myClaimCount: myClaimRows.length,
        recycleCandidateCount,
        recordCount,
      },
      teamOptions,
      salesOptions,
      poolItems: [],
      recycleItems: [],
      recordItems: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        reason: row.reason,
        reasonLabel: ownershipEventReasonLabels[row.reason],
        note: row.note,
        fromOwnershipMode: row.fromOwnershipMode,
        toOwnershipMode: row.toOwnershipMode,
        effectiveFollowUpAt: row.effectiveFollowUpAt,
        claimLockedUntil: row.claimLockedUntil,
        fromOwner: row.fromOwner,
        toOwner: row.toOwner,
        actor: row.actor,
        team: row.team,
        customer: row.customer,
      })),
      pagination,
    };
  }

  if (filters.view === "recycle") {
    const totalCount = recycleCandidateCount;
    const pagination = buildPagination(filters.page, filters.pageSize, totalCount);
    const rows = await prisma.customer.findMany({
      where: visibleRecycleWhere,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: recycleCustomerSelect,
    });
    // 选了"X 内打过"分桶时, 给当前页客户补"窗口内拨打次数"
    // (选了业务员则只数她的拨打)
    const recencyCutoff = resolveRecencyCutoff(filters.calledRange, now);
    const rangeCallCounts = new Map<string, number>();

    if (recencyCutoff && rows.length > 0) {
      const grouped = await prisma.callRecord.groupBy({
        by: ["customerId"],
        where: {
          customerId: {
            in: rows.map((row) => row.id),
          },
          ...(filters.ownerId ? { salesId: filters.ownerId } : {}),
          callTime: {
            gte: recencyCutoff,
          },
        },
        _count: {
          _all: true,
        },
      });

      for (const bucket of grouped) {
        if (bucket.customerId) {
          rangeCallCounts.set(bucket.customerId, bucket._count._all);
        }
      }
    }

    return {
      actor,
      filters,
      canClaim:
        canClaimPublicPoolCustomer(viewer.role) && actorTeamSetting.salesCanClaim,
      canManage: canManageCustomerPublicPool(viewer.role),
      activeTeamAutoAssign,
      summary: {
        publicCount,
        claimableCount,
        lockedCount,
        todayNewCount,
        expiringSoonCount,
        unreachableCount,
        myClaimCount: myClaimRows.length,
        recycleCandidateCount,
        recordCount,
      },
      teamOptions,
      salesOptions,
      poolItems: [],
      recycleItems: rows.map((row) =>
        mapRecycleItem(
          row,
          now,
          recencyCutoff ? rangeCallCounts.get(row.id) ?? 0 : null,
        ),
      ),
      recordItems: [],
      pagination,
    };
  }

  const totalCount = await prisma.customer.count({
    where: visiblePublicWhere,
  });
  const pagination = buildPagination(filters.page, filters.pageSize, totalCount);
  const rows = await prisma.customer.findMany({
    where: visiblePublicWhere,
    orderBy: [{ publicPoolEnteredAt: "desc" }, { id: "desc" }],
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
    select: publicPoolCustomerSelect,
  });
  // 选了目标销售时, 给当前页客户补"该销售最近一次拨打时间", 行上标注给主管看
  const targetSalesLastCalledMap = new Map<string, Date>();

  if (filters.targetSalesId && rows.length > 0) {
    const grouped = await prisma.callRecord.groupBy({
      by: ["customerId"],
      where: {
        customerId: {
          in: rows.map((row) => row.id),
        },
        salesId: filters.targetSalesId,
      },
      _max: {
        callTime: true,
      },
    });

    for (const bucket of grouped) {
      if (bucket.customerId && bucket._max.callTime) {
        targetSalesLastCalledMap.set(bucket.customerId, bucket._max.callTime);
      }
    }
  }

  return {
    actor,
    filters,
    canClaim:
      canClaimPublicPoolCustomer(viewer.role) && actorTeamSetting.salesCanClaim,
    canManage: canManageCustomerPublicPool(viewer.role),
    activeTeamAutoAssign,
    summary: {
      publicCount,
      claimableCount,
      lockedCount,
      todayNewCount,
      expiringSoonCount,
      unreachableCount,
      myClaimCount: myClaimRows.length,
      recycleCandidateCount,
      recordCount,
    },
    teamOptions,
    salesOptions,
    poolItems: rows.map((row) =>
      mapPoolItem(row, now, targetSalesLastCalledMap.get(row.id) ?? null),
    ),
    recycleItems: [],
    recordItems: [],
    pagination,
  };
}
