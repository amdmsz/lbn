import {
  CustomerOwnershipMode,
  PaymentRecordStatus,
  SalesOrderPaymentScheme,
  TradeOrderStatus,
  WechatAddStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import ExcelJS from "exceljs";
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

const customerExportXlsxMimeType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const customersExportContentType = customerExportXlsxMimeType;

const customerExportColumns = [
  {
    key: "customerId",
    header: "客户ID",
    width: 22,
    text: true,
    description: "CRM 客户主键，用于回查和审计。",
  },
  {
    key: "customerName",
    header: "客户姓名",
    width: 14,
    description: "客户当前姓名。",
  },
  {
    key: "phone",
    header: "电话",
    width: 16,
    text: true,
    description: "客户手机号，按文本保存，避免 Excel 自动转科学计数。",
  },
  {
    key: "province",
    header: "省份",
    width: 12,
    description: "客户地址省份。",
  },
  {
    key: "city",
    header: "城市",
    width: 12,
    description: "客户地址城市。",
  },
  {
    key: "district",
    header: "区县",
    width: 12,
    description: "客户地址区县。",
  },
  {
    key: "detailAddress",
    header: "详细地址",
    width: 34,
    wrap: true,
    description: "客户详细收货地址。",
  },
  {
    key: "fullAddress",
    header: "完整地址",
    width: 44,
    wrap: true,
    description: "省市区和详细地址合并后的地址，方便财务直接核对。",
  },
  {
    key: "salesperson",
    header: "销售员",
    width: 18,
    description: "当前承接客户的销售员。",
  },
  {
    key: "team",
    header: "团队",
    width: 16,
    description: "销售员所属团队。",
  },
  {
    key: "assignedAt",
    header: "分配时间",
    width: 20,
    date: true,
    description: "客户最近一次进入当前销售私海的时间。",
  },
  {
    key: "createdAt",
    header: "建档时间",
    width: 20,
    date: true,
    description: "客户记录创建时间。",
  },
  {
    key: "latestOrderAt",
    header: "最近下单时间",
    width: 20,
    date: true,
    description: "最近一笔成交主单创建时间。",
  },
  {
    key: "orderCount",
    header: "订单数",
    width: 10,
    center: true,
    description: "客户名下成交主单总数。",
  },
  {
    key: "productSummary",
    header: "商品明细",
    width: 58,
    wrap: true,
    description: "最近订单商品、规格、单位和数量，以及线索意向商品摘要。",
  },
  {
    key: "orderSummary",
    header: "最近订单摘要",
    width: 58,
    wrap: true,
    description: "最近成交主单的订单号、状态、成交金额、已收和待收。",
  },
  {
    key: "totalFinalAmount",
    header: "成交金额合计",
    width: 16,
    money: true,
    description: "本次导出中已读取订单的成交金额合计。",
  },
  {
    key: "totalPaidAmount",
    header: "已收金额合计",
    width: 16,
    money: true,
    description: "本次导出中已读取订单的已收金额合计。",
  },
  {
    key: "totalRemainingAmount",
    header: "待收金额合计",
    width: 16,
    money: true,
    description: "本次导出中已读取订单的待收金额合计。",
  },
  {
    key: "paymentScheme",
    header: "付款方式",
    width: 18,
    wrap: true,
    description: "订单付款方案汇总。",
  },
  {
    key: "paymentRecords",
    header: "最近收款记录",
    width: 58,
    wrap: true,
    description: "最近收款时间、渠道、金额、确认状态和流水号。",
  },
  {
    key: "trackingNumbers",
    header: "物流单号",
    width: 42,
    wrap: true,
    description: "订单物流公司和物流单号汇总。",
  },
  {
    key: "communicationSummary",
    header: "沟通记录",
    width: 64,
    wrap: true,
    description: "最近电话、微信、直播邀约等沟通记录摘要。",
  },
] as const;

type CustomerExportColumn = (typeof customerExportColumns)[number];
type CustomerExportColumnKey = CustomerExportColumn["key"];
type CustomerExportCellValue = string | number | Date | null;
type CustomerExportRow = Record<CustomerExportColumnKey, CustomerExportCellValue>;

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
  _count: {
    select: {
      tradeOrders: true,
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
  orderTotals: {
    finalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  };
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

function toNumberAmount(value: Prisma.Decimal | number | string | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function buildCustomersExportRows(items: CustomerExportItem[]): CustomerExportRow[] {
  return items.map((item) => ({
    customerId: item.id,
    customerName: item.name,
    phone: item.phone,
    province: item.province ?? "",
    city: item.city ?? "",
    district: item.district ?? "",
    detailAddress: item.address ?? "",
    fullAddress: buildAddress(item),
    salesperson: buildOwnerLabel(item),
    team: item.owner?.team?.name ?? "",
    assignedAt: item.assignedAt,
    createdAt: item.createdAt,
    latestOrderAt: item.tradeOrders[0]?.createdAt ?? null,
    orderCount: item._count.tradeOrders,
    productSummary: buildProductSummary(item),
    orderSummary: buildOrderSummary(item),
    totalFinalAmount: item.orderTotals.finalAmount,
    totalPaidAmount: item.orderTotals.paidAmount,
    totalRemainingAmount: item.orderTotals.remainingAmount,
    paymentScheme: buildPaymentSchemeSummary(item),
    paymentRecords: buildPaymentSummary(item),
    trackingNumbers: buildTrackingSummary(item),
    communicationSummary: buildCommunicationSummary(item),
  }));
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

function applyDetailWorksheetStyle(worksheet: ExcelJS.Worksheet, rowCount: number) {
  worksheet.views = [{ state: "frozen", ySplit: 4 }];
  worksheet.properties.defaultRowHeight = 22;
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
  };

  customerExportColumns.forEach((column, index) => {
    const excelColumn = worksheet.getColumn(index + 1);
    excelColumn.width = column.width;

    if ("text" in column && column.text) {
      excelColumn.numFmt = "@";
    }

    if ("money" in column && column.money) {
      excelColumn.numFmt = "¥#,##0.00;[Red]-¥#,##0.00";
    }

    if ("date" in column && column.date) {
      excelColumn.numFmt = "yyyy/mm/dd hh:mm";
    }
  });

  const lastColumnIndex = customerExportColumns.length;
  worksheet.mergeCells(1, 1, 1, lastColumnIndex);
  worksheet.mergeCells(2, 1, 2, lastColumnIndex);

  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = "客户对账导出";
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(1).height = 30;

  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = `导出时间：${formatDateTime(new Date())}    客户数：${rowCount}    来源：JIUZHUANG CRM`;
  subtitleCell.font = { size: 11, color: { argb: "FF6B7280" } };
  subtitleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF9FAFB" },
  };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(2).height = 24;
  worksheet.getRow(3).height = 8;

  const headerRow = worksheet.getRow(4);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEA580C" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });

  for (let rowNumber = 5; rowNumber <= rowCount + 4; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 42;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const column = customerExportColumns[columnNumber - 1];

      cell.border = thinBorder;
      cell.alignment = {
        vertical: "top",
        horizontal:
          "center" in column && column.center
            ? "center"
            : "money" in column && column.money
              ? "right"
              : "left",
        wrapText: "wrap" in column ? Boolean(column.wrap) : false,
      };

      if (rowNumber % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFBF7" },
        };
      }
    });
  }
}

