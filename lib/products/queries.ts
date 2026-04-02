import type { RoleCode } from "@prisma/client";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import { canAccessProductModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type ProductViewer = {
  id: string;
  role: RoleCode;
};

export async function getProductsPageData(
  viewer: ProductViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessProductModule(viewer.role)) {
    throw new Error("当前角色无权访问商品中心。");
  }

  const supplierId = getParamValue(rawSearchParams?.supplierId);
  const where = supplierId ? { supplierId } : {};

  const [items, suppliers] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        enabled: true,
        createdAt: true,
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
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
      where: { enabled: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
      },
    }),
  ]);

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: { supplierId },
    items,
    suppliers,
  };
}

export async function getProductDetail(
  viewer: ProductViewer,
  productId: string,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessProductModule(viewer.role)) {
    throw new Error("当前角色无权访问商品中心。");
  }

  const [product, suppliers] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        enabled: true,
        supplierId: true,
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        skus: {
          orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
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
            _count: {
              select: {
                salesOrderItems: true,
              },
            },
          },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
      },
    }),
  ]);

  return {
    notice: parseActionNotice(rawSearchParams),
    product,
    suppliers,
  };
}
