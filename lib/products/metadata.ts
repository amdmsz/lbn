export type ProductCenterPrimaryTab = "products" | "skus";

export type ProductSystemViewPreset =
  | "missing_brand"
  | "missing_category"
  | "missing_sku_default_price"
  | "missing_supply_group";

export type ProductDictionaryTypeCode =
  | "PRODUCT_CATEGORY"
  | "PRODUCT_PRIMARY_SALES_SCENE"
  | "PRODUCT_SUPPLY_GROUP"
  | "PRODUCT_FINANCE_CATEGORY";

export type ProductCenterDictionaryOption = {
  code: string;
  label: string;
  description: string | null;
  isActive: boolean;
};

export type ProductCenterSavedFilters = {
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
};

export type ProductCenterFilters = ProductCenterSavedFilters & {
  page: number;
  savedViewId: string;
};

export type ProductCenterSavedViewItem = {
  id: string;
  name: string;
  tab: ProductCenterPrimaryTab;
  filters: ProductCenterSavedFilters;
  updatedAt: Date;
};

export const PRODUCT_CENTER_DICTIONARY_TYPES: Record<
  "category" | "primarySalesScene" | "supplyGroup" | "financeCategory",
  ProductDictionaryTypeCode
> = {
  category: "PRODUCT_CATEGORY",
  primarySalesScene: "PRODUCT_PRIMARY_SALES_SCENE",
  supplyGroup: "PRODUCT_SUPPLY_GROUP",
  financeCategory: "PRODUCT_FINANCE_CATEGORY",
};

export const PRODUCT_CENTER_SYSTEM_VIEWS: Array<{
  id: ProductSystemViewPreset;
  label: string;
  description: string;
}> = [
  {
    id: "missing_brand",
    label: "缺品牌",
    description: "品牌字段为空的商品或 SKU。",
  },
  {
    id: "missing_category",
    label: "缺类目",
    description: "类目字段为空的商品或 SKU。",
  },
  {
    id: "missing_sku_default_price",
    label: "缺 SKU 默认价",
    description: "默认售价未完善的 SKU，或其所属商品。",
  },
  {
    id: "missing_supply_group",
    label: "缺供货归类",
    description: "供货归类为空的商品或 SKU。",
  },
];

export const PRODUCT_CENTER_EMPTY_SAVED_FILTERS: ProductCenterSavedFilters = {
  q: "",
  status: "",
  supplierId: "",
  brandName: "",
  seriesName: "",
  categoryCode: "",
  primarySalesSceneCode: "",
  supplyGroupCode: "",
  financeCategoryCode: "",
  preset: "",
};

export const PRODUCT_CENTER_EMPTY_FILTERS: ProductCenterFilters = {
  ...PRODUCT_CENTER_EMPTY_SAVED_FILTERS,
  page: 1,
  savedViewId: "",
};

export const PRODUCT_CENTER_SAVED_FILTER_KEYS = [
  "q",
  "status",
  "supplierId",
  "brandName",
  "seriesName",
  "categoryCode",
  "primarySalesSceneCode",
  "supplyGroupCode",
  "financeCategoryCode",
  "preset",
] as const;