function addDetailWorksheet(workbook: ExcelJS.Workbook, rows: CustomerExportRow[]) {
  const worksheet = workbook.addWorksheet("客户对账明细");
  const tableRows = rows.map((row) =>
    customerExportColumns.map((column) => row[column.key] ?? ""),
  );

  worksheet.addTable({
    name: "CustomerExportTable",
    ref: "A4",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium2",
      showRowStripes: true,
    },
    columns: customerExportColumns.map((column) => ({
      name: column.header,
      filterButton: true,
    })),
    rows: tableRows,
  });

  applyDetailWorksheetStyle(worksheet, rows.length);

  return worksheet;
}

function addGuideWorksheet(workbook: ExcelJS.Workbook) {
  const worksheet = workbook.addWorksheet("字段说明");

  worksheet.columns = [
    { key: "field", width: 24 },
    { key: "description", width: 82 },
  ];
  worksheet.addTable({
    name: "CustomerExportGuideTable",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium4",
      showRowStripes: true,
    },
    columns: [
      { name: "字段", filterButton: true },
      { name: "说明", filterButton: false },
    ],
    rows: customerExportColumns.map((column) => [column.header, column.description]),
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.getRow(1).height = 26;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF374151" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  for (let rowNumber = 2; rowNumber <= customerExportColumns.length + 1; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 28;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "top",
        horizontal: columnNumber === 1 ? "center" : "left",
        wrapText: columnNumber !== 1,
      };
    });
  }

  return worksheet;
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
  return `customers-${datePart}.xlsx`;
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
  const tradeOrderAmountGroups = customerIds.length
    ? await prisma.tradeOrder.groupBy({
        by: ["customerId"],
        where: {
          customerId: {
            in: customerIds,
          },
        },
        _sum: {
          finalAmount: true,
          paidAmount: true,
          remainingAmount: true,
        },
      })
    : [];
  const orderTotalsByCustomerId = new Map(
    tradeOrderAmountGroups.map((group) => [
      group.customerId,
      {
        finalAmount: toNumberAmount(group._sum.finalAmount),
        paidAmount: toNumberAmount(group._sum.paidAmount),
        remainingAmount: toNumberAmount(group._sum.remainingAmount),
      },
    ]),
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
        orderTotals: orderTotalsByCustomerId.get(item.id) ?? {
          finalAmount: 0,
          paidAmount: 0,
          remainingAmount: 0,
        },
      })),
  };
}

export async function buildCustomersExportXlsx(items: CustomerExportItem[]) {
  const workbook = new ExcelJS.Workbook();
  const rows = buildCustomersExportRows(items);

  workbook.creator = "JIUZHUANG CRM";
  workbook.lastModifiedBy = "JIUZHUANG CRM";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  addDetailWorksheet(workbook, rows);
  addGuideWorksheet(workbook);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
