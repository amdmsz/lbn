import type { LeadStatus, RecycleDomain, RecycleTargetType } from "@prisma/client";
import { getParamValue } from "@/lib/action-notice";
import {
  canAccessCustomerModule,
  canAccessSalesOrderModule,
  canAccessLeadModule,
  canManageLiveSessions,
  canManageProducts,
  canManageSuppliers,
} from "@/lib/auth/access";
import {
  formatDateTime,
  getCustomerLevelLabel,
  getCustomerStatusLabel,
} from "@/lib/customers/metadata";
import { getCustomerOwnershipModeLabel } from "@/lib/customers/public-pool-metadata";
import {
  listVisibleCustomerRecycleTargetIds,
  parseCustomerRecycleSnapshot,
} from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import {
  buildCustomerPurgeGuard,
  buildCustomerRestoreGuard,
} from "@/lib/recycle-bin/customer-adapter";
import {
  buildLeadPurgeGuard,
  buildLeadRestoreGuard,
} from "@/lib/recycle-bin/lead-adapter";
import {
  buildLiveSessionPurgeGuard,
  buildLiveSessionRestoreGuard,
} from "@/lib/recycle-bin/live-session-adapter";
import {
  buildMasterDataPurgeGuard,
  buildMasterDataRestoreGuard,
} from "@/lib/recycle-bin/master-data-adapter";
import {
  buildTradeOrderPurgeGuard,
  buildTradeOrderRestoreGuard,
} from "@/lib/recycle-bin/trade-order-adapter";
import {
  countActiveRecycleEntries,
  listActiveRecycleEntries,
} from "@/lib/recycle-bin/repository";
import type {
  RecycleLifecycleActor,
  RecyclePurgeGuard,
  RecycleRestoreGuard,
} from "@/lib/recycle-bin/types";
import { getLeadStatusLabel } from "@/lib/leads/metadata";

export type RecycleBinTabValue =
  | "master-data"
  | "live-sessions"
  | "leads"
  | "trade-orders"
  | "customers";
export type RecycleBinDeletedRangeValue = "all" | "today" | "last_7d" | "last_30d";
export type RecycleBinFilterStateValue =
  | "all"
  | "restorable"
  | "restore_blocked"
  | "purge_blocked";
export type RecycleBinTargetFilterValue =
  | "all"
  | "product"
  | "product_sku"
  | "supplier"
  | "live_session"
  | "lead"
  | "trade_order"
  | "customer";

type RecycleBinListEntry = Awaited<
  ReturnType<typeof listActiveRecycleEntries>
>[number];

type RecycleBinTab = {
  value: RecycleBinTabValue;
  label: string;
  href: string;
  count: number;
};

type RecycleBinSummary = {
  totalCount: number;
  restorableCount: number;
  purgeBlockedCount: number;
};

export type RecycleBinFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type RecycleBinFilters = {
  deletedRange: RecycleBinDeletedRangeValue;
  deletedById: string;
  state: RecycleBinFilterStateValue;
  targetType: RecycleBinTargetFilterValue;
};

export type RecycleBinBlockerGroup = {
  title: string;
  description: string;
  items: Array<{
    name: string;
    description: string;
    suggestedAction?: string;
  }>;
};

export type RecycleBinListItem = {
  entryId: string;
  targetType: RecycleBinListEntry["targetType"];
  targetTypeLabel: string;
  name: string;
  secondaryLabel: string;
  statusLabel: string | null;
  ownerLabel: string | null;
  deleteReasonLabel: string;
  deleteReasonText: string | null;
  deletedAtLabel: string;
  deletedByLabel: string;
  blockerSummary: string;
  restoreSummary: string;
  purgeSummary: string;
  restoreBlockerGroups: RecycleBinBlockerGroup[];
  purgeBlockerGroups: RecycleBinBlockerGroup[];
  restoreRouteSnapshot: string;
  canRestore: boolean;
  canPurge: boolean;
  purgeRequiresAdmin: boolean;
  customerSummary?: {
    phone: string;
    levelLabel: string;
    ownershipLabel: string;
    lastEffectiveFollowUpAtLabel: string | null;
    approvedTradeOrderCount: number;
    linkedLeadCount: number;
  };
};

function getSnapshotObject(entry: RecycleBinListEntry) {
  if (
    !entry.blockerSnapshotJson ||
    typeof entry.blockerSnapshotJson !== "object" ||
    Array.isArray(entry.blockerSnapshotJson)
  ) {
    return null;
  }

  return entry.blockerSnapshotJson as Record<string, unknown>;
}

