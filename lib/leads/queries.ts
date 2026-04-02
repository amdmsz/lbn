import {
  LeadStatus,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessAllData,
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
import { getActiveTagOptions } from "@/lib/master-data/queries";

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
  ownerId: string;
  createdFrom: string;
  createdTo: string;
  page: number;
  pageSize: number;
};

export type LeadOwnerOption = {
  id: string;
  label: string;
};

export type LeadSalesOption = {
  id: string;
  label: string;
};

const filtersSchema = z.object({
  name: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  status: z.union([z.nativeEnum(LeadStatus), z.literal("")]).default(""),
  tagId: z.string().trim().default(""),
  ownerId: z.string().trim().default(""),
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

export function buildLeadWhereInput(viewer: LeadViewer, filters: LeadListFilters) {
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

  if (canAccessAllData(viewer.role) && filters.ownerId) {
    if (filters.ownerId === UNASSIGNED_OWNER_VALUE) {
      andClauses.push({ ownerId: null });
    } else {
      andClauses.push({ ownerId: filters.ownerId });
    }
  }

  const createdFrom = parseDateBoundary(filters.createdFrom, false);
  const createdTo = parseDateBoundary(filters.createdTo, true);

  if (createdFrom || createdTo) {
    andClauses.push({
      createdAt: {
        gte: createdFrom ?? undefined,
        lte: createdTo ?? undefined,
      },
    });
  }

  if (andClauses.length === 0) {
    return {};
  }

  return {
    AND: andClauses,
  } satisfies Prisma.LeadWhereInput;
}

export function parseLeadListFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  return filtersSchema.parse({
    name: getParamValue(searchParams?.name),
    phone: getParamValue(searchParams?.phone),
    status: getParamValue(searchParams?.status),
    tagId: getParamValue(searchParams?.tagId),
    ownerId: getParamValue(searchParams?.ownerId),
    createdFrom: getParamValue(searchParams?.createdFrom),
    createdTo: getParamValue(searchParams?.createdTo),
    page: getParamValue(searchParams?.page) || "1",
    pageSize: getParamValue(searchParams?.pageSize) || String(LEADS_PAGE_SIZE),
  });
}

export async function getLeadListData(
  viewer: LeadViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessLeadModule(viewer.role)) {
    throw new Error("You do not have access to leads.");
  }

  const filters = parseLeadListFilters(rawSearchParams);
  const where = buildLeadWhereInput(viewer, filters);
  const totalCount = await prisma.lead.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);

  const [items, ownerOptions, salesOptions, tagOptions] = await Promise.all([
    prisma.lead.findMany({
      where,
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
        createdAt: true,
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
      },
    }),
    canAccessAllData(viewer.role)
      ? prisma.user.findMany({
          where: {
            userStatus: UserStatus.ACTIVE,
            role: {
              code: {
                in: ["ADMIN", "SUPERVISOR", "SALES"],
              },
            },
          },
          orderBy: [{ role: { code: "asc" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
          },
        })
      : Promise.resolve([]),
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

  return {
    filters: {
      ...filters,
      page: currentPage,
    },
    items,
    ownerOptions: ownerOptions.map((user) => ({
      id: user.id,
      label: `${user.name} (@${user.username})`,
    })) satisfies LeadOwnerOption[],
    salesOptions: salesOptions.map((user) => ({
      id: user.id,
      label: `${user.name} (@${user.username})`,
    })) satisfies LeadSalesOption[],
    tagOptions,
    pagination: {
      page: currentPage,
      pageSize: filters.pageSize,
      totalCount,
      totalPages,
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

  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      ...scope,
    },
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
