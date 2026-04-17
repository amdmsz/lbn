import {
  CollectionTaskStatus,
  PaymentCollectionChannel,
  PaymentPlanStatus,
  PaymentPlanSubjectType,
  PaymentRecordChannel,
  PaymentRecordStatus,
  SalesOrderPaymentScheme,
  SalesOrderReviewStatus,
  ShippingFulfillmentStatus,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { getParamValue } from "@/lib/action-notice";
import { canAccessFinanceModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  buildCollectionTaskScope,
  buildPaymentPlanScope,
  buildPaymentRecordScope,
} from "@/lib/payments/scope";

type SearchParamsValue = string | string[] | undefined;

const FINANCE_PAYMENTS_PAGE_SIZE = 12;
const GIFT_FREIGHT_STALE_DAYS = 14;
const ACTIVE_COLLECTION_TASK_STATUSES: CollectionTaskStatus[] = [
  CollectionTaskStatus.PENDING,
  CollectionTaskStatus.IN_PROGRESS,
];
const SHIPPED_LIKE_STATUSES: ShippingFulfillmentStatus[] = [
  ShippingFulfillmentStatus.SHIPPED,
  ShippingFulfillmentStatus.DELIVERED,
  ShippingFulfillmentStatus.COMPLETED,
];
const COD_COMPLETED_STATUSES: ShippingFulfillmentStatus[] = [
  ShippingFulfillmentStatus.DELIVERED,
  ShippingFulfillmentStatus.COMPLETED,
];

export type FinanceViewer = {
  id: string;
  role: RoleCode;
};

export type FinancePaymentsFilters = {
  orderNo: string;
  customerKeyword: string;
  salesId: string;
  channel: "" | PaymentRecordChannel;
  status: "" | PaymentRecordStatus;
  occurredFrom: string;
  occurredTo: string;
  page: number;
};

export type FinancePaymentsExportItem = {
  id: string;
  sourceType: "SALES_ORDER" | "GIFT_RECORD";
  occurredAt: Date;
  amount: string;
  channel:
    | "ORDER_FORM_DECLARED"
    | "BANK_TRANSFER"
    | "WECHAT_TRANSFER"
    | "ALIPAY_TRANSFER"
    | "COD"
    | "CASH"
    | "OTHER";
  status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
  referenceNo: string | null;
  remark: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
  } | null;
  giftRecord: {
    id: string;
    giftName: string;
  } | null;
  salesOrder: {
    id: string;
    orderNo: string;
    items: Array<{
      id: string;
      titleSnapshot: string | null;
      productNameSnapshot: string;
      skuNameSnapshot: string;
      specSnapshot: string;
      qty: number;
    }>;
  } | null;
  shippingTask: {
    id: string;
    trackingNumber: string | null;
  } | null;
};

export type FinanceExceptionKind =
  | "SHIPPED_WITHOUT_PAYMENT_PLAN"
  | "DELIVERED_COD_UNPAID"
  | "REJECTED_ORDER_ACTIVE_COLLECTION"
  | "STALE_GIFT_FREIGHT_COLLECTION"
  | "PAYMENT_PLAN_ORDER_MISMATCH";

export type FinanceExceptionSeverity = "danger" | "warning" | "info";

type FinanceCard = {
  label: string;
  value: string;
  note: string;
  href?: string;
};

const financePaymentsFiltersSchema = z.object({
  orderNo: z.string().trim().default(""),
  customerKeyword: z.string().trim().default(""),
  salesId: z.string().trim().default(""),
  channel: z
    .enum([
      "",
      "ORDER_FORM_DECLARED",
      "BANK_TRANSFER",
      "WECHAT_TRANSFER",
      "ALIPAY_TRANSFER",
      "COD",
      "CASH",
      "OTHER",
    ])
    .default(""),
  status: z.enum(["", "SUBMITTED", "CONFIRMED", "REJECTED"]).default(""),
  occurredFrom: z.string().trim().default(""),
  occurredTo: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).default(1),
});

function toCurrencyNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function getDifference(left: number, right: number) {
  return Math.abs(left - right);
}

function buildSupervisorTeamScope(teamId: string | null) {
  return teamId ? { teamId } : { id: "__missing_finance_team_scope__" };
}

function getFinanceScopeLabel(viewer: FinanceViewer) {
  return viewer.role === "ADMIN" ? "全量财务视角" : "团队财务视角";
}

