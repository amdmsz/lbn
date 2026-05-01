import {
  CallResult,
  TradeOrderStatus,
  WechatAddStatus,
  type Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { canAccessMobileApp, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { findLatestCallActionEventsByCallRecordIds } from "@/lib/calls/call-action-audit";
import { resolveCustomerAvatarSrc } from "@/lib/customers/avatar";
import { prisma } from "@/lib/db/prisma";
import {
  deriveMobileCustomerLevelFromSignals,
  getLatestMobileCallSignal,
  toDecimalString,
  toIsoString,
} from "@/lib/mobile/api-contract";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

const successfulWechatCallWhere = {
  OR: [
    { result: CallResult.WECHAT_ADDED },
    { resultCode: CallResult.WECHAT_ADDED },
  ],
} satisfies Prisma.CallRecordWhereInput;

const mobileCustomerDetailSelect = {
  id: true,
  name: true,
  phone: true,
  wechatId: true,
  province: true,
  city: true,
  district: true,
  address: true,
  avatarPath: true,
  status: true,
  ownershipMode: true,
  ownerId: true,
  lastEffectiveFollowUpAt: true,
  remark: true,
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
  customerTags: {
    orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
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
  followUpTasks: {
    orderBy: [{ dueAt: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      id: true,
      type: true,
      status: true,
      priority: true,
      subject: true,
      content: true,
      dueAt: true,
      completedAt: true,
      createdAt: true,
    },
  },
  callRecords: {
    orderBy: [{ callTime: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      id: true,
      callTime: true,
      durationSeconds: true,
      result: true,
      resultCode: true,
      remark: true,
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
    take: 30,
    select: {
      id: true,
      addedStatus: true,
      addedAt: true,
      wechatAccount: true,
      wechatNickname: true,
      wechatRemarkName: true,
      summary: true,
      nextFollowUpAt: true,
      createdAt: true,
    },
  },
  liveInvitations: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      id: true,
      invitationStatus: true,
      invitedAt: true,
      invitationMethod: true,
      attendanceStatus: true,
      watchDurationMinutes: true,
      giftQualified: true,
      remark: true,
      createdAt: true,
      liveSession: {
        select: {
          id: true,
          title: true,
          hostName: true,
          startAt: true,
          status: true,
        },
      },
    },
  },
  tradeOrders: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      tradeNo: true,
      reviewStatus: true,
      tradeStatus: true,
      finalAmount: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: [{ lineNo: "asc" }],
        take: 10,
        select: {
          id: true,
          lineNo: true,
          itemType: true,
          titleSnapshot: true,
          qty: true,
          subtotal: true,
        },
      },
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

type MobileCustomerDetailRecord = Prisma.CustomerGetPayload<{
  select: typeof mobileCustomerDetailSelect;
}>;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMobileApp(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const customerId = id?.trim();

  if (!customerId) {
    return NextResponse.json({ message: "Invalid customer id" }, { status: 400 });
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
    const customer = await prisma.customer.findFirst({
      where: {
        AND: [{ id: customerId }, customerScope],
      },
      select: mobileCustomerDetailSelect,
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const latestEvents = await findLatestCallActionEventsByCallRecordIds(
      customer.callRecords.map((record) => record.id),
    );

    return NextResponse.json(
      {
        customer: mapCustomerDetail(customer, latestEvents),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load mobile customer detail API.", error);

    return NextResponse.json(
      { message: "移动端客户详情加载失败。" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

function mapCustomerDetail(
  customer: MobileCustomerDetailRecord,
  latestEvents: Awaited<ReturnType<typeof findLatestCallActionEventsByCallRecordIds>>,
) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    wechatId: customer.wechatId,
    level: deriveMobileCustomerLevelFromSignals({
      approvedTradeOrderCount: customer._count.tradeOrders,
      hasLiveInvitation: customer._count.liveInvitations > 0,
      hasSuccessfulWechatSignal:
        customer._count.wechatRecords > 0 || customer._count.callRecords > 0,
      latestCall: getLatestMobileCallSignal(customer.callRecords),
    }),
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
    profile: {
      province: customer.province,
      city: customer.city,
      district: customer.district,
      address: customer.address,
      remark: customer.remark,
      lastEffectiveFollowUpAt: toIsoString(customer.lastEffectiveFollowUpAt),
    },
    tags: customer.customerTags.map((item) => ({
      id: item.tag.id,
      name: item.tag.name,
      color: item.tag.color,
    })),
    timeline: {
      followUpTasks: customer.followUpTasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        priority: task.priority,
        subject: task.subject,
        content: task.content,
        dueAt: task.dueAt.toISOString(),
        completedAt: toIsoString(task.completedAt),
        createdAt: task.createdAt.toISOString(),
      })),
      callRecords: customer.callRecords.map((record) => ({
        id: record.id,
        callTime: record.callTime.toISOString(),
        durationSeconds: record.durationSeconds,
        callSource: record.outboundSession ? "crm-outbound" : "local-phone",
        result: record.result,
        resultCode: record.resultCode,
        remark: record.remark,
        nextFollowUpAt: toIsoString(record.nextFollowUpAt),
        latestActionEvent: latestEvents.get(record.id) ?? null,
      })),
      wechatRecords: customer.wechatRecords.map((record) => ({
        id: record.id,
        addedStatus: record.addedStatus,
        addedAt: toIsoString(record.addedAt),
        wechatAccount: record.wechatAccount,
        wechatNickname: record.wechatNickname,
        wechatRemarkName: record.wechatRemarkName,
        summary: record.summary,
        nextFollowUpAt: toIsoString(record.nextFollowUpAt),
        createdAt: record.createdAt.toISOString(),
      })),
      liveInvitations: customer.liveInvitations.map((invitation) => ({
        id: invitation.id,
        invitationStatus: invitation.invitationStatus,
        invitationMethod: invitation.invitationMethod,
        attendanceStatus: invitation.attendanceStatus,
        invitedAt: toIsoString(invitation.invitedAt),
        watchDurationMinutes: invitation.watchDurationMinutes,
        giftQualified: invitation.giftQualified,
        remark: invitation.remark,
        createdAt: invitation.createdAt.toISOString(),
        liveSession: {
          id: invitation.liveSession.id,
          title: invitation.liveSession.title,
          hostName: invitation.liveSession.hostName,
          startAt: invitation.liveSession.startAt.toISOString(),
          status: invitation.liveSession.status,
        },
      })),
    },
    orders: customer.tradeOrders.map((order) => ({
      id: order.id,
      tradeNo: order.tradeNo,
      reviewStatus: order.reviewStatus,
      tradeStatus: order.tradeStatus,
      finalAmount: toDecimalString(order.finalAmount),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        lineNo: item.lineNo,
        itemType: item.itemType,
        title: item.titleSnapshot,
        qty: item.qty,
        subtotal: toDecimalString(item.subtotal),
      })),
    })),
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function resolveCustomerAssignedAt(customer: MobileCustomerDetailRecord) {
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
