import {
  CallResult,
  TradeOrderStatus,
  WechatAddStatus,
  type Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { canAccessMobileApp, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  deriveMobileCustomerLevelFromSignals,
  getLatestMobileCallSignal,
  maskMobilePhone,
  parseMobilePagination,
  resolveMobileCustomerLevel,
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
    const requestedLevel = resolveMobileCustomerLevel(searchParams.get("level"));
    const where = buildScopedCustomerWhere(customerScope, requestedLevel);

    if (requestedLevel) {
      const filtered = await findCustomersByComputedLevel(
        where,
        requestedLevel,
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
  level: MobileCustomerLevel | null,
): Prisma.CustomerWhereInput {
  const levelCandidateWhere = level ? buildLevelCandidateWhere(level) : {};

  return {
    AND: [customerScope, levelCandidateWhere],
  };
}

function buildLevelCandidateWhere(level: MobileCustomerLevel): Prisma.CustomerWhereInput {
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

async function findCustomersByComputedLevel(
  where: Prisma.CustomerWhereInput,
  level: MobileCustomerLevel,
  skip: number,
  limit: number,
) {
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
      if (deriveCustomerLevel(customer) === level) {
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

function deriveCustomerLevel(customer: MobileCustomerListRecord) {
  return deriveMobileCustomerLevelFromSignals({
    approvedTradeOrderCount: customer._count.tradeOrders,
    hasLiveInvitation: customer._count.liveInvitations > 0,
    hasSuccessfulWechatSignal:
      customer._count.wechatRecords > 0 || customer._count.callRecords > 0,
    latestCall: getLatestMobileCallSignal(customer.callRecords),
  });
}