function getSnapshotString(entry: RecycleBinListEntry, key: string) {
  const snapshot = getSnapshotObject(entry);
  const value = snapshot?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type RecycleBinPageData = {
  activeTab: RecycleBinTabValue;
  tabs: RecycleBinTab[];
  summary: RecycleBinSummary;
  items: RecycleBinListItem[];
  filters: RecycleBinFilters;
  deletedByOptions: RecycleBinFilterOption[];
  targetTypeOptions: RecycleBinFilterOption[];
  hasActiveFilters: boolean;
  resetHref: string;
};

const leadStatusSnapshotValues = new Set([
  "NEW",
  "ASSIGNED",
  "FIRST_CALL_PENDING",
  "FOLLOWING",
  "WECHAT_ADDED",
  "LIVE_INVITED",
  "LIVE_WATCHED",
  "ORDERED",
  "CONVERTED",
  "CLOSED_LOST",
  "INVALID",
]);

function getResolvedTargetTypeLabel(targetType: RecycleBinListEntry["targetType"]) {
  if (targetType === "TRADE_ORDER") {
    return "成交主单";
  }

  if (targetType === "CUSTOMER") {
    return "客户";
  }

  return getTargetTypeLabel(targetType);
}

function getTargetTypeLabel(targetType: RecycleBinListEntry["targetType"]) {
  switch (targetType) {
    case "PRODUCT":
      return "商品";
    case "PRODUCT_SKU":
      return "SKU";
    case "SUPPLIER":
      return "供应商";
    case "LIVE_SESSION":
      return "直播场次";
    case "LEAD":
      return "线索";
    case "TRADE_ORDER":
      return "成交主单";
    case "CUSTOMER":
      return "客户";
    default:
      return "对象";
  }
}

function getDeleteReasonLabel(reasonCode: RecycleBinListEntry["deleteReasonCode"]) {
  switch (reasonCode) {
    case "MISTAKEN_CREATION":
      return "误建";
    case "TEST_DATA":
      return "测试数据";
    case "DUPLICATE":
      return "重复创建";
    case "NO_LONGER_NEEDED":
      return "不再需要";
    case "OTHER":
    default:
      return "其他";
  }
}

function getDeletedByLabel(entry: RecycleBinListEntry) {
  if (entry.deletedBy.name?.trim()) {
    return entry.deletedBy.name.trim();
  }

  return `@${entry.deletedBy.username}`;
}

function buildRecycleBinHref(tab: RecycleBinTabValue, filters: RecycleBinFilters) {
  const params = new URLSearchParams();
  params.set("tab", tab);

  if (filters.deletedRange !== "all") {
    params.set("deletedRange", filters.deletedRange);
  }

  if (filters.deletedById) {
    params.set("deletedById", filters.deletedById);
  }

  if (filters.state !== "all") {
    params.set("state", filters.state);
  }

  const targetTypeValue =
    tab === "master-data"
      ? filters.targetType === "product" ||
        filters.targetType === "product_sku" ||
        filters.targetType === "supplier"
        ? filters.targetType
        : "all"
      : tab === "live-sessions"
        ? filters.targetType === "live_session"
          ? filters.targetType
          : "all"
        : tab === "leads"
          ? filters.targetType === "lead"
            ? filters.targetType
            : "all"
          : tab === "trade-orders"
            ? filters.targetType === "trade_order"
              ? filters.targetType
              : "all"
            : filters.targetType === "customer"
              ? filters.targetType
              : "all";

  if (targetTypeValue !== "all") {
    params.set("targetType", targetTypeValue);
  }

  return `/recycle-bin?${params.toString()}`;
}

function buildTabs(input: {
  canAccessMasterData: boolean;
  canAccessLiveSessions: boolean;
  canAccessLeads: boolean;
  canAccessTradeOrders: boolean;
  canAccessCustomers: boolean;
  masterDataCount: number;
  liveSessionCount: number;
  leadCount: number;
  tradeOrderCount: number;
  customerCount: number;
  filters: RecycleBinFilters;
}) {
  const tabs: RecycleBinTab[] = [];

  if (input.canAccessMasterData) {
    tabs.push({
      value: "master-data",
      label: "商品主数据",
      href: buildRecycleBinHref("master-data", input.filters),
      count: input.masterDataCount,
    });
  }

  if (input.canAccessLiveSessions) {
    tabs.push({
      value: "live-sessions",
      label: "直播场次",
      href: buildRecycleBinHref("live-sessions", input.filters),
      count: input.liveSessionCount,
    });
  }

  if (input.canAccessLeads) {
    tabs.push({
      value: "leads",
      label: "线索",
      href: buildRecycleBinHref("leads", input.filters),
      count: input.leadCount,
    });
  }

  if (input.canAccessTradeOrders) {
    tabs.push({
      value: "trade-orders",
      label: "交易订单",
      href: buildRecycleBinHref("trade-orders", input.filters),
      count: input.tradeOrderCount,
    });
  }

  if (input.canAccessCustomers) {
    tabs.push({
      value: "customers",
      label: "客户",
      href: buildRecycleBinHref("customers", input.filters),
      count: input.customerCount,
    });
  }

  return tabs;
}

function getDomainFromTab(tab: RecycleBinTabValue): RecycleDomain {
  if (tab === "master-data") {
    return "PRODUCT_MASTER_DATA";
  }

  if (tab === "live-sessions") {
    return "LIVE_SESSION";
  }

  if (tab === "leads") {
    return "LEAD";
  }

  if (tab === "trade-orders") {
    return "TRADE_ORDER";
  }

  return "CUSTOMER";
}

function normalizeDeletedRange(value: string): RecycleBinDeletedRangeValue {
  return value === "today" || value === "last_7d" || value === "last_30d" ? value : "all";
}

function normalizeFilterState(value: string): RecycleBinFilterStateValue {
  return value === "restorable" ||
    value === "restore_blocked" ||
    value === "purge_blocked"
    ? value
    : "all";
}

function normalizeTargetType(
  value: string,
  activeTab: RecycleBinTabValue,
): RecycleBinTargetFilterValue {
  if (activeTab === "live-sessions") {
    return value === "live_session" ? "live_session" : "all";
  }

  if (activeTab === "leads") {
    return value === "lead" ? "lead" : "all";
  }

  if (activeTab === "trade-orders") {
    return value === "trade_order" ? "trade_order" : "all";
  }

  if (activeTab === "customers") {
    return value === "customer" ? "customer" : "all";
  }

  return value === "product" || value === "product_sku" || value === "supplier"
    ? value
    : "all";
}

function parseFilters(
  activeTab: RecycleBinTabValue,
  searchParams?: Record<string, string | string[] | undefined>,
): RecycleBinFilters {
  return {
    deletedRange: normalizeDeletedRange(getParamValue(searchParams?.deletedRange)),
    deletedById: getParamValue(searchParams?.deletedById),
    state: normalizeFilterState(getParamValue(searchParams?.state)),
    targetType: normalizeTargetType(getParamValue(searchParams?.targetType), activeTab),
  };
}

function matchesDeletedRange(
  deletedAt: Date,
  deletedRange: RecycleBinDeletedRangeValue,
) {
  if (deletedRange === "all") {
    return true;
  }

  const now = new Date();

  if (deletedRange === "today") {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return deletedAt >= startOfToday;
  }

  const days = deletedRange === "last_7d" ? 7 : 30;
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() - days);

  return deletedAt >= threshold;
}

