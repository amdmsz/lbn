import {
  CallResult,
  TradeOrderStatus,
  WechatAddStatus,
  type Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { canAccessMobileApp, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { resolveCustomerAvatarSrc } from "@/lib/customers/avatar";
import { prisma } from "@/lib/db/prisma";
import {
  deriveMobileCustomerLevelFromSignals,
  getLocalDayRange,
  getLatestMobileCallSignal,
  maskMobilePhone,
  parseMobilePagination,
  resolveMobileCustomerLevels,
  toDecimalString,
  toIsoString,
  type MobileCustomerLevel,
} from "@/lib/mobile/api-contract";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };
const LEVEL_FILTER_BATCH_SIZE = 100;
const LEVEL_FILTER_SCAN_LIMIT = 3000;

const successfulWechatCallWhere = {
  OR: [
    { result: CallResult.WECHAT_ADDED },
    { resultCode: CallResult.WECHAT_ADDED },
  ],
} satisfies Prisma.CallRecordWhereInput;

const refusedWechatCallWhere = {
  OR: [
    { result: CallResult.REFUSED_WECHAT },
    { resultCode: CallResult.REFUSED_WECHAT },
  ],
} satisfies Prisma.CallRecordWhereInput;

const mobileCustomerOrderBy = [
  { updatedAt: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.CustomerOrderByWithRelationInput[];

const mobileCustomerListSelect = {
  id: true,
  name: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  avatarPath: true,
  status: true,
  ownershipMode: true,
  ownerId: true,
  lastEffectiveFollowUpAt: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  ownershipEvents: {
    where: {
      toOwnerId: {
        not: null,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      toOwnerId: true,
      createdAt: true,
    },
  },
  followUpTasks: {
    orderBy: [{ dueAt: "asc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      type: true,
      status: true,
      dueAt: true,
      completedAt: true,
    },
  },
  callRecords: {
    orderBy: [{ callTime: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      id: true,
      callTime: true,
      durationSeconds: true,
      result: true,
      resultCode: true,
      nextFollowUpAt: true,
      outboundSession: {
        select: {
          id: true,
        },
      },
    },
  },
  wechatRecords: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      addedStatus: true,
      addedAt: true,
      nextFollowUpAt: true,
      createdAt: true,
    },
  },
  liveInvitations: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      invitationStatus: true,
      invitedAt: true,
      attendanceStatus: true,
      createdAt: true,
    },
  },
  tradeOrders: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      tradeNo: true,
      reviewStatus: true,
      tradeStatus: true,
      finalAmount: true,
      createdAt: true,
    },
  },
  _count: {
    select: {
      tradeOrders: {
        where: {
          tradeStatus: TradeOrderStatus.APPROVED,
        },
      },
      liveInvitations: true,
      wechatRecords: {
        where: {
          addedStatus: WechatAddStatus.ADDED,
        },
      },
      callRecords: {
        where: successfulWechatCallWhere,
      },
    },
  },
} satisfies Prisma.CustomerSelect;