async function getViewerTeamId(viewer: FinanceViewer) {
  if (viewer.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function buildFinanceSalesOrderScope(
  viewer: FinanceViewer,
  teamId: string | null,
): Prisma.SalesOrderWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  const teamScope = buildSupervisorTeamScope(teamId);
  return {
    OR: [
      { owner: { is: teamScope } },
      { customer: { owner: { is: teamScope } } },
    ],
  };
}

function buildFinanceGiftScope(
  viewer: FinanceViewer,
  teamId: string | null,
): Prisma.GiftRecordWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  const teamScope = buildSupervisorTeamScope(teamId);
  return {
    OR: [
      { sales: { is: teamScope } },
      { customer: { owner: { is: teamScope } } },
    ],
  };
}

function buildFinancePaymentRecordSalesFilter(salesId: string): Prisma.PaymentRecordWhereInput {
  return {
    OR: [
      { ownerId: salesId },
      { customer: { ownerId: salesId } },
      { salesOrder: { ownerId: salesId } },
      { salesOrder: { customer: { ownerId: salesId } } },
      { giftRecord: { salesId } },
      { giftRecord: { customer: { ownerId: salesId } } },
    ],
  };
}

function getFinancePaymentsWhere(
  viewer: FinanceViewer,
  teamId: string | null,
  filters: FinancePaymentsFilters,
): Prisma.PaymentRecordWhereInput {
  const andClauses: Prisma.PaymentRecordWhereInput[] = [
    buildPaymentRecordScope(viewer, teamId),
  ];

  if (filters.orderNo) {
    andClauses.push({
      salesOrder: {
        orderNo: {
          contains: filters.orderNo,
        },
      },
    });
  }

  if (filters.customerKeyword) {
    andClauses.push({
      OR: [
        { customer: { name: { contains: filters.customerKeyword } } },
        { customer: { phone: { contains: filters.customerKeyword } } },
      ],
    });
  }

  if (filters.salesId) {
    andClauses.push(buildFinancePaymentRecordSalesFilter(filters.salesId));
  }

  if (filters.channel) {
    andClauses.push({ channel: filters.channel });
  }

  if (filters.status) {
    andClauses.push({ status: filters.status });
  }

  if (filters.occurredFrom || filters.occurredTo) {
    const occurredAt: Prisma.DateTimeFilter = {};

    if (filters.occurredFrom) {
      occurredAt.gte = new Date(filters.occurredFrom);
    }

    if (filters.occurredTo) {
      const end = new Date(filters.occurredTo);
      end.setHours(23, 59, 59, 999);
      occurredAt.lte = end;
    }

    andClauses.push({ occurredAt });
  }

  return { AND: andClauses };
}

