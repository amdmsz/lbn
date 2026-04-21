import type { RecycleArchivePayload } from "@/lib/recycle-bin/types";

export type RecycleArchiveObjectWeight = "LIGHT" | "HEAVY";
export type RecycleArchiveMaskedValue = "CLEARED" | "EMPTY";

export type RecycleArchiveOwnerSnapshot = {
  id: string | null;
  name: string | null;
  username: string | null;
  teamId: string | null;
  displayLabel: string | null;
};

export type CustomerRecycleArchiveGovernanceAnchors = {
  approvedTradeOrderCount: number;
  linkedLeadCount: number;
  followUpTaskCount: number;
  callRecordCount: number;
  wechatRecordCount: number;
  liveInvitationCount: number;
  legacyOrderCount: number;
  salesOrderCount: number;
  tradeOrderCount: number;
  paymentPlanCount: number;
  paymentRecordCount: number;
  collectionTaskCount: number;
  giftRecordCount: number;
  shippingTaskCount: number;
  logisticsFollowUpCount: number;
  codCollectionCount: number;
  mergeLogCount: number;
  customerTagCount: number;
  ownershipEventCount: number;
};

export type CustomerRecycleArchiveSnapshot = {
  entity: "CUSTOMER";
  snapshotVersion: number;
  finalAction: "ARCHIVE";
  objectWeight: RecycleArchiveObjectWeight;
  targetMissing: boolean;
  customerId: string;
  customerStatus: string | null;
  ownershipMode: string | null;
  nameMasked: string | null;
  phoneMasked: string | null;
  wechatIdMasked: RecycleArchiveMaskedValue | null;
  addressMasked: RecycleArchiveMaskedValue | null;
  remarkMasked: RecycleArchiveMaskedValue | null;
  owner: RecycleArchiveOwnerSnapshot | null;
  governanceAnchors: CustomerRecycleArchiveGovernanceAnchors | null;
};

export type TradeOrderRecycleArchiveCustomerSnapshot = {
  id: string | null;
  name: string | null;
  phoneMasked: string | null;
  ownerLabel: string | null;
};

export type TradeOrderRecycleArchiveDownstreamAnchors = {
  salesOrderCount: number;
  paymentPlanCount: number;
  paymentRecordCount: number;
  collectionTaskCount: number;
  shippingTaskCount: number;
  exportLineCount: number;
  logisticsFollowUpCount: number;
  codCollectionCount: number;
};

export type TradeOrderRecycleArchiveSnapshot = {
  entity: "TRADE_ORDER";
  snapshotVersion: number;
  finalAction: "ARCHIVE";
  objectWeight: RecycleArchiveObjectWeight;
  targetMissing: boolean;
  tradeOrderId: string;
  tradeNo: string | null;
  customer: TradeOrderRecycleArchiveCustomerSnapshot | null;
  tradeStatus: string | null;
  reviewStatus: string | null;
  finalAmount: string | null;
  receiverNameMasked: string | null;
  receiverPhoneMasked: string | null;
  receiverAddressMasked: string | null;
  downstreamAnchors: TradeOrderRecycleArchiveDownstreamAnchors | null;
};

export type ProductRecycleArchiveCascadeSkuSnapshot = {
  id: string;
  skuName: string | null;
  enabled: boolean;
  salesOrderItemCount: number;
  hasHistoricalReferences: boolean;
};

export type ProductRecycleArchiveSnapshot = {
  entity: "PRODUCT";
  snapshotVersion: number;
  finalAction: "ARCHIVE";
  objectWeight: RecycleArchiveObjectWeight;
  targetMissing: boolean;
  productId: string;
  supplierId: string | null;
  productCode: string | null;
  productName: string | null;
  enabled: boolean;
  hasHistoricalReferences: boolean;
  salesOrderItemCount: number;
  preDeleteProductSnapshot: Record<string, unknown> | null;
  cascadeSkuSnapshot: ProductRecycleArchiveCascadeSkuSnapshot[];
};

