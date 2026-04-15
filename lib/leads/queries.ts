import {
  LeadConversionStatus,
  LeadSource,
  LeadStatus,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessLeadModule,
  canManageLeadAssignments,
  getLeadScope,
} from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  LEADS_PAGE_SIZE,
  LEADS_PAGE_SIZE_OPTIONS,
  UNASSIGNED_OWNER_VALUE,
} from "@/lib/leads/metadata";
import type { LeadRecycleGuard } from "@/lib/leads/recycle-guards";
import { buildLeadMoveGuardFromRecord } from "@/lib/recycle-bin/lead-adapter";
import { withVisibleLeadWhere } from "@/lib/leads/visibility";
import { getActiveTagOptions } from "@/lib/master-data/queries";
import {
  findActiveRecycleEntry,
  findActiveTargetIds,
} from "@/lib/recycle-bin/repository";

type SearchParamsValue = string | string[] | undefined;

export type LeadViewer = {
  id: string;
  role: RoleCode;
};

export type LeadListFilters = {
  name: string;
  phone: string;
  status: LeadStatus | "";
  tagId: string;
  view: "unassigned" | "assigned";
  quick: "" | "import_batch" | "today" | "all_unassigned";
  importBatchId: string;
  assignedOwnerId: string;
  createdFrom: string;
  createdTo: string;
  page: number;
  pageSize: number;
};

export type LeadSalesOption = {
  id: string;
  label: string;
};

export type LeadAssignedOwnerSummary = {
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  count: number;
};

