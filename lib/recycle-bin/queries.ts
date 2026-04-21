import {
  RecycleEntryStatus,
  type LeadStatus,
  type RecycleDomain,
  type RecycleTargetType,
} from "@prisma/client";
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
import { buildCustomerRecycleBlockerGroups } from "@/lib/customers/recycle-blocker-explanation";
import { prisma } from "@/lib/db/prisma";
import {
  buildCustomerPurgeGuard,
  buildCustomerRestoreGuard,
} from "@/lib/recycle-bin/customer-adapter";
import {
  RECYCLE_ARCHIVE_SNAPSHOT_VERSION,
  parseCustomerRecycleArchiveSnapshot,
  parseProductRecycleArchiveSnapshot,
  parseProductSkuRecycleArchiveSnapshot,
  parseRecycleArchivePayload,
  parseTradeOrderRecycleArchiveSnapshot,
  type CustomerRecycleArchiveSnapshot,
  type ProductRecycleArchiveSnapshot,
  type ProductSkuRecycleArchiveSnapshot,
  type TradeOrderRecycleArchiveSnapshot,
} from "@/lib/recycle-bin/archive-payload";
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
  countRecycleEntries,
  listRecycleEntries,
} from "@/lib/recycle-bin/repository";
import { previewRecycleBinFinalize } from "@/lib/recycle-bin/lifecycle";
import { buildTradeOrderRecycleBlockerGroups } from "@/lib/trade-orders/recycle-blocker-explanation";
import type {
  RecycleArchivePayload,
  RecycleFinalizePreview,
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
export type RecycleBinResolvedRangeValue = RecycleBinDeletedRangeValue;
export type RecycleBinEntryStatusValue =
  | "active"
  | "archived"
  | "purged"
  | "restored";
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
export type RecycleBinHistoryFinalActionFilterValue =
  | "all"
  | "archive"
  | "purge"
  | "restore";
export type RecycleBinHistoryArchiveSourceFilterValue =
  | "all"
  | "snapshot_v2"
  | "legacy_fallback"
  | "unavailable";

type RecycleBinListEntry = Awaited<
  ReturnType<typeof listRecycleEntries>
>[number];

type RecycleBinTab = {
  value: RecycleBinTabValue;
  label: string;
  href: string;
  count: number;
};

type RecycleBinStatusTab = {
  value: RecycleBinEntryStatusValue;
  label: string;
  href: string;
  count: number;
};

type RecycleBinSummary = {
  totalCount: number;
  restorableCount: number;
  purgeBlockedCount: number;
  resolvedCount: number;
  resolvedActorCount: number;
  archivePayloadCount: number;
};

export type RecycleBinFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type RecycleBinFilters = {
  entryStatus: RecycleBinEntryStatusValue;
  deletedRange: RecycleBinDeletedRangeValue;
  deletedById: string;
  state: RecycleBinFilterStateValue;
  targetType: RecycleBinTargetFilterValue;
  resolvedRange: RecycleBinResolvedRangeValue;
  resolvedById: string;
  finalAction: RecycleBinHistoryFinalActionFilterValue;
  historyArchiveSource: RecycleBinHistoryArchiveSourceFilterValue;
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

export type RecycleBinHistoryArchiveSource =
  | "SNAPSHOT_V2"
  | "LEGACY_FALLBACK"
  | "UNAVAILABLE";

export type RecycleBinHistoryArchiveContract = {
  source: RecycleBinHistoryArchiveSource;
  snapshotVersion: number | null;
  archivePayload: RecycleArchivePayload | null;
  customerSnapshot: CustomerRecycleArchiveSnapshot | null;
  tradeOrderSnapshot: TradeOrderRecycleArchiveSnapshot | null;
  productSnapshot: ProductRecycleArchiveSnapshot | null;
  productSkuSnapshot: ProductSkuRecycleArchiveSnapshot | null;
};

export type RecycleBinListItem = {
  entryId: string;
  entryStatus: RecycleEntryStatus;
  entryStatusLabel: string;
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
  resolvedAtLabel: string | null;
  resolvedByLabel: string | null;
  resolutionActionLabel: string | null;
  resolutionSummary: string | null;
  archivePayloadJsonText: string | null;
  historyArchive: RecycleBinHistoryArchiveContract | null;
  blockerSummary: string;
  restoreSummary: string;
  purgeSummary: string;
  restoreBlockerGroups: RecycleBinBlockerGroup[];
  purgeBlockerGroups: RecycleBinBlockerGroup[];
  restoreRouteSnapshot: string;
  canRestore: boolean;
  canPurge: boolean;
  purgeRequiresAdmin: boolean;
  finalActionPreview: RecycleFinalizePreview | null;
  finalizeSummary: string | null;
  finalActionLabel: string | null;
  remainingTimeLabel: string | null;
  finalizeBlockerGroups: RecycleBinBlockerGroup[];
  canFinalizeNow: boolean;
  isExpired: boolean;
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
  statusTabs: RecycleBinStatusTab[];
  summary: RecycleBinSummary;
  items: RecycleBinListItem[];
  filters: RecycleBinFilters;
  deletedByOptions: RecycleBinFilterOption[];
  resolvedByOptions: RecycleBinFilterOption[];
  targetTypeOptions: RecycleBinFilterOption[];
  finalActionOptions: RecycleBinFilterOption[];
  historyArchiveSourceOptions: RecycleBinFilterOption[];
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

function getResolvedByLabel(entry: RecycleBinListEntry) {
  if (!entry.resolvedBy) {
    return null;
  }

  if (entry.resolvedBy.name?.trim()) {
    return entry.resolvedBy.name.trim();
  }

  return `@${entry.resolvedBy.username}`;
}

function getEntryStatusLabel(status: RecycleEntryStatus) {
  switch (status) {
    case RecycleEntryStatus.ACTIVE:
      return "ACTIVE";
    case RecycleEntryStatus.ARCHIVED:
      return "ARCHIVED";
    case RecycleEntryStatus.PURGED:
      return "PURGED";
    case RecycleEntryStatus.RESTORED:
      return "RESTORED";
    default:
      return "UNKNOWN";
  }
}

function buildRecycleBinHref(tab: RecycleBinTabValue, filters: RecycleBinFilters) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("entryStatus", filters.entryStatus);

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

  if (filters.entryStatus !== "active") {
    if (filters.resolvedRange !== "all") {
      params.set("resolvedRange", filters.resolvedRange);
    }

    if (filters.resolvedById) {
      params.set("resolvedById", filters.resolvedById);
    }

    if (filters.finalAction !== "all") {
      params.set("finalAction", filters.finalAction);
    }

    if (filters.historyArchiveSource !== "all") {
      params.set("historyArchiveSource", filters.historyArchiveSource);
    }
  }

  return `/recycle-bin?${params.toString()}`;
}

function buildRecycleBinStatusHref(
  tab: RecycleBinTabValue,
  filters: RecycleBinFilters,
  entryStatus: RecycleBinEntryStatusValue,
) {
  return buildRecycleBinHref(tab, {
    ...filters,
    entryStatus,
    state: entryStatus === "active" ? filters.state : "all",
    resolvedRange: entryStatus === "active" ? "all" : filters.resolvedRange,
    resolvedById: entryStatus === "active" ? "" : filters.resolvedById,
    finalAction: entryStatus === "active" ? "all" : filters.finalAction,
    historyArchiveSource:
      entryStatus === "active" ? "all" : filters.historyArchiveSource,
  });
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

function buildStatusTabs(input: {
  activeTab: RecycleBinTabValue;
  filters: RecycleBinFilters;
  activeCount: number;
  archivedCount: number;
  purgedCount: number;
  restoredCount: number;
}) {
  return [
    {
      value: "active" as const,
      label: "ACTIVE",
      href: buildRecycleBinStatusHref(input.activeTab, input.filters, "active"),
      count: input.activeCount,
    },
    {
      value: "archived" as const,
      label: "ARCHIVED",
      href: buildRecycleBinStatusHref(input.activeTab, input.filters, "archived"),
      count: input.archivedCount,
    },
    {
      value: "purged" as const,
      label: "PURGED",
      href: buildRecycleBinStatusHref(input.activeTab, input.filters, "purged"),
      count: input.purgedCount,
    },
    {
      value: "restored" as const,
      label: "RESTORED",
      href: buildRecycleBinStatusHref(input.activeTab, input.filters, "restored"),
      count: input.restoredCount,
    },
  ];
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

function normalizeEntryStatus(value: string): RecycleBinEntryStatusValue {
  return value === "archived" ||
    value === "purged" ||
    value === "restored"
    ? value
    : "active";
}

function normalizeFilterState(value: string): RecycleBinFilterStateValue {
  return value === "restorable" ||
    value === "restore_blocked" ||
    value === "purge_blocked"
    ? value
    : "all";
}

function normalizeHistoryFinalAction(
  value: string,
): RecycleBinHistoryFinalActionFilterValue {
  return value === "archive" || value === "purge" || value === "restore"
    ? value
    : "all";
}

function normalizeHistoryArchiveSource(
  value: string,
): RecycleBinHistoryArchiveSourceFilterValue {
  return value === "snapshot_v2" ||
    value === "legacy_fallback" ||
    value === "unavailable"
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
  const entryStatus = normalizeEntryStatus(getParamValue(searchParams?.entryStatus));

  return {
    entryStatus,
    deletedRange: normalizeDeletedRange(getParamValue(searchParams?.deletedRange)),
    deletedById: getParamValue(searchParams?.deletedById),
    state:
      entryStatus === "active"
        ? normalizeFilterState(getParamValue(searchParams?.state))
        : "all",
    targetType: normalizeTargetType(getParamValue(searchParams?.targetType), activeTab),
    resolvedRange:
      entryStatus === "active"
        ? "all"
        : normalizeDeletedRange(getParamValue(searchParams?.resolvedRange)),
    resolvedById:
      entryStatus === "active" ? "" : getParamValue(searchParams?.resolvedById),
    finalAction:
      entryStatus === "active"
        ? "all"
        : normalizeHistoryFinalAction(getParamValue(searchParams?.finalAction)),
    historyArchiveSource:
      entryStatus === "active"
        ? "all"
        : normalizeHistoryArchiveSource(
            getParamValue(searchParams?.historyArchiveSource),
          ),
  };
}

function getEntryStatusStatuses(
  entryStatus: RecycleBinEntryStatusValue,
): readonly RecycleEntryStatus[] {
  if (entryStatus === "archived") {
    return [RecycleEntryStatus.ARCHIVED];
  }

  if (entryStatus === "purged") {
    return [RecycleEntryStatus.PURGED];
  }

  if (entryStatus === "restored") {
    return [RecycleEntryStatus.RESTORED];
  }

  return [RecycleEntryStatus.ACTIVE];
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

function matchesResolvedRange(
  resolvedAt: Date | null,
  resolvedRange: RecycleBinResolvedRangeValue,
) {
  if (resolvedRange === "all") {
    return true;
  }

  if (!resolvedAt) {
    return false;
  }

  return matchesDeletedRange(resolvedAt, resolvedRange);
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
  if (item.entryStatus !== RecycleEntryStatus.ACTIVE) {
    return true;
  }

  switch (state) {
    case "restorable":
      return item.canRestore;
    case "restore_blocked":
      return !item.canRestore;
    case "purge_blocked":
      if (item.finalActionPreview) {
        if (item.finalActionPreview.finalAction === "ARCHIVE") {
          return true;
        }

        if (item.isExpired) {
          return !item.canFinalizeNow;
        }

        return item.purgeRequiresAdmin || !item.canPurge;
      }

      return item.purgeRequiresAdmin || !item.canPurge;
    case "all":
    default:
      return true;
  }
}

function matchesFinalActionFilter(
  item: RecycleBinListItem,
  finalAction: RecycleBinHistoryFinalActionFilterValue,
) {
  if (finalAction === "all") {
    return true;
  }

  return getHistoryFinalActionFilterValue(item.resolutionActionLabel) === finalAction;
}

function matchesHistoryArchiveSourceFilter(
  item: RecycleBinListItem,
  historyArchiveSource: RecycleBinHistoryArchiveSourceFilterValue,
) {
  if (historyArchiveSource === "all") {
    return true;
  }

  return (
    getHistoryArchiveSourceFilterValue(item.historyArchive?.source ?? "UNAVAILABLE") ===
    historyArchiveSource
  );
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
    return `恢复受阻：${input.restoreGuard.blockerSummary}；清理受阻：${input.purgeGuard.blockerSummary}`;
  }

  if (!input.restoreGuard.canRestore) {
    return input.canActorPurge
      ? `恢复受阻：${input.restoreGuard.blockerSummary}；当前可执行永久删除`
      : `恢复受阻：${input.restoreGuard.blockerSummary}；当前清理动作仅管理员可执行`;
  }

  if (!input.purgeGuard.canPurge) {
    return `可恢复；清理受阻：${input.purgeGuard.blockerSummary}`;
  }

  return input.canActorPurge ? "可恢复，且可执行永久删除" : "可恢复；清理动作仅管理员可执行";
}

function formatRemainingTimeLabel(expiresAt: string, isExpired: boolean) {
  if (isExpired) {
    return "冷静期已到期";
  }

  const diffMs = new Date(expiresAt).getTime() - Date.now();

  if (diffMs <= 0) {
    return "冷静期已到期";
  }

  const totalHours = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) {
    return `还剩 ${days} 天 ${hours} 小时`;
  }

  if (days > 0) {
    return `还剩 ${days} 天`;
  }

  return `还剩 ${totalHours} 小时`;
}

function buildCustomerRecycleBlockerSummary(input: {
  restoreGuard: RecycleRestoreGuard;
  preview: RecycleFinalizePreview;
  isExpired: boolean;
  canFinalizeNow: boolean;
}) {
  const restoreSummary = input.restoreGuard.canRestore
    ? "可恢复"
    : `恢复受阻：${input.restoreGuard.blockerSummary}`;

  if (input.isExpired) {
    return `${restoreSummary}；${
      input.canFinalizeNow
        ? `已到最终处理窗口：${input.preview.finalAction}`
        : `已到最终处理窗口：仅管理员可执行 ${input.preview.finalAction}`
    }`;
  }

  if (input.preview.finalAction === "ARCHIVE") {
    return `${restoreSummary}；3 天后仅 ARCHIVE`;
  }

  return `${restoreSummary}；3 天后可 PURGE`;
}

function buildCustomerEarlyPurgeSummary(input: {
  preview: RecycleFinalizePreview;
  isExpired: boolean;
  canEarlyPurge: boolean;
  canFinalizeNow: boolean;
}) {
  if (input.isExpired) {
    return input.canFinalizeNow
      ? `冷静期已到期，请执行最终处理：${input.preview.finalAction}`
      : `冷静期已到期，最终处理仅管理员可执行：${input.preview.finalAction}`;
  }

  if (input.preview.finalAction === "ARCHIVE") {
    return "当前不提供提前永久删除，3 天后仅 ARCHIVE。";
  }

  return input.canEarlyPurge ? "当前可提前永久删除。" : "仅管理员可提前永久删除。";
}

function supportsFinalizePreview(targetType: RecycleBinListEntry["targetType"]) {
  return (
    targetType === "PRODUCT" ||
    targetType === "PRODUCT_SKU" ||
    targetType === "CUSTOMER" ||
    targetType === "TRADE_ORDER"
  );
}

function buildTradeOrderRecycleBlockerSummary(input: {
  restoreGuard: RecycleRestoreGuard;
  preview: RecycleFinalizePreview;
  isExpired: boolean;
  canFinalizeNow: boolean;
}) {
  const restoreSummary = input.restoreGuard.canRestore
    ? "可恢复"
    : `恢复受阻：${input.restoreGuard.blockerSummary}`;

  if (input.isExpired) {
    return `${restoreSummary}；${
      input.canFinalizeNow
        ? `已到最终处理窗口：${input.preview.finalAction}`
        : `已到最终处理窗口：仅管理员可执行 ${input.preview.finalAction}`
    }`;
  }

  if (input.preview.finalAction === "ARCHIVE") {
    return `${restoreSummary}；3 天后仅 ARCHIVE`;
  }

  return `${restoreSummary}；3 天后可 PURGE`;
}

function buildTradeOrderEarlyPurgeSummary(input: {
  preview: RecycleFinalizePreview;
  isExpired: boolean;
  canEarlyPurge: boolean;
  canFinalizeNow: boolean;
}) {
  if (input.isExpired) {
    return input.canFinalizeNow
      ? `冷静期已到期，请执行最终处理：${input.preview.finalAction}`
      : `冷静期已到期，最终处理仅管理员可执行：${input.preview.finalAction}`;
  }

  if (input.preview.finalAction === "ARCHIVE") {
    return "当前不提供提前永久删除，3 天后仅 ARCHIVE。";
  }

  return input.canEarlyPurge ? "当前可提前永久删除。" : "仅管理员可提前永久删除。";
}

function parseArchivePayload(
  value: unknown,
): RecycleArchivePayload | null {
  return parseRecycleArchivePayload(value);
}

function buildHistoryArchiveContract(
  entry: RecycleBinListEntry,
): RecycleBinHistoryArchiveContract | null {
  const archivePayload = parseArchivePayload(entry.archivePayloadJson);

  if (!archivePayload) {
    return null;
  }

  const customerSnapshot =
    entry.targetType === "CUSTOMER"
      ? parseCustomerRecycleArchiveSnapshot(archivePayload)
      : null;
  const tradeOrderSnapshot =
    entry.targetType === "TRADE_ORDER"
      ? parseTradeOrderRecycleArchiveSnapshot(archivePayload)
      : null;
  const productSnapshot =
    entry.targetType === "PRODUCT"
      ? parseProductRecycleArchiveSnapshot(archivePayload)
      : null;
  const productSkuSnapshot =
    entry.targetType === "PRODUCT_SKU"
      ? parseProductSkuRecycleArchiveSnapshot(archivePayload)
      : null;
  const snapshotVersion =
    customerSnapshot?.snapshotVersion ??
    tradeOrderSnapshot?.snapshotVersion ??
    productSnapshot?.snapshotVersion ??
    productSkuSnapshot?.snapshotVersion ??
    null;

  return {
    source:
      snapshotVersion !== null
        ? snapshotVersion >= RECYCLE_ARCHIVE_SNAPSHOT_VERSION
          ? "SNAPSHOT_V2"
          : "LEGACY_FALLBACK"
        : "UNAVAILABLE",
    snapshotVersion,
    archivePayload,
    customerSnapshot,
    tradeOrderSnapshot,
    productSnapshot,
    productSkuSnapshot,
  };
}

function buildHistoryResolutionSummary(
  entry: RecycleBinListEntry,
  archivePayload: RecycleArchivePayload | null,
) {
  if (entry.status === RecycleEntryStatus.RESTORED) {
    return "该对象已通过 RESTORE 退出回收站，当前只保留删除与恢复审计记录。";
  }

  if (entry.status === RecycleEntryStatus.PURGED) {
    return "该对象已执行 PURGE，源对象已物理删除；当前列表只保留回收站历史审计。";
  }

  if (entry.status === RecycleEntryStatus.ARCHIVED) {
    return (
      archivePayload?.blockerSummary ??
      "该对象已执行 ARCHIVE，按封存/脱敏归档终态保留，不会伪装成 PURGED。"
    );
  }

  return null;
}

function getResolutionActionLabel(
  entry: RecycleBinListEntry,
  archivePayload: RecycleArchivePayload | null,
) {
  if (entry.status === RecycleEntryStatus.RESTORED) {
    return "RESTORE";
  }

  if (entry.status === RecycleEntryStatus.PURGED) {
    return "PURGE";
  }

  if (entry.status === RecycleEntryStatus.ARCHIVED) {
    return archivePayload?.finalAction ?? "ARCHIVE";
  }

  return null;
}

function getHistoryFinalActionFilterValue(
  value: string | null,
): RecycleBinHistoryFinalActionFilterValue {
  if (value === "ARCHIVE") {
    return "archive";
  }

  if (value === "PURGE") {
    return "purge";
  }

  if (value === "RESTORE") {
    return "restore";
  }

  return "all";
}

function getHistoryArchiveSourceFilterValue(
  value: RecycleBinHistoryArchiveSource | null | undefined,
): RecycleBinHistoryArchiveSourceFilterValue {
  if (value === "SNAPSHOT_V2") {
    return "snapshot_v2";
  }

  if (value === "LEGACY_FALLBACK") {
    return "legacy_fallback";
  }

  if (value === "UNAVAILABLE") {
    return "unavailable";
  }

  return "all";
}

function getHistoryArchiveSourceLabel(
  value: RecycleBinHistoryArchiveSource | null | undefined,
) {
  return value ?? "UNAVAILABLE";
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

function buildResolvedByOptions(entries: RecycleBinListEntry[]): RecycleBinFilterOption[] {
  const counts = new Map<string, RecycleBinFilterOption>();

  for (const entry of entries) {
    if (!entry.resolvedById || !entry.resolvedBy) {
      continue;
    }

    const existing = counts.get(entry.resolvedById);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(entry.resolvedById, {
      value: entry.resolvedById,
      label: getResolvedByLabel(entry) ?? "--",
      count: 1,
    });
  }

  return Array.from(counts.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "zh-CN"),
  );
}

function buildFinalActionOptions(items: RecycleBinListItem[]): RecycleBinFilterOption[] {
  const counts = new Map<RecycleBinHistoryFinalActionFilterValue, RecycleBinFilterOption>();

  for (const item of items) {
    const filterValue = getHistoryFinalActionFilterValue(item.resolutionActionLabel);

    if (filterValue === "all") {
      continue;
    }

    const existing = counts.get(filterValue);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(filterValue, {
      value: filterValue,
      label: item.resolutionActionLabel ?? filterValue.toUpperCase(),
      count: 1,
    });
  }

  return Array.from(counts.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "zh-CN"),
  );
}

function buildHistoryArchiveSourceOptions(
  items: RecycleBinListItem[],
): RecycleBinFilterOption[] {
  const counts = new Map<
    RecycleBinHistoryArchiveSourceFilterValue,
    RecycleBinFilterOption
  >();

  for (const item of items) {
    const filterValue = getHistoryArchiveSourceFilterValue(
      item.historyArchive?.source ?? "UNAVAILABLE",
    );

    if (filterValue === "all") {
      continue;
    }

    const existing = counts.get(filterValue);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(filterValue, {
      value: filterValue,
      label: getHistoryArchiveSourceLabel(item.historyArchive?.source ?? "UNAVAILABLE"),
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

async function listEntriesForTabByStatus(input: {
  activeTab: RecycleBinTabValue;
  viewer: RecycleLifecycleActor;
  statuses: readonly RecycleEntryStatus[];
}) {
  const entries = await listRecycleEntries(prisma, {
    domain: getDomainFromTab(input.activeTab),
    statuses: input.statuses,
  });

  if (input.activeTab !== "customers") {
    return entries;
  }

  const visibleCustomerEntryIds = await listVisibleCustomerRecycleTargetIds(
    prisma,
    input.viewer,
    entries,
  );

  return entries.filter((entry) => visibleCustomerEntryIds.has(entry.targetId));
}

async function countEntriesForTabByStatus(input: {
  activeTab: RecycleBinTabValue;
  viewer: RecycleLifecycleActor;
  statuses: readonly RecycleEntryStatus[];
}) {
  if (input.activeTab !== "customers") {
    return countRecycleEntries(prisma, {
      domain: getDomainFromTab(input.activeTab),
      statuses: input.statuses,
    });
  }

  const entries = await listEntriesForTabByStatus(input);
  return entries.length;
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
        "这条线索已经产生分配或跟进痕迹，可回收治理，但不适合直接永久删除。",
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
          : "先确认原始对象仍存在，当前条目才有最终处理意义。",
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
  const unifiedGroups = buildTradeOrderRecycleBlockerGroups(blockers);

  if (unifiedGroups.length > 0) {
    return unifiedGroups.map((group) => ({
      title: group.title,
      description: group.description,
      items: group.items.map((item) => ({
        name: item.name,
        description: item.description,
        suggestedAction: item.suggestedAction,
      })),
    }));
  }

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
  const unifiedGroups = buildCustomerRecycleBlockerGroups(blockers);

  if (unifiedGroups.length > 0) {
    return unifiedGroups.map((group) => ({
      title: group.title,
      description: group.description,
      items: group.items.map((item) => ({
        name: item.name,
        description: item.description,
        suggestedAction: item.suggestedAction,
      })),
    }));
  }

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
      const isActiveEntry = entry.status === RecycleEntryStatus.ACTIVE;
      const restoreGuard = isActiveEntry ? await buildRestoreGuard(entry) : null;
      const purgeGuard = isActiveEntry ? await buildPurgeGuard(entry) : null;
      const finalizePreviewResult =
        isActiveEntry && supportsFinalizePreview(entry.targetType)
          ? await previewRecycleBinFinalize(viewer, {
              entryId: entry.id,
            })
          : null;
      const finalActionPreview = finalizePreviewResult?.preview ?? null;
      const isExpired = finalizePreviewResult?.isExpired ?? false;
      const canFinalizeNow = Boolean(
        finalizePreviewResult &&
          finalActionPreview?.canFinalize &&
          isExpired &&
          canActorPurge,
      );
      const canEarlyPurge = Boolean(
        finalActionPreview &&
          !isExpired &&
          canActorPurge &&
          finalActionPreview.canEarlyPurge,
      );
      const isFinalizeTarget = supportsFinalizePreview(entry.targetType);
      const leadMetadata =
        entry.targetType === "LEAD" ? leadRuntimeMetadata.get(entry.targetId) : null;
      const customerSummary =
        entry.targetType === "CUSTOMER" ? getCustomerListSummary(entry) : null;
      const historyArchive = buildHistoryArchiveContract(entry);
      const archivePayload = historyArchive?.archivePayload ?? null;
      const ownerLabel =
        entry.targetType === "LEAD"
          ? leadMetadata?.ownerLabel ?? "未分配"
          : entry.targetType === "TRADE_ORDER"
            ? getSnapshotString(entry, "ownerName") ?? "未分配"
            : entry.targetType === "CUSTOMER"
              ? customerSummary?.ownerLabel ?? "--"
              : null;
      const baseItem = {
        entryId: entry.id,
        entryStatus: entry.status,
        entryStatusLabel: getEntryStatusLabel(entry.status),
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
        resolvedAtLabel: entry.resolvedAt ? formatDateTime(entry.resolvedAt) : null,
        resolvedByLabel: getResolvedByLabel(entry),
        resolutionActionLabel: getResolutionActionLabel(entry, archivePayload),
        resolutionSummary: buildHistoryResolutionSummary(entry, archivePayload),
        archivePayloadJsonText: archivePayload
          ? JSON.stringify(archivePayload, null, 2)
          : null,
        historyArchive,
      };

      if (!isActiveEntry) {
        return {
          ...baseItem,
          blockerSummary:
            buildHistoryResolutionSummary(entry, archivePayload) ?? "当前为历史终态只读记录。",
          restoreSummary: "当前条目已离开 ACTIVE，不提供历史恢复操作。",
          purgeSummary: "当前条目已离开 ACTIVE，不提供历史永久删除操作。",
          restoreBlockerGroups: [],
          purgeBlockerGroups: [],
          restoreRouteSnapshot: entry.restoreRouteSnapshot,
          canRestore: false,
          canPurge: false,
          purgeRequiresAdmin: false,
          finalActionPreview: null,
          finalizeSummary: null,
          finalActionLabel: null,
          remainingTimeLabel: null,
          finalizeBlockerGroups: [],
          canFinalizeNow: false,
          isExpired: true,
        } satisfies RecycleBinListItem;
      }

      return {
        ...baseItem,
        blockerSummary:
          finalActionPreview && entry.targetType === "CUSTOMER"
            ? buildCustomerRecycleBlockerSummary({
                restoreGuard: restoreGuard!,
                preview: finalActionPreview,
                isExpired,
                canFinalizeNow,
              })
            : finalActionPreview && entry.targetType === "TRADE_ORDER"
              ? buildTradeOrderRecycleBlockerSummary({
                  restoreGuard: restoreGuard!,
                  preview: finalActionPreview,
                  isExpired,
                  canFinalizeNow,
                })
            : buildBlockerSummary({
                restoreGuard: restoreGuard!,
                purgeGuard: purgeGuard!,
                canActorPurge,
              }),
        restoreSummary: restoreGuard!.blockerSummary,
        purgeSummary:
          finalActionPreview && entry.targetType === "CUSTOMER"
            ? buildCustomerEarlyPurgeSummary({
                preview: finalActionPreview,
                isExpired,
                canEarlyPurge,
                canFinalizeNow,
              })
            : finalActionPreview && entry.targetType === "TRADE_ORDER"
              ? buildTradeOrderEarlyPurgeSummary({
                  preview: finalActionPreview,
                  isExpired,
                  canEarlyPurge,
                  canFinalizeNow,
              })
            : purgeGuard!.blockerSummary,
        restoreBlockerGroups: buildBlockerGroups({
          targetType: entry.targetType,
          blockers: restoreGuard!.blockers,
          mode: "restore",
        }),
        purgeBlockerGroups: buildBlockerGroups({
          targetType: entry.targetType,
          blockers: purgeGuard!.blockers,
          mode: "purge",
        }),
        restoreRouteSnapshot: restoreGuard!.restoreRouteSnapshot,
        canRestore: restoreGuard!.canRestore,
        canPurge:
          finalActionPreview && isFinalizeTarget
            ? canEarlyPurge
            : canActorPurge && purgeGuard!.canPurge,
        purgeRequiresAdmin:
          finalActionPreview && isFinalizeTarget
            ? Boolean(
                finalActionPreview.canEarlyPurge && !isExpired && !canActorPurge,
              )
            : !canActorPurge,
        finalActionPreview,
        finalizeSummary: finalActionPreview?.blockerSummary ?? null,
        finalActionLabel: finalActionPreview?.finalActionLabel ?? null,
        remainingTimeLabel: finalizePreviewResult
          ? formatRemainingTimeLabel(
              finalizePreviewResult.expiresAt,
              finalizePreviewResult.isExpired,
            )
          : null,
        finalizeBlockerGroups: finalActionPreview
          ? buildBlockerGroups({
              targetType: entry.targetType,
              blockers: finalActionPreview.blockers,
              mode: "purge",
            })
          : [],
        canFinalizeNow,
        isExpired,
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
  const selectedStatuses = getEntryStatusStatuses(filters.entryStatus);
  const [
    masterDataCount,
    liveSessionCount,
    leadCount,
    tradeOrderCount,
    customerCount,
    activeCount,
    archivedCount,
    purgedCount,
    restoredCount,
    scopedEntries,
  ] = await Promise.all([
    canAccessMasterData
      ? countEntriesForTabByStatus({
          activeTab: "master-data",
          viewer,
          statuses: selectedStatuses,
        })
      : Promise.resolve(0),
    canAccessLiveSessions
      ? countEntriesForTabByStatus({
          activeTab: "live-sessions",
          viewer,
          statuses: selectedStatuses,
        })
      : Promise.resolve(0),
    canAccessLeads
      ? countEntriesForTabByStatus({
          activeTab: "leads",
          viewer,
          statuses: selectedStatuses,
        })
      : Promise.resolve(0),
    canAccessTradeOrders
      ? countEntriesForTabByStatus({
          activeTab: "trade-orders",
          viewer,
          statuses: selectedStatuses,
        })
      : Promise.resolve(0),
    canAccessCustomers
      ? countEntriesForTabByStatus({
          activeTab: "customers",
          viewer,
          statuses: selectedStatuses,
        })
      : Promise.resolve(0),
    countEntriesForTabByStatus({
      activeTab,
      viewer,
      statuses: [RecycleEntryStatus.ACTIVE],
    }),
    countEntriesForTabByStatus({
      activeTab,
      viewer,
      statuses: [RecycleEntryStatus.ARCHIVED],
    }),
    countEntriesForTabByStatus({
      activeTab,
      viewer,
      statuses: [RecycleEntryStatus.PURGED],
    }),
    countEntriesForTabByStatus({
      activeTab,
      viewer,
      statuses: [RecycleEntryStatus.RESTORED],
    }),
    listEntriesForTabByStatus({
      activeTab,
      viewer,
      statuses: selectedStatuses,
    }),
  ]);
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
  const statusTabs = buildStatusTabs({
    activeTab,
    filters,
    activeCount,
    archivedCount,
    purgedCount,
    restoredCount,
  });

  const deletedByOptions = buildDeletedByOptions(scopedEntries);
  const targetTypeOptions = buildTargetTypeOptions(activeTab, scopedEntries);
  const isHistoryView = filters.entryStatus !== "active";

  const baseFilteredEntries = scopedEntries.filter((entry) => {
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

  const resolvedByOptions = isHistoryView ? buildResolvedByOptions(baseFilteredEntries) : [];
  const resolvedFilteredEntries = isHistoryView
    ? baseFilteredEntries.filter((entry) => {
        if (filters.resolvedById && entry.resolvedById !== filters.resolvedById) {
          return false;
        }

        if (!matchesResolvedRange(entry.resolvedAt, filters.resolvedRange)) {
          return false;
        }

        return true;
      })
    : baseFilteredEntries;

  const allVisibleItems = await buildListItems(resolvedFilteredEntries, viewer);
  const finalActionOptions = isHistoryView ? buildFinalActionOptions(allVisibleItems) : [];
  const historyArchiveSourceOptions = isHistoryView
    ? buildHistoryArchiveSourceOptions(allVisibleItems)
    : [];
  const items = allVisibleItems.filter((item) => {
    if (!matchesStateFilter(item, filters.state)) {
      return false;
    }

    if (isHistoryView && !matchesFinalActionFilter(item, filters.finalAction)) {
      return false;
    }

    if (
      isHistoryView &&
      !matchesHistoryArchiveSourceFilter(item, filters.historyArchiveSource)
    ) {
      return false;
    }

    return true;
  });

  return {
    activeTab,
    tabs,
    statusTabs,
    summary: {
      totalCount: items.length,
      restorableCount: items.filter((item) => item.canRestore).length,
      purgeBlockedCount: items.filter(
        (item) => item.purgeRequiresAdmin || !item.canPurge,
      ).length,
      resolvedCount: items.filter(
        (item) => item.entryStatus !== RecycleEntryStatus.ACTIVE,
      ).length,
      resolvedActorCount: new Set(
        items
          .map((item) => item.resolvedByLabel)
          .filter((value): value is string => Boolean(value)),
      ).size,
      archivePayloadCount: items.filter((item) => item.archivePayloadJsonText).length,
    },
    items,
    filters,
    deletedByOptions,
    resolvedByOptions,
    targetTypeOptions,
    finalActionOptions,
    historyArchiveSourceOptions,
    hasActiveFilters:
      filters.deletedRange !== "all" ||
      filters.deletedById.length > 0 ||
      filters.state !== "all" ||
      filters.targetType !== "all" ||
      filters.resolvedRange !== "all" ||
      filters.resolvedById.length > 0 ||
      filters.finalAction !== "all" ||
      filters.historyArchiveSource !== "all",
    resetHref: buildRecycleBinHref(activeTab, {
      ...filters,
      deletedRange: "all",
      deletedById: "",
      state: "all",
      targetType: "all",
      resolvedRange: "all",
      resolvedById: "",
      finalAction: "all",
      historyArchiveSource: "all",
    }),
  };
}
