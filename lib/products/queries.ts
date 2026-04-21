import { Prisma, type RoleCode } from "@prisma/client";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import {
  canAccessProductModule,
  canManageProducts,
  canViewProductFinanceCategory,
  canViewProductSupplyGroup,
  canViewProductSupplyIdentity,
} from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  PRODUCT_CENTER_DICTIONARY_TYPES,
  PRODUCT_CENTER_EMPTY_FILTERS,
  type ProductCenterDictionaryOption,
  type ProductCenterFilters,
  type ProductSystemViewPreset,
} from "@/lib/products/metadata";
import {
  buildProductRecycleGuard,
  buildProductSkuRecycleGuard,
} from "@/lib/products/recycle-guards";
import {
  findProductDomainCurrentlyHiddenEntry,
  findProductDomainCurrentlyHiddenTargetIds,
} from "@/lib/products/recycle";
import { listProductSavedViews } from "@/lib/products/views";

type SearchParamsValue = string | string[] | undefined;

export type ProductViewer = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

const PRODUCT_CENTER_PAGE_SIZE = 25;

type SupplierOption = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
};

function parsePage(rawValue: string) {
  const rawPage = Number(rawValue || "1");
  return Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
}

function getWorkspaceSearchState(
  viewer: ProductViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  const canSeeSupplierIdentity = canViewProductSupplyIdentity(
    viewer.role,
    viewer.permissionCodes,
  );
  const canSeeSupplyGroup = canViewProductSupplyGroup(
    viewer.role,
    viewer.permissionCodes,
  );
  const canSeeFinanceCategory = canViewProductFinanceCategory(
    viewer.role,
    viewer.permissionCodes,
  );

  return {
    q: getParamValue(rawSearchParams?.q).trim(),
    status: getParamValue(rawSearchParams?.status).trim(),
    supplierId: canSeeSupplierIdentity ? getParamValue(rawSearchParams?.supplierId).trim() : "",
    brandName: getParamValue(rawSearchParams?.brandName).trim(),
    seriesName: getParamValue(rawSearchParams?.seriesName).trim(),
    categoryCode: getParamValue(rawSearchParams?.categoryCode).trim(),
    primarySalesSceneCode: getParamValue(rawSearchParams?.primarySalesSceneCode).trim(),
    supplyGroupCode: canSeeSupplyGroup
      ? getParamValue(rawSearchParams?.supplyGroupCode).trim()
      : "",
    financeCategoryCode: canSeeFinanceCategory
      ? getParamValue(rawSearchParams?.financeCategoryCode).trim()
      : "",
    preset: getParamValue(rawSearchParams?.preset).trim(),
    savedViewId: getParamValue(rawSearchParams?.savedViewId).trim(),
    page: parsePage(getParamValue(rawSearchParams?.page)),
    canSeeSupplierIdentity,
    canSeeSupplyGroup,
    canSeeFinanceCategory,
    canManageProductData: canManageProducts(viewer.role, viewer.permissionCodes),
  };
}

async function getSupplierOptions(canSeeSupplierIdentity: boolean) {
  if (!canSeeSupplierIdentity) {
    return [] as SupplierOption[];
  }

  const hiddenSupplierIds = await findProductDomainCurrentlyHiddenTargetIds(
    prisma,
    "SUPPLIER",
  );

  return prisma.supplier.findMany({
    where:
      hiddenSupplierIds.length > 0
        ? {
            id: {
              notIn: hiddenSupplierIds,
            },
          }
        : undefined,
    orderBy: [{ enabled: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      enabled: true,
    },
  });
}

async function getDictionaryOptions(
  dictionaryTypeCode: string,
): Promise<ProductCenterDictionaryOption[]> {
  const items = await prisma.dictionaryItem.findMany({
    where: {
      type: {
        code: dictionaryTypeCode,
      },
    },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      code: true,
      label: true,
      description: true,
      isActive: true,
    },
  });

  return items.map((item) => ({
    code: item.code,
    label: item.label,
    description: item.description,
    isActive: item.isActive,
  }));
}

