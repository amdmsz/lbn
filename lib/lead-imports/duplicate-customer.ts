import {
  CallResult,
  CustomerOwnershipMode,
  SalesOrderReviewStatus,
  WechatAddStatus,
  type Prisma,
} from "@prisma/client";
import {
  getDefaultSystemCallResultDefinition,
  isSystemCallResultCode,
  resolveStoredCallResultCode,
} from "@/lib/calls/metadata";
import {
  getCustomerExecutionClassLongLabel,
  getCustomerLevelLabel,
  getCustomerStatusLabel,
  type CustomerExecutionClass,
} from "@/lib/customers/metadata";
import type {
  LeadImportDuplicateCustomerSnapshot,
} from "@/lib/lead-imports/metadata";

const nonConnectedCallResultCodes = [
  "NOT_CONNECTED",
  "INVALID_NUMBER",
  "HUNG_UP",
] as const;

export const leadImportDuplicateCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  status: true,
  level: true,
  ownershipMode: true,
  ownerId: true,
  publicPoolTeamId: true,
  owner: {
    select: {
      name: true,
      username: true,
      teamId: true,
    },
  },
  publicPoolTeam: {
    select: {
      name: true,
    },
  },
  callRecords: {
    orderBy: { callTime: "desc" },
    take: 20,
    select: {
      result: true,
      resultCode: true,
      callTime: true,
    },
  },
  wechatRecords: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      addedStatus: true,
      addedAt: true,
      createdAt: true,
    },
  },
  salesOrders: {
    where: {
      reviewStatus: SalesOrderReviewStatus.APPROVED,
    },
    take: 2,
    select: {
      id: true,
    },
  },
  _count: {
    select: {
      callRecords: true,
      wechatRecords: true,
      liveInvitations: true,
      tradeOrders: true,
      salesOrders: true,
      orders: true,
      giftRecords: true,
      paymentPlans: true,
      paymentRecords: true,
      collectionTasks: true,
      shippingTasks: true,
      logisticsFollowUpTasks: true,
      codCollectionRecords: true,
      callRecordings: true,
      outboundCallSessions: true,
    },
  },
} satisfies Prisma.CustomerSelect;

export type LeadImportDuplicateCustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof leadImportDuplicateCustomerSelect;
}>;

type CallSignal = {
  result: CallResult | null;
  resultCode: string | null;
  callTime?: Date;
};

