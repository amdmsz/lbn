import { Prisma, type RoleCode } from "@prisma/client";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import { canAccessSupplierModule } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { buildSupplierRecycleGuard } from "@/lib/products/recycle-guards";
import { findActiveTargetIds } from "@/lib/recycle-bin/repository";

type SearchParamsValue = string | string[] | undefined;

export type SupplierViewer = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

function getLatestDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

export async function getSuppliersPageData(
  viewer: SupplierViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessSupplierModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("You do not have access to supplier management.");
  }

  const keyword = getParamValue(rawSearchParams?.supplierQ).trim();
  const status = getParamValue(rawSearchParams?.supplierStatus);
  const filters: Prisma.SupplierWhereInput[] = [];

  if (status === "enabled") {
    filters.push({ enabled: true });
  }

  if (status === "disabled") {
    filters.push({ enabled: false });
  }

  if (keyword) {
    filters.push({
      OR: [
        { code: { contains: keyword } },
        { name: { contains: keyword } },
        { contactName: { contains: keyword } },
        { contactPhone: { contains: keyword } },
        { remark: { contains: keyword } },
      ],
    });
  }

  const activeSupplierIds = await findActiveTargetIds(prisma, "SUPPLIER");

  // Phase 1 KISS approach: exclude active recycle targets via notIn(activeIds).
  // If the active-id set grows large later, replace this with anti-join / exists.
  if (activeSupplierIds.length > 0) {
    filters.push({
      id: {
        notIn: activeSupplierIds,
      },
    });
  }

  const where: Prisma.SupplierWhereInput = filters.length > 0 ? { AND: filters } : {};

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      contactName: true,
      contactPhone: true,
      remark: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      products: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: {
          updatedAt: true,
        },
      },
      salesOrders: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
        },
      },
      shippingTasks: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
        },
      },
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

  const items = suppliers.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    remark: item.remark,
    enabled: item.enabled,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastUsedAt: getLatestDate([
      item.products[0]?.updatedAt,
      item.salesOrders[0]?.createdAt,
      item.shippingTasks[0]?.createdAt,
    ]),
    _count: item._count,
    recycleGuard: buildSupplierRecycleGuard({
      productCount: item._count.products,
      salesOrderCount: item._count.salesOrders,
      shippingTaskCount: item._count.shippingTasks,
      exportBatchCount: item._count.exportBatches,
    }),
  }));

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: {
      supplierQ: keyword,
      supplierStatus: status,
    },
    items,
  };
}
