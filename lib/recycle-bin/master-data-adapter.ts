import {
  OperationModule,
  OperationTargetType,
  Prisma,
  type RecycleDomain,
  type RecycleTargetType,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildProductRecycleGuard,
  buildProductSkuRecycleGuard,
  buildSupplierRecycleGuard,
} from "@/lib/products/recycle-guards";
import { findProductDomainCurrentlyHiddenTargetIds } from "@/lib/products/recycle";
import {
  RECYCLE_ARCHIVE_SNAPSHOT_VERSION,
  type ProductRecycleArchiveSnapshot,
  type ProductSkuRecycleArchiveSnapshot,
} from "@/lib/recycle-bin/archive-payload";
import { findActiveRecycleEntry } from "@/lib/recycle-bin/repository";
import type {
  RecycleArchivePayload,
  RecycleFinalizeBlocker,
  RecycleFinalizePreview,
  RecyclePurgeBlocker,
  RecyclePurgeGuard,
  RecycleRestoreBlocker,
  RecycleRestoreGuard,
  RecycleTargetSnapshot,
} from "@/lib/recycle-bin/types";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

export type ProductCascadeSkuSnapshot = {
  id: string;
  skuName: string;
  enabled: boolean;
  salesOrderItemCount: number;
  hasHistoricalReferences: boolean;
};

type ParsedProductFinalizeSnapshot = {
  hasHistoricalReferences: boolean;
  salesOrderItemCount: number;
  preDeleteProductSnapshot: Record<string, unknown> | null;
  cascadeSkuSnapshot: ProductCascadeSkuSnapshot[];
};

type ParsedProductSkuFinalizeSnapshot = {
  hasHistoricalReferences: boolean;
  salesOrderItemCount: number;
  parentProductSnapshot: Record<string, unknown> | null;
  preDeleteSkuSnapshot: Record<string, unknown> | null;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBoolean(value: unknown) {
  return value === true;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseCascadeSkuSnapshot(value: unknown): ProductCascadeSkuSnapshot | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  const id = getString(record.id);
  const skuName = getString(record.skuName);

  if (!id || !skuName) {
    return null;
  }

  return {
    id,
    skuName,
    enabled: getBoolean(record.enabled),
    salesOrderItemCount: getNumber(record.salesOrderItemCount),
    hasHistoricalReferences: getBoolean(record.hasHistoricalReferences),
  };
}

function parseProductFinalizeSnapshot(value: unknown): ParsedProductFinalizeSnapshot {
  const record = getRecord(value);

  if (!record) {
    return {
      hasHistoricalReferences: false,
      salesOrderItemCount: 0,
      preDeleteProductSnapshot: null,
      cascadeSkuSnapshot: [],
    };
  }

  return {
    hasHistoricalReferences: getBoolean(record.hasHistoricalReferences),
    salesOrderItemCount: getNumber(record.salesOrderItemCount),
    preDeleteProductSnapshot: getRecord(record.preDeleteProductSnapshot),
    cascadeSkuSnapshot: getArray(record.cascadeSkuSnapshot)
      .map((item) => parseCascadeSkuSnapshot(item))
      .filter((item): item is ProductCascadeSkuSnapshot => Boolean(item)),
  };
}

function parseProductSkuFinalizeSnapshot(value: unknown): ParsedProductSkuFinalizeSnapshot {
  const record = getRecord(value);

  if (!record) {
    return {
      hasHistoricalReferences: false,
      salesOrderItemCount: 0,
      parentProductSnapshot: null,
      preDeleteSkuSnapshot: null,
    };
  }

  return {
    hasHistoricalReferences: getBoolean(record.hasHistoricalReferences),
    salesOrderItemCount: getNumber(record.salesOrderItemCount),
    parentProductSnapshot: getRecord(record.parentProductSnapshot),
    preDeleteSkuSnapshot: getRecord(record.preDeleteSkuSnapshot),
  };
}

function buildProductPreDeleteSnapshot(product: {
  id: string;
  supplierId: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  totalSkuCount?: number;
}) {
  return {
    id: product.id,
    supplierId: product.supplierId,
    code: product.code,
    name: product.name,
    description: product.description,
    enabled: product.enabled,
    totalSkuCount: product.totalSkuCount ?? null,
  };
}

function buildProductSkuPreDeleteSnapshot(sku: {
  id: string;
  productId: string;
  skuName: string;
  defaultUnitPrice: Prisma.Decimal;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: Prisma.Decimal;
  enabled: boolean;
}) {
  return {
    id: sku.id,
    productId: sku.productId,
    skuName: sku.skuName,
    defaultUnitPrice: sku.defaultUnitPrice.toString(),
    codSupported: sku.codSupported,
    insuranceSupported: sku.insuranceSupported,
    defaultInsuranceAmount: sku.defaultInsuranceAmount.toString(),
    enabled: sku.enabled,
  };
}

function buildParentProductSnapshot(product: {
  id: string;
  supplierId: string;
  code: string;
  name: string;
}) {
  return {
    id: product.id,
    supplierId: product.supplierId,
    code: product.code,
    name: product.name,
  };
}

export async function listProductCascadeSkuSnapshot(
  db: RecycleDbClient,
  productId: string,
): Promise<ProductCascadeSkuSnapshot[]> {
  const hiddenProductSkuIds = await findProductDomainCurrentlyHiddenTargetIds(
    db,
    "PRODUCT_SKU",
  );

  const skus = await db.productSku.findMany({
    where: {
      productId,
      ...(hiddenProductSkuIds.length > 0
        ? {
            id: {
              notIn: hiddenProductSkuIds,
            },
          }
        : {}),
    },
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      skuName: true,
      enabled: true,
      _count: {
        select: {
          salesOrderItems: true,
        },
      },
    },
  });

  return skus.map((sku) => ({
    id: sku.id,
    skuName: sku.skuName,
    enabled: sku.enabled,
    salesOrderItemCount: sku._count.salesOrderItems,
    hasHistoricalReferences: sku._count.salesOrderItems > 0,
  }));
}

