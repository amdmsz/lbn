import type {
  ProductCenterFilters,
  ProductCenterPrimaryTab,
} from "@/lib/products/metadata";

export type SupplierCenterFilters = {
  supplierQ: string;
  supplierStatus: string;
};

export function buildProductCenterHref(
  filters: ProductCenterFilters,
  overrides: Partial<{
    q: string;
    status: string;
    supplierId: string;
    brandName: string;
    seriesName: string;
    categoryCode: string;
    primarySalesSceneCode: string;
    supplyGroupCode: string;
    financeCategoryCode: string;
    preset: string;
    savedViewId: string;
    page: number;
    tab: ProductCenterPrimaryTab;
    detail: string;
    detailSku: string;
    createProduct: string;
  }> = {},
) {
  const params = new URLSearchParams();
  const nextTab = overrides.tab ?? "products";
  const q = overrides.q ?? filters.q;
  const status = overrides.status ?? filters.status;
  const supplierId = overrides.supplierId ?? filters.supplierId;
  const brandName = overrides.brandName ?? filters.brandName;
  const seriesName = overrides.seriesName ?? filters.seriesName;
  const categoryCode = overrides.categoryCode ?? filters.categoryCode;
  const primarySalesSceneCode =
    overrides.primarySalesSceneCode ?? filters.primarySalesSceneCode;
  const supplyGroupCode = overrides.supplyGroupCode ?? filters.supplyGroupCode;
  const financeCategoryCode =
    overrides.financeCategoryCode ?? filters.financeCategoryCode;
  const preset = overrides.preset ?? filters.preset;
  const savedViewId = overrides.savedViewId ?? filters.savedViewId;
  const page = overrides.page ?? filters.page;
  const detail = overrides.detail ?? "";
  const detailSku = detail ? overrides.detailSku ?? "" : "";
  const createProduct = overrides.createProduct ?? "";

  if (nextTab === "skus") {
    params.set("tab", "skus");
  }

  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (supplierId) params.set("supplierId", supplierId);
  if (brandName) params.set("brandName", brandName);
  if (seriesName) params.set("seriesName", seriesName);
  if (categoryCode) params.set("categoryCode", categoryCode);
  if (primarySalesSceneCode) params.set("primarySalesSceneCode", primarySalesSceneCode);
  if (supplyGroupCode) params.set("supplyGroupCode", supplyGroupCode);
  if (financeCategoryCode) params.set("financeCategoryCode", financeCategoryCode);
  if (preset) params.set("preset", preset);
  if (savedViewId) params.set("savedViewId", savedViewId);
  if (page > 1) params.set("page", String(page));
  if (detail) params.set("detail", detail);
  if (detailSku) params.set("detailSku", detailSku);
  if (createProduct) params.set("createProduct", createProduct);

  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

export function buildSupplierCenterHref(
  filters: SupplierCenterFilters,
  overrides: Partial<{
    supplierQ: string;
    supplierStatus: string;
    createSupplier: string;
  }> = {},
) {
  const params = new URLSearchParams();
  const supplierQ = overrides.supplierQ ?? filters.supplierQ;
  const supplierStatus = overrides.supplierStatus ?? filters.supplierStatus;
  const createSupplier = overrides.createSupplier ?? "";

  params.set("tab", "suppliers");

  if (supplierQ) params.set("supplierQ", supplierQ);
  if (supplierStatus) params.set("supplierStatus", supplierStatus);
  if (createSupplier) params.set("createSupplier", createSupplier);

  return `/products?${params.toString()}`;
}