function buildProductPresetWhereInput(preset: string): Prisma.ProductWhereInput | null {
  switch (preset as ProductSystemViewPreset) {
    case "missing_brand":
      return {
        OR: [{ brandName: null }, { brandName: "" }],
      };
    case "missing_category":
      return {
        OR: [{ categoryCode: null }, { categoryCode: "" }],
      };
    case "missing_sku_default_price":
      return {
        skus: {
          some: {
            defaultUnitPrice: {
              lte: 0,
            },
          },
        },
      };
    case "missing_supply_group":
      return {
        OR: [{ supplyGroupCode: null }, { supplyGroupCode: "" }],
      };
    default:
      return null;
  }
}

function buildProductSkuPresetWhereInput(preset: string): Prisma.ProductSkuWhereInput | null {
  switch (preset as ProductSystemViewPreset) {
    case "missing_brand":
      return {
        product: {
          is: {
            OR: [{ brandName: null }, { brandName: "" }],
          },
        },
      };
    case "missing_category":
      return {
        product: {
          is: {
            OR: [{ categoryCode: null }, { categoryCode: "" }],
          },
        },
      };
    case "missing_sku_default_price":
      return {
        defaultUnitPrice: {
          lte: 0,
        },
      };
    case "missing_supply_group":
      return {
        product: {
          is: {
            OR: [{ supplyGroupCode: null }, { supplyGroupCode: "" }],
          },
        },
      };
    default:
      return null;
  }
}

function buildProductWhereInput(input: ProductCenterFilters & {
  canSeeSupplierIdentity: boolean;
  hiddenProductIds?: string[];
}) {
  const filters: Prisma.ProductWhereInput[] = [];

  if (input.supplierId) {
    filters.push({ supplierId: input.supplierId });
  }

  if (input.status === "enabled") {
    filters.push({ enabled: true });
  }

  if (input.status === "disabled") {
    filters.push({ enabled: false });
  }

  if (input.brandName) {
    filters.push({
      brandName: {
        contains: input.brandName,
      },
    });
  }

  if (input.seriesName) {
    filters.push({
      seriesName: {
        contains: input.seriesName,
      },
    });
  }

  if (input.categoryCode) {
    filters.push({
      categoryCode: input.categoryCode,
    });
  }

  if (input.primarySalesSceneCode) {
    filters.push({
      primarySalesSceneCode: input.primarySalesSceneCode,
    });
  }

  if (input.supplyGroupCode) {
    filters.push({
      supplyGroupCode: input.supplyGroupCode,
    });
  }

  if (input.financeCategoryCode) {
    filters.push({
      financeCategoryCode: input.financeCategoryCode,
    });
  }

  if (input.preset) {
    const presetWhere = buildProductPresetWhereInput(input.preset);
    if (presetWhere) {
      filters.push(presetWhere);
    }
  }

  if (input.q) {
    filters.push({
      OR: [
        { code: { contains: input.q } },
        { name: { contains: input.q } },
        { brandName: { contains: input.q } },
        { seriesName: { contains: input.q } },
        { description: { contains: input.q } },
        ...(input.canSeeSupplierIdentity
          ? [
              { supplier: { name: { contains: input.q } } },
              { supplier: { code: { contains: input.q } } },
            ]
          : []),
        {
          skus: {
            some: {
              OR: [
                { skuName: { contains: input.q } },
              ],
            },
          },
        },
      ],
    });
  }

  if (input.hiddenProductIds && input.hiddenProductIds.length > 0) {
    filters.push({
      id: {
        notIn: input.hiddenProductIds,
      },
    });
  }

  return filters.length > 0 ? { AND: filters } : {};
}