async function getProductTarget(
  db: RecycleDbClient,
  productId: string,
): Promise<RecycleTargetSnapshot | null> {
  const [product, cascadeSkuSnapshot] = await Promise.all([
    db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        supplierId: true,
        code: true,
        name: true,
        description: true,
        enabled: true,
        _count: {
          select: {
            skus: true,
            salesOrderItems: true,
          },
        },
      },
    }),
    listProductCascadeSkuSnapshot(db, productId),
  ]);

  if (!product) {
    return null;
  }

  const hasHistoricalReferences =
    product._count.salesOrderItems > 0 ||
    cascadeSkuSnapshot.some((sku) => sku.hasHistoricalReferences);
  const guard = buildProductRecycleGuard({
    skuCount: cascadeSkuSnapshot.length,
    salesOrderItemCount: product._count.salesOrderItems,
  });

  return {
    targetType: "PRODUCT",
    targetId: product.id,
    domain: "PRODUCT_MASTER_DATA",
    titleSnapshot: product.name,
    secondarySnapshot: product.code,
    originalStatusSnapshot: product.enabled ? "ENABLED" : "DISABLED",
    restoreRouteSnapshot: `/products/${product.id}`,
    operationModule: OperationModule.PRODUCT,
    operationTargetType: OperationTargetType.PRODUCT,
    operationAction: "product.moved_to_recycle_bin",
    operationDescription: `Moved product to recycle bin: ${product.name}`,
    guard,
    blockerSnapshotJson: {
      hasHistoricalReferences,
      salesOrderItemCount: product._count.salesOrderItems,
      preDeleteProductSnapshot: buildProductPreDeleteSnapshot({
        ...product,
        totalSkuCount: product._count.skus,
      }),
      cascadeSkuSnapshot,
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
    },
  };
}

