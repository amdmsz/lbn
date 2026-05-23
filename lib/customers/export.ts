import {
  CustomerOwnershipMode,
  PaymentRecordStatus,
  SalesOrderPaymentScheme,
  TradeOrderStatus,
  WechatAddStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { canExportCustomers } from "@/lib/auth/access";
import {
  customerManualCreateOperationAction,
  formatDateTime,
} from "@/lib/customers/metadata";
import { listFilteredCustomerCenterCustomerIds } from "@/lib/customers/queries";
import { prisma } from "@/lib/db/prisma";
import {
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderReviewStatusLabel,
} from "@/lib/fulfillment/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { getPaymentRecordChannelLabel } from "@/lib/payments/metadata";
import {
  formatTradeOrderLineSummary,
} from "@/lib/trade-orders/display";
import { buildCustomersExportHref } from "@/lib/customers/export-url";

export { buildCustomersExportHref };

type SearchParamsValue = string | string[] | undefined;

export type CustomerExportViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

export type CustomerExportFilters = {
  search: string;
  salesId: string;
  assignedFrom: string;
  assignedTo: string;
  productKeyword: string;
};

const customerExportSelect = {
  id: true,
  name: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  address: true,
  ownerId: true,
  createdAt: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  },
  ownershipEvents: {
    where: {
      toOwnershipMode: CustomerOwnershipMode.PRIVATE,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      createdAt: true,
    },
  },
  leads: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 3,
    select: {
      id: true,
      interestedProduct: true,
      remark: true,
      createdAt: true,
    },
  },
  callRecords: {
    orderBy: [{ callTime: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      callTime: true,
      result: true,
      resultCode: true,
      remark: true,
      sales: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  },
  wechatRecords: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 3,
    select: {
      createdAt: true,
      addedAt: true,
      addedStatus: true,
      summary: true,
      sales: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  },
  liveInvitations: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 3,
    select: {
      createdAt: true,
      invitedAt: true,
      invitationStatus: true,
      attendanceStatus: true,
      remark: true,
      liveSession: {
        select: {
          title: true,
        },
      },
    },
  },
  tradeOrders: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      id: true,
      tradeNo: true,
      tradeStatus: true,
      reviewStatus: true,
      paymentScheme: true,
      finalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      codAmount: true,
      createdAt: true,
      reviewedAt: true,
      items: {
        orderBy: [{ lineNo: "asc" }],
        select: {
          titleSnapshot: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          unitSnapshot: true,
          qty: true,
          subtotal: true,
        },
      },
      paymentRecords: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          amount: true,
          channel: true,
          status: true,
          occurredAt: true,
          referenceNo: true,
        },
      },
      shippingTasks: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          carrier: true,
          shippingProvider: true,
          trackingNumber: true,
          shippingStatus: true,
          shippedAt: true,
          completedAt: true,
        },
      },
    },
  },
} satisfies Prisma.CustomerSelect;

export type CustomerExportItem = Prisma.CustomerGetPayload<{
  select: typeof customerExportSelect;
}> & {
  assignedAt: Date | null;
};

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

async function getLatestCustomerAssignmentMap(
  customerSnapshots: Array<{ id: string; ownerId: string | null; leads: Array<{ id: string }> }>,
) {
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

    const payload =
      log.afterData && typeof log.afterData === "object" ? (log.afterData as Record<string, unknown>) : null;
    const createdById = payload && typeof payload.createdById === "string" ? payload.createdById : null;

    if (createdById !== expectedOwnerId) {
      continue;
    }

    latestMap.set(log.targetId, log.createdAt);
  }

  return latestMap;
}

function escapeCsvValue(value: string) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvLine(values: Array<string | null | undefined>) {
  return values.map((value) => escapeCsvValue(value ?? "")).join(",");
}

function formatOptionalDateTime(value: Date | null | undefined) {
  return value ? formatDateTime(value) : "";
}