function buildProductSkuWhereInput(input: ProductCenterFilters & {
  canSeeSupplierIdentity: boolean;
  hiddenProductSkuIds?: string[];
  hiddenProductIds?: string[];
}) {
  const filters: Prisma.ProductSkuWhereInput[] = [];

  if (input.supplierId) {
    filters.push({
      product: {
        is: {
          supplierId: input.supplierId,
        },
      },
    });
  }

  if (input.status === "enabled") {
    filters.push({ enabled: true });
  }

  if (input.status === "disabled") {
    filters.push({ enabled: false });
  }

  if (input.brandName) {
    filters.push({
      product: {
        is: {
          brandName: {
            contains: input.brandName,
          },
        },
      },
    });
  }

  if (input.seriesName) {
    filters.push({
      product: {
        is: {
          seriesName: {
            contains: input.seriesName,
          },
        },
      },
    });
  }

  if (input.categoryCode) {
    filters.push({
      product: {
        is: {
          categoryCode: input.categoryCode,
        },
      },
    });
  }

  if (input.primarySalesSceneCode) {
    filters.push({
      product: {
        is: {
          primarySalesSceneCode: input.primarySalesSceneCode,
        },
      },
    });
  }

  if (input.supplyGroupCode) {
    filters.push({
      product: {
        is: {
          supplyGroupCode: input.supplyGroupCode,
        },
      },
    });
  }

  if (input.financeCategoryCode) {
    filters.push({
      product: {
        is: {
          financeCategoryCode: input.financeCategoryCode,
        },
      },
    });
  }

  if (input.preset) {
    const presetWhere = buildProductSkuPresetWhereInput(input.preset);
    if (presetWhere) {
      filters.push(presetWhere);
    }
  }

  if (input.q) {
    filters.push({
      OR: [
        { skuName: { contains: input.q } },
        { product: { is: { name: { contains: input.q } } } },
        { product: { is: { code: { contains: input.q } } } },
        { product: { is: { brandName: { contains: input.q } } } },
        { product: { is: { seriesName: { contains: input.q } } } },
        ...(input.canSeeSupplierIdentity
          ? [
              {
                product: {
                  is: {
                    supplier: {
                      name: { contains: input.q },
                    },
                  },
                },
              },
              {
                product: {
                  is: {
                    supplier: {
                      code: { contains: input.q },
                    },
                  },
                },
              },
            ]
          : []),
      ],
    });
  }

  if (input.hiddenProductSkuIds && input.hiddenProductSkuIds.length > 0) {
    filters.push({
      id: {
        notIn: input.hiddenProductSkuIds,
      },
    });
  }

  if (input.hiddenProductIds && input.hiddenProductIds.length > 0) {
    filters.push({
      productId: {
        notIn: input.hiddenProductIds,
      },
    });
  }

  return filters.length > 0 ? { AND: filters } : {};
}

function buildListFilters(input: ProductCenterFilters): ProductCenterFilters {
  return {
    ...PRODUCT_CENTER_EMPTY_FILTERS,
    ...input,
  };
}

function serializeProductSkuDecimals<
  TSku extends {
    defaultUnitPrice: Prisma.Decimal;
    defaultInsuranceAmount: Prisma.Decimal;
  },
>(sku: TSku) {
  return {
    ...sku,
    defaultUnitPrice: sku.defaultUnitPrice.toString(),
    defaultInsuranceAmount: sku.defaultInsuranceAmount.toString(),
  };
}

export async function getProductCenterMeta(viewer: ProductViewer) {
  if (!canAccessProductModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("You do not have access to the product center.");
  }

  const [savedViews, categoryOptions, primarySalesSceneOptions, supplyGroupOptions, financeCategoryOptions] =
    await Promise.all([
      listProductSavedViews(viewer),
      getDictionaryOptions(PRODUCT_CENTER_DICTIONARY_TYPES.category),
      getDictionaryOptions(PRODUCT_CENTER_DICTIONARY_TYPES.primarySalesScene),
      getDictionaryOptions(PRODUCT_CENTER_DICTIONARY_TYPES.supplyGroup),
      getDictionaryOptions(PRODUCT_CENTER_DICTIONARY_TYPES.financeCategory),
    ]);

  return {
    savedViews,
    dictionaries: {
      categoryOptions,
      primarySalesSceneOptions,
      supplyGroupOptions,
      financeCategoryOptions,
    },
  };
}