async function getProductSkuTarget(
  db: RecycleDbClient,
  productSkuId: string,
): Promise<RecycleTargetSnapshot | null> {
  const sku = await db.productSku.findUnique({
    where: { id: productSkuId },
    select: {
      id: true,
      productId: true,
      skuName: true,
      defaultUnitPrice: true,
      codSupported: true,
      insuranceSupported: true,
      defaultInsuranceAmount: true,
      enabled: true,
      product: {
        select: {
          id: true,
          supplierId: true,
          code: true,
          name: true,
        },
      },
      _count: {
        select: {
          salesOrderItems: true,
        },
      },
    },
  });

  if (!sku) {
    return null;
  }

  const guard = buildProductSkuRecycleGuard({
    salesOrderItemCount: sku._count.salesOrderItems,
  });
  const hasHistoricalReferences = sku._count.salesOrderItems > 0;

  return {
    targetType: "PRODUCT_SKU",
    targetId: sku.id,
    domain: "PRODUCT_MASTER_DATA",
    titleSnapshot: sku.skuName,
    secondarySnapshot: sku.skuName,
    originalStatusSnapshot: sku.enabled ? "ENABLED" : "DISABLED",
    restoreRouteSnapshot: `/products/${sku.product.id}`,
    operationModule: OperationModule.PRODUCT,
    operationTargetType: OperationTargetType.PRODUCT_SKU,
    operationAction: "product_sku.moved_to_recycle_bin",
    operationDescription: `Moved product SKU to recycle bin: ${sku.skuName}`,
    guard,
    blockerSnapshotJson: {
      hasHistoricalReferences,
      salesOrderItemCount: sku._count.salesOrderItems,
      parentProductSnapshot: buildParentProductSnapshot(sku.product),
      preDeleteSkuSnapshot: buildProductSkuPreDeleteSnapshot(sku),
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
    },
  };
}

async function getSupplierTarget(
  db: RecycleDbClient,
  supplierId: string,
): Promise<RecycleTargetSnapshot | null> {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      code: true,
      name: true,
      enabled: true,
      _count: {
        select: {
          products: true,
          salesOrders: true,
          shippingTasks: true,
          exportBatches: true,
        },
      },
    },
  });

  if (!supplier) {
    return null;
  }

  const guard = buildSupplierRecycleGuard({
    productCount: supplier._count.products,
    salesOrderCount: supplier._count.salesOrders,
    shippingTaskCount: supplier._count.shippingTasks,
    exportBatchCount: supplier._count.exportBatches,
  });

  return {
    targetType: "SUPPLIER",
    targetId: supplier.id,
    domain: "PRODUCT_MASTER_DATA",
    titleSnapshot: supplier.name,
    secondarySnapshot: supplier.code,
    originalStatusSnapshot: supplier.enabled ? "ENABLED" : "DISABLED",
    restoreRouteSnapshot: "/products?tab=suppliers",
    operationModule: OperationModule.SUPPLIER,
    operationTargetType: OperationTargetType.SUPPLIER,
    operationAction: "supplier.moved_to_recycle_bin",
    operationDescription: `Moved supplier to recycle bin: ${supplier.name}`,
    guard,
    blockerSnapshotJson: {
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
    },
  };
}

export async function getMasterDataRecycleTarget(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
) {
  if (targetType === "PRODUCT") {
    return getProductTarget(db, targetId);
  }

  if (targetType === "PRODUCT_SKU") {
    return getProductSkuTarget(db, targetId);
  }

  if (targetType === "SUPPLIER") {
    return getSupplierTarget(db, targetId);
  }

  return null;
}

function buildRestoreGuard(
  restoreRouteSnapshot: string,
  blockers: RecycleRestoreBlocker[],
): RecycleRestoreGuard {
  return {
    canRestore: blockers.length === 0,
    blockerSummary:
      blockers.length === 0
        ? "可以恢复到原业务域。"
        : blockers[0]?.description ?? "当前对象暂时不能恢复。",
    blockers,
    restoreRouteSnapshot,
  };
}