function getTargetFilterValue(targetType: RecycleTargetType): RecycleBinTargetFilterValue {
  switch (targetType) {
    case "PRODUCT":
      return "product";
    case "PRODUCT_SKU":
      return "product_sku";
    case "SUPPLIER":
      return "supplier";
    case "LIVE_SESSION":
      return "live_session";
    case "LEAD":
      return "lead";
    case "TRADE_ORDER":
      return "trade_order";
    case "CUSTOMER":
      return "customer";
    default:
      return "all";
  }
}

function matchesTargetType(
  targetType: RecycleTargetType,
  filterValue: RecycleBinTargetFilterValue,
) {
  return filterValue === "all" || getTargetFilterValue(targetType) === filterValue;
}

function matchesStateFilter(
  item: RecycleBinListItem,
  state: RecycleBinFilterStateValue,
) {
  switch (state) {
    case "restorable":
      return item.canRestore;
    case "restore_blocked":
      return !item.canRestore;
    case "purge_blocked":
      return item.purgeRequiresAdmin || !item.canPurge;
    case "all":
    default:
      return true;
  }
}

async function buildRestoreGuard(
  entry: RecycleBinListEntry,
): Promise<RecycleRestoreGuard> {
  const input = {
    targetType: entry.targetType,
    targetId: entry.targetId,
    domain: entry.domain,
    restoreRouteSnapshot: entry.restoreRouteSnapshot,
  };

  const masterDataGuard = await buildMasterDataRestoreGuard(prisma, input);

  if (masterDataGuard) {
    return masterDataGuard;
  }

  const liveSessionGuard = await buildLiveSessionRestoreGuard(prisma, input);

  if (liveSessionGuard) {
    return liveSessionGuard;
  }

  const tradeOrderGuard = await buildTradeOrderRestoreGuard(prisma, input);

  if (tradeOrderGuard) {
    return tradeOrderGuard;
  }

  const customerGuard = await buildCustomerRestoreGuard(prisma, input);

  if (customerGuard) {
    return customerGuard;
  }

  const leadGuard = await buildLeadRestoreGuard(prisma, input);

  if (leadGuard) {
    return leadGuard;
  }

  return {
    canRestore: false,
    blockerSummary: "当前对象类型暂不支持恢复。",
    blockers: [
      {
        name: "暂不支持",
        description: "当前对象类型暂不支持恢复。",
      },
    ],
    restoreRouteSnapshot: entry.restoreRouteSnapshot,
  };
}

