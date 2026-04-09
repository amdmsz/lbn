import {
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  PublicPoolReason,
  SalesOrderReviewStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
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
type PublicPoolSegment = "all" | "claimable" | "locked" | "today_new" | "expiring_soon";

type PublicPoolActor = Awaited<ReturnType<typeof getCustomerOwnershipActorContext>>;

const publicPoolViewValues = ["pool", "recycle", "records"] as const satisfies PublicPoolView[];
const publicPoolSegmentValues = [
  "all",
  "claimable",
  "locked",
  "today_new",
  "expiring_soon",
] as const satisfies PublicPoolSegment[];

const publicPoolFiltersSchema = z.object({
  view: z.enum(publicPoolViewValues).default("pool"),
  segment: z.enum(publicPoolSegmentValues).default("all"),
  search: z.string().trim().default(""),
  reason: z.string().trim().default(""),
  teamId: z.string().trim().default(""),
  hasOrders: z.enum(["all", "yes", "no"]).default("all"),
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
    page: getParamValue(rawSearchParams?.page) || "1",
    pageSize: getParamValue(rawSearchParams?.pageSize) || String(CUSTOMERS_PAGE_SIZE),
  });
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

  return {
    AND: clauses,
  } satisfies Prisma.CustomerWhereInput;
}

function buildVisibleRecycleCustomerWhere(
  actor: PublicPoolActor,
  filters: CustomerPublicPoolFilters,
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
): CustomerRecycleListItem {
  const latestLead = item.leads[0] ?? null;

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
  const visibleRecycleWhere = buildVisibleRecycleCustomerWhere(actor, filters);
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
    canManageCustomerPublicPool(viewer.role)
      ? prisma.customer.count({
          where: buildVisibleRecycleCustomerWhere(actor, { ...filters, view: "recycle" }),
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
        myClaimCount: myClaimRows.length,
        recycleCandidateCount,
        recordCount,
      },
      teamOptions,
      salesOptions,
      poolItems: [],
      recycleItems: rows.map((row) => mapRecycleItem(row, now)),
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
      myClaimCount: myClaimRows.length,
      recycleCandidateCount,
      recordCount,
    },
    teamOptions,
    salesOptions,
    poolItems: rows.map((row) => mapPoolItem(row, now)),
    recycleItems: [],
    recordItems: [],
    pagination,
  };
}