function buildMissingTargetRestoreGuard(restoreRouteSnapshot: string) {
  return buildRestoreGuard(restoreRouteSnapshot, [
    {
      name: "对象缺失",
      description: "原始对象已不存在，当前不能恢复。",
    },
  ]);
}

function buildPurgeGuard(blockers: RecyclePurgeBlocker[]): RecyclePurgeGuard {
  return {
    canPurge: blockers.length === 0,
    blockerSummary:
      blockers.length === 0
        ? "当前对象可从回收站中永久删除。"
        : blockers[0]?.description ?? "当前对象暂时不能永久删除。",
    blockers,
  };
}

function buildFinalizePreview(input: {
  targetExists: boolean;
  blockers: RecycleFinalizeBlocker[];
  purgeSummary: string;
  archiveSummary: string;
}): RecycleFinalizePreview {
  if (!input.targetExists) {
    return {
      canFinalize: true,
      targetExists: false,
      finalAction: "PURGE",
      finalActionLabel: "可 purge",
      blockerSummary: "原始对象已不存在，回收站条目会按 PURGE 终态收口。",
      blockers: [],
      canEarlyPurge: true,
      earlyPurgeRequiresAdmin: true,
    };
  }

  if (input.blockers.length === 0) {
    return {
      canFinalize: true,
      targetExists: true,
      finalAction: "PURGE",
      finalActionLabel: "可 purge",
      blockerSummary: input.purgeSummary,
      blockers: [],
      canEarlyPurge: true,
      earlyPurgeRequiresAdmin: true,
    };
  }

  return {
    canFinalize: true,
    targetExists: true,
    finalAction: "ARCHIVE",
    finalActionLabel: "仅封存",
    blockerSummary: input.blockers[0]?.description ?? input.archiveSummary,
    blockers: input.blockers,
    canEarlyPurge: false,
    earlyPurgeRequiresAdmin: true,
  };
}

async function buildProductRestoreGuard(
  db: RecycleDbClient,
  productId: string,
  restoreRouteSnapshot: string,
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      supplierId: true,
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!product) {
    return buildMissingTargetRestoreGuard(restoreRouteSnapshot);
  }

  const blockers: RecycleRestoreBlocker[] = [];

  if (!product.supplierId || !product.supplier) {
    blockers.push({
      name: "供应商缺失",
      description: "该商品关联的供应商已不存在，当前不能恢复。",
    });
  } else {
    const activeSupplierEntry = await findActiveRecycleEntry(
      db,
      "SUPPLIER",
      product.supplierId,
    );

    if (activeSupplierEntry) {
      blockers.push({
        name: "供应商仍在回收站",
        description: `关联供应商 ${product.supplier.name} 仍在回收站中，请先恢复供应商。`,
      });
    }
  }

  return buildRestoreGuard(restoreRouteSnapshot, blockers);
}

async function buildProductSkuRestoreGuard(
  db: RecycleDbClient,
  productSkuId: string,
  restoreRouteSnapshot: string,
) {
  const sku = await db.productSku.findUnique({
    where: { id: productSkuId },
    select: {
      id: true,
      productId: true,
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!sku) {
    return buildMissingTargetRestoreGuard(restoreRouteSnapshot);
  }

  const blockers: RecycleRestoreBlocker[] = [];

  if (!sku.productId || !sku.product) {
    blockers.push({
      name: "商品缺失",
      description: "该 SKU 所属商品已不存在，当前不能恢复。",
    });
  } else {
    const activeProductEntry = await findActiveRecycleEntry(
      db,
      "PRODUCT",
      sku.productId,
    );

    if (activeProductEntry) {
      blockers.push({
        name: "商品仍在回收站",
        description: `所属商品 ${sku.product.name} 仍在回收站中，请先恢复商品。`,
      });
    }
  }

  return buildRestoreGuard(restoreRouteSnapshot, blockers);
}

async function buildSupplierRestoreGuard(
  db: RecycleDbClient,
  supplierId: string,
  restoreRouteSnapshot: string,
) {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
    },
  });

  if (!supplier) {
    return buildMissingTargetRestoreGuard(restoreRouteSnapshot);
  }

  return buildRestoreGuard(restoreRouteSnapshot, []);
}