async function buildPurgeGuard(
  entry: RecycleBinListEntry,
): Promise<RecyclePurgeGuard> {
  const input = {
    targetType: entry.targetType,
    targetId: entry.targetId,
    domain: entry.domain,
  };

  const masterDataGuard = await buildMasterDataPurgeGuard(prisma, input);

  if (masterDataGuard) {
    return masterDataGuard;
  }

  const liveSessionGuard = await buildLiveSessionPurgeGuard(prisma, input);

  if (liveSessionGuard) {
    return liveSessionGuard;
  }

  const tradeOrderGuard = await buildTradeOrderPurgeGuard(prisma, input);

  if (tradeOrderGuard) {
    return tradeOrderGuard;
  }

  const customerGuard = await buildCustomerPurgeGuard(prisma, input);

  if (customerGuard) {
    return customerGuard;
  }

  const leadGuard = await buildLeadPurgeGuard(prisma, input);

  if (leadGuard) {
    return leadGuard;
  }

  return {
    canPurge: false,
    blockerSummary: "当前对象类型暂不支持永久删除。",
    blockers: [
      {
        name: "暂不支持",
        description: "当前对象类型暂不支持永久删除。",
      },
    ],
  };
}

function buildBlockerSummary(input: {
  restoreGuard: RecycleRestoreGuard;
  purgeGuard: RecyclePurgeGuard;
  canActorPurge: boolean;
}) {
  if (!input.restoreGuard.canRestore && !input.purgeGuard.canPurge) {
    return `恢复受阻：${input.restoreGuard.blockerSummary}；永久删除受阻：${input.purgeGuard.blockerSummary}`;
  }

  if (!input.restoreGuard.canRestore) {
    return input.canActorPurge
      ? `恢复受阻：${input.restoreGuard.blockerSummary}；当前允许永久删除`
      : `恢复受阻：${input.restoreGuard.blockerSummary}；永久删除仅管理员可执行`;
  }

  if (!input.purgeGuard.canPurge) {
    return `可恢复；永久删除受阻：${input.purgeGuard.blockerSummary}`;
  }

  return input.canActorPurge ? "可恢复，且可永久删除" : "可恢复；永久删除仅管理员可执行";
}

function buildDeletedByOptions(entries: RecycleBinListEntry[]): RecycleBinFilterOption[] {
  const counts = new Map<string, RecycleBinFilterOption>();

  for (const entry of entries) {
    const existing = counts.get(entry.deletedById);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(entry.deletedById, {
      value: entry.deletedById,
      label: getDeletedByLabel(entry),
      count: 1,
    });
  }

  return Array.from(counts.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "zh-CN"),
  );
}

function buildTargetTypeOptions(
  activeTab: RecycleBinTabValue,
  entries: RecycleBinListEntry[],
): RecycleBinFilterOption[] {
  if (activeTab === "live-sessions") {
    return [
      {
        value: "live_session",
        label: "直播场次",
        count: entries.length,
      },
    ];
  }

  if (activeTab === "leads") {
    return [
      {
        value: "lead",
        label: "线索",
        count: entries.length,
      },
    ];
  }

  if (activeTab === "trade-orders") {
    return [
      {
        value: "trade_order",
        label: "交易订单",
        count: entries.length,
      },
    ];
  }

  if (activeTab === "customers") {
    return [
      {
        value: "customer",
        label: "客户",
        count: entries.length,
      },
    ];
  }

  const counts = new Map<RecycleBinTargetFilterValue, number>([
    ["product", 0],
    ["product_sku", 0],
    ["supplier", 0],
  ]);

  for (const entry of entries) {
    const targetFilterValue = getTargetFilterValue(entry.targetType);

    if (targetFilterValue !== "all" && counts.has(targetFilterValue)) {
      counts.set(targetFilterValue, (counts.get(targetFilterValue) ?? 0) + 1);
    }
  }

  return [
    {
      value: "product",
      label: "商品",
      count: counts.get("product") ?? 0,
    },
    {
      value: "product_sku",
      label: "SKU",
      count: counts.get("product_sku") ?? 0,
    },
    {
      value: "supplier",
      label: "供应商",
      count: counts.get("supplier") ?? 0,
    },
  ];
}

function appendBlockerGroup(
  groups: Map<string, RecycleBinBlockerGroup>,
  title: string,
  description: string,
  blocker: { name: string; description: string; suggestedAction?: string },
) {
  const existing = groups.get(title);

  if (existing) {
    existing.items.push(blocker);
    return;
  }

  groups.set(title, {
    title,
    description,
    items: [blocker],
  });
}