export async function getProductsPageData(
  viewer: ProductViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessProductModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("You do not have access to the product center.");
  }

  const state = getWorkspaceSearchState(viewer, rawSearchParams);
  const [hiddenProductIds, hiddenProductSkuIds] = await Promise.all([
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT_SKU"),
  ]);
  const where = buildProductWhereInput({
    ...state,
    hiddenProductIds,
  });

  const [suppliers, totalCount, enabledCount, skuCount, salesOrderItemCount] =
    await Promise.all([
      getSupplierOptions(state.canSeeSupplierIdentity),
      prisma.product.count({ where }),
      prisma.product.count({
        where: {
          AND: [where, { enabled: true }],
        },
      }),
      prisma.productSku.count({
        where: {
          product: {
            is: where,
          },
        },
      }),
      prisma.salesOrderItem.count({
        where: {
          product: {
            is: where,
          },
        },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCT_CENTER_PAGE_SIZE));
  const page = Math.min(state.page, totalPages);

  const rawItems = await prisma.product.findMany({
    where,
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PRODUCT_CENTER_PAGE_SIZE,
    take: PRODUCT_CENTER_PAGE_SIZE,
    select: {
      id: true,
      code: true,
      name: true,
      mainImagePath: true,
      brandName: true,
      seriesName: true,
      categoryCode: true,
      primarySalesSceneCode: true,
      supplyGroupCode: true,
      financeCategoryCode: true,
      description: true,
      internalSupplyRemark: true,
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
      skus:
        hiddenProductSkuIds.length > 0
          ? {
              where: {
                id: {
                  notIn: hiddenProductSkuIds,
                },
              },
              orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
              select: {
                id: true,
                skuName: true,
                defaultUnitPrice: true,
                defaultInsuranceAmount: true,
                enabled: true,
                updatedAt: true,
                _count: {
                  select: {
                    salesOrderItems: true,
                  },
                },
              },
            }
          : {
              orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
              select: {
                id: true,
                skuName: true,
                defaultUnitPrice: true,
                defaultInsuranceAmount: true,
                enabled: true,
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
          salesOrderItems: true,
        },
      },
    },
  });

  const items = rawItems.map((item) => ({
    ...item,
    skus: item.skus.map((sku) => serializeProductSkuDecimals(sku)),
    _count: {
      ...item._count,
      skus: item.skus.length,
    },
    supplyGroupCode: state.canSeeSupplyGroup ? item.supplyGroupCode : null,
    financeCategoryCode: state.canSeeFinanceCategory ? item.financeCategoryCode : null,
    supplier: state.canSeeSupplierIdentity ? item.supplier : null,
    recycleGuard: buildProductRecycleGuard({
      skuCount: item.skus.length,
      salesOrderItemCount: item._count.salesOrderItems,
    }),
  }));

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: buildListFilters({
      ...state,
      page,
    }),
    summary: {
      totalCount,
      enabledCount,
      skuCount,
      salesOrderItemCount,
    },
    items,
    suppliers,
    pagination: {
      page,
      pageSize: PRODUCT_CENTER_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export async function getProductSkusPageData(
  viewer: ProductViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessProductModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("You do not have access to the product center.");
  }

  const state = getWorkspaceSearchState(viewer, rawSearchParams);
  const [hiddenProductSkuIds, hiddenProductIds] = await Promise.all([
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT_SKU"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT"),
  ]);
  const where = buildProductSkuWhereInput({
    ...state,
    hiddenProductSkuIds,
    hiddenProductIds,
  });

  const [suppliers, totalCount, enabledCount, coveredProducts, salesOrderItemCount] =
    await Promise.all([
      getSupplierOptions(state.canSeeSupplierIdentity),
      prisma.productSku.count({ where }),
      prisma.productSku.count({
        where: {
          AND: [where, { enabled: true }],
        },
      }),
      prisma.productSku.findMany({
        where,
        distinct: ["productId"],
        select: {
          productId: true,
        },
      }),
      prisma.salesOrderItem.count({
        where: {
          sku: {
            is: where,
          },
        },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCT_CENTER_PAGE_SIZE));
  const page = Math.min(state.page, totalPages);

  const rawItems = await prisma.productSku.findMany({
    where,
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PRODUCT_CENTER_PAGE_SIZE,
    take: PRODUCT_CENTER_PAGE_SIZE,
    select: {
      id: true,
      skuName: true,
      defaultUnitPrice: true,
      codSupported: true,
      insuranceSupported: true,
      defaultInsuranceAmount: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      product: {
      select: {
        id: true,
        code: true,
        name: true,
        mainImagePath: true,
        brandName: true,
        seriesName: true,
          categoryCode: true,
          primarySalesSceneCode: true,
          supplyGroupCode: true,
          financeCategoryCode: true,
          enabled: true,
          supplier: {
            select: {
              id: true,
              name: true,
              code: true,
              enabled: true,
            },
          },
        },
      },
      _count: {
        select: {
          salesOrderItems: true,
        },
      },
    },
  });

  const items = rawItems.map((item) => ({
    ...serializeProductSkuDecimals(item),
    product: {
      ...item.product,
      supplyGroupCode: state.canSeeSupplyGroup ? item.product.supplyGroupCode : null,
      financeCategoryCode: state.canSeeFinanceCategory
        ? item.product.financeCategoryCode
        : null,
      supplier: state.canSeeSupplierIdentity ? item.product.supplier : null,
    },
    recycleGuard: buildProductSkuRecycleGuard({
      salesOrderItemCount: item._count.salesOrderItems,
    }),
  }));

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: buildListFilters({
      ...state,
      page,
    }),
    summary: {
      totalCount,
      enabledCount,
      productCount: coveredProducts.length,
      salesOrderItemCount,
    },
    items,
    suppliers,
    pagination: {
      page,
      pageSize: PRODUCT_CENTER_PAGE_SIZE,
      totalCount,
      totalPages,
    },
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

  const hiddenEntry = await findProductDomainCurrentlyHiddenEntry(
    prisma,
    "PRODUCT",
    productId,
  );

  if (hiddenEntry) {
    return {
      notice: parseActionNotice(rawSearchParams),
      product: null,
      suppliers: [],
    };
  }

  const canSeeSupplierIdentity = canViewProductSupplyIdentity(
    viewer.role,
    viewer.permissionCodes,
  );
  const canSeeSupplyGroup = canViewProductSupplyGroup(
    viewer.role,
    viewer.permissionCodes,
  );
  const canSeeFinanceCategory = canViewProductFinanceCategory(
    viewer.role,
    viewer.permissionCodes,
  );
  const canManageProductData = canManageProducts(viewer.role, viewer.permissionCodes);
  const hiddenProductSkuIds = await findProductDomainCurrentlyHiddenTargetIds(
    prisma,
    "PRODUCT_SKU",
  );

  const [rawProduct, suppliers] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        code: true,
        name: true,
        mainImagePath: true,
        brandName: true,
        seriesName: true,
        categoryCode: true,
        primarySalesSceneCode: true,
        supplyGroupCode: true,
        financeCategoryCode: true,
        description: true,
        internalSupplyRemark: true,
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
          ...(hiddenProductSkuIds.length > 0
            ? {
                where: {
                  id: {
                    notIn: hiddenProductSkuIds,
                  },
                },
              }
            : {}),
          orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            skuName: true,
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
    canManageProductData ? getSupplierOptions(true) : Promise.resolve([] as SupplierOption[]),
  ]);

  const product = rawProduct
    ? {
        ...rawProduct,
        supplyGroupCode: canSeeSupplyGroup ? rawProduct.supplyGroupCode : null,
        financeCategoryCode: canSeeFinanceCategory ? rawProduct.financeCategoryCode : null,
        supplier: canSeeSupplierIdentity ? rawProduct.supplier : null,
        recycleGuard: buildProductRecycleGuard({
          skuCount: rawProduct.skus.length,
          salesOrderItemCount: rawProduct._count.salesOrderItems,
        }),
        skus: rawProduct.skus.map((sku) => ({
          ...serializeProductSkuDecimals(sku),
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