export async function buildMasterDataRestoreGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    restoreRouteSnapshot: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "PRODUCT_MASTER_DATA") {
    return null;
  }

  if (input.targetType === "PRODUCT") {
    return buildProductRestoreGuard(db, input.targetId, input.restoreRouteSnapshot);
  }

  if (input.targetType === "PRODUCT_SKU") {
    return buildProductSkuRestoreGuard(db, input.targetId, input.restoreRouteSnapshot);
  }

  if (input.targetType === "SUPPLIER") {
    return buildSupplierRestoreGuard(db, input.targetId, input.restoreRouteSnapshot);
  }

  return null;
}

async function buildProductPurgeGuard(db: RecycleDbClient, productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      _count: {
        select: {
          skus: true,
          salesOrderItems: true,
        },
      },
    },
  });

  if (!product) {
    return buildPurgeGuard([
      {
        name: "对象缺失",
        description: "原始商品已不存在，当前不能执行永久删除。",
      },
    ]);
  }

  const blockers: RecyclePurgeBlocker[] = [];

  if (product._count.skus > 0) {
    blockers.push({
      name: "SKU 挂载",
      description: `仍有 ${product._count.skus} 个 SKU 挂载在该商品下，当前不能永久删除。`,
    });
  }

  if (product._count.salesOrderItems > 0) {
    blockers.push({
      name: "销售明细引用",
      description: `已被销售明细引用 ${product._count.salesOrderItems} 次，当前不能永久删除。`,
    });
  }

  return buildPurgeGuard(blockers);
}

async function buildProductSkuPurgeGuard(
  db: RecycleDbClient,
  productSkuId: string,
) {
  const sku = await db.productSku.findUnique({
    where: { id: productSkuId },
    select: {
      id: true,
      _count: {
        select: {
          salesOrderItems: true,
        },
      },
    },
  });

  if (!sku) {
    return buildPurgeGuard([
      {
        name: "对象缺失",
        description: "原始 SKU 已不存在，当前不能执行永久删除。",
      },
    ]);
  }

  const blockers: RecyclePurgeBlocker[] = [];

  if (sku._count.salesOrderItems > 0) {
    blockers.push({
      name: "销售明细引用",
      description: `已被销售明细引用 ${sku._count.salesOrderItems} 次，当前不能永久删除。`,
    });
  }

  return buildPurgeGuard(blockers);
}

async function buildSupplierPurgeGuard(db: RecycleDbClient, supplierId: string) {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      _count: {
        select: {
          products: true,
          salesOrders: true,
          shippingTasks: true,
          exportBatches: true,
        },
      },
    },
  });

  if (!supplier) {
    return buildPurgeGuard([
      {
        name: "对象缺失",
        description: "原始供应商已不存在，当前不能执行永久删除。",
      },
    ]);
  }

  const blockers: RecyclePurgeBlocker[] = [];

  if (supplier._count.products > 0) {
    blockers.push({
      name: "商品挂载",
      description: `仍有 ${supplier._count.products} 个商品挂载在该供应商下，当前不能永久删除。`,
    });
  }

  if (supplier._count.salesOrders > 0) {
    blockers.push({
      name: "销售子单引用",
      description: `已被销售子单引用 ${supplier._count.salesOrders} 次，当前不能永久删除。`,
    });
  }

  if (supplier._count.shippingTasks > 0) {
    blockers.push({
      name: "履约任务引用",
      description: `已被履约任务引用 ${supplier._count.shippingTasks} 次，当前不能永久删除。`,
    });
  }

  if (supplier._count.exportBatches > 0) {
    blockers.push({
      name: "导出批次引用",
      description: `已被导出批次引用 ${supplier._count.exportBatches} 次，当前不能永久删除。`,
    });
  }

  return buildPurgeGuard(blockers);
}

