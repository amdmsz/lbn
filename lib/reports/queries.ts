import {
  AttendanceStatus,
  CallResult,
  GiftReviewStatus,
  InvitationStatus,
  LiveSessionStatus,
  PaymentCollectionChannel,
  PaymentPlanStatus,
  PaymentRecordStatus,
  SalesOrderReviewStatus,
  ShippingFulfillmentStatus,
  ShippingReportStatus,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import {
  canAccessCustomerModule,
  canAccessGiftModule,
  canAccessLeadModule,
  canAccessLiveSessionModule,
  canAccessPaymentRecordModule,
  canAccessReportModule,
  canAccessShippingModule,
  getCustomerScope,
  getGiftScope,
  getLeadScope,
  getShippingTaskScope,
} from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { buildOrderFulfillmentHref } from "@/lib/fulfillment/navigation";
import { withVisibleLeadWhere } from "@/lib/leads/visibility";
import {
  buildCollectionTaskScope,
  buildPaymentPlanScope,
  buildPaymentRecordScope,
} from "@/lib/payments/scope";
import { getFinanceSummary } from "@/lib/finance/queries";

const REPORT_WINDOW_DAYS = 30;
const CONNECTED_CALL_RESULTS: CallResult[] = [
  CallResult.CONNECTED_NO_TALK,
  CallResult.INTERESTED,
  CallResult.WECHAT_PENDING,
  CallResult.WECHAT_ADDED,
  CallResult.REFUSED_WECHAT,
  CallResult.NEED_CALLBACK,
  CallResult.REFUSED_TO_BUY,
  CallResult.BLACKLIST,
];
const NON_CONNECTED_CALL_RESULT_CODES = [
  "NOT_CONNECTED",
  "INVALID_NUMBER",
  "HUNG_UP",
] as const;
const INVITED_STATUSES: InvitationStatus[] = [
  InvitationStatus.INVITED,
  InvitationStatus.ACCEPTED,
];
const ATTENDED_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.ATTENDED,
  AttendanceStatus.LEFT_EARLY,
];
const PENDING_V2_SHIPPING_STATUSES: ShippingFulfillmentStatus[] = [
  ShippingFulfillmentStatus.PENDING,
  ShippingFulfillmentStatus.READY_TO_SHIP,
];

export type ReportViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
  permissionCodes?: ExtraPermissionCode[];
};

export type SummaryCard = {
  label: string;
  value: string;
  note: string;
  href?: string;
};

export type ConversionMetric = {
  label: string;
  value: string;
  note: string;
  numerator: number;
  denominator: number;
};

export type EmployeeRankingItem = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  followUpCount: number;
  dealCount: number;
  invitationCount: number;
  wechatAddedCount: number;
};

export type ReportDefinition = {
  label: string;
  description: string;
};

export type PaymentSummaryData = {
  description: string;
  cards: SummaryCard[];
};

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function getTodayRange(now = new Date()) {
  return {
    start: startOfDay(now),
    end: endOfDay(now),
  };
}

