import { Prisma, type RoleCode } from "@prisma/client";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import { canAccessProductModule } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  buildProductRecycleGuard,
  buildProductSkuRecycleGuard,
} from "@/lib/products/recycle-guards";

type SearchParamsValue = string | string[] | undefined;

export type ProductViewer = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

export async function getProductsPageData(
  viewer: ProductViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessProductModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("You do not have access to the product center.");
  }

  const keyword = getParamValue(rawSearchParams?.q).trim();
  const supplierId = getParamValue(rawSearchParams?.supplierId);
  const status = getParamValue(rawSearchParams?.status);
  const category = getParamValue(rawSearchParams?.category);

  const filters: Prisma.ProductWhereInput[] = [];

  if (supplierId) {
    filters.push({ supplierId });
  }

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
        { description: { contains: keyword } },
        { supplier: { name: { contains: keyword } } },
        { supplier: { code: { contains: keyword } } },
        {
          skus: {
            some: {
              OR: [
                { skuCode: { contains: keyword } },
                { skuName: { contains: keyword } },
                { specText: { contains: keyword } },
              ],
            },
          },
        },
      ],
    });
  }

  const where: Prisma.ProductWhereInput = filters.length > 0 ? { AND: filters } : {};

  const [rawItems, suppliers] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
            enabled: true,
          },
        },
        _count: {
          select: {
            skus: true,
            salesOrderItems: true,
          },
        },
      },
    }),
    prisma.supplier.findMany({
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        enabled: true,
      },
    }),
  ]);

  const items = rawItems.map((item) => ({
    ...item,
    recycleGuard: buildProductRecycleGuard({
      skuCount: item._count.skus,
      salesOrderItemCount: item._count.salesOrderItems,
    }),
  }));

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: {
      q: keyword,
      status,
      category,
      supplierId,
    },
    items,
    suppliers,
  };
}

export async function getProductDetail(
  viewer: ProductViewer,
  productId: string,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessProductModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("You do not have access to the product center.");
  }

  const [rawProduct, suppliers] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        supplierId: true,
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
            enabled: true,
          },
        },
        skus: {
          orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            skuCode: true,
            skuName: true,
            specText: true,
            unit: true,
            defaultUnitPrice: true,
            codSupported: true,
            insuranceSupported: true,
            defaultInsuranceAmount: true,
            enabled: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                salesOrderItems: true,
              },
            },
          },
        },
        _count: {
          select: {
            skus: true,
            salesOrderItems: true,
          },
        },
      },
    }),
    prisma.supplier.findMany({
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        enabled: true,
      },
    }),
  ]);

  const product = rawProduct
    ? {
        ...rawProduct,
        recycleGuard: buildProductRecycleGuard({
          skuCount: rawProduct._count.skus,
          salesOrderItemCount: rawProduct._count.salesOrderItems,
        }),
        skus: rawProduct.skus.map((sku) => ({
          ...sku,
          recycleGuard: buildProductSkuRecycleGuard({
            salesOrderItemCount: sku._count.salesOrderItems,
          }),
        })),
      }
    : null;

  return {
    notice: parseActionNotice(rawSearchParams),
    product,
    suppliers,
  };
}