export async function buildMasterDataPurgeGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "PRODUCT_MASTER_DATA") {
    return null;
  }

  if (input.targetType === "PRODUCT") {
    return buildProductPurgeGuard(db, input.targetId);
  }

  if (input.targetType === "PRODUCT_SKU") {
    return buildProductSkuPurgeGuard(db, input.targetId);
  }

  if (input.targetType === "SUPPLIER") {
    return buildSupplierPurgeGuard(db, input.targetId);
  }

  return null;
}

export async function buildProductFinalizePreview(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "PRODUCT_MASTER_DATA" || input.targetType !== "PRODUCT") {
    return null;
  }

  const [product, activeEntry] = await Promise.all([
    db.product.findUnique({
      where: { id: input.targetId },
      select: {
        id: true,
        _count: {
          select: {
            skus: true,
            salesOrderItems: true,
          },
        },
      },
    }),
    findActiveRecycleEntry(db, "PRODUCT", input.targetId),
  ]);

  const snapshot = parseProductFinalizeSnapshot(activeEntry?.blockerSnapshotJson);

  if (!product) {
    return buildFinalizePreview({
      targetExists: false,
      blockers: [],
      purgeSummary: "",
      archiveSummary: "",
    });
  }

  const hasHistoricalReferences =
    snapshot.hasHistoricalReferences || product._count.salesOrderItems > 0;
  const cascadeSkuCount = Math.max(
    snapshot.cascadeSkuSnapshot.length,
    product._count.skus,
  );
  const blockers: RecycleFinalizeBlocker[] = [];

  if (hasHistoricalReferences) {
    blockers.push({
      code: "product_historical_references",
      name: "销售明细引用",
      description: `删除前商品已被销售明细引用 ${Math.max(snapshot.salesOrderItemCount, product._count.salesOrderItems)} 次，finalize 只能 ARCHIVE 保留历史锚点。`,
      suggestedAction: "保留 archive 结果，不改历史订单、成交单和履约单快照。",
    });
  }

  if (cascadeSkuCount > 0) {
    blockers.push({
      code: "product_aggregate_retention",
      name: "SKU 挂载",
      description: `删除前商品下存在 ${cascadeSkuCount} 个 SKU，商品作为聚合根仍有保留意义，本轮 finalize 只 ARCHIVE，不做复杂级联 purge。`,
      suggestedAction: "如需清理轻对象，优先在 SKU 层分别完成 finalize。",
    });
  }

  return buildFinalizePreview({
    targetExists: true,
    blockers,
    purgeSummary: "当前商品满足轻对象条件，可直接执行 PURGE。",
    archiveSummary: "当前商品存在历史引用或商品聚合保留意义，仅 ARCHIVE。",
  });
}