function buildAddress(item: CustomerExportItem) {
  return [item.province, item.city, item.district, item.address]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

function buildOwnerLabel(item: CustomerExportItem) {
  if (!item.owner) {
    return "未分配";
  }

  return `${item.owner.name} (@${item.owner.username})`;
}

function getCallResultLabel(result: string | null, resultCode: string | null) {
  const value = resultCode || result || "";
  const labels: Record<string, string> = {
    NOT_CONNECTED: "未接通",
    INVALID_NUMBER: "空错号",
    HUNG_UP: "挂断",
    CONNECTED_NO_TALK: "接通未沟通",
    INTERESTED: "有意向",
    WECHAT_PENDING: "待加微信",
    WECHAT_ADDED: "已加微信",
    REFUSED_WECHAT: "拒绝加微信",
    NEED_CALLBACK: "需回拨",
    REFUSED_TO_BUY: "拒绝购买",
    BLACKLIST: "拉黑",
  };

  return labels[value] ?? value;
}

function getWechatStatusLabel(value: WechatAddStatus) {
  const labels: Record<WechatAddStatus, string> = {
    PENDING: "待添加",
    ADDED: "已添加",
    REJECTED: "已拒绝",
    BLOCKED: "已拉黑",
  };

  return labels[value];
}

function getTradeStatusLabel(value: TradeOrderStatus) {
  const labels: Record<TradeOrderStatus, string> = {
    DRAFT: "草稿",
    PENDING_REVIEW: "待审核",
    APPROVED: "已成交",
    REJECTED: "已驳回",
    CANCELED: "已取消",
  };

  return labels[value];
}

function buildProductSummary(item: CustomerExportItem) {
  const tradeProducts = item.tradeOrders.flatMap((order) =>
    order.items.map((line) => {
      return formatTradeOrderLineSummary({
        titleSnapshot: line.titleSnapshot,
        productNameSnapshot: line.productNameSnapshot,
        skuNameSnapshot: line.skuNameSnapshot,
        specSnapshot: line.specSnapshot,
        unitSnapshot: line.unitSnapshot,
        qty: line.qty,
      });
    }),
  );
  const interestedProducts = item.leads
    .map((lead) => lead.interestedProduct?.trim())
    .filter((value): value is string => Boolean(value));

  return [...tradeProducts, ...interestedProducts].slice(0, 12).join("；");
}

function buildCommunicationSummary(item: CustomerExportItem) {
  const calls = item.callRecords.map((record) => {
    const resultLabel = getCallResultLabel(record.result, record.resultCode);
    const remark = record.remark?.trim();
    return `${formatDateTime(record.callTime)} ${record.sales.name} 电话 ${resultLabel}${
      remark ? `：${remark}` : ""
    }`;
  });
  const wechats = item.wechatRecords.map((record) => {
    const occurredAt = record.addedAt ?? record.createdAt;
    const summary = record.summary?.trim();
    return `${formatDateTime(occurredAt)} ${record.sales.name} 微信 ${getWechatStatusLabel(
      record.addedStatus,
    )}${summary ? `：${summary}` : ""}`;
  });
  const lives = item.liveInvitations.map((record) => {
    const occurredAt = record.invitedAt ?? record.createdAt;
    const remark = record.remark?.trim();
    return `${formatDateTime(occurredAt)} 直播 ${record.liveSession.title} ${record.invitationStatus}/${record.attendanceStatus}${
      remark ? `：${remark}` : ""
    }`;
  });

  return [...calls, ...wechats, ...lives].slice(0, 10).join("；");
}

function buildOrderSummary(item: CustomerExportItem) {
  return item.tradeOrders
    .map((order) => {
      const status = `${getTradeStatusLabel(order.tradeStatus)} / ${getSalesOrderReviewStatusLabel(
        order.reviewStatus,
      )}`;
      return `${order.tradeNo} ${status} 金额 ${formatCurrency(order.finalAmount)} 已收 ${formatCurrency(
        order.paidAmount,
      )} 待收 ${formatCurrency(order.remainingAmount)}`;
    })
    .join("；");
}

function buildPaymentSummary(item: CustomerExportItem) {
  return item.tradeOrders
    .flatMap((order) =>
      order.paymentRecords.map((record) => {
        const status = record.status === PaymentRecordStatus.CONFIRMED ? "已确认" : record.status;
        const reference = record.referenceNo?.trim();
        return `${order.tradeNo} ${formatDateTime(record.occurredAt)} ${getPaymentRecordChannelLabel(
          record.channel,
        )} ${formatCurrency(record.amount)} ${status}${reference ? ` ${reference}` : ""}`;
      }),
    )
    .join("；");
}

function buildPaymentSchemeSummary(item: CustomerExportItem) {
  const labels = new Set(
    item.tradeOrders.map((order) =>
      getSalesOrderPaymentSchemeLabel(order.paymentScheme as SalesOrderPaymentScheme),
    ),
  );

  return [...labels].join("；");
}

function buildTrackingSummary(item: CustomerExportItem) {
  return item.tradeOrders
    .flatMap((order) =>
      order.shippingTasks.map((task) => {
        const provider = task.shippingProvider || task.carrier || "物流";
        const tracking = task.trackingNumber?.trim() || "未回填";
        return `${order.tradeNo} ${provider} ${tracking}`;
      }),
    )
    .join("；");
}

export function parseCustomerExportFilters(
  rawSearchParams?: Record<string, SearchParamsValue>,
): CustomerExportFilters {
  return {
    search:
      getParamValue(rawSearchParams?.search) ||
      getParamValue(rawSearchParams?.name) ||
      getParamValue(rawSearchParams?.phone),
    salesId: getParamValue(rawSearchParams?.salesId),
    assignedFrom:
      getParamValue(rawSearchParams?.assignedFrom) ||
      getParamValue(rawSearchParams?.importedFrom),
    assignedTo:
      getParamValue(rawSearchParams?.assignedTo) ||
      getParamValue(rawSearchParams?.importedTo),
    productKeyword: getParamValue(rawSearchParams?.productKeyword),
  };
}

export function buildCustomersExportFileName() {
  const datePart = new Date().toISOString().slice(0, 10);
  return `customers-${datePart}.csv`;
}

export async function getCustomersExportData(
  viewer: CustomerExportViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canExportCustomers(viewer.role)) {
    throw new Error("You do not have access to customer export.");
  }

  const filters = parseCustomerExportFilters(rawSearchParams);
  const customerIds = await listFilteredCustomerCenterCustomerIds(
    {
      id: viewer.id,
      role: viewer.role,
      teamId: viewer.teamId,
    },
    rawSearchParams,
  );
  const items = await prisma.customer.findMany({
    where: {
      id: {
        in: customerIds,
      },
    },
    select: customerExportSelect,
  });
  const assignedAtMap = await getLatestCustomerAssignmentMap(
    items.map((item) => ({
      id: item.id,
      ownerId: item.ownerId,
      leads: item.leads.map((lead) => ({
        id: lead.id,
      })),
    })),
  );
  const itemMap = new Map(items.map((item) => [item.id, item]));

  return {
    filters,
    items: customerIds
      .map((customerId) => itemMap.get(customerId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...item,
        assignedAt: assignedAtMap.get(item.id) ?? item.ownershipEvents[0]?.createdAt ?? null,
      })),
  };
}

export function buildCustomersExportCsv(items: CustomerExportItem[]) {
  const header = [
    "客户ID",
    "客户姓名",
    "电话",
    "地址",
    "销售员",
    "团队",
    "分配时间",
    "建档时间",
    "商品信息",
    "订单金额/状态",
    "付款方案",
    "付款记录",
    "物流单号",
    "沟通记录",
  ];
  const rows = items.map((item) =>
    toCsvLine([
      item.id,
      item.name,
      item.phone,
      buildAddress(item),
      buildOwnerLabel(item),
      item.owner?.team?.name ?? "",
      formatOptionalDateTime(item.assignedAt),
      formatDateTime(item.createdAt),
      buildProductSummary(item),
      buildOrderSummary(item),
      buildPaymentSchemeSummary(item),
      buildPaymentSummary(item),
      buildTrackingSummary(item),
      buildCommunicationSummary(item),
    ]),
  );

  return `\uFEFF${toCsvLine(header)}\n${rows.join("\n")}\n`;
}