function buildLeadBlockerGroups(
  blockers: Array<{ name: string; description: string }>,
) {
  const groups = new Map<string, RecycleBinBlockerGroup>();

  for (const blocker of blockers) {
    if (blocker.name === "对象缺失") {
      appendBlockerGroup(
        groups,
        "对象状态",
        "先确认原始线索对象仍存在，当前条目才有继续治理的意义。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "已转为客户" || blocker.name === "归并审计链") {
      appendBlockerGroup(
        groups,
        "转化与归并",
        "这条线索已经进入客户或归并真相链，不能再按轻线索对象恢复或清理。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "成交订单" || blocker.name === "礼品记录") {
      appendBlockerGroup(
        groups,
        "成交与礼品",
        "这条线索已经进入订单或礼品链，必须保留业务可追溯性。",
        blocker,
      );
      continue;
    }

    if (
      blocker.name === "删除前负责人" ||
      blocker.name === "已分配记录" ||
      blocker.name === "跟进任务" ||
      blocker.name === "通话记录" ||
      blocker.name === "微信记录" ||
      blocker.name === "直播邀请" ||
      blocker.name === "最近跟进时间" ||
      blocker.name === "下次跟进时间"
    ) {
      appendBlockerGroup(
        groups,
        "销售执行痕迹",
        "这条线索已经产生分配或跟进痕迹，可回收治理，但不适合最终清理。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "导入回滚审计" || blocker.name === "标签记录") {
      appendBlockerGroup(
        groups,
        "导入回滚与审计",
        "这条线索已经进入导入回滚、标签或其他审计链，必须保留治理上下文。",
        blocker,
      );
      continue;
    }

    appendBlockerGroup(
      groups,
      "其他阻断",
      "当前还有未归入主分组的阻断项，需要一并检查。",
      blocker,
    );
  }

  return Array.from(groups.values());
}

function buildLiveSessionBlockerGroups(
  blockers: Array<{ name: string; description: string }>,
) {
  const groups = new Map<string, RecycleBinBlockerGroup>();

  for (const blocker of blockers) {
    if (blocker.name === "邀请记录") {
      appendBlockerGroup(
        groups,
        "邀请记录",
        "该场次已经进入邀约链，不能再按误建对象处理。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "礼品记录") {
      appendBlockerGroup(
        groups,
        "礼品记录",
        "该场次已经产生礼品链记录，需要保留运营链条。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "观看或到场结果") {
      appendBlockerGroup(
        groups,
        "运营结果",
        "该场次已经产生到场、观看或达标结果，不能直接恢复或清理。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "场次缺失" || blocker.name === "对象缺失") {
      appendBlockerGroup(
        groups,
        "对象状态",
        "先确认原始场次对象仍存在，当前条目才有继续治理的意义。",
        blocker,
      );
      continue;
    }

    appendBlockerGroup(
      groups,
      "其他阻断",
      "当前还有未归入主分组的阻断项，需要一并检查。",
      blocker,
    );
  }

  return Array.from(groups.values());
}

function buildMasterDataBlockerGroups(
  blockers: Array<{ name: string; description: string }>,
  mode: "restore" | "purge",
) {
  const groups = new Map<string, RecycleBinBlockerGroup>();

  for (const blocker of blockers) {
    if (
      blocker.name === "供应商缺失" ||
      blocker.name === "供应商仍在回收站" ||
      blocker.name === "商品缺失" ||
      blocker.name === "商品仍在回收站"
    ) {
      appendBlockerGroup(
        groups,
        "父级依赖",
        "需要先恢复或补齐上游主数据，当前对象才能重新回到业务页。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "SKU 挂载" || blocker.name === "商品挂载") {
      appendBlockerGroup(
        groups,
        "主数据挂载",
        "当前对象仍被其他主数据挂载，不能继续恢复或清理。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "销售明细引用" || blocker.name === "销售子单引用") {
      appendBlockerGroup(
        groups,
        "交易引用",
        "当前对象已经进入销售执行链，需要保留交易可追溯性。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "履约任务引用" || blocker.name === "导出批次引用") {
      appendBlockerGroup(
        groups,
        "履约引用",
        "当前对象已经进入履约或导出执行链，不能忽略这些引用。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "对象缺失") {
      appendBlockerGroup(
        groups,
        "对象状态",
        mode === "restore"
          ? "先确认原始对象仍存在，当前条目才有恢复意义。"
          : "先确认原始对象仍存在，当前条目才有最终清理意义。",
        blocker,
      );
      continue;
    }

    appendBlockerGroup(
      groups,
      "其他阻断",
      "当前还有未归入主分组的阻断项，需要一并检查。",
      blocker,
    );
  }

  return Array.from(groups.values());
}

function buildTradeOrderBlockerGroups(
  blockers: Array<{ name: string; description: string }>,
) {
  const groups = new Map<string, RecycleBinBlockerGroup>();

  for (const blocker of blockers) {
    if (
      blocker.name === "对象缺失" ||
      blocker.name === "订单已离开草稿态" ||
      blocker.name === "已取消订单" ||
      blocker.name === "非草稿订单"
    ) {
      appendBlockerGroup(
        groups,
        "订单状态",
        "先确认当前成交主单是否仍处于纯草稿误建语义；非草稿或已取消订单不能再按误建删除处理。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "已生成供应商子单") {
      appendBlockerGroup(
        groups,
        "审核与拆单",
        "只要已经进入审核或拆单链，当前成交主单就不再属于可删除的误建草稿。",
        blocker,
      );
      continue;
    }

    if (
      blocker.name === "已存在支付计划" ||
      blocker.name === "已存在支付记录" ||
      blocker.name === "已存在催收任务"
    ) {
      appendBlockerGroup(
        groups,
        "支付收款链",
        "当前成交主单已经进入支付或收款链，需要保留交易真相与追踪能力。",
        blocker,
      );
      continue;
    }

    if (
      blocker.name === "已存在发货任务" ||
      blocker.name === "已存在物流跟进" ||
      blocker.name === "已存在 COD 回款记录"
    ) {
      appendBlockerGroup(
        groups,
        "履约执行链",
        "当前成交主单已经进入履约执行链，不能再当作误建草稿处理。",
        blocker,
      );
      continue;
    }

    if (blocker.name === "已存在导出批次行") {
      appendBlockerGroup(
        groups,
        "导出与审计链",
        "当前成交主单已经进入导出审计链，需要保留执行与审计上下文。",
        blocker,
      );
      continue;
    }

    appendBlockerGroup(
      groups,
      "其他阻断",
      "当前还有未归入主分组的阻断项，需要一并检查。",
      blocker,
    );
  }

  return Array.from(groups.values());
}

function buildCustomerBlockerGroups(
  blockers: Array<{
    name: string;
    description: string;
    group?: string;
    suggestedAction?: string;
  }>,
) {
  const groupMeta = new Map<
    string,
    {
      title: string;
      description: string;
    }
  >([
    [
      "object_state",
      {
        title: "对象状态",
        description: "先确认原始客户记录是否仍存在，再决定是否继续恢复或清理。",
      },
    ],
    [
      "customer_lifecycle",
      {
        title: "客户生命周期",
        description: "Customer recycle 只承接误建轻客户，不替代 DORMANT / LOST / BLACKLISTED。",
      },
    ],
    [
      "ownership_lifecycle",
      {
        title: "公海与归属链",
        description: "当前客户已进入 ownership lifecycle，应继续走公海 / claim / 归属治理。",
      },
    ],
    [
      "sales_engagement",
      {
        title: "销售跟进痕迹",
        description: "一旦已有有效跟进、通话、微信或邀约记录，就不再属于误建轻客户。",
      },
    ],
    [
      "transaction_chain",
      {
        title: "成交与资金链",
        description: "客户一旦进入订单、支付、催收链，就必须保留交易真相与审计上下文。",
      },
    ],
    [
      "fulfillment_chain",
      {
        title: "履约与物流链",
        description: "客户一旦进入履约、物流或 COD 链，就不再适合按误建客户处理。",
      },
    ],
    [
      "import_audit",
      {
        title: "归并与导入审计",
        description: "涉及 merge / import / 标签上下文时，应优先保留审计链，不直接 purge。",
      },
    ],
  ]);
  const groups = new Map<string, RecycleBinBlockerGroup>();

  for (const blocker of blockers) {
    const meta = groupMeta.get(blocker.group ?? "") ?? {
      title: "其他阻断",
      description: "保留服务端返回的原始阻断项，不在前端重写额外规则。",
    };

    appendBlockerGroup(groups, meta.title, meta.description, blocker);
  }

  return Array.from(groups.values());
}

function buildBlockerGroups(input: {
  targetType: RecycleBinListEntry["targetType"];
  blockers: Array<{
    name: string;
    description: string;
    group?: string;
    suggestedAction?: string;
  }>;
  mode: "restore" | "purge";
}): RecycleBinBlockerGroup[] {
  if (input.blockers.length === 0) {
    return [];
  }

  if (input.targetType === "LEAD") {
    return buildLeadBlockerGroups(input.blockers);
  }

  if (input.targetType === "LIVE_SESSION") {
    return buildLiveSessionBlockerGroups(input.blockers);
  }

  if (input.targetType === "TRADE_ORDER") {
    return buildTradeOrderBlockerGroups(input.blockers);
  }

  if (input.targetType === "CUSTOMER") {
    return buildCustomerBlockerGroups(input.blockers);
  }

  return buildMasterDataBlockerGroups(input.blockers, input.mode);
}

function getLeadStatusSnapshotLabel(statusSnapshot: string | null) {
  if (!statusSnapshot || !leadStatusSnapshotValues.has(statusSnapshot)) {
    return null;
  }

  return getLeadStatusLabel(statusSnapshot as LeadStatus);
}

function getTradeOrderStatusSnapshotLabel(statusSnapshot: string | null) {
  switch (statusSnapshot) {
    case "DRAFT":
      return "草稿";
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已驳回";
    case "CANCELED":
      return "已取消";
    default:
      return null;
  }
}

function getCustomerListSummary(entry: RecycleBinListEntry) {
  const snapshot = parseCustomerRecycleSnapshot(entry.blockerSnapshotJson);

  if (!snapshot) {
    return null;
  }

  const statusLabel = snapshot.status
    ? getCustomerStatusLabel(snapshot.status as never)
    : "未知状态";
  const levelLabel = snapshot.level
    ? getCustomerLevelLabel(snapshot.level as never)
    : "未知等级";
  const ownershipLabel = snapshot.ownershipMode
    ? getCustomerOwnershipModeLabel(snapshot.ownershipMode as never)
    : "未知归属";

  return {
    phone: snapshot.phone ?? entry.secondarySnapshot ?? "--",
    ownerLabel: snapshot.ownerLabel ?? "--",
    statusLabel: `${statusLabel} / ${levelLabel} / ${ownershipLabel}`,
    customerSummary: {
      phone: snapshot.phone ?? entry.secondarySnapshot ?? "--",
      levelLabel,
      ownershipLabel,
      lastEffectiveFollowUpAtLabel: snapshot.lastEffectiveFollowUpAt
        ? formatDateTime(new Date(snapshot.lastEffectiveFollowUpAt))
        : null,
      approvedTradeOrderCount: snapshot.approvedTradeOrderCount,
      linkedLeadCount: snapshot.linkedLeadCount,
    },
  };
}

async function loadLeadRuntimeMetadata(entries: RecycleBinListEntry[]) {
  const leadIds = entries
    .filter((entry) => entry.targetType === "LEAD")
    .map((entry) => entry.targetId);

  if (leadIds.length === 0) {
    return new Map<
      string,
      {
        ownerLabel: string;
      }
    >();
  }

  const rows = await prisma.lead.findMany({
    where: {
      id: {
        in: leadIds,
      },
    },
    select: {
      id: true,
      owner: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  });

  return new Map(
    rows.map((row) => [
      row.id,
      {
        ownerLabel: row.owner
          ? `${row.owner.name} (@${row.owner.username})`
          : "未分配",
      },
    ]),
  );
}

async function buildListItems(
  entries: RecycleBinListEntry[],
  viewer: RecycleLifecycleActor,
) {
  const canActorPurge = viewer.role === "ADMIN";
  const leadRuntimeMetadata = await loadLeadRuntimeMetadata(entries);

  return Promise.all(
    entries.map(async (entry) => {
      const restoreGuard = await buildRestoreGuard(entry);
      const purgeGuard = await buildPurgeGuard(entry);
      const leadMetadata =
        entry.targetType === "LEAD" ? leadRuntimeMetadata.get(entry.targetId) : null;
      const customerSummary =
        entry.targetType === "CUSTOMER" ? getCustomerListSummary(entry) : null;
      const ownerLabel =
        entry.targetType === "LEAD"
          ? leadMetadata?.ownerLabel ?? "未分配"
          : entry.targetType === "TRADE_ORDER"
            ? getSnapshotString(entry, "ownerName") ?? "未分配"
            : entry.targetType === "CUSTOMER"
              ? customerSummary?.ownerLabel ?? "--"
              : null;

      return {
        entryId: entry.id,
        targetType: entry.targetType,
        targetTypeLabel: getResolvedTargetTypeLabel(entry.targetType),
        name: entry.titleSnapshot,
        secondaryLabel:
          entry.targetType === "CUSTOMER"
            ? customerSummary?.phone ?? entry.secondarySnapshot ?? "--"
            : entry.secondarySnapshot || "--",
        statusLabel:
          entry.targetType === "LEAD"
            ? getLeadStatusSnapshotLabel(entry.originalStatusSnapshot)
            : entry.targetType === "TRADE_ORDER"
              ? getTradeOrderStatusSnapshotLabel(entry.originalStatusSnapshot)
              : entry.targetType === "CUSTOMER"
                ? customerSummary?.statusLabel ?? null
                : null,
        ownerLabel,
        customerSummary: customerSummary?.customerSummary,
        deleteReasonLabel: getDeleteReasonLabel(entry.deleteReasonCode),
        deleteReasonText: entry.deleteReasonText,
        deletedAtLabel: formatDateTime(entry.deletedAt),
        deletedByLabel: getDeletedByLabel(entry),
        blockerSummary: buildBlockerSummary({
          restoreGuard,
          purgeGuard,
          canActorPurge,
        }),
        restoreSummary: restoreGuard.blockerSummary,
        purgeSummary: purgeGuard.blockerSummary,
        restoreBlockerGroups: buildBlockerGroups({
          targetType: entry.targetType,
          blockers: restoreGuard.blockers,
          mode: "restore",
        }),
        purgeBlockerGroups: buildBlockerGroups({
          targetType: entry.targetType,
          blockers: purgeGuard.blockers,
          mode: "purge",
        }),
        restoreRouteSnapshot: restoreGuard.restoreRouteSnapshot,
        canRestore: restoreGuard.canRestore,
        canPurge: canActorPurge && purgeGuard.canPurge,
        purgeRequiresAdmin: !canActorPurge,
      } satisfies RecycleBinListItem;
    }),
  );
}

export async function getRecycleBinPageData(
  viewer: RecycleLifecycleActor,
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<RecycleBinPageData> {
  const canAccessMasterData =
    canManageProducts(viewer.role, viewer.permissionCodes) ||
    canManageSuppliers(viewer.role, viewer.permissionCodes);
  const canAccessLiveSessions = canManageLiveSessions(
    viewer.role,
    viewer.permissionCodes,
  );
  const canAccessLeads = canAccessLeadModule(viewer.role);
  const canAccessTradeOrders = canAccessSalesOrderModule(viewer.role);
  const canAccessCustomers = canAccessCustomerModule(viewer.role);

  const [
    masterDataCount,
    liveSessionCount,
    leadCount,
    tradeOrderCount,
    customerEntries,
  ] = await Promise.all([
    canAccessMasterData
      ? countActiveRecycleEntries(prisma, { domain: "PRODUCT_MASTER_DATA" })
      : Promise.resolve(0),
    canAccessLiveSessions
      ? countActiveRecycleEntries(prisma, { domain: "LIVE_SESSION" })
      : Promise.resolve(0),
    canAccessLeads
      ? countActiveRecycleEntries(prisma, { domain: "LEAD" })
      : Promise.resolve(0),
    canAccessTradeOrders
      ? countActiveRecycleEntries(prisma, { domain: "TRADE_ORDER" })
      : Promise.resolve(0),
    canAccessCustomers
      ? listActiveRecycleEntries(prisma, { domain: "CUSTOMER" })
      : Promise.resolve([]),
  ]);
  const visibleCustomerEntryIds = canAccessCustomers
    ? await listVisibleCustomerRecycleTargetIds(prisma, viewer, customerEntries)
    : new Set<string>();
  const customerCount = visibleCustomerEntryIds.size;

  const requestedTab = getParamValue(searchParams?.tab);
  const defaultTab: RecycleBinTabValue = canAccessMasterData
    ? "master-data"
    : canAccessLiveSessions
      ? "live-sessions"
      : canAccessLeads
        ? "leads"
        : canAccessTradeOrders
          ? "trade-orders"
          : "customers";
  const activeTab: RecycleBinTabValue =
    requestedTab === "master-data" && canAccessMasterData
      ? "master-data"
      : requestedTab === "live-sessions" && canAccessLiveSessions
        ? "live-sessions"
        : requestedTab === "leads" && canAccessLeads
          ? "leads"
          : requestedTab === "trade-orders" && canAccessTradeOrders
            ? "trade-orders"
            : requestedTab === "customers" && canAccessCustomers
              ? "customers"
              : defaultTab;

  const filters = parseFilters(activeTab, searchParams);
  const tabs = buildTabs({
    canAccessMasterData,
    canAccessLiveSessions,
    canAccessLeads,
    canAccessTradeOrders,
    canAccessCustomers,
    masterDataCount,
    liveSessionCount,
    leadCount,
    tradeOrderCount,
    customerCount,
    filters,
  });

  const activeEntries =
    activeTab === "customers"
      ? customerEntries.filter((entry) => visibleCustomerEntryIds.has(entry.targetId))
      : await listActiveRecycleEntries(prisma, {
          domain: getDomainFromTab(activeTab),
        });

  const deletedByOptions = buildDeletedByOptions(activeEntries);
  const targetTypeOptions = buildTargetTypeOptions(activeTab, activeEntries);

  const preliminarilyFilteredEntries = activeEntries.filter((entry) => {
    if (filters.deletedById && entry.deletedById !== filters.deletedById) {
      return false;
    }

    if (!matchesDeletedRange(entry.deletedAt, filters.deletedRange)) {
      return false;
    }

    if (!matchesTargetType(entry.targetType, filters.targetType)) {
      return false;
    }

    return true;
  });

  const allVisibleItems = await buildListItems(preliminarilyFilteredEntries, viewer);
  const items = allVisibleItems.filter((item) => matchesStateFilter(item, filters.state));

  return {
    activeTab,
    tabs,
    summary: {
      totalCount: items.length,
      restorableCount: items.filter((item) => item.canRestore).length,
      purgeBlockedCount: items.filter(
        (item) => item.purgeRequiresAdmin || !item.canPurge,
      ).length,
    },
    items,
    filters,
    deletedByOptions,
    targetTypeOptions,
    hasActiveFilters:
      filters.deletedRange !== "all" ||
      filters.deletedById.length > 0 ||
      filters.state !== "all" ||
      filters.targetType !== "all",
    resetHref: `/recycle-bin?tab=${activeTab}`,
  };
}