async function getFinanceSalesOptions(viewer: FinanceViewer, teamId: string | null) {
  return prisma.user.findMany({
    where: {
      userStatus: UserStatus.ACTIVE,
      role: {
        code: "SALES",
      },
      ...(viewer.role === "SUPERVISOR" && teamId ? { teamId } : {}),
    },
    orderBy: [{ name: "asc" }, { username: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
    },
  });
}

export function parseFinancePaymentsFilters(
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  return financePaymentsFiltersSchema.parse({
    orderNo: getParamValue(rawSearchParams?.orderNo),
    customerKeyword: getParamValue(rawSearchParams?.customerKeyword),
    salesId: getParamValue(rawSearchParams?.salesId),
    channel: getParamValue(rawSearchParams?.channel),
    status: getParamValue(rawSearchParams?.status),
    occurredFrom: getParamValue(rawSearchParams?.occurredFrom),
    occurredTo: getParamValue(rawSearchParams?.occurredTo),
    page: getParamValue(rawSearchParams?.page) || "1",
  });
}

export async function getFinancePaymentsPageData(
  viewer: FinanceViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessFinanceModule(viewer.role)) {
    throw new Error("You do not have access to finance payments.");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseFinancePaymentsFilters(rawSearchParams);
  const where = getFinancePaymentsWhere(viewer, teamId, filters);

  const [totalCount, salesOptions, currentSummary] = await Promise.all([
    prisma.paymentRecord.count({ where }),
    getFinanceSalesOptions(viewer, teamId),
    prisma.paymentRecord.aggregate({
      where,
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / FINANCE_PAYMENTS_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.paymentRecord.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * FINANCE_PAYMENTS_PAGE_SIZE,
    take: FINANCE_PAYMENTS_PAGE_SIZE,
    select: {
      id: true,
      sourceType: true,
      amount: true,
      channel: true,
      status: true,
      occurredAt: true,
      referenceNo: true,
      remark: true,
      createdAt: true,
      paymentPlan: {
        select: {
          id: true,
          subjectType: true,
          stageType: true,
          collectionChannel: true,
          plannedAmount: true,
          confirmedAmount: true,
          remainingAmount: true,
          status: true,
        },
      },
      salesOrder: {
        select: {
          id: true,
          orderNo: true,
          owner: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          customer: {
            select: {
              owner: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
        },
      },
      giftRecord: {
        select: {
          id: true,
          giftName: true,
          sales: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          customer: {
            select: {
              owner: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          owner: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      },
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          shippingStatus: true,
          trackingNumber: true,
        },
      },
      submittedBy: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      confirmedBy: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  });

  return {
    scopeLabel: getFinanceScopeLabel(viewer),
    filters: {
      ...filters,
      page,
    },
    salesOptions,
    summaryCards: [
      {
        label: "当前筛选记录数",
        value: String(currentSummary._count._all),
        note: "PaymentRecord 为主的财务收款视图，仅展示当前筛选结果。",
      },
      {
        label: "当前筛选总金额",
        value: formatCurrency(currentSummary._sum.amount?.toString() ?? "0"),
        note: "按当前筛选条件汇总的 PaymentRecord.amount。",
      },
    ] satisfies FinanceCard[],
    items: items.map((item) => {
      const salesOwner =
        item.salesOrder?.owner ??
        item.giftRecord?.sales ??
        item.customer?.owner ??
        item.salesOrder?.customer.owner ??
        item.giftRecord?.customer.owner ??
        item.owner ??
        null;

      return {
        ...item,
        amount: item.amount.toString(),
        salesOwner,
        paymentPlan: {
          ...item.paymentPlan,
          plannedAmount: item.paymentPlan.plannedAmount.toString(),
          confirmedAmount: item.paymentPlan.confirmedAmount.toString(),
          remainingAmount: item.paymentPlan.remainingAmount.toString(),
        },
      };
    }),
    pagination: {
      page,
      pageSize: FINANCE_PAYMENTS_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export async function getFinancePaymentsExportData(
  viewer: FinanceViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
): Promise<{
  filters: FinancePaymentsFilters;
  scopeLabel: string;
  items: FinancePaymentsExportItem[];
}> {
  if (!canAccessFinanceModule(viewer.role)) {
    throw new Error("You do not have access to finance payments export.");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseFinancePaymentsFilters(rawSearchParams);
  const where = getFinancePaymentsWhere(viewer, teamId, filters);

  const items = await prisma.paymentRecord.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      sourceType: true,
      occurredAt: true,
      amount: true,
      channel: true,
      status: true,
      referenceNo: true,
      remark: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      giftRecord: {
        select: {
          id: true,
          giftName: true,
        },
      },
      salesOrder: {
        select: {
          id: true,
          orderNo: true,
          items: {
            orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              titleSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              specSnapshot: true,
              qty: true,
            },
          },
        },
      },
      shippingTask: {
        select: {
          id: true,
          trackingNumber: true,
        },
      },
    },
  });

  const normalizedItems: FinancePaymentsExportItem[] = items.map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    occurredAt: item.occurredAt,
    amount: item.amount.toString(),
    channel: item.channel,
    status: item.status,
    referenceNo: item.referenceNo,
    remark: item.remark,
    customer: item.customer,
    giftRecord: item.giftRecord,
    salesOrder: item.salesOrder,
    shippingTask: item.shippingTask,
  }));

  return {
    filters,
    scopeLabel: getFinanceScopeLabel(viewer),
    items: normalizedItems,
  };
}

export async function getFinanceReconciliationPageData(viewer: FinanceViewer) {
  if (!canAccessFinanceModule(viewer.role)) {
    throw new Error("You do not have access to finance reconciliation.");
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

  const pendingConfirmRecordWhere: Prisma.PaymentRecordWhereInput = {
    AND: [
      recordScope,
      {
        status: PaymentRecordStatus.SUBMITTED,
      },
    ],
  };

  const pendingCollectionPlanWhere: Prisma.PaymentPlanWhereInput = {
    AND: [
      activePlanWhere,
      {
        collectionChannel: PaymentCollectionChannel.PREPAID,
        remainingAmount: {
          gt: 0,
        },
      },
    ],
  };

  const codPendingPlanWhere: Prisma.PaymentPlanWhereInput = {
    AND: [
      activePlanWhere,
      {
        collectionChannel: PaymentCollectionChannel.COD,
        remainingAmount: {
          gt: 0,
        },
        shippingTask: {
          is: {
            shippingStatus: {
              in: SHIPPED_LIKE_STATUSES,
            },
          },
        },
      },
    ],
  };

  const giftFreightPendingWhere: Prisma.PaymentPlanWhereInput = {
    AND: [
      activePlanWhere,
      {
        sourceType: "GIFT_RECORD",
        subjectType: PaymentPlanSubjectType.FREIGHT,
        remainingAmount: {
          gt: 0,
        },
      },
    ],
  };

  const activeCollectionTaskWhere: Prisma.CollectionTaskWhereInput = {
    AND: [
      taskScope,
      {
        status: {
          in: ACTIVE_COLLECTION_TASK_STATUSES,
        },
      },
    ],
  };

  const overdueCollectionTaskWhere: Prisma.CollectionTaskWhereInput = {
    AND: [
      activeCollectionTaskWhere,
      {
        dueAt: {
          lt: new Date(),
        },
      },
    ],
  };

  const [
    receivableAggregate,
    pendingConfirmAggregate,
    pendingConfirmCount,
    pendingCollectionAggregate,
    codPendingAggregate,
    giftFreightPendingAggregate,
    activeCollectionTaskCount,
    overdueCollectionTaskCount,
    sourceBreakdown,
    collectionTaskBreakdown,
  ] = await Promise.all([
    prisma.paymentPlan.aggregate({
      where: activePlanWhere,
      _sum: {
        plannedAmount: true,
        confirmedAmount: true,
      },
    }),
    prisma.paymentRecord.aggregate({
      where: pendingConfirmRecordWhere,
      _sum: {
        amount: true,
      },
    }),
    prisma.paymentRecord.count({
      where: pendingConfirmRecordWhere,
    }),
    prisma.paymentPlan.aggregate({
      where: pendingCollectionPlanWhere,
      _sum: {
        remainingAmount: true,
      },
    }),
    prisma.paymentPlan.aggregate({
      where: codPendingPlanWhere,
      _sum: {
        remainingAmount: true,
      },
    }),
    prisma.paymentPlan.aggregate({
      where: giftFreightPendingWhere,
      _sum: {
        remainingAmount: true,
      },
    }),
    prisma.collectionTask.count({
      where: activeCollectionTaskWhere,
    }),
    prisma.collectionTask.count({
      where: overdueCollectionTaskWhere,
    }),
    prisma.paymentPlan.groupBy({
      by: ["sourceType", "subjectType", "collectionChannel"],
      where: activePlanWhere,
      _count: {
        _all: true,
      },
      _sum: {
        plannedAmount: true,
        confirmedAmount: true,
        remainingAmount: true,
      },
    }),
    prisma.collectionTask.groupBy({
      by: ["taskType", "status"],
      where: taskScope,
      _count: {
        _all: true,
      },
    }),
  ]);

  return {
    scopeLabel: getFinanceScopeLabel(viewer),
    summaryCards: [
      {
        label: "应收金额",
        value: formatCurrency(receivableAggregate._sum.plannedAmount?.toString() ?? "0"),
        note: "口径：未取消 PaymentPlan.plannedAmount 汇总，覆盖订单货款与礼品运费。",
      },
      {
        label: "已确认金额",
        value: formatCurrency(receivableAggregate._sum.confirmedAmount?.toString() ?? "0"),
        note: "口径：未取消 PaymentPlan.confirmedAmount 汇总，代表已完成财务确认的收款。",
      },
      {
        label: "待确认金额",
        value: formatCurrency(pendingConfirmAggregate._sum.amount?.toString() ?? "0"),
        note: "口径：PaymentRecord.status = SUBMITTED 的 amount 汇总，等待主管或管理员确认。",
      },
      {
        label: "待收金额",
        value: formatCurrency(
          pendingCollectionAggregate._sum.remainingAmount?.toString() ?? "0",
        ),
        note: "口径：collectionChannel = PREPAID 且未取消的 PaymentPlan.remainingAmount 汇总。",
      },
      {
        label: "COD 待回款金额",
        value: formatCurrency(codPendingAggregate._sum.remainingAmount?.toString() ?? "0"),
        note: "口径：collectionChannel = COD，且履约已进入发货后阶段的 PaymentPlan.remainingAmount 汇总。",
      },
      {
        label: "礼品运费待收金额",
        value: formatCurrency(
          giftFreightPendingAggregate._sum.remainingAmount?.toString() ?? "0",
        ),
        note: "口径：GiftRecord 运费 PaymentPlan.remainingAmount 汇总，用于礼品运费补款预览。",
      },
    ] satisfies FinanceCard[],
    metricDefinitions: [
      {
        label: "应收金额",
        description:
          "未取消的 PaymentPlan.plannedAmount 汇总。当前阶段不做开票、结算，只用 payment layer 作为正式对账口径。",
      },
      {
        label: "已确认金额",
        description:
          "未取消的 PaymentPlan.confirmedAmount 汇总。该值与已确认 PaymentRecord 同步，不回退到订单单字段做主口径。",
      },
      {
        label: "待确认金额",
        description:
          "PaymentRecord.status = SUBMITTED 的 amount 汇总。它代表已录入但尚未完成财务确认的收款。",
      },
      {
        label: "待收金额",
        description:
          "collectionChannel = PREPAID 且 remainingAmount > 0 的 PaymentPlan.remainingAmount 汇总，覆盖定金、尾款和礼品运费中的预付类待收。",
      },
      {
        label: "COD 待回款金额",
        description:
          "collectionChannel = COD 且 ShippingTask 已发货/签收/完成的 PaymentPlan.remainingAmount 汇总，用于预览履约侧代收回款压力。",
      },
      {
        label: "礼品运费待收金额",
        description:
          "sourceType = GIFT_RECORD 且 subjectType = FREIGHT 的 PaymentPlan.remainingAmount 汇总，是待收金额中的礼品运费子集。",
      },
    ],
    operationalCards: [
      {
        label: "待确认收款笔数",
        value: String(pendingConfirmCount),
        note: "口径：PaymentRecord.status = SUBMITTED。",
        href: "/finance/payments?status=SUBMITTED",
      },
      {
        label: "活跃催收任务",
        value: String(activeCollectionTaskCount),
        note: "口径：CollectionTask.status ∈ {PENDING, IN_PROGRESS}。",
        href: "/collection-tasks",
      },
      {
        label: "逾期催收任务",
        value: String(overdueCollectionTaskCount),
        note: "口径：活跃 CollectionTask 且 dueAt 早于当前时间。",
        href: "/collection-tasks?dueState=OVERDUE",
      },
    ] satisfies FinanceCard[],
    sourceBreakdown: sourceBreakdown.map((item) => ({
      ...item,
      plannedAmount: item._sum.plannedAmount?.toString() ?? "0",
      confirmedAmount: item._sum.confirmedAmount?.toString() ?? "0",
      remainingAmount: item._sum.remainingAmount?.toString() ?? "0",
      count: item._count._all,
    })),
    collectionTaskBreakdown: collectionTaskBreakdown.map((item) => ({
      taskType: item.taskType,
      status: item.status,
      count: item._count._all,
    })),
  };
}

function buildFinanceExceptionItem(input: {
  kind: FinanceExceptionKind;
  severity: FinanceExceptionSeverity;
  title: string;
  sourceKey: string;
  sourceLabel: string;
  sourceDescription: string;
  explanation: string;
  href: string;
  hrefLabel: string;
  createdAt: Date | null;
}) {
  return input;
}

async function loadFinanceExceptionItems(viewer: FinanceViewer, teamId: string | null) {
  const salesOrderScope = buildFinanceSalesOrderScope(viewer, teamId);
  const giftScope = buildFinanceGiftScope(viewer, teamId);
  const staleBoundary = new Date();
  staleBoundary.setDate(staleBoundary.getDate() - GIFT_FREIGHT_STALE_DAYS);

  const [
    shippedWithoutPlanOrders,
    deliveredCodUnpaidOrders,
    rejectedOrdersWithCollection,
    staleGiftFreightRecords,
    mismatchCandidates,
  ] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        AND: [
          salesOrderScope,
          {
            reviewStatus: SalesOrderReviewStatus.APPROVED,
            shippingTask: {
              is: {
                shippingStatus: {
                  in: SHIPPED_LIKE_STATUSES,
                },
              },
            },
            paymentPlans: {
              none: {
                status: {
                  not: PaymentPlanStatus.CANCELED,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        shippingTask: {
          select: {
            shippingStatus: true,
            trackingNumber: true,
          },
        },
      },
    }),
    prisma.salesOrder.findMany({
      where: {
        AND: [
          salesOrderScope,
          {
            reviewStatus: SalesOrderReviewStatus.APPROVED,
            paymentScheme: {
              in: [
                SalesOrderPaymentScheme.FULL_COD,
                SalesOrderPaymentScheme.DEPOSIT_PLUS_COD,
              ],
            },
            shippingTask: {
              is: {
                shippingStatus: {
                  in: COD_COMPLETED_STATUSES,
                },
              },
            },
            paymentPlans: {
              some: {
                collectionChannel: PaymentCollectionChannel.COD,
                status: {
                  not: PaymentPlanStatus.CANCELED,
                },
                remainingAmount: {
                  gt: 0,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        paymentPlans: {
          where: {
            collectionChannel: PaymentCollectionChannel.COD,
            status: {
              not: PaymentPlanStatus.CANCELED,
            },
          },
          select: {
            remainingAmount: true,
            codCollectionRecord: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    }),
    prisma.salesOrder.findMany({
      where: {
        AND: [
          salesOrderScope,
          {
            reviewStatus: SalesOrderReviewStatus.REJECTED,
            paymentPlans: {
              some: {
                collectionTasks: {
                  some: {
                    status: {
                      in: ACTIVE_COLLECTION_TASK_STATUSES,
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        paymentPlans: {
          select: {
            collectionTasks: {
              where: {
                status: {
                  in: ACTIVE_COLLECTION_TASK_STATUSES,
                },
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    }),
    prisma.giftRecord.findMany({
      where: {
        AND: [
          giftScope,
          {
            paymentPlans: {
              some: {
                subjectType: PaymentPlanSubjectType.FREIGHT,
                status: {
                  not: PaymentPlanStatus.CANCELED,
                },
                remainingAmount: {
                  gt: 0,
                },
              },
            },
            OR: [
              {
                paymentPlans: {
                  some: {
                    subjectType: PaymentPlanSubjectType.FREIGHT,
                    status: {
                      not: PaymentPlanStatus.CANCELED,
                    },
                    remainingAmount: {
                      gt: 0,
                    },
                    dueAt: {
                      lte: staleBoundary,
                    },
                  },
                },
              },
              {
                AND: [
                  {
                    createdAt: {
                      lte: staleBoundary,
                    },
                  },
                  {
                    paymentPlans: {
                      some: {
                        subjectType: PaymentPlanSubjectType.FREIGHT,
                        status: {
                          not: PaymentPlanStatus.CANCELED,
                        },
                        remainingAmount: {
                          gt: 0,
                        },
                        dueAt: null,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        giftName: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        paymentPlans: {
          where: {
            subjectType: PaymentPlanSubjectType.FREIGHT,
            status: {
              not: PaymentPlanStatus.CANCELED,
            },
            remainingAmount: {
              gt: 0,
            },
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: {
            dueAt: true,
            remainingAmount: true,
          },
        },
      },
    }),
    prisma.salesOrder.findMany({
      where: {
        AND: [
          salesOrderScope,
          {
            reviewStatus: {
              in: [SalesOrderReviewStatus.APPROVED, SalesOrderReviewStatus.REJECTED],
            },
            paymentPlans: {
              some: {
                status: {
                  not: PaymentPlanStatus.CANCELED,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        finalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        codAmount: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        paymentPlans: {
          where: {
            status: {
              not: PaymentPlanStatus.CANCELED,
            },
          },
          select: {
            subjectType: true,
            collectionChannel: true,
            plannedAmount: true,
            confirmedAmount: true,
            remainingAmount: true,
          },
        },
      },
    }),
  ]);

  const items = [
    ...shippedWithoutPlanOrders.map((order) =>
      buildFinanceExceptionItem({
        kind: "SHIPPED_WITHOUT_PAYMENT_PLAN",
        severity: "danger",
        title: "已发货但没有有效收款计划",
        sourceKey: `salesOrder:${order.id}`,
        sourceLabel: order.orderNo,
        sourceDescription: `${order.customer.name} / ${order.shippingTask?.trackingNumber || "未回填物流单号"}`,
        explanation:
          "来源：订单已进入发货后阶段，但关联 PaymentPlan 缺失或只剩已取消计划，finance 无法形成正式应收口径。",
        href: `/orders/${order.id}`,
        hrefLabel: "查看订单",
        createdAt: order.createdAt,
      }),
    ),
    ...deliveredCodUnpaidOrders.map((order) => {
      const codRemaining = order.paymentPlans.reduce(
        (total, plan) => total + toCurrencyNumber(plan.remainingAmount),
        0,
      );
      const latestCodStatus =
        order.paymentPlans.find((plan) => plan.codCollectionRecord)?.codCollectionRecord?.status ??
        null;

      return buildFinanceExceptionItem({
        kind: "DELIVERED_COD_UNPAID",
        severity: "danger",
        title: "已签收但 COD 未回款",
        sourceKey: `salesOrder:${order.id}`,
        sourceLabel: order.orderNo,
        sourceDescription: `${order.customer.name} / COD 待回款 ${codRemaining.toFixed(2)}`,
        explanation: `来源：订单已签收或已完成，但 COD PaymentPlan 仍有 remainingAmount。最新履约回款状态：${latestCodStatus ?? "未登记"}`,
        href: `/orders/${order.id}`,
        hrefLabel: "查看订单",
        createdAt: order.createdAt,
      });
    }),
    ...rejectedOrdersWithCollection.map((order) => {
      const activeTaskCount = order.paymentPlans.reduce(
        (total, plan) => total + plan.collectionTasks.length,
        0,
      );

      return buildFinanceExceptionItem({
        kind: "REJECTED_ORDER_ACTIVE_COLLECTION",
        severity: "warning",
        title: "已驳回订单仍有活跃催收任务",
        sourceKey: `salesOrder:${order.id}`,
        sourceLabel: order.orderNo,
        sourceDescription: `${order.customer.name} / 活跃催收 ${activeTaskCount} 条`,
        explanation:
          "来源：订单审核状态已驳回，但仍保留 PENDING / IN_PROGRESS 的 CollectionTask，需人工确认是否关闭或改派。",
        href: `/orders/${order.id}`,
        hrefLabel: "查看订单",
        createdAt: order.createdAt,
      });
    }),
    ...staleGiftFreightRecords.map((gift) => {
      const freightPlan = gift.paymentPlans[0] ?? null;

      return buildFinanceExceptionItem({
        kind: "STALE_GIFT_FREIGHT_COLLECTION",
        severity: "warning",
        title: "GiftRecord 运费待收过久",
        sourceKey: `giftRecord:${gift.id}`,
        sourceLabel: gift.giftName,
        sourceDescription: `${gift.customer.name} / 待收运费 ${freightPlan?.remainingAmount.toString() ?? "0"}`,
        explanation: `来源：礼品运费仍未收齐，且参考时间（dueAt 或创建时间）已超过 ${GIFT_FREIGHT_STALE_DAYS} 天。`,
        href: `/customers/${gift.customer.id}?tab=gifts`,
        hrefLabel: "查看客户礼品记录",
        createdAt: gift.createdAt,
      });
    }),
    ...mismatchCandidates.flatMap((order) => {
      const goodsPlanned = order.paymentPlans
        .filter((plan) => plan.subjectType === PaymentPlanSubjectType.GOODS)
        .reduce((total, plan) => total + toCurrencyNumber(plan.plannedAmount), 0);
      const confirmedTotal = order.paymentPlans.reduce(
        (total, plan) => total + toCurrencyNumber(plan.confirmedAmount),
        0,
      );
      const remainingTotal = order.paymentPlans.reduce(
        (total, plan) => total + toCurrencyNumber(plan.remainingAmount),
        0,
      );
      const codPlanned = order.paymentPlans
        .filter((plan) => plan.collectionChannel === PaymentCollectionChannel.COD)
        .reduce((total, plan) => total + toCurrencyNumber(plan.plannedAmount), 0);

      const mismatches: string[] = [];

      if (getDifference(goodsPlanned, toCurrencyNumber(order.finalAmount)) > 0.009) {
        mismatches.push(
          `货款计划 ${goodsPlanned.toFixed(2)} 与订单 finalAmount ${toCurrencyNumber(order.finalAmount).toFixed(2)} 不一致`,
        );
      }

      if (getDifference(confirmedTotal, toCurrencyNumber(order.paidAmount)) > 0.009) {
        mismatches.push(
          `计划 confirmedAmount ${confirmedTotal.toFixed(2)} 与订单 paidAmount ${toCurrencyNumber(order.paidAmount).toFixed(2)} 不一致`,
        );
      }

      if (getDifference(remainingTotal, toCurrencyNumber(order.remainingAmount)) > 0.009) {
        mismatches.push(
          `计划 remainingAmount ${remainingTotal.toFixed(2)} 与订单 remainingAmount ${toCurrencyNumber(order.remainingAmount).toFixed(2)} 不一致`,
        );
      }

      if (getDifference(codPlanned, toCurrencyNumber(order.codAmount)) > 0.009) {
        mismatches.push(
          `COD 计划 ${codPlanned.toFixed(2)} 与订单 codAmount ${toCurrencyNumber(order.codAmount).toFixed(2)} 不一致`,
        );
      }

      if (mismatches.length === 0) {
        return [];
      }

      return [
        buildFinanceExceptionItem({
          kind: "PAYMENT_PLAN_ORDER_MISMATCH",
          severity: "info",
          title: "PaymentPlan 与订单摘要不一致",
          sourceKey: `salesOrder:${order.id}`,
          sourceLabel: order.orderNo,
          sourceDescription: `${order.customer.name} / ${mismatches.length} 处差异`,
          explanation: `来源：兼容摘要字段与 payment layer 聚合值未同步。${mismatches.join("；")}`,
          href: `/orders/${order.id}`,
          hrefLabel: "查看订单",
          createdAt: order.createdAt,
        }),
      ];
    }),
  ].sort((left, right) => {
    const leftTime = left.createdAt?.getTime() ?? 0;
    const rightTime = right.createdAt?.getTime() ?? 0;
    return rightTime - leftTime;
  });

  const uniqueSourceCount = new Set(items.map((item) => item.sourceKey)).size;

  return {
    items,
    uniqueSourceCount,
  };
}

export async function getFinanceExceptionsPageData(viewer: FinanceViewer) {
  if (!canAccessFinanceModule(viewer.role)) {
    throw new Error("You do not have access to finance exceptions.");
  }

  const teamId = await getViewerTeamId(viewer);
  const { items, uniqueSourceCount } = await loadFinanceExceptionItems(viewer, teamId);

  const groupedCounts = items.reduce<Record<FinanceExceptionKind, number>>(
    (result, item) => {
      result[item.kind] += 1;
      return result;
    },
    {
      SHIPPED_WITHOUT_PAYMENT_PLAN: 0,
      DELIVERED_COD_UNPAID: 0,
      REJECTED_ORDER_ACTIVE_COLLECTION: 0,
      STALE_GIFT_FREIGHT_COLLECTION: 0,
      PAYMENT_PLAN_ORDER_MISMATCH: 0,
    },
  );

  return {
    scopeLabel: getFinanceScopeLabel(viewer),
    totalCount: items.length,
    uniqueSourceCount,
    summaryCards: [
      {
        label: "异常项总数",
        value: String(items.length),
        note: "口径：finance exceptions 页面识别出的全部异常条目。",
      },
      {
        label: "异常单数",
        value: String(uniqueSourceCount),
        note: "口径：按订单或礼品业务单去重后的异常来源数。",
      },
      {
        label: "高优先级异常",
        value: String(
          groupedCounts.SHIPPED_WITHOUT_PAYMENT_PLAN + groupedCounts.DELIVERED_COD_UNPAID,
        ),
        note: "口径：已发货无计划 + 已签收 COD 未回款。",
      },
    ] satisfies FinanceCard[],
    groupedCounts,
    items,
  };
}

export async function getFinanceSummary(viewer: FinanceViewer) {
  if (!canAccessFinanceModule(viewer.role)) {
    return null;
  }

  const teamId = await getViewerTeamId(viewer);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const planScope = buildPaymentPlanScope(viewer, teamId);
  const recordScope = buildPaymentRecordScope(viewer, teamId);

  const [
    todayConfirmedAggregate,
    pendingConfirmCount,
    codPendingAggregate,
    giftFreightAggregate,
    exceptionSnapshot,
  ] = await Promise.all([
    prisma.paymentRecord.aggregate({
      where: {
        AND: [
          recordScope,
          {
            status: PaymentRecordStatus.CONFIRMED,
            confirmedAt: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        ],
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.paymentRecord.count({
      where: {
        AND: [
          recordScope,
          {
            status: PaymentRecordStatus.SUBMITTED,
          },
        ],
      },
    }),
    prisma.paymentPlan.aggregate({
      where: {
        AND: [
          planScope,
          {
            collectionChannel: PaymentCollectionChannel.COD,
            status: {
              not: PaymentPlanStatus.CANCELED,
            },
            remainingAmount: {
              gt: 0,
            },
            shippingTask: {
              is: {
                shippingStatus: {
                  in: SHIPPED_LIKE_STATUSES,
                },
              },
            },
          },
        ],
      },
      _sum: {
        remainingAmount: true,
      },
    }),
    prisma.paymentPlan.aggregate({
      where: {
        AND: [
          planScope,
          {
            sourceType: "GIFT_RECORD",
            subjectType: PaymentPlanSubjectType.FREIGHT,
            status: {
              not: PaymentPlanStatus.CANCELED,
            },
            remainingAmount: {
              gt: 0,
            },
          },
        ],
      },
      _sum: {
        remainingAmount: true,
      },
    }),
    loadFinanceExceptionItems(viewer, teamId),
  ]);

  return {
    description:
      "财务摘要只做 payment / fulfillment 的只读聚合，不扩展到开票、结算、自动对账或真实支付网关。",
    cards: [
      {
        label: "今日确认收款",
        value: formatCurrency(todayConfirmedAggregate._sum.amount?.toString() ?? "0"),
        note: "口径：PaymentRecord.status = CONFIRMED，且 confirmedAt 落在今天。",
        href: "/finance/payments?status=CONFIRMED",
      },
      {
        label: "待确认收款笔数",
        value: String(pendingConfirmCount),
        note: "口径：PaymentRecord.status = SUBMITTED。",
        href: "/finance/payments?status=SUBMITTED",
      },
      {
        label: "COD 待回款金额",
        value: formatCurrency(codPendingAggregate._sum.remainingAmount?.toString() ?? "0"),
        note: "口径：已发货后阶段的 COD PaymentPlan.remainingAmount 汇总。",
        href: "/finance/reconciliation",
      },
      {
        label: "礼品运费待收金额",
        value: formatCurrency(giftFreightAggregate._sum.remainingAmount?.toString() ?? "0"),
        note: "口径：GiftRecord 运费 PaymentPlan.remainingAmount 汇总。",
        href: "/finance/reconciliation",
      },
      {
        label: "异常订单数",
        value: String(exceptionSnapshot.uniqueSourceCount),
        note: "口径：finance exceptions 中按订单或礼品业务单去重后的异常来源数。",
        href: "/finance/exceptions",
      },
    ] satisfies FinanceCard[],
  };
}