const replacementBlockerLabels = [
  ["tradeOrders", "已存在成交主单"],
  ["salesOrders", "已存在供应商子单"],
  ["orders", "已存在历史订单"],
  ["giftRecords", "已存在礼品履约记录"],
  ["paymentPlans", "已存在收款计划"],
  ["paymentRecords", "已存在收款记录"],
  ["collectionTasks", "已存在催收任务"],
  ["shippingTasks", "已存在发货任务"],
  ["logisticsFollowUpTasks", "已存在物流跟进任务"],
  ["codCollectionRecords", "已存在 COD 回款记录"],
  ["liveInvitations", "已存在直播邀约"],
  ["callRecordings", "已存在通话录音"],
  ["outboundCallSessions", "已存在外呼会话"],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getCallResultCode(record: CallSignal | null) {
  return record ? resolveStoredCallResultCode(record) : null;
}

function getCallResultLabel(record: CallSignal | null) {
  const code = getCallResultCode(record);

  if (!code) {
    return null;
  }

  return isSystemCallResultCode(code)
    ? getDefaultSystemCallResultDefinition(code).label
    : code;
}

function isSuccessfulWechatCallSignal(record: CallSignal) {
  return getCallResultCode(record) === CallResult.WECHAT_ADDED;
}

function isRefusedWechatCallSignal(record: CallSignal | null) {
  return getCallResultCode(record) === CallResult.REFUSED_WECHAT;
}

export function isLeadImportDisconnectedCallSignal(record: CallSignal | null) {
  const code = getCallResultCode(record);

  return Boolean(
    code &&
      nonConnectedCallResultCodes.includes(
        code as (typeof nonConnectedCallResultCodes)[number],
      ),
  );
}

export function getLeadImportLatestCallSignal<
  T extends { result: CallResult | null; resultCode: string | null; callTime: Date },
>(records: T[]) {
  return records.reduce<T | null>((latest, candidate) => {
    if (!getCallResultCode(candidate)) {
      return latest;
    }

    if (!latest || candidate.callTime.getTime() > latest.callTime.getTime()) {
      return candidate;
    }

    return latest;
  }, null);
}

export function hasLeadImportSuccessfulWechatSignal(
  customer: Pick<LeadImportDuplicateCustomerRecord, "wechatRecords" | "callRecords">,
) {
  return (
    customer.wechatRecords.some(
      (record) => record.addedStatus === WechatAddStatus.ADDED,
    ) || customer.callRecords.some((record) => isSuccessfulWechatCallSignal(record))
  );
}

export function getLeadImportDuplicateReplacementBlockerLabels(
  customer: LeadImportDuplicateCustomerRecord,
) {
  return replacementBlockerLabels.flatMap(([key, label]) =>
    (customer._count[key] ?? 0) > 0 ? [label] : [],
  );
}

export function deriveLeadImportDuplicateCustomerExecutionClass(
  customer: LeadImportDuplicateCustomerRecord,
): CustomerExecutionClass {
  const latestCall = getLeadImportLatestCallSignal(customer.callRecords);

  if (customer.salesOrders.length >= 2) {
    return "A";
  }

  if (isRefusedWechatCallSignal(latestCall)) {
    return "E";
  }

  if (customer._count.liveInvitations > 0) {
    return "C";
  }

  if (hasLeadImportSuccessfulWechatSignal(customer)) {
    return "B";
  }

  return "D";
}

export function getLeadImportDuplicateReplacementEligibility(
  customer: LeadImportDuplicateCustomerRecord,
) {
  const blockers = getLeadImportDuplicateReplacementBlockerLabels(customer);
  const latestCall = getLeadImportLatestCallSignal(customer.callRecords);

  if (blockers.length > 0) {
    return {
      eligible: false,
      reason: `不能作为新线索：${blockers.join("、")}。`,
    };
  }

  if (hasLeadImportSuccessfulWechatSignal(customer)) {
    return {
      eligible: false,
      reason: "不能作为新线索：原客户已有加微信信号。",
    };
  }

  if (latestCall && !isLeadImportDisconnectedCallSignal(latestCall)) {
    return {
      eligible: false,
      reason: `不能作为新线索：最近通话结果为${getCallResultLabel(latestCall) ?? "非未接通"}。`,
    };
  }

  return {
    eligible: true,
    reason: "符合未接通、未加微信、无交易/履约阻断，可由主管作为新线索重新分配。",
  };
}

function getOwnerLabel(customer: LeadImportDuplicateCustomerRecord) {
  if (customer.owner) {
    return `${customer.owner.name} (@${customer.owner.username})`;
  }

  if (customer.publicPoolTeam?.name) {
    return `团队公海：${customer.publicPoolTeam.name}`;
  }

  return "暂无负责人";
}

function getOwnershipLabel(customer: LeadImportDuplicateCustomerRecord) {
  if (customer.owner) {
    return "私域客户";
  }

  if (customer.ownershipMode === CustomerOwnershipMode.PUBLIC) {
    return customer.publicPoolTeam?.name
      ? `${customer.publicPoolTeam.name}公海`
      : "公海客户";
  }

  if (customer.ownershipMode === CustomerOwnershipMode.LOCKED) {
    return "锁定客户";
  }

  return "未分配客户";
}

function getLatestWechatAt(customer: LeadImportDuplicateCustomerRecord) {
  return customer.wechatRecords.reduce<Date | null>((latest, record) => {
    const at = record.addedAt ?? record.createdAt;

    if (!latest || at.getTime() > latest.getTime()) {
      return at;
    }

    return latest;
  }, null);
}

export function buildLeadImportDuplicateCustomerSnapshot(
  customer: LeadImportDuplicateCustomerRecord,
): LeadImportDuplicateCustomerSnapshot {
  const latestCall = getLeadImportLatestCallSignal(customer.callRecords);
  const latestWechatAt = getLatestWechatAt(customer);
  const executionClass = deriveLeadImportDuplicateCustomerExecutionClass(customer);
  const eligibility = getLeadImportDuplicateReplacementEligibility(customer);

  return {
    customerId: customer.id,
    name: customer.name,
    phone: customer.phone,
    ownerLabel: getOwnerLabel(customer),
    statusLabel: getCustomerStatusLabel(customer.status),
    levelLabel: getCustomerLevelLabel(customer.level),
    executionClass,
    executionClassLabel: getCustomerExecutionClassLongLabel(executionClass),
    ownershipLabel: getOwnershipLabel(customer),
    hasSuccessfulWechatSignal: hasLeadImportSuccessfulWechatSignal(customer),
    callRecordCount: customer._count.callRecords,
    wechatRecordCount: customer._count.wechatRecords,
    latestCallResultLabel: getCallResultLabel(latestCall),
    latestCallAt: latestCall?.callTime.toISOString() ?? null,
    latestWechatAt: latestWechatAt?.toISOString() ?? null,
    replacementEligible: eligibility.eligible,
    replacementReason: eligibility.reason,
  };
}

export function parseLeadImportDuplicateCustomerSnapshot(
  value: unknown,
): LeadImportDuplicateCustomerSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const customerId = typeof value.customerId === "string" ? value.customerId : "";
  const name = typeof value.name === "string" ? value.name : "";
  const phone = typeof value.phone === "string" ? value.phone : "";
  const executionClass =
    value.executionClass === "A" ||
    value.executionClass === "B" ||
    value.executionClass === "C" ||
    value.executionClass === "D" ||
    value.executionClass === "E"
      ? value.executionClass
      : null;

  if (!customerId || !phone || !executionClass) {
    return null;
  }

  return {
    customerId,
    name,
    phone,
    ownerLabel: typeof value.ownerLabel === "string" ? value.ownerLabel : "暂无负责人",
    statusLabel: typeof value.statusLabel === "string" ? value.statusLabel : "-",
    levelLabel: typeof value.levelLabel === "string" ? value.levelLabel : "-",
    executionClass,
    executionClassLabel:
      typeof value.executionClassLabel === "string"
        ? value.executionClassLabel
        : getCustomerExecutionClassLongLabel(executionClass),
    ownershipLabel:
      typeof value.ownershipLabel === "string" ? value.ownershipLabel : "未分类客户",
    hasSuccessfulWechatSignal: value.hasSuccessfulWechatSignal === true,
    callRecordCount:
      typeof value.callRecordCount === "number" ? value.callRecordCount : 0,
    wechatRecordCount:
      typeof value.wechatRecordCount === "number" ? value.wechatRecordCount : 0,
    latestCallResultLabel:
      typeof value.latestCallResultLabel === "string"
        ? value.latestCallResultLabel
        : null,
    latestCallAt: typeof value.latestCallAt === "string" ? value.latestCallAt : null,
    latestWechatAt:
      typeof value.latestWechatAt === "string" ? value.latestWechatAt : null,
    replacementEligible: value.replacementEligible === true,
    replacementReason:
      typeof value.replacementReason === "string"
        ? value.replacementReason
        : "缺少实时判定结果，请刷新后重试。",
  };
}