function getRollingRange(days: number, now = new Date()) {
  const end = endOfDay(now);
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));

  return { start, end };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatPercentage(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function toCurrencyNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function toCountValue(value: number | null) {
  return value === null ? "--" : String(value);
}

function getPerformanceScopeMode(role: RoleCode) {
  if (canAccessReportModule(role)) {
    return "team" as const;
  }

  if (role === "SALES") {
    return "personal" as const;
  }

  return "restricted" as const;
}

async function getViewerTeamId(viewer: ReportViewer) {
  if (viewer.role !== "SUPERVISOR") {
    return null;
  }

  if (viewer.teamId !== undefined) {
    return viewer.teamId ?? null;
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function getScopedLeadWhere(viewer: ReportViewer): Prisma.LeadWhereInput | null {
  if (!canAccessLeadModule(viewer.role)) {
    return null;
  }

  return withVisibleLeadWhere(getLeadScope(viewer.role, viewer.id, viewer.teamId));
}

function getScopedCustomerWhere(viewer: ReportViewer): Prisma.CustomerWhereInput | null {
  if (!canAccessCustomerModule(viewer.role)) {
    return null;
  }

  return getCustomerScope(viewer.role, viewer.id, viewer.teamId);
}

function getScopedGiftWhere(viewer: ReportViewer): Prisma.GiftRecordWhereInput | null {
  if (!canAccessGiftModule(viewer.role)) {
    return null;
  }

  return getGiftScope(viewer.role, viewer.id, viewer.teamId);
}

function getScopedShippingWhere(viewer: ReportViewer): Prisma.ShippingTaskWhereInput | null {
  if (!canAccessShippingModule(viewer.role)) {
    return null;
  }

  return getShippingTaskScope(viewer.role, viewer.id, viewer.teamId);
}

function getActionFilter(viewer: ReportViewer) {
  if (viewer.role === "SALES") {
    return { salesId: viewer.id };
  }

  if (viewer.role === "SUPERVISOR") {
    return viewer.teamId
      ? {
          sales: {
            is: {
              teamId: viewer.teamId,
            },
          },
        }
      : { id: "__missing_action_team_scope__" };
  }

  return {};
}

function getSalesOrderAttributionFilter(viewer: ReportViewer): Prisma.SalesOrderWhereInput {
  if (viewer.role === "SALES") {
    return {
      OR: [{ ownerId: viewer.id }, { customer: { ownerId: viewer.id } }],
    };
  }

  if (viewer.role === "SUPERVISOR") {
    return viewer.teamId
      ? {
          OR: [
            { owner: { is: { teamId: viewer.teamId } } },
            { customer: { owner: { is: { teamId: viewer.teamId } } } },
          ],
        }
      : { id: "__missing_sales_order_team_scope__" };
  }

  return {};
}

async function getTodayCards(viewer: ReportViewer) {
  const now = new Date();
  const today = getTodayRange(now);
  const leadWhere = getScopedLeadWhere(viewer);
  const customerWhere = getScopedCustomerWhere(viewer);
  const giftWhere = getScopedGiftWhere(viewer);
  const shippingWhere = getScopedShippingWhere(viewer);

  const [
    todayLeadCount,
    pendingFollowUpCustomers,
    todayLiveSessions,
    pendingGiftReviews,
    pendingShippingTasks,
  ] = await Promise.all([
    leadWhere
      ? prisma.lead.count({
          where: {
            AND: [
              leadWhere,
              {
                createdAt: {
                  gte: today.start,
                  lte: today.end,
                },
              },
            ],
          },
        })
      : Promise.resolve(null),
    customerWhere
      ? prisma.customer.count({
          where: {
            AND: [
              customerWhere,
              {
                OR: [
                  {
                    followUpTasks: {
                      some: {
                        status: "PENDING",
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
              },
            ],
          },
        })
      : Promise.resolve(null),
    canAccessLiveSessionModule(viewer.role, viewer.permissionCodes)
      ? prisma.liveSession.count({
          where: {
            status: {
              in: [
                LiveSessionStatus.SCHEDULED,
                LiveSessionStatus.LIVE,
                LiveSessionStatus.ENDED,
              ],
            },
            startAt: {
              gte: today.start,
              lte: today.end,
            },
          },
        })
      : Promise.resolve(null),
    giftWhere
      ? prisma.giftRecord.count({
          where: {
            AND: [
              giftWhere,
              {
                reviewStatus: GiftReviewStatus.PENDING_REVIEW,
              },
            ],
          },
        })
      : Promise.resolve(null),
    shippingWhere
      ? prisma.shippingTask.count({
          where: {
            AND: [
              shippingWhere,
              {
                salesOrderId: {
                  not: null,
                },
                shippingStatus: {
                  in: PENDING_V2_SHIPPING_STATUSES,
                },
              },
            ],
          },
        })
      : Promise.resolve(null),
  ]);

  return [
    {
      label: "今日新增线索",
      value: toCountValue(todayLeadCount),
      note:
        todayLeadCount === null
          ? "当前角色无权查看线索统计"
          : `口径：${formatDate(today.start)} 新建的可见线索`,
    },
    {
      label: "待跟进客户数",
      value: toCountValue(pendingFollowUpCustomers),
      note:
        pendingFollowUpCustomers === null
          ? "当前角色无权查看客户跟进统计"
          : "口径：存在逾期待跟进任务或下次跟进时间已到的可见客户",
    },
    {
      label: "今日直播场次",
      value: toCountValue(todayLiveSessions),
      note:
        todayLiveSessions === null
          ? "当前角色无权查看直播场次"
          : `口径：${formatDate(today.start)} 开播的直播场次`,
    },
    {
      label: "待审核礼品单",
      value: toCountValue(pendingGiftReviews),
      note:
        pendingGiftReviews === null
          ? "当前角色无权查看礼品审核数据"
          : "口径：审核状态为待审核的可见礼品记录",
    },
    {
      label: "待发货任务数",
      value: toCountValue(pendingShippingTasks),
      note:
        pendingShippingTasks === null
          ? "当前角色无权查看发货任务数据"
          : "口径：仅统计已关联 SalesOrder 的 V2 发货任务，且发货状态为未进发货池或待发货",
    },
  ] satisfies SummaryCard[];
}

async function getPaymentSummary(viewer: ReportViewer) {
  if (!canAccessPaymentRecordModule(viewer.role)) {
    return null;
  }

  const teamId = await getViewerTeamId(viewer);
  const planScope = buildPaymentPlanScope(viewer, teamId);
  const recordScope = buildPaymentRecordScope(viewer, teamId);
  const taskScope = buildCollectionTaskScope(viewer, teamId);

  const activePlanWhere: Prisma.PaymentPlanWhereInput = {
    AND: [
      planScope,
      {
        status: {
          not: PaymentPlanStatus.CANCELED,
        },
      },
    ],
  };

  const activePrepaidPlanWhere: Prisma.PaymentPlanWhereInput = {
    AND: [
      activePlanWhere,
      {
        collectionChannel: PaymentCollectionChannel.PREPAID,
      },
    ],
  };

  const activeCodPlanWhere: Prisma.PaymentPlanWhereInput = {
    AND: [
      activePlanWhere,
      {
        collectionChannel: PaymentCollectionChannel.COD,
      },
    ],
  };

  const submittedRecordWhere: Prisma.PaymentRecordWhereInput = {
    AND: [
      recordScope,
      {
        status: PaymentRecordStatus.SUBMITTED,
      },
    ],
  };

  const activeCollectionTaskWhere: Prisma.CollectionTaskWhereInput = {
    AND: [
      taskScope,
      {
        status: {
          in: ["PENDING", "IN_PROGRESS"],
        },
      },
    ],
  };

  const [
    planAggregate,
    prepaidRemainingAggregate,
    codRemainingAggregate,
    submittedRecordCount,
    activeCollectionTaskCount,
  ] = await Promise.all([
    prisma.paymentPlan.aggregate({
      where: activePlanWhere,
      _sum: {
        submittedAmount: true,
        confirmedAmount: true,
      },
    }),
    prisma.paymentPlan.aggregate({
      where: activePrepaidPlanWhere,
      _sum: {
        remainingAmount: true,
      },
    }),
    prisma.paymentPlan.aggregate({
      where: activeCodPlanWhere,
      _sum: {
        remainingAmount: true,
      },
    }),
    prisma.paymentRecord.count({
      where: submittedRecordWhere,
    }),
    prisma.collectionTask.count({
      where: activeCollectionTaskWhere,
    }),
  ]);

  return {
    description:
      "全部支付指标正式基于 PaymentPlan / PaymentRecord / CollectionTask 聚合；SalesOrder 上的 depositAmount、collectedAmount、paidAmount、remainingAmount、codAmount 仅作为同步摘要字段展示。",
    cards: [
      {
        label: "已录入收款金额",
        value: formatCurrency(toCurrencyNumber(planAggregate._sum.submittedAmount)),
        note: "口径：Σ PaymentPlan.submittedAmount；来源于 PaymentRecord 的已提交 + 已确认。",
        href: "/payment-records",
      },
      {
        label: "已确认收款金额",
        value: formatCurrency(toCurrencyNumber(planAggregate._sum.confirmedAmount)),
        note: "口径：Σ PaymentPlan.confirmedAmount；只统计已完成确认的收款。",
        href: "/payment-records",
      },
      {
        label: "待确认收款记录",
        value: String(submittedRecordCount),
        note: "口径：PaymentRecord.status = SUBMITTED；等待主管或管理员确认。",
        href: "/payment-records",
      },
      {
        label: "待收金额",
        value: formatCurrency(
          toCurrencyNumber(prepaidRemainingAggregate._sum.remainingAmount),
        ),
        note: "口径：collectionChannel = PREPAID 且未取消的 PaymentPlan.remainingAmount。",
        href: "/collection-tasks",
      },
      {
        label: "待代收金额",
        value: formatCurrency(toCurrencyNumber(codRemainingAggregate._sum.remainingAmount)),
        note: "口径：collectionChannel = COD 且未取消的 PaymentPlan.remainingAmount。",
        href: buildOrderFulfillmentHref("shipping", { isCod: "true" }),
      },
      {
        label: "活跃催收任务",
        value: String(activeCollectionTaskCount),
        note: "口径：CollectionTask.status ∈ {PENDING, IN_PROGRESS}。",
        href: "/collection-tasks",
      },
    ] satisfies SummaryCard[],
  } satisfies PaymentSummaryData;
}

function buildShippingSummaryScope(
  viewer: ReportViewer,
  teamId: string | null,
): Prisma.ShippingTaskWhereInput | null {
  if (viewer.role === "ADMIN" || viewer.role === "SHIPPER") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    return teamId
      ? {
          OR: [
            { salesOrder: { owner: { is: { teamId } } } },
            { salesOrder: { customer: { owner: { is: { teamId } } } } },
          ],
        }
      : { id: "__missing_shipping_scope__" };
  }

  return null;
}

function buildLogisticsSummaryScope(
  viewer: ReportViewer,
  teamId: string | null,
): Prisma.LogisticsFollowUpTaskWhereInput | null {
  if (viewer.role === "ADMIN" || viewer.role === "SHIPPER") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    return teamId
      ? {
          OR: [
            { owner: { is: { teamId } } },
            { customer: { owner: { is: { teamId } } } },
            { salesOrder: { owner: { is: { teamId } } } },
            { salesOrder: { customer: { owner: { is: { teamId } } } } },
          ],
        }
      : { id: "__missing_logistics_scope__" };
  }

  return null;
}

async function getFulfillmentSummary(viewer: ReportViewer) {
  const teamId = await getViewerTeamId(viewer);
  const shippingScope = buildShippingSummaryScope(viewer, teamId);
  const logisticsScope = buildLogisticsSummaryScope(viewer, teamId);

  if (!shippingScope) {
    return null;
  }

  const now = new Date();
  const shippingBaseWhere: Prisma.ShippingTaskWhereInput = {
    AND: [
      shippingScope,
      {
        salesOrderId: {
          not: null,
        },
        salesOrder: {
          reviewStatus: SalesOrderReviewStatus.APPROVED,
        },
      },
    ],
  };

  const codPendingWhere: Prisma.ShippingTaskWhereInput = {
    AND: [
      shippingBaseWhere,
      {
        codAmount: {
          gt: 0,
        },
        shippingStatus: {
          in: [
            ShippingFulfillmentStatus.SHIPPED,
            ShippingFulfillmentStatus.DELIVERED,
            ShippingFulfillmentStatus.COMPLETED,
          ],
        },
        OR: [
          {
            codCollectionRecords: {
              none: {},
            },
          },
          {
            codCollectionRecords: {
              some: {
                status: {
                  in: ["PENDING_COLLECTION", "EXCEPTION", "REJECTED", "UNCOLLECTED"],
                },
              },
            },
          },
        ],
      },
    ],
  };

  const promises: Array<Promise<number | null>> = [
    prisma.shippingTask.count({
      where: {
        AND: [
          shippingBaseWhere,
          {
            reportStatus: ShippingReportStatus.PENDING,
          },
        ],
      },
    }),
    prisma.shippingTask.count({
      where: {
        AND: [
          shippingBaseWhere,
          {
            reportStatus: ShippingReportStatus.REPORTED,
            OR: [{ trackingNumber: null }, { trackingNumber: "" }],
          },
        ],
      },
    }),
    logisticsScope
      ? prisma.logisticsFollowUpTask.count({
          where: {
            AND: [
              logisticsScope,
              {
                status: {
                  in: ["PENDING", "IN_PROGRESS"],
                },
                nextTriggerAt: {
                  lte: now,
                },
              },
            ],
          },
        })
      : Promise.resolve(null),
    prisma.shippingTask.count({
      where: codPendingWhere,
    }),
    canAccessReportModule(viewer.role)
      ? prisma.paymentPlan.count({
          where: {
            AND: [
              buildPaymentPlanScope(viewer, teamId),
              {
                sourceType: "GIFT_RECORD",
                subjectType: "FREIGHT",
                status: {
                  not: PaymentPlanStatus.CANCELED,
                },
                remainingAmount: {
                  gt: 0,
                },
              },
            ],
          },
        })
      : Promise.resolve(null),
  ];

  const [
    pendingReportCount,
    reportedWithoutTrackingCount,
    logisticsDueCount,
    codPendingCount,
    giftFreightPendingCount,
  ] = await Promise.all(promises);

  const cards: SummaryCard[] = [
    {
      label: "待报单任务",
      value: String(pendingReportCount ?? 0),
      note: "已审核通过但尚未导出给供货商的履约任务。",
      href: buildOrderFulfillmentHref("shipping", { reportStatus: "PENDING" }),
    },
    {
      label: "已报单待回填",
      value: String(reportedWithoutTrackingCount ?? 0),
      note: "已报单但尚未回填物流单号，不能推进到已发货。",
      href: buildOrderFulfillmentHref("shipping", {
        reportStatus: "REPORTED",
        hasTrackingNumber: "false",
      }),
    },
    {
      label: "待物流跟进",
      value: toCountValue(logisticsDueCount),
      note: "物流跟进任务状态为待跟进或跟进中，且已到触发时间。",
      href: buildOrderFulfillmentHref("shipping"),
    },
    {
      label: "待 COD 回款",
      value: String(codPendingCount ?? 0),
      note: "已发货 COD 订单中，尚未完成履约侧回款登记的任务。",
      href: buildOrderFulfillmentHref("shipping", { isCod: "true" }),
    },
  ];

  if (giftFreightPendingCount !== null) {
    cards.push({
      label: "待礼品运费",
      value: String(giftFreightPendingCount),
      note: "礼品运费 PaymentPlan 尚未完成收款的记录。",
      href: "/gifts",
    });
  }

  return {
    description:
      "履约摘要聚焦发货执行、物流跟进、COD 回款与礼品运费，不扩展为财务中心。",
    cards,
  } satisfies PaymentSummaryData;
}

async function getConversionMetrics(viewer: ReportViewer) {
  const leadWhere = getScopedLeadWhere(viewer);
  const scopeMode = getPerformanceScopeMode(viewer.role);

  if (!leadWhere || scopeMode === "restricted") {
    return null;
  }

  const range = getRollingRange(REPORT_WINDOW_DAYS);
  const actionFilter = getActionFilter(viewer);
  const salesOrderFilter = getSalesOrderAttributionFilter(viewer);

  const leadWindowWhere: Prisma.LeadWhereInput = {
    AND: [
      leadWhere,
      {
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
      },
    ],
  };

  const [
    newLeads,
    leadsWithFirstCall,
    totalCalls,
    connectedCalls,
    leadsWithWechatAdded,
    leadsWithLiveInvitation,
    totalInvitations,
    attendedInvitations,
    leadsWithDeal,
  ] = await Promise.all([
    prisma.lead.count({
      where: leadWindowWhere,
    }),
    prisma.lead.count({
      where: {
        AND: [
          leadWindowWhere,
          {
            OR: [
              {
                callRecords: {
                  some: actionFilter,
                },
              },
              {
                customer: {
                  is: {
                    callRecords: {
                      some: actionFilter,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    }),
    prisma.callRecord.count({
      where: {
        ...actionFilter,
        callTime: {
          gte: range.start,
          lte: range.end,
        },
      },
    }),
    prisma.callRecord.count({
      where: {
        ...actionFilter,
        callTime: {
          gte: range.start,
          lte: range.end,
        },
        OR: [
          {
            resultCode: {
              not: null,
              notIn: [...NON_CONNECTED_CALL_RESULT_CODES],
            },
          },
          {
            resultCode: null,
            result: {
              in: CONNECTED_CALL_RESULTS,
            },
          },
        ],
      },
    }),
    prisma.lead.count({
      where: {
        AND: [
          leadWindowWhere,
          {
            OR: [
              {
                wechatRecords: {
                  some: {
                    ...actionFilter,
                    addedStatus: "ADDED",
                  },
                },
              },
              {
                customer: {
                  is: {
                    wechatRecords: {
                      some: {
                        ...actionFilter,
                        addedStatus: "ADDED",
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    }),
    prisma.lead.count({
      where: {
        AND: [
          leadWindowWhere,
          {
            OR: [
              {
                liveInvitations: {
                  some: {
                    ...actionFilter,
                    invitationStatus: {
                      in: INVITED_STATUSES,
                    },
                  },
                },
              },
              {
                customer: {
                  is: {
                    liveInvitations: {
                      some: {
                        ...actionFilter,
                        invitationStatus: {
                          in: INVITED_STATUSES,
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    }),
    prisma.liveInvitation.count({
      where: {
        ...actionFilter,
        invitationStatus: {
          in: INVITED_STATUSES,
        },
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
      },
    }),
    prisma.liveInvitation.count({
      where: {
        ...actionFilter,
        invitationStatus: {
          in: INVITED_STATUSES,
        },
        attendanceStatus: {
          in: ATTENDED_STATUSES,
        },
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
      },
    }),
    prisma.lead.count({
      where: {
        AND: [
          leadWindowWhere,
          {
            customer: {
              is: {
                salesOrders: {
                  some: {
                    ...salesOrderFilter,
                    reviewStatus: SalesOrderReviewStatus.APPROVED,
                  },
                },
              },
            },
          },
        ],
      },
    }),
  ]);

  return {
    windowLabel: `近 ${REPORT_WINDOW_DAYS} 天（${formatDate(range.start)} - ${formatDate(range.end)}）`,
    scopeLabel: scopeMode === "team" ? "团队口径" : "个人口径",
    metrics: [
      {
        label: "新增线索数",
        value: String(newLeads),
        note: `口径：统计窗口内新建线索数`,
        numerator: newLeads,
        denominator: newLeads,
      },
      {
        label: "首呼完成率",
        value: formatPercentage(leadsWithFirstCall, newLeads),
        note: `口径：有至少 1 条通话记录的新增线索 / 新增线索`,
        numerator: leadsWithFirstCall,
        denominator: newLeads,
      },
      {
        label: "接通率",
        value: formatPercentage(connectedCalls, totalCalls),
        note: `口径：接通类通话记录 / 全部通话记录`,
        numerator: connectedCalls,
        denominator: totalCalls,
      },
      {
        label: "加微率",
        value: formatPercentage(leadsWithWechatAdded, newLeads),
        note: `口径：已产生 ADDED 加微记录的新增线索 / 新增线索`,
        numerator: leadsWithWechatAdded,
        denominator: newLeads,
      },
      {
        label: "直播邀约率",
        value: formatPercentage(leadsWithLiveInvitation, newLeads),
        note: `口径：已产生邀约记录的新增线索 / 新增线索`,
        numerator: leadsWithLiveInvitation,
        denominator: newLeads,
      },
      {
        label: "到场率",
        value: formatPercentage(attendedInvitations, totalInvitations),
        note: `口径：到场邀约记录 / 已邀约直播记录`,
        numerator: attendedInvitations,
        denominator: totalInvitations,
      },
      {
        label: "成交率",
        value: formatPercentage(leadsWithDeal, newLeads),
        note: `口径：已产生已审核通过 SalesOrder 的新增线索 / 新增线索`,
        numerator: leadsWithDeal,
        denominator: newLeads,
      },
    ] satisfies ConversionMetric[],
  };
}

function mapGroupCounts<K extends string, T extends { _count: { _all: number } } & Record<K, string | null>>(
  items: T[],
  key: K,
) {
  const result = new Map<string, number>();

  for (const item of items) {
    const value = item[key];

    if (typeof value === "string" && value) {
      result.set(value, item._count._all);
    }
  }

  return result;
}

async function getEmployeeRanking(viewer: ReportViewer) {
  if (!canAccessReportModule(viewer.role)) {
    return null;
  }

  const range = getRollingRange(REPORT_WINDOW_DAYS);
  const supervisorTeamFilter =
    viewer.role === "SUPERVISOR"
      ? viewer.teamId
        ? { teamId: viewer.teamId }
        : { id: "__missing_sales_team_scope__" }
      : {};

  const [
    salesUsers,
    callCounts,
    wechatCounts,
    wechatAddedCounts,
    invitationCounts,
    dealCounts,
  ] = await Promise.all([
    prisma.user.findMany({
      where: {
        userStatus: UserStatus.ACTIVE,
        role: {
          code: "SALES",
        },
        ...supervisorTeamFilter,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        username: true,
      },
    }),
    prisma.callRecord.groupBy({
      by: ["salesId"],
      where: {
        callTime: {
          gte: range.start,
          lte: range.end,
        },
        ...(viewer.role === "SUPERVISOR"
          ? viewer.teamId
            ? { sales: { is: { teamId: viewer.teamId } } }
            : { id: "__missing_call_team_scope__" }
          : {}),
      },
      _count: {
        _all: true,
      },
    }),
    prisma.wechatRecord.groupBy({
      by: ["salesId"],
      where: {
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
        ...(viewer.role === "SUPERVISOR"
          ? viewer.teamId
            ? { sales: { is: { teamId: viewer.teamId } } }
            : { id: "__missing_wechat_team_scope__" }
          : {}),
      },
      _count: {
        _all: true,
      },
    }),
    prisma.wechatRecord.groupBy({
      by: ["salesId"],
      where: {
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
        addedStatus: "ADDED",
        ...(viewer.role === "SUPERVISOR"
          ? viewer.teamId
            ? { sales: { is: { teamId: viewer.teamId } } }
            : { id: "__missing_wechat_added_team_scope__" }
          : {}),
      },
      _count: {
        _all: true,
      },
    }),
    prisma.liveInvitation.groupBy({
      by: ["salesId"],
      where: {
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
        invitationStatus: {
          in: INVITED_STATUSES,
        },
        ...(viewer.role === "SUPERVISOR"
          ? viewer.teamId
            ? { sales: { is: { teamId: viewer.teamId } } }
            : { id: "__missing_invitation_team_scope__" }
          : {}),
      },
      _count: {
        _all: true,
      },
    }),
    prisma.salesOrder.groupBy({
      by: ["ownerId"],
      where: {
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
        reviewStatus: SalesOrderReviewStatus.APPROVED,
        ...(viewer.role === "SUPERVISOR"
          ? viewer.teamId
            ? {
                OR: [
                  { owner: { is: { teamId: viewer.teamId } } },
                  { customer: { owner: { is: { teamId: viewer.teamId } } } },
                ],
              }
            : { id: "__missing_deal_team_scope__" }
          : {}),
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const callCountMap = mapGroupCounts(callCounts, "salesId");
  const wechatCountMap = mapGroupCounts(wechatCounts, "salesId");
  const wechatAddedCountMap = mapGroupCounts(wechatAddedCounts, "salesId");
  const invitationCountMap = mapGroupCounts(invitationCounts, "salesId");
  const dealCountMap = mapGroupCounts(dealCounts, "ownerId");

  const items = salesUsers
    .map((user) => {
      const followUpCount =
        (callCountMap.get(user.id) ?? 0) +
        (wechatCountMap.get(user.id) ?? 0) +
        (invitationCountMap.get(user.id) ?? 0);

      return {
        userId: user.id,
        name: user.name,
        username: user.username,
        followUpCount,
        dealCount: dealCountMap.get(user.id) ?? 0,
        invitationCount: invitationCountMap.get(user.id) ?? 0,
        wechatAddedCount: wechatAddedCountMap.get(user.id) ?? 0,
      };
    })
    .filter(
      (item) =>
        item.followUpCount > 0 ||
        item.dealCount > 0 ||
        item.invitationCount > 0 ||
        item.wechatAddedCount > 0,
    )
    .sort((left, right) => {
      if (right.followUpCount !== left.followUpCount) {
        return right.followUpCount - left.followUpCount;
      }

      if (right.dealCount !== left.dealCount) {
        return right.dealCount - left.dealCount;
      }

      if (right.invitationCount !== left.invitationCount) {
        return right.invitationCount - left.invitationCount;
      }

      return right.wechatAddedCount - left.wechatAddedCount;
    })
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    })) satisfies EmployeeRankingItem[];

  return {
    windowLabel: `近 ${REPORT_WINDOW_DAYS} 天（${formatDate(range.start)} - ${formatDate(range.end)}）`,
    description:
      "按近 30 天跟进数排序。跟进数 = 通话记录 + 微信记录 + 直播邀约记录；成交数 = 已审核通过 SalesOrder 数。",
    items,
  };
}

export async function getDashboardData(viewer: ReportViewer) {
  const [
    cards,
    conversions,
    ranking,
    paymentSummary,
    fulfillmentSummary,
    financeSummary,
  ] = await Promise.all([
    getTodayCards(viewer),
    getConversionMetrics(viewer),
    getEmployeeRanking(viewer),
    getPaymentSummary(viewer),
    getFulfillmentSummary(viewer),
    getFinanceSummary(viewer),
  ]);

  return {
    scopeMode: getPerformanceScopeMode(viewer.role),
    cards,
    conversions,
    ranking,
    paymentSummary,
    fulfillmentSummary,
    financeSummary,
  };
}

export async function getReportsPageData(viewer: ReportViewer) {
  if (!canAccessReportModule(viewer.role)) {
    throw new Error("You do not have access to reports.");
  }

  const [
    cards,
    conversions,
    ranking,
    paymentSummary,
    fulfillmentSummary,
    financeSummary,
  ] = await Promise.all([
    getTodayCards(viewer),
    getConversionMetrics(viewer),
    getEmployeeRanking(viewer),
    getPaymentSummary(viewer),
    getFulfillmentSummary(viewer),
    getFinanceSummary(viewer),
  ]);

  return {
    cards,
    conversions,
    ranking,
    paymentSummary,
    fulfillmentSummary,
    financeSummary,
    definitions: [
      {
        label: "今日新增线索",
        description: "当天创建的线索数量，按当前角色可见范围统计。",
      },
      {
        label: "待跟进客户数",
        description:
          "存在逾期待跟进任务，或线索 / 通话 / 微信记录上的下次跟进时间已到的客户数。",
      },
      {
        label: "今日直播场次",
        description: "当天开播的直播场次数量。",
      },
      {
        label: "待审核礼品单",
        description: "审核状态为 PENDING_REVIEW 的礼品记录数量。",
      },
      {
        label: "待发货任务数",
        description: "仅统计已关联 SalesOrder 的 V2 发货任务，且发货状态为未进发货池或待发货。",
      },
      {
        label: "待报单任务",
        description: "已审核通过但报单状态仍为 PENDING 的履约任务数。",
      },
      {
        label: "已报单待回填",
        description: "报单状态已完成，但物流单号仍为空的履约任务数。",
      },
      {
        label: "待物流跟进",
        description: "LogisticsFollowUpTask.status ∈ {PENDING, IN_PROGRESS} 且 nextTriggerAt 已到。",
      },
      {
        label: "待 COD 回款",
        description: "已发货 COD 订单中，履约侧仍未完成回款登记的任务数。",
      },
      {
        label: "待礼品运费",
        description: "GiftRecord 运费对应的 PaymentPlan 仍有 remainingAmount 的记录数。",
      },
      {
        label: "已录入收款金额",
        description:
          "口径：Σ PaymentPlan.submittedAmount。该字段来自 PaymentRecord 的已提交与已确认状态，不再直接聚合 SalesOrder.collectedAmount。",
      },
      {
        label: "已确认收款金额",
        description:
          "口径：Σ PaymentPlan.confirmedAmount。只统计 PaymentRecord 已确认后的金额，不再直接聚合 SalesOrder.paidAmount。",
      },
      {
        label: "待确认收款记录",
        description: "口径：PaymentRecord.status = SUBMITTED，用于识别待主管或管理员确认的收款记录。",
      },
      {
        label: "待收金额",
        description:
          "口径：collectionChannel = PREPAID 且未取消的 PaymentPlan.remainingAmount，不再直接聚合 SalesOrder.remainingAmount。",
      },
      {
        label: "待代收金额",
        description:
          "口径：collectionChannel = COD 且未取消的 PaymentPlan.remainingAmount；履约页仍可读 SalesOrder.codAmount 摘要，但报表正式以 payment layer 为准。",
      },
      {
        label: "活跃催收任务",
        description: "口径：CollectionTask.status ∈ {PENDING, IN_PROGRESS}。",
      },
      {
        label: "首呼完成率",
        description: "近 30 天新增线索中，至少出现 1 次通话记录的线索占比。",
      },
      {
        label: "接通率",
        description:
          "近 30 天全部通话记录中，结果属于接通类枚举的通话占比。",
      },
      {
        label: "加微率",
        description: "近 30 天新增线索中，已产生 ADDED 微信记录的线索占比。",
      },
      {
        label: "直播邀约率",
        description: "近 30 天新增线索中，已产生直播邀约记录的线索占比。",
      },
      {
        label: "到场率",
        description: "近 30 天已邀约直播记录中，实际到场记录占比。",
      },
      {
        label: "成交率",
        description: "近 30 天新增线索中，已产生已审核通过 SalesOrder 的线索占比。",
      },
      {
        label: "员工排行",
        description:
          "按近 30 天跟进数排序；跟进数 = 通话记录 + 微信记录 + 直播邀约记录；成交数按已审核通过 SalesOrder 数统计。",
      },
      {
        label: "兼容期摘要字段",
        description:
          "兼容期内，SalesOrder.depositAmount / collectedAmount / paidAmount / remainingAmount / codAmount 仅作为 payment layer 同步摘要，不再作为报表主口径真相。",
      },
    ] satisfies ReportDefinition[],
  };
}