export type ProductSkuRecycleArchiveSnapshot = {
  entity: "PRODUCT_SKU";
  snapshotVersion: number;
  finalAction: "ARCHIVE";
  objectWeight: RecycleArchiveObjectWeight;
  targetMissing: boolean;
  productSkuId: string;
  productId: string | null;
  supplierId: string | null;
  skuName: string | null;
  enabled: boolean;
  hasHistoricalReferences: boolean;
  salesOrderItemCount: number;
  parentProductSnapshot: Record<string, unknown> | null;
  preDeleteSkuSnapshot: Record<string, unknown> | null;
};

export const RECYCLE_ARCHIVE_SNAPSHOT_VERSION = 2;

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function getNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getMaskedValue(value: unknown): RecycleArchiveMaskedValue | null {
  return value === "CLEARED" || value === "EMPTY" ? value : null;
}

function getObjectWeight(value: unknown): RecycleArchiveObjectWeight {
  return value === "LIGHT" ? "LIGHT" : "HEAVY";
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getSnapshot(payload: RecycleArchivePayload | null) {
  if (!payload) {
    return null;
  }

  return getRecord(payload.snapshot);
}

function coerceArchivePayload(value: unknown): RecycleArchivePayload | null {
  if (typeof value === "string") {
    return parseRecycleArchivePayloadJsonText(value);
  }

  return parseRecycleArchivePayload(value);
}

function parseOwnerSnapshot(value: unknown): RecycleArchiveOwnerSnapshot | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  return {
    id: getString(record.id),
    name: getString(record.name),
    username: getString(record.username),
    teamId: getString(record.teamId),
    displayLabel: getString(record.displayLabel),
  };
}

function parseCustomerGovernanceAnchors(
  value: unknown,
): CustomerRecycleArchiveGovernanceAnchors | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  return {
    approvedTradeOrderCount: getNumber(record.approvedTradeOrderCount),
    linkedLeadCount: getNumber(record.linkedLeadCount),
    followUpTaskCount: getNumber(record.followUpTaskCount),
    callRecordCount: getNumber(record.callRecordCount),
    wechatRecordCount: getNumber(record.wechatRecordCount),
    liveInvitationCount: getNumber(record.liveInvitationCount),
    legacyOrderCount: getNumber(record.legacyOrderCount),
    salesOrderCount: getNumber(record.salesOrderCount),
    tradeOrderCount: getNumber(record.tradeOrderCount),
    paymentPlanCount: getNumber(record.paymentPlanCount),
    paymentRecordCount: getNumber(record.paymentRecordCount),
    collectionTaskCount: getNumber(record.collectionTaskCount),
    giftRecordCount: getNumber(record.giftRecordCount),
    shippingTaskCount: getNumber(record.shippingTaskCount),
    logisticsFollowUpCount: getNumber(record.logisticsFollowUpCount),
    codCollectionCount: getNumber(record.codCollectionCount),
    mergeLogCount: getNumber(record.mergeLogCount),
    customerTagCount: getNumber(record.customerTagCount),
    ownershipEventCount: getNumber(record.ownershipEventCount),
  };
}

function parseTradeOrderCustomerSnapshot(
  value: unknown,
): TradeOrderRecycleArchiveCustomerSnapshot | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  return {
    id: getString(record.id),
    name: getString(record.name),
    phoneMasked: getString(record.phoneMasked),
    ownerLabel: getString(record.ownerLabel),
  };
}

function parseTradeOrderDownstreamAnchors(
  value: unknown,
): TradeOrderRecycleArchiveDownstreamAnchors | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  return {
    salesOrderCount: getNumber(record.salesOrderCount),
    paymentPlanCount: getNumber(record.paymentPlanCount),
    paymentRecordCount: getNumber(record.paymentRecordCount),
    collectionTaskCount: getNumber(record.collectionTaskCount),
    shippingTaskCount: getNumber(record.shippingTaskCount),
    exportLineCount: getNumber(record.exportLineCount),
    logisticsFollowUpCount: getNumber(record.logisticsFollowUpCount),
    codCollectionCount: getNumber(record.codCollectionCount),
  };
}

function parseProductCascadeSkuSnapshot(
  value: unknown,
): ProductRecycleArchiveCascadeSkuSnapshot | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  const id = getString(record.id);

  if (!id) {
    return null;
  }

  return {
    id,
    skuName: getString(record.skuName),
    enabled: getBoolean(record.enabled),
    salesOrderItemCount: getNumber(record.salesOrderItemCount),
    hasHistoricalReferences: getBoolean(record.hasHistoricalReferences),
  };
}