export async function buildProductSkuFinalizePreview(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "PRODUCT_MASTER_DATA" || input.targetType !== "PRODUCT_SKU") {
    return null;
  }

  const [sku, activeEntry] = await Promise.all([
    db.productSku.findUnique({
      where: { id: input.targetId },
      select: {
        id: true,
        _count: {
          select: {
            salesOrderItems: true,
          },
        },
      },
    }),
    findActiveRecycleEntry(db, "PRODUCT_SKU", input.targetId),
  ]);

  const snapshot = parseProductSkuFinalizeSnapshot(activeEntry?.blockerSnapshotJson);

  if (!sku) {
    return buildFinalizePreview({
      targetExists: false,
      blockers: [],
      purgeSummary: "",
      archiveSummary: "",
    });
  }

  const salesOrderItemCount = Math.max(
    snapshot.salesOrderItemCount,
    sku._count.salesOrderItems,
  );
  const blockers: RecycleFinalizeBlocker[] =
    snapshot.hasHistoricalReferences || sku._count.salesOrderItems > 0
      ? [
          {
            code: "product_sku_historical_references",
            name: "销售明细引用",
            description: `删除前 SKU 已被销售明细引用 ${salesOrderItemCount} 次，finalize 只能 ARCHIVE 保留历史锚点。`,
            suggestedAction: "保留 archive 结果，不改历史订单、成交单和履约单快照。",
          },
        ]
      : [];

  return buildFinalizePreview({
    targetExists: true,
    blockers,
    purgeSummary: "当前 SKU 满足轻对象条件，可直接执行 PURGE。",
    archiveSummary: "当前 SKU 已进入历史业务引用链，仅 ARCHIVE。",
  });
}

export async function buildMasterDataFinalizePreview(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "PRODUCT_MASTER_DATA") {
    return null;
  }

  if (input.targetType === "PRODUCT") {
    return buildProductFinalizePreview(db, input);
  }

  if (input.targetType === "PRODUCT_SKU") {
    return buildProductSkuFinalizePreview(db, input);
  }

  return null;
}

function buildProductArchiveSnapshot(input: {
  targetId: string;
  targetMissing: boolean;
  product: {
    id: string;
    supplierId: string;
    code: string;
    name: string;
    enabled: boolean;
  } | null;
  snapshot: ParsedProductFinalizeSnapshot;
}): ProductRecycleArchiveSnapshot {
  const preDeleteProductSnapshot = input.snapshot.preDeleteProductSnapshot;

  return {
    entity: "PRODUCT",
    snapshotVersion: RECYCLE_ARCHIVE_SNAPSHOT_VERSION,
    finalAction: "ARCHIVE",
    objectWeight: "HEAVY",
    targetMissing: input.targetMissing,
    productId:
      getString(preDeleteProductSnapshot?.id) ?? input.product?.id ?? input.targetId,
    supplierId:
      getString(preDeleteProductSnapshot?.supplierId) ?? input.product?.supplierId ?? null,
    productCode:
      getString(preDeleteProductSnapshot?.code) ?? input.product?.code ?? null,
    productName:
      getString(preDeleteProductSnapshot?.name) ?? input.product?.name ?? null,
    enabled:
      preDeleteProductSnapshot?.enabled === undefined
        ? (input.product?.enabled ?? false)
        : getBoolean(preDeleteProductSnapshot.enabled),
    hasHistoricalReferences: input.snapshot.hasHistoricalReferences,
    salesOrderItemCount: input.snapshot.salesOrderItemCount,
    preDeleteProductSnapshot,
    cascadeSkuSnapshot: input.snapshot.cascadeSkuSnapshot.map((sku) => ({
      id: sku.id,
      skuName: sku.skuName,
      enabled: sku.enabled,
      salesOrderItemCount: sku.salesOrderItemCount,
      hasHistoricalReferences: sku.hasHistoricalReferences,
    })),
  };
}