type MobileCustomerListRecord = Prisma.CustomerGetPayload<{
  select: typeof mobileCustomerListSelect;
}>;

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMobileApp(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const customerScope = getCustomerScope(
    session.user.role,
    session.user.id,
    session.user.teamId,
  );

  if (!customerScope) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const pagination = parseMobilePagination(searchParams);
    const requestedLevels = resolveMobileCustomerLevels(searchParams.get("level"));
    const where = buildScopedCustomerWhere(customerScope, {
      levels: requestedLevels,
      queue: searchParams.get("queue"),
      search: searchParams.get("search"),
    });

    if (requestedLevels.length > 0) {
      const filtered = await findCustomersByComputedLevels(
        where,
        requestedLevels,
        pagination.skip,
        pagination.limit,
      );

      return NextResponse.json(
        {
          customers: filtered.customers.map(mapCustomerListItem),
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: filtered.total,
            hasMore: filtered.hasMore,
          },
        },
        { headers: noStoreHeaders },
      );
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: mobileCustomerOrderBy,
        skip: pagination.skip,
        take: pagination.limit,
        select: mobileCustomerListSelect,
      }),
    ]);

    return NextResponse.json(
      {
        customers: customers.map(mapCustomerListItem),
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          hasMore: pagination.skip + customers.length < total,
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load mobile customers API.", error);

    return NextResponse.json(
      { message: "移动端客户列表加载失败。" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

function buildScopedCustomerWhere(
  customerScope: Prisma.CustomerWhereInput,
  filters: {
    levels: readonly MobileCustomerLevel[];
    queue: string | null;
    search: string | null;
  },
): Prisma.CustomerWhereInput {
  const levelCandidateWhere = buildLevelCandidateWhere(filters.levels);
  const queueWhere = buildQueueWhere(filters.queue);
  const searchWhere = buildSearchWhere(filters.search);

  return {
    AND: [customerScope, levelCandidateWhere, queueWhere, searchWhere],
  };
}

function buildLevelCandidateWhere(
  levels: readonly MobileCustomerLevel[],
): Prisma.CustomerWhereInput {
  if (levels.length === 0 || levels.includes("D")) {
    return {};
  }

  return {
    OR: levels.map((level) => buildSingleLevelCandidateWhere(level)),
  };
}

function buildSingleLevelCandidateWhere(level: MobileCustomerLevel): Prisma.CustomerWhereInput {
  switch (level) {
    case "A":
      return {
        tradeOrders: {
          some: {
            tradeStatus: TradeOrderStatus.APPROVED,
          },
        },
      };
    case "B":
      return {
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
              some: successfulWechatCallWhere,
            },
          },
        ],
      };
    case "C":
      return {
        liveInvitations: {
          some: {},
        },
      };
    case "E":
      return {
        callRecords: {
          some: refusedWechatCallWhere,
        },
      };
    case "D":
    default:
      return {};
  }
}

function buildQueueWhere(queue: string | null): Prisma.CustomerWhereInput {
  if (queue !== "new_imported") {
    return {};
  }

  const { start, next } = getLocalDayRange();

  return {
    leads: {
      some: {
        rolledBackAt: null,
        createdAt: {
          gte: start,
          lt: next,
        },
      },
    },
  };
}

function buildSearchWhere(value: string | null): Prisma.CustomerWhereInput {
  const search = value?.trim();

  if (!search) {
    return {};
  }

  return {
    OR: [
      { name: { contains: search } },
      { phone: { contains: search } },
      { remark: { contains: search } },
      {
        owner: {
          is: {
            OR: [
              { name: { contains: search } },
              { username: { contains: search } },
            ],
          },
        },
      },
      {
        leads: {
          some: {
            OR: [
              { interestedProduct: { contains: search } },
              { remark: { contains: search } },
            ],
          },
        },
      },
    ],
  };
}

async function findCustomersByComputedLevels(
  where: Prisma.CustomerWhereInput,
  levels: readonly MobileCustomerLevel[],
  skip: number,
  limit: number,
) {
  const levelSet = new Set(levels);
  const targetMatchCount = skip + limit + 1;
  const matches: MobileCustomerListRecord[] = [];
  let scanned = 0;
  let dbSkip = 0;
  let exhausted = false;

  while (matches.length < targetMatchCount && scanned < LEVEL_FILTER_SCAN_LIMIT) {
    const take = Math.min(
      LEVEL_FILTER_BATCH_SIZE,
      LEVEL_FILTER_SCAN_LIMIT - scanned,
    );
    const batch = await prisma.customer.findMany({
      where,
      orderBy: mobileCustomerOrderBy,
      skip: dbSkip,
      take,
      select: mobileCustomerListSelect,
    });

    if (batch.length === 0) {
      exhausted = true;
      break;
    }

    scanned += batch.length;
    dbSkip += batch.length;

    for (const customer of batch) {
      if (levelSet.has(deriveCustomerLevel(customer))) {
        matches.push(customer);
      }
    }
  }

  const hasMore = matches.length > skip + limit || (!exhausted && scanned >= LEVEL_FILTER_SCAN_LIMIT);

  return {
    customers: matches.slice(skip, skip + limit),
    total: exhausted ? matches.length : null,
    hasMore,
  };
}

function mapCustomerListItem(customer: MobileCustomerListRecord) {
  const latestCall = customer.callRecords[0] ?? null;
  const latestFollowUpTask = customer.followUpTasks[0] ?? null;
  const latestWechatRecord = customer.wechatRecords[0] ?? null;
  const latestLiveInvitation = customer.liveInvitations[0] ?? null;
  const latestOrder = customer.tradeOrders[0] ?? null;

  return {
    id: customer.id,
    name: customer.name,
    phoneMasked: maskMobilePhone(customer.phone),
    level: deriveCustomerLevel(customer),
    status: customer.status,
    ownershipMode: customer.ownershipMode,
    ownerId: customer.ownerId,
    avatarUrl: resolveCustomerAvatarSrc(customer.avatarPath),
    assignedAt: toIsoString(resolveCustomerAssignedAt(customer)),
    owner: customer.owner
      ? {
          id: customer.owner.id,
          name: customer.owner.name,
          username: customer.owner.username,
        }
      : null,
    region: [customer.province, customer.city, customer.district]
      .filter(Boolean)
      .join(" / "),
    lastFollowUpAt: toIsoString(customer.lastEffectiveFollowUpAt),
    latestFollowUpTask: latestFollowUpTask
      ? {
          id: latestFollowUpTask.id,
          type: latestFollowUpTask.type,
          status: latestFollowUpTask.status,
          dueAt: latestFollowUpTask.dueAt.toISOString(),
          completedAt: toIsoString(latestFollowUpTask.completedAt),
        }
      : null,
    latestCall: latestCall
      ? {
          id: latestCall.id,
          callTime: latestCall.callTime.toISOString(),
          durationSeconds: latestCall.durationSeconds,
          callSource: latestCall.outboundSession ? "crm-outbound" : "local-phone",
          result: latestCall.result,
          resultCode: latestCall.resultCode,
          nextFollowUpAt: toIsoString(latestCall.nextFollowUpAt),
        }
      : null,
    latestWechatRecord: latestWechatRecord
      ? {
          id: latestWechatRecord.id,
          addedStatus: latestWechatRecord.addedStatus,
          addedAt: toIsoString(latestWechatRecord.addedAt),
          nextFollowUpAt: toIsoString(latestWechatRecord.nextFollowUpAt),
          createdAt: latestWechatRecord.createdAt.toISOString(),
        }
      : null,
    latestLiveInvitation: latestLiveInvitation
      ? {
          id: latestLiveInvitation.id,
          invitationStatus: latestLiveInvitation.invitationStatus,
          attendanceStatus: latestLiveInvitation.attendanceStatus,
          invitedAt: toIsoString(latestLiveInvitation.invitedAt),
          createdAt: latestLiveInvitation.createdAt.toISOString(),
        }
      : null,
    latestOrder: latestOrder
      ? {
          id: latestOrder.id,
          tradeNo: latestOrder.tradeNo,
          reviewStatus: latestOrder.reviewStatus,
          tradeStatus: latestOrder.tradeStatus,
          finalAmount: toDecimalString(latestOrder.finalAmount),
          createdAt: latestOrder.createdAt.toISOString(),
        }
      : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function resolveCustomerAssignedAt(customer: MobileCustomerListRecord) {
  if (!customer.ownerId) {
    return null;
  }

  return (
    customer.ownershipEvents.find((event) => event.toOwnerId === customer.ownerId)
      ?.createdAt ??
    customer.ownershipEvents[0]?.createdAt ??
    customer.createdAt
  );
}

function deriveCustomerLevel(customer: MobileCustomerListRecord) {
  return deriveMobileCustomerLevelFromSignals({
    approvedTradeOrderCount: customer._count.tradeOrders,
    hasLiveInvitation: customer._count.liveInvitations > 0,
    hasSuccessfulWechatSignal:
      customer._count.wechatRecords > 0 || customer._count.callRecords > 0,
    latestCall: getLatestMobileCallSignal(customer.callRecords),
  });
}
