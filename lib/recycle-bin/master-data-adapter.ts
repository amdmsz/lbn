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
import { findActiveRecycleEntry } from "@/lib/recycle-bin/repository";
import type {
  RecyclePurgeBlocker,
  RecyclePurgeGuard,
  RecycleRestoreBlocker,
  RecycleRestoreGuard,
  RecycleTargetSnapshot,
} from "@/lib/recycle-bin/types";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

async function getProductTarget(
  db: RecycleDbClient,
  productId: string,
): Promise<RecycleTargetSnapshot | null> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      code: true,
      name: true,
      enabled: true,
      _count: {
        select: {
          skus: true,
          salesOrderItems: true,
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const guard = buildProductRecycleGuard({
    skuCount: product._count.skus,
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
      skuCode: true,
      skuName: true,
      enabled: true,
      product: {
        select: {
          id: true,
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

  return {
    targetType: "PRODUCT_SKU",
    targetId: sku.id,
    domain: "PRODUCT_MASTER_DATA",
    titleSnapshot: sku.skuName,
    secondarySnapshot: sku.skuCode,
    originalStatusSnapshot: sku.enabled ? "ENABLED" : "DISABLED",
    restoreRouteSnapshot: `/products/${sku.product.id}`,
    operationModule: OperationModule.PRODUCT,
    operationTargetType: OperationTargetType.PRODUCT_SKU,
    operationAction: "product_sku.moved_to_recycle_bin",
    operationDescription: `Moved product SKU to recycle bin: ${sku.skuName}`,
    guard,
    blockerSnapshotJson: {
      parentProductName: sku.product.name,
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