function buildProductSkuArchiveSnapshot(input: {
  targetId: string;
  targetMissing: boolean;
  sku: {
    id: string;
    productId: string;
    skuName: string;
    enabled: boolean;
    product: {
      supplierId: string;
    };
  } | null;
  snapshot: ParsedProductSkuFinalizeSnapshot;
}): ProductSkuRecycleArchiveSnapshot {
  const parentProductSnapshot = input.snapshot.parentProductSnapshot;
  const preDeleteSkuSnapshot = input.snapshot.preDeleteSkuSnapshot;

  return {
    entity: "PRODUCT_SKU",
    snapshotVersion: RECYCLE_ARCHIVE_SNAPSHOT_VERSION,
    finalAction: "ARCHIVE",
    objectWeight: "HEAVY",
    targetMissing: input.targetMissing,
    productSkuId: getString(preDeleteSkuSnapshot?.id) ?? input.sku?.id ?? input.targetId,
    productId:
      getString(preDeleteSkuSnapshot?.productId) ??
      getString(parentProductSnapshot?.id) ??
      input.sku?.productId ??
      null,
    supplierId:
      getString(parentProductSnapshot?.supplierId) ??
      input.sku?.product.supplierId ??
      null,
    skuName: getString(preDeleteSkuSnapshot?.skuName) ?? input.sku?.skuName ?? null,
    enabled:
      preDeleteSkuSnapshot?.enabled === undefined
        ? (input.sku?.enabled ?? false)
        : getBoolean(preDeleteSkuSnapshot.enabled),
    hasHistoricalReferences: input.snapshot.hasHistoricalReferences,
    salesOrderItemCount: input.snapshot.salesOrderItemCount,
    parentProductSnapshot,
    preDeleteSkuSnapshot,
  };
}

export async function archiveProductTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    preview: RecycleFinalizePreview;
  },
): Promise<RecycleArchivePayload | null> {
  if (input.targetType !== "PRODUCT") {
    return null;
  }

  const [product, activeEntry] = await Promise.all([
    db.product.findUnique({
      where: { id: input.targetId },
      select: {
        id: true,
        supplierId: true,
        code: true,
        name: true,
        enabled: true,
      },
    }),
    findActiveRecycleEntry(db, "PRODUCT", input.targetId),
  ]);

  const snapshot = parseProductFinalizeSnapshot(activeEntry?.blockerSnapshotJson);

  return {
    finalAction: "ARCHIVE",
    archivedAt: new Date().toISOString(),
    blockerSummary: input.preview.blockerSummary,
    blockers: input.preview.blockers,
    snapshot: buildProductArchiveSnapshot({
      targetId: input.targetId,
      targetMissing: !product,
      product,
      snapshot,
    }),
  };
}

export async function archiveProductSkuTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    preview: RecycleFinalizePreview;
  },
): Promise<RecycleArchivePayload | null> {
  if (input.targetType !== "PRODUCT_SKU") {
    return null;
  }

  const [sku, activeEntry] = await Promise.all([
    db.productSku.findUnique({
      where: { id: input.targetId },
      select: {
        id: true,
        productId: true,
        skuName: true,
        enabled: true,
        product: {
          select: {
            supplierId: true,
          },
        },
      },
    }),
    findActiveRecycleEntry(db, "PRODUCT_SKU", input.targetId),
  ]);

  const snapshot = parseProductSkuFinalizeSnapshot(activeEntry?.blockerSnapshotJson);

  return {
    finalAction: "ARCHIVE",
    archivedAt: new Date().toISOString(),
    blockerSummary: input.preview.blockerSummary,
    blockers: input.preview.blockers,
    snapshot: buildProductSkuArchiveSnapshot({
      targetId: input.targetId,
      targetMissing: !sku,
      sku,
      snapshot,
    }),
  };
}

export async function archiveMasterDataTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    preview: RecycleFinalizePreview;
  },
): Promise<RecycleArchivePayload | null> {
  if (input.targetType === "PRODUCT") {
    return archiveProductTarget(db, input);
  }

  if (input.targetType === "PRODUCT_SKU") {
    return archiveProductSkuTarget(db, input);
  }

  return null;
}

export async function purgeMasterDataTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
  },
) {
  if (input.targetType === "PRODUCT") {
    await db.product.delete({
      where: { id: input.targetId },
    });
    return true;
  }

  if (input.targetType === "PRODUCT_SKU") {
    await db.productSku.delete({
      where: { id: input.targetId },
    });
    return true;
  }

  if (input.targetType === "SUPPLIER") {
    await db.supplier.delete({
      where: { id: input.targetId },
    });
    return true;
  }

  return false;
}
