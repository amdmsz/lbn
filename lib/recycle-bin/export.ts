import type {
  RecycleBinFilters,
  RecycleBinListItem,
  RecycleBinTabValue,
} from "@/lib/recycle-bin/queries";

function escapeCsvValue(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvLine(values: Array<string | null | undefined>) {
  return values.map((value) => escapeCsvValue(value ?? "")).join(",");
}

function getTabSlug(tab: RecycleBinTabValue) {
  switch (tab) {
    case "master-data":
      return "master-data";
    case "live-sessions":
      return "live-sessions";
    case "leads":
      return "leads";
    case "trade-orders":
      return "trade-orders";
    case "customers":
      return "customers";
    default:
      return "recycle-bin";
  }
}

function getHistoryExportNote(item: RecycleBinListItem) {
  if (item.historyArchive?.source === "SNAPSHOT_V2") {
    return "snapshotVersion=2 structured export";
  }

  if (item.historyArchive?.source === "LEGACY_FALLBACK") {
    return "legacy snapshot, structured fields may be incomplete";
  }

  return "no structured archive payload";
}

export function buildRecycleBinHistoryExportHref(input: {
  activeTab: RecycleBinTabValue;
  filters: RecycleBinFilters;
}) {
  if (input.filters.entryStatus === "active") {
    return null;
  }

  const params = new URLSearchParams();
  params.set("tab", input.activeTab);
  params.set("entryStatus", input.filters.entryStatus);

  if (input.filters.deletedRange !== "all") {
    params.set("deletedRange", input.filters.deletedRange);
  }

  if (input.filters.deletedById) {
    params.set("deletedById", input.filters.deletedById);
  }

  if (input.filters.targetType !== "all") {
    params.set("targetType", input.filters.targetType);
  }

  if (input.filters.resolvedRange !== "all") {
    params.set("resolvedRange", input.filters.resolvedRange);
  }

  if (input.filters.resolvedById) {
    params.set("resolvedById", input.filters.resolvedById);
  }

  if (input.filters.finalAction !== "all") {
    params.set("finalAction", input.filters.finalAction);
  }

  if (input.filters.historyArchiveSource !== "all") {
    params.set("historyArchiveSource", input.filters.historyArchiveSource);
  }

  return `/recycle-bin/export?${params.toString()}`;
}

export function buildRecycleBinHistoryExportFileName(input: {
  activeTab: RecycleBinTabValue;
  entryStatus: RecycleBinFilters["entryStatus"];
}) {
  const datePart = new Date().toISOString().slice(0, 10);
  return `recycle-bin-${getTabSlug(input.activeTab)}-${input.entryStatus}-${datePart}.csv`;
}

export function buildRecycleBinHistoryExportCsv(items: RecycleBinListItem[]) {
  const header = [
    "targetType",
    "targetTypeLabel",
    "name",
    "secondaryLabel",
    "finalStatus",
    "deletedAt",
    "deletedBy",
    "resolvedAt",
    "resolvedBy",
    "finalAction",
    "historyArchiveSource",
    "historyArchiveSnapshotVersion",
    "historyArchiveExportNote",
    "deleteReason",
    "deleteReasonText",
    "resolutionSummary",
    "restoreRouteSnapshot",
    "archivePayloadJson",
    "customer.objectWeight",
    "customer.nameMasked",
    "customer.phoneMasked",
    "customer.wechatIdMasked",
    "customer.addressMasked",
    "customer.remarkMasked",
    "customer.owner.id",
    "customer.owner.name",
    "customer.owner.username",
    "customer.owner.teamId",
    "customer.owner.displayLabel",
    "customer.governanceAnchors.approvedTradeOrderCount",
    "customer.governanceAnchors.linkedLeadCount",
    "customer.governanceAnchors.followUpTaskCount",
    "customer.governanceAnchors.callRecordCount",
    "customer.governanceAnchors.wechatRecordCount",
    "customer.governanceAnchors.liveInvitationCount",
    "customer.governanceAnchors.legacyOrderCount",
    "customer.governanceAnchors.salesOrderCount",
    "customer.governanceAnchors.tradeOrderCount",
    "customer.governanceAnchors.paymentPlanCount",
    "customer.governanceAnchors.paymentRecordCount",
    "customer.governanceAnchors.collectionTaskCount",
    "customer.governanceAnchors.giftRecordCount",
    "customer.governanceAnchors.shippingTaskCount",
    "customer.governanceAnchors.logisticsFollowUpCount",
    "customer.governanceAnchors.codCollectionCount",
    "customer.governanceAnchors.mergeLogCount",
    "customer.governanceAnchors.customerTagCount",
    "customer.governanceAnchors.ownershipEventCount",
    "tradeOrder.objectWeight",
    "tradeOrder.tradeNo",
    "tradeOrder.customer.id",
    "tradeOrder.customer.name",
    "tradeOrder.customer.phoneMasked",
    "tradeOrder.customer.ownerLabel",
    "tradeOrder.tradeStatus",
    "tradeOrder.reviewStatus",
    "tradeOrder.finalAmount",
    "tradeOrder.receiverNameMasked",
    "tradeOrder.receiverPhoneMasked",
    "tradeOrder.receiverAddressMasked",
    "tradeOrder.downstreamAnchors.salesOrderCount",
    "tradeOrder.downstreamAnchors.paymentPlanCount",
    "tradeOrder.downstreamAnchors.paymentRecordCount",
    "tradeOrder.downstreamAnchors.collectionTaskCount",
    "tradeOrder.downstreamAnchors.shippingTaskCount",
    "tradeOrder.downstreamAnchors.exportLineCount",
    "tradeOrder.downstreamAnchors.logisticsFollowUpCount",
    "tradeOrder.downstreamAnchors.codCollectionCount",
  ];

  const rows = items.map((item) => {
    const customerSnapshot =
      item.historyArchive?.source === "SNAPSHOT_V2"
        ? item.historyArchive.customerSnapshot
        : null;
    const tradeOrderSnapshot =
      item.historyArchive?.source === "SNAPSHOT_V2"
        ? item.historyArchive.tradeOrderSnapshot
        : null;
    const customerAnchors = customerSnapshot?.governanceAnchors;
    const tradeOrderAnchors = tradeOrderSnapshot?.downstreamAnchors;

    return toCsvLine([
      item.targetType,
      item.targetTypeLabel,
      item.name,
      item.secondaryLabel,
      item.entryStatusLabel,
      item.deletedAtLabel,
      item.deletedByLabel,
      item.resolvedAtLabel ?? "",
      item.resolvedByLabel ?? "",
      item.resolutionActionLabel ?? "",
      item.historyArchive?.source ?? "UNAVAILABLE",
      item.historyArchive?.snapshotVersion?.toString() ?? "",
      getHistoryExportNote(item),
      item.deleteReasonLabel,
      item.deleteReasonText ?? "",
      item.resolutionSummary ?? "",
      item.restoreRouteSnapshot,
      item.archivePayloadJsonText ?? "",
      customerSnapshot?.objectWeight ?? "",
      customerSnapshot?.nameMasked ?? "",
      customerSnapshot?.phoneMasked ?? "",
      customerSnapshot?.wechatIdMasked ?? "",
      customerSnapshot?.addressMasked ?? "",
      customerSnapshot?.remarkMasked ?? "",
      customerSnapshot?.owner?.id ?? "",
      customerSnapshot?.owner?.name ?? "",
      customerSnapshot?.owner?.username ?? "",
      customerSnapshot?.owner?.teamId ?? "",
      customerSnapshot?.owner?.displayLabel ?? "",
      customerAnchors?.approvedTradeOrderCount?.toString() ?? "",
      customerAnchors?.linkedLeadCount?.toString() ?? "",
      customerAnchors?.followUpTaskCount?.toString() ?? "",
      customerAnchors?.callRecordCount?.toString() ?? "",
      customerAnchors?.wechatRecordCount?.toString() ?? "",
      customerAnchors?.liveInvitationCount?.toString() ?? "",
      customerAnchors?.legacyOrderCount?.toString() ?? "",
      customerAnchors?.salesOrderCount?.toString() ?? "",
      customerAnchors?.tradeOrderCount?.toString() ?? "",
      customerAnchors?.paymentPlanCount?.toString() ?? "",
      customerAnchors?.paymentRecordCount?.toString() ?? "",
      customerAnchors?.collectionTaskCount?.toString() ?? "",
      customerAnchors?.giftRecordCount?.toString() ?? "",
      customerAnchors?.shippingTaskCount?.toString() ?? "",
      customerAnchors?.logisticsFollowUpCount?.toString() ?? "",
      customerAnchors?.codCollectionCount?.toString() ?? "",
      customerAnchors?.mergeLogCount?.toString() ?? "",
      customerAnchors?.customerTagCount?.toString() ?? "",
      customerAnchors?.ownershipEventCount?.toString() ?? "",
      tradeOrderSnapshot?.objectWeight ?? "",
      tradeOrderSnapshot?.tradeNo ?? "",
      tradeOrderSnapshot?.customer?.id ?? "",
      tradeOrderSnapshot?.customer?.name ?? "",
      tradeOrderSnapshot?.customer?.phoneMasked ?? "",
      tradeOrderSnapshot?.customer?.ownerLabel ?? "",
      tradeOrderSnapshot?.tradeStatus ?? "",
      tradeOrderSnapshot?.reviewStatus ?? "",
      tradeOrderSnapshot?.finalAmount ?? "",
      tradeOrderSnapshot?.receiverNameMasked ?? "",
      tradeOrderSnapshot?.receiverPhoneMasked ?? "",
      tradeOrderSnapshot?.receiverAddressMasked ?? "",
      tradeOrderAnchors?.salesOrderCount?.toString() ?? "",
      tradeOrderAnchors?.paymentPlanCount?.toString() ?? "",
      tradeOrderAnchors?.paymentRecordCount?.toString() ?? "",
      tradeOrderAnchors?.collectionTaskCount?.toString() ?? "",
      tradeOrderAnchors?.shippingTaskCount?.toString() ?? "",
      tradeOrderAnchors?.exportLineCount?.toString() ?? "",
      tradeOrderAnchors?.logisticsFollowUpCount?.toString() ?? "",
      tradeOrderAnchors?.codCollectionCount?.toString() ?? "",
    ]);
  });

  return `\uFEFF${toCsvLine(header)}\n${rows.join("\n")}\n`;
}

export function buildRecycleBinHistoryExportSummary(items: RecycleBinListItem[]) {
  return {
    totalCount: items.length,
    snapshotV2Count: items.filter((item) => item.historyArchive?.source === "SNAPSHOT_V2").length,
    legacyCount: items.filter((item) => item.historyArchive?.source === "LEGACY_FALLBACK").length,
    unavailableCount: items.filter((item) => !item.historyArchive || item.historyArchive.source === "UNAVAILABLE").length,
  };
}