export function parseRecycleArchivePayload(
  value: unknown,
): RecycleArchivePayload | null {
  const record = getRecord(value);

  if (!record || record.finalAction !== "ARCHIVE") {
    return null;
  }

  return {
    finalAction: "ARCHIVE",
    archivedAt: getString(record.archivedAt) ?? "",
    blockerSummary:
      getString(record.blockerSummary) ??
      "对象已按 ARCHIVE 终态封存或脱敏归档。",
    blockers: Array.isArray(record.blockers)
      ? (record.blockers as RecycleArchivePayload["blockers"])
      : [],
    snapshot: getRecord(record.snapshot) ?? {},
  };
}

export function parseRecycleArchivePayloadJsonText(
  value: string | null,
): RecycleArchivePayload | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return parseRecycleArchivePayload(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseCustomerRecycleArchiveSnapshot(
  value: unknown,
): CustomerRecycleArchiveSnapshot | null {
  const payload = coerceArchivePayload(value);
  const snapshot = getSnapshot(payload);

  if (!payload || !snapshot) {
    return null;
  }

  if (snapshot.entity === "CUSTOMER") {
    const customerId = getString(snapshot.customerId);

    if (!customerId) {
      return null;
    }

    return {
      entity: "CUSTOMER",
      snapshotVersion: getNumber(snapshot.snapshotVersion) || 1,
      finalAction: "ARCHIVE",
      objectWeight: getObjectWeight(snapshot.objectWeight),
      targetMissing: getBoolean(snapshot.targetMissing),
      customerId,
      customerStatus: getString(snapshot.customerStatus),
      ownershipMode: getString(snapshot.ownershipMode),
      nameMasked: getString(snapshot.nameMasked),
      phoneMasked: getString(snapshot.phoneMasked),
      wechatIdMasked: getMaskedValue(snapshot.wechatIdMasked),
      addressMasked: getMaskedValue(snapshot.addressMasked),
      remarkMasked: getMaskedValue(snapshot.remarkMasked),
      owner: parseOwnerSnapshot(snapshot.owner),
      governanceAnchors: parseCustomerGovernanceAnchors(snapshot.governanceAnchors),
    };
  }

  const legacyCustomerId = getString(snapshot.customerId);

  if (!legacyCustomerId) {
    return null;
  }

  return {
    entity: "CUSTOMER",
    snapshotVersion: 1,
    finalAction: "ARCHIVE",
    objectWeight: "HEAVY",
    targetMissing: getBoolean(snapshot.targetMissing),
    customerId: legacyCustomerId,
    customerStatus: getString(snapshot.status),
    ownershipMode: getString(snapshot.ownershipMode),
    nameMasked: getString(snapshot.archivedName),
    phoneMasked: getString(snapshot.archivedPhone),
    wechatIdMasked: null,
    addressMasked: null,
    remarkMasked: null,
    owner: null,
    governanceAnchors: null,
  };
}

export function parseTradeOrderRecycleArchiveSnapshot(
  value: unknown,
): TradeOrderRecycleArchiveSnapshot | null {
  const payload = coerceArchivePayload(value);
  const snapshot = getSnapshot(payload);

  if (!payload || !snapshot) {
    return null;
  }

  if (snapshot.entity === "TRADE_ORDER") {
    const tradeOrderId = getString(snapshot.tradeOrderId);

    if (!tradeOrderId) {
      return null;
    }

    return {
      entity: "TRADE_ORDER",
      snapshotVersion: getNumber(snapshot.snapshotVersion) || 1,
      finalAction: "ARCHIVE",
      objectWeight: getObjectWeight(snapshot.objectWeight),
      targetMissing: getBoolean(snapshot.targetMissing),
      tradeOrderId,
      tradeNo: getString(snapshot.tradeNo),
      customer: parseTradeOrderCustomerSnapshot(snapshot.customer),
      tradeStatus: getString(snapshot.tradeStatus),
      reviewStatus: getString(snapshot.reviewStatus),
      finalAmount: getString(snapshot.finalAmount),
      receiverNameMasked: getString(snapshot.receiverNameMasked),
      receiverPhoneMasked: getString(snapshot.receiverPhoneMasked),
      receiverAddressMasked: getString(snapshot.receiverAddressMasked),
      downstreamAnchors: parseTradeOrderDownstreamAnchors(
        snapshot.downstreamAnchors,
      ),
    };
  }

  const legacyTradeOrderId = getString(snapshot.tradeOrderId);

  if (!legacyTradeOrderId) {
    return null;
  }

  return {
    entity: "TRADE_ORDER",
    snapshotVersion: 1,
    finalAction: "ARCHIVE",
    objectWeight: "HEAVY",
    targetMissing: getBoolean(snapshot.targetMissing),
    tradeOrderId: legacyTradeOrderId,
    tradeNo: getString(snapshot.tradeNo),
    customer: {
      id: getString(snapshot.customerId),
      name: getString(snapshot.customerName),
      phoneMasked: null,
      ownerLabel: null,
    },
    tradeStatus: getString(snapshot.tradeStatus),
    reviewStatus: getString(snapshot.reviewStatus),
    finalAmount: getString(snapshot.finalAmount),
    receiverNameMasked: getString(snapshot.archivedReceiverName),
    receiverPhoneMasked: getString(snapshot.archivedReceiverPhone),
    receiverAddressMasked: null,
    downstreamAnchors: null,
  };
}

export function parseProductRecycleArchiveSnapshot(
  value: unknown,
): ProductRecycleArchiveSnapshot | null {
  const payload = coerceArchivePayload(value);
  const snapshot = getSnapshot(payload);

  if (!payload || !snapshot || snapshot.entity !== "PRODUCT") {
    return null;
  }

  const productId = getString(snapshot.productId);

  if (!productId) {
    return null;
  }

  return {
    entity: "PRODUCT",
    snapshotVersion: getNumber(snapshot.snapshotVersion) || 1,
    finalAction: "ARCHIVE",
    objectWeight: getObjectWeight(snapshot.objectWeight),
    targetMissing: getBoolean(snapshot.targetMissing),
    productId,
    supplierId: getString(snapshot.supplierId),
    productCode: getString(snapshot.productCode),
    productName: getString(snapshot.productName),
    enabled: getBoolean(snapshot.enabled),
    hasHistoricalReferences: getBoolean(snapshot.hasHistoricalReferences),
    salesOrderItemCount: getNumber(snapshot.salesOrderItemCount),
    preDeleteProductSnapshot: getRecord(snapshot.preDeleteProductSnapshot),
    cascadeSkuSnapshot: getArray(snapshot.cascadeSkuSnapshot)
      .map((item) => parseProductCascadeSkuSnapshot(item))
      .filter(
        (item): item is ProductRecycleArchiveCascadeSkuSnapshot => Boolean(item),
      ),
  };
}

export function parseProductSkuRecycleArchiveSnapshot(
  value: unknown,
): ProductSkuRecycleArchiveSnapshot | null {
  const payload = coerceArchivePayload(value);
  const snapshot = getSnapshot(payload);

  if (!payload || !snapshot || snapshot.entity !== "PRODUCT_SKU") {
    return null;
  }

  const productSkuId = getString(snapshot.productSkuId);

  if (!productSkuId) {
    return null;
  }

  return {
    entity: "PRODUCT_SKU",
    snapshotVersion: getNumber(snapshot.snapshotVersion) || 1,
    finalAction: "ARCHIVE",
    objectWeight: getObjectWeight(snapshot.objectWeight),
    targetMissing: getBoolean(snapshot.targetMissing),
    productSkuId,
    productId: getString(snapshot.productId),
    supplierId: getString(snapshot.supplierId),
    skuName: getString(snapshot.skuName),
    enabled: getBoolean(snapshot.enabled),
    hasHistoricalReferences: getBoolean(snapshot.hasHistoricalReferences),
    salesOrderItemCount: getNumber(snapshot.salesOrderItemCount),
    parentProductSnapshot: getRecord(snapshot.parentProductSnapshot),
    preDeleteSkuSnapshot: getRecord(snapshot.preDeleteSkuSnapshot),
  };
}