export type LeadListItem = {
  id: string;
  name: string | null;
  phone: string;
  source: LeadSource;
  interestedProduct: string | null;
  status: LeadStatus;
  createdAt: Date;
  updatedAt: Date;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  leadTags: Array<{
    id: string;
    tagId: string;
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
  assignments?: Array<{
    id: string;
    createdAt: Date;
    assignedBy: {
      name: string | null;
      username: string;
    } | null;
  }>;
  recycleGuard: LeadRecycleGuard;
};

type LeadListGuardRecord = {
  id: string;
  name: string | null;
  phone: string;
  status: LeadStatus;
  conversionStatus: LeadConversionStatus;
  ownerId: string | null;
  customerId: string | null;
  rolledBackAt: Date | null;
  rolledBackBatchId: string | null;
  lastFollowUpAt: Date | null;
  nextFollowUpAt: Date | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  _count: {
    assignments: number;
    followUpTasks: number;
    callRecords: number;
    wechatRecords: number;
    liveInvitations: number;
    orders: number;
    giftRecords: number;
    leadTags: number;
    mergeLogs: number;
  };
};

function attachLeadRecycleGuard<T extends LeadListGuardRecord & {
  source: LeadSource;
  interestedProduct: string | null;
  createdAt: Date;
  updatedAt: Date;
  leadTags: Array<{
    id: string;
    tagId: string;
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
  assignments?: Array<{
    id: string;
    createdAt: Date;
    assignedBy: {
      name: string | null;
      username: string;
    } | null;
  }>;
}>(item: T): LeadListItem {
  return {
    id: item.id,
    name: item.name,
    phone: item.phone,
    source: item.source,
    interestedProduct: item.interestedProduct,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    owner: item.owner,
    leadTags: item.leadTags,
    assignments: item.assignments,
    recycleGuard: buildLeadMoveGuardFromRecord({
      id: item.id,
      name: item.name,
      phone: item.phone,
      status: item.status,
      conversionStatus: item.conversionStatus,
      ownerId: item.ownerId,
      customerId: item.customerId,
      rolledBackAt: item.rolledBackAt,
      rolledBackBatchId: item.rolledBackBatchId,
      lastFollowUpAt: item.lastFollowUpAt,
      nextFollowUpAt: item.nextFollowUpAt,
      owner: item.owner,
      _count: item._count,
    }),
  };
}

function buildLeadRecycleExclusionWhere(activeLeadIds: string[]) {
  if (activeLeadIds.length === 0) {
    return null;
  }

  return {
    id: {
      // Phase 2 先用 notIn(activeIds) 保持 KISS，后续若 active ids 规模变大再优化为更稳的查询策略。
      notIn: activeLeadIds,
    },
  } satisfies Prisma.LeadWhereInput;
}

const filtersSchema = z.object({
  name: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  status: z.union([z.nativeEnum(LeadStatus), z.literal("")]).default(""),
  tagId: z.string().trim().default(""),
  view: z.enum(["unassigned", "assigned"]).default("unassigned"),
  quick: z.enum(["", "import_batch", "today", "all_unassigned"]).default(""),
  importBatchId: z.string().trim().default(""),
  assignedOwnerId: z.string().trim().default(""),
  createdFrom: z.string().trim().default(""),
  createdTo: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z
    .coerce.number()
    .int()
    .default(LEADS_PAGE_SIZE)
    .transform((value) =>
      LEADS_PAGE_SIZE_OPTIONS.includes(
        value as (typeof LEADS_PAGE_SIZE_OPTIONS)[number],
      )
        ? value
        : LEADS_PAGE_SIZE,
    ),
});

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseDateBoundary(value: string, endOfDay: boolean) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

function buildTodayBoundary(endOfDay: boolean) {
  const date = new Date();
  date.setHours(
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  return date;
}

function combineLeadWhere(
  ...clauses: Array<Prisma.LeadWhereInput | null | undefined>
): Prisma.LeadWhereInput {
  const visibleClauses = clauses.filter(
    (clause): clause is Prisma.LeadWhereInput =>
      clause != null && Object.keys(clause).length > 0,
  );

  if (visibleClauses.length === 0) {
    return {};
  }

  if (visibleClauses.length === 1) {
    return visibleClauses[0];
  }

  return {
    AND: visibleClauses,
  };
}

export async function getLeadImportBatchLeadIds(importBatchId: string) {
  if (!importBatchId.trim()) {
    return [];
  }

  const rows = await prisma.leadImportRow.findMany({
    where: {
      batchId: importBatchId,
      importedLeadId: {
        not: null,
      },
    },
    select: {
      importedLeadId: true,
    },
    distinct: ["importedLeadId"],
  });

  return rows
    .map((row) => row.importedLeadId)
    .filter((leadId): leadId is string => Boolean(leadId));
}

export function buildLeadBaseWhereInput(
  viewer: LeadViewer,
  filters: LeadListFilters,
  importedLeadIds: string[] = [],
  activeLeadIds: string[] = [],
) {
  const scope = getLeadScope(viewer.role, viewer.id);

  if (!scope) {
    throw new Error("You do not have access to leads.");
  }

  const andClauses: Prisma.LeadWhereInput[] = [];

  if ("ownerId" in scope) {
    andClauses.push({ ownerId: scope.ownerId });
  }

  if (filters.name) {
    andClauses.push({
      name: {
        contains: filters.name,
      },
    });
  }

  if (filters.phone) {
    andClauses.push({
      phone: {
        contains: filters.phone,
      },
    });
  }

  if (filters.status) {
    andClauses.push({ status: filters.status });
  }

  if (filters.tagId) {
    andClauses.push({
      leadTags: {
        some: {
          tagId: filters.tagId,
        },
      },
    });
  }

  if (filters.importBatchId) {
    andClauses.push({
      id: {
        in: importedLeadIds.length > 0 ? importedLeadIds : ["__NO_VISIBLE_IMPORTED_LEADS__"],
      },
    });
  }

  const createdFrom =
    parseDateBoundary(filters.createdFrom, false) ??
    (filters.quick === "today" ? buildTodayBoundary(false) : null);
  const createdTo =
    parseDateBoundary(filters.createdTo, true) ??
    (filters.quick === "today" ? buildTodayBoundary(true) : null);

  if (createdFrom || createdTo) {
    andClauses.push({
      createdAt: {
        gte: createdFrom ?? undefined,
        lte: createdTo ?? undefined,
      },
    });
  }

  return combineLeadWhere(
    andClauses.length === 0
      ? {}
      : ({
          AND: andClauses,
        } satisfies Prisma.LeadWhereInput),
    buildLeadRecycleExclusionWhere(activeLeadIds),
  );
}

export function buildLeadWhereInput(
  viewer: LeadViewer,
  filters: LeadListFilters,
  importedLeadIds: string[] = [],
  activeLeadIds: string[] = [],
) {
  const baseWhere = buildLeadBaseWhereInput(
    viewer,
    filters,
    importedLeadIds,
    activeLeadIds,
  );
  const workspaceWhere =
    filters.view === "assigned"
      ? combineLeadWhere(
          { ownerId: { not: null } },
          filters.assignedOwnerId ? { ownerId: filters.assignedOwnerId } : null,
        )
      : { ownerId: null };

  return withVisibleLeadWhere(combineLeadWhere(baseWhere, workspaceWhere));
}

export function parseLeadListFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  const legacyOwnerId = getParamValue(searchParams?.ownerId);
  const rawView = getParamValue(searchParams?.view).trim();
  const parsed = filtersSchema.parse({
    name: getParamValue(searchParams?.name),
    phone: getParamValue(searchParams?.phone),
    status: getParamValue(searchParams?.status),
    tagId: getParamValue(searchParams?.tagId),
    view: rawView || undefined,
    quick: getParamValue(searchParams?.quick),
    importBatchId: getParamValue(searchParams?.importBatchId),
    assignedOwnerId: getParamValue(searchParams?.assignedOwnerId),
    createdFrom: getParamValue(searchParams?.createdFrom),
    createdTo: getParamValue(searchParams?.createdTo),
    page: getParamValue(searchParams?.page) || "1",
    pageSize: getParamValue(searchParams?.pageSize) || String(LEADS_PAGE_SIZE),
  });

  return {
    ...parsed,
    view: !rawView && legacyOwnerId === UNASSIGNED_OWNER_VALUE ? "unassigned" : parsed.view,
    assignedOwnerId:
      parsed.assignedOwnerId ||
      (legacyOwnerId && legacyOwnerId !== UNASSIGNED_OWNER_VALUE ? legacyOwnerId : ""),
  } satisfies LeadListFilters;
}

export async function getLeadListData(
  viewer: LeadViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessLeadModule(viewer.role)) {
    throw new Error("You do not have access to leads.");
  }

  const filters = parseLeadListFilters(rawSearchParams);
  const [importBatch, importedLeadIds, activeLeadIds] = await Promise.all([
    filters.importBatchId
      ? prisma.leadImportBatch.findUnique({
          where: { id: filters.importBatchId },
          select: {
            id: true,
            fileName: true,
            status: true,
            importedAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve(null),
    filters.importBatchId
      ? getLeadImportBatchLeadIds(filters.importBatchId)
      : Promise.resolve([] as string[]),
    findActiveTargetIds(prisma, "LEAD"),
  ]);
  const baseWhere = buildLeadBaseWhereInput(
    viewer,
    filters,
    importedLeadIds,
    activeLeadIds,
  );
  const unassignedWhere = withVisibleLeadWhere(
    combineLeadWhere(baseWhere, { ownerId: null }),
  );
  const assignedWhere = withVisibleLeadWhere(
    combineLeadWhere(
      baseWhere,
      { ownerId: { not: null } },
      filters.assignedOwnerId ? { ownerId: filters.assignedOwnerId } : null,
    ),
  );

  const [unassignedTotalCount, assignedTotalCount] = await Promise.all([
    prisma.lead.count({ where: unassignedWhere }),
    prisma.lead.count({ where: assignedWhere }),
  ]);
  const totalPages = Math.max(1, Math.ceil(unassignedTotalCount / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);

  const [rawUnassignedItems, rawAssignedItems, assignedOwnerGroups, salesOptions, tagOptions] =
    await Promise.all([
    prisma.lead.findMany({
      where: unassignedWhere,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true,
        name: true,
        phone: true,
        source: true,
        interestedProduct: true,
        status: true,
        conversionStatus: true,
        ownerId: true,
        customerId: true,
        rolledBackAt: true,
        rolledBackBatchId: true,
        lastFollowUpAt: true,
        nextFollowUpAt: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        leadTags: {
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
        _count: {
          select: {
            assignments: true,
            followUpTasks: true,
            callRecords: true,
            wechatRecords: true,
            liveInvitations: true,
            orders: true,
            giftRecords: true,
            leadTags: true,
            mergeLogs: true,
          },
        },
      },
    }),
    prisma.lead.findMany({
      where: assignedWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(filters.pageSize, 12),
      select: {
        id: true,
        name: true,
        phone: true,
        source: true,
        interestedProduct: true,
        status: true,
        conversionStatus: true,
        ownerId: true,
        customerId: true,
        rolledBackAt: true,
        rolledBackBatchId: true,
        lastFollowUpAt: true,
        nextFollowUpAt: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        leadTags: {
          orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
          take: 3,
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
        _count: {
          select: {
            assignments: true,
            followUpTasks: true,
            callRecords: true,
            wechatRecords: true,
            liveInvitations: true,
            orders: true,
            giftRecords: true,
            leadTags: true,
            mergeLogs: true,
          },
        },
        assignments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            assignedBy: {
              select: {
                name: true,
                username: true,
              },
            },
          },
        },
      },
    }),
    prisma.lead.groupBy({
      by: ["ownerId"],
      where: assignedWhere,
      _count: {
        _all: true,
      },
    }),
    canManageLeadAssignments(viewer.role)
      ? prisma.user.findMany({
          where: {
            userStatus: UserStatus.ACTIVE,
            role: {
              code: "SALES",
            },
          },
          orderBy: [{ name: "asc" }, { username: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
          },
        })
      : Promise.resolve([]),
    getActiveTagOptions(),
  ]);

  const assignedOwnerIds = assignedOwnerGroups
    .map((group) => group.ownerId)
    .filter((ownerId): ownerId is string => Boolean(ownerId));
  const assignedOwnerRecords =
    assignedOwnerIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: {
              in: assignedOwnerIds,
            },
          },
          select: {
            id: true,
            name: true,
            username: true,
          },
        })
      : [];
  const assignedOwnerMap = new Map(
    assignedOwnerRecords.map((user) => [user.id, user] as const),
  );
  const assignedByOwner = assignedOwnerGroups
    .filter(
      (
        group,
      ): group is {
        ownerId: string;
        _count: {
          _all: number;
        };
      } => Boolean(group.ownerId),
    )
    .map((group) => {
      const owner = assignedOwnerMap.get(group.ownerId);

      return {
        ownerId: group.ownerId,
        ownerName: owner?.name ?? "未知负责人",
        ownerUsername: owner?.username ?? group.ownerId.slice(0, 8),
        count: group._count._all,
      } satisfies LeadAssignedOwnerSummary;
    })
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const unassignedItems = rawUnassignedItems.map(attachLeadRecycleGuard);
  const assignedItems = rawAssignedItems.map(attachLeadRecycleGuard);

  return {
    filters: {
      ...filters,
      page: currentPage,
    },
    importBatch,
    unassigned: {
      items: unassignedItems,
      totalCount: unassignedTotalCount,
      pagination: {
        page: currentPage,
        pageSize: filters.pageSize,
        totalCount: unassignedTotalCount,
        totalPages,
      },
    },
    assigned: {
      items: assignedItems,
      totalCount: assignedTotalCount,
      byOwner: assignedByOwner,
    },
    salesOptions: salesOptions.map((user) => ({
      id: user.id,
      label: `${user.name} (@${user.username})`,
    })) satisfies LeadSalesOption[],
    tagOptions,
    summary: {
      totalVisibleCount: unassignedTotalCount + assignedTotalCount,
    },
  };
}

export async function getLeadDetail(viewer: LeadViewer, leadId: string) {
  if (!canAccessLeadModule(viewer.role)) {
    throw new Error("You do not have access to leads.");
  }

  const scope = getLeadScope(viewer.role, viewer.id);

  if (!scope) {
    throw new Error("You do not have access to leads.");
  }

  const activeRecycleEntry = await findActiveRecycleEntry(prisma, "LEAD", leadId);

  if (activeRecycleEntry) {
    return null;
  }

  const lead = await prisma.lead.findFirst({
    where: withVisibleLeadWhere({
      id: leadId,
      ...scope,
    }),
    select: {
      id: true,
      name: true,
      phone: true,
      source: true,
      sourceDetail: true,
      campaignName: true,
      interestedProduct: true,
      status: true,
      remark: true,
      province: true,
      city: true,
      district: true,
      address: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      createdAt: true,
      updatedAt: true,
      lastFollowUpAt: true,
      nextFollowUpAt: true,
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          assignmentType: true,
          note: true,
          createdAt: true,
          fromUser: {
            select: {
              name: true,
              username: true,
            },
          },
          toUser: {
            select: {
              name: true,
              username: true,
            },
          },
          assignedBy: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      },
      _count: {
        select: {
          assignments: true,
        },
      },
      leadTags: {
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
          customerId: true,
          phone: true,
          note: true,
          tagSynced: true,
          createdAt: true,
          batch: {
            select: {
              id: true,
              fileName: true,
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
      },
    },
  });

  if (!lead) {
    return null;
  }

  const [operationLogs, availableTags] = await Promise.all([
    prisma.operationLog.findMany({
      where: {
        targetType: "LEAD",
        targetId: lead.id,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
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
    getActiveTagOptions(),
  ]);

  return {
    ...lead,
    operationLogs,
    availableTags,
  };
}
