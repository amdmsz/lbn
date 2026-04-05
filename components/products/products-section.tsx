import Link from "next/link";
import { ProductCreateForm } from "@/components/products/product-create-form";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { EmptyState } from "@/components/shared/empty-state";

type SupplierOption = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
};

type ProductItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
  supplier: SupplierOption;
  _count: {
    skus: number;
    salesOrderItems: number;
  };
};

type InlineSupplierResult =
  | {
      success: true;
      supplier: {
        id: string;
        name: string;
        code: string;
      };
      message: string;
    }
  | {
      success: false;
      errorMessage: string;
    };

export function ProductsSection({
  items,
  suppliers,
  filters,
  canManage,
  canAccessSupplierTab,
  listHref,
  manageSuppliersHref,
  upsertAction,
  toggleAction,
  createInlineSupplierAction,
}: Readonly<{
  items: ProductItem[];
  suppliers: SupplierOption[];
  filters: {
    q: string;
    status: string;
    category: string;
    supplierId: string;
  };
  canManage: boolean;
  canAccessSupplierTab: boolean;
  listHref: string;
  manageSuppliersHref: string;
  upsertAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  return (
    <div className="space-y-6">
      <section className="crm-filter-panel space-y-4">
        <form
          method="get"
          className="crm-filter-grid xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.85fr))_auto]"
        >
          <label className="space-y-2">
            <span className="crm-label">搜索</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="商品 / SKU / 供货商"
              className="crm-input"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">状态</span>
            <select name="status" defaultValue={filters.status} className="crm-select">
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">类目</span>
            <select name="category" defaultValue={filters.category} className="crm-select" disabled>
              <option value="">类目模型待补充</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">供货商</span>
            <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
              <option value="">全部供货商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code}){supplier.enabled ? "" : " - 已停用"}
                </option>
              ))}
            </select>
          </label>

          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              应用
            </button>
            <Link href="/products" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/6 pt-4">
          <p className="text-sm text-black/58">
            类目筛选位暂时保留，当前 schema 还没有商品类目的正式锚点。
          </p>
          <div className="flex flex-wrap gap-3">
            {canManage ? (
              <Link href={`${listHref}#create-product`} className="crm-button crm-button-primary">
                新建商品
              </Link>
            ) : null}
            {canAccessSupplierTab ? (
              <Link href={manageSuppliersHref} className="crm-button crm-button-secondary">
                管理供货商
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {canManage ? (
        <ProductCreateForm
          suppliers={suppliers}
          redirectTo={listHref}
          canQuickCreateSupplier={canAccessSupplierTab}
          upsertAction={upsertAction}
          createInlineSupplierAction={createInlineSupplierAction}
        />
      ) : (
        <section className="crm-section-card">
          <h3 className="text-lg font-semibold text-black/85">商品只读视图</h3>
          <p className="mt-2 text-sm leading-7 text-black/60">
            当前角色可查看商品与 SKU 快照，但不维护商品或供货商主数据。
          </p>
        </section>
      )}

      {items.length > 0 ? (
        <div className="grid gap-4">
          {items.map((item) => (
            <div key={item.id} className="crm-card-muted p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.enabled} />
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      {item.code}
                    </span>
                  </div>
                  <div>
                    <div className="text-base font-semibold text-black/84">{item.name}</div>
                    <div className="mt-1 text-sm text-black/58">
                      {item.supplier.name} ({item.supplier.code})
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-black/55">
                    <span className="rounded-full border border-black/10 px-2.5 py-1">
                      SKU {item._count.skus}
                    </span>
                    <span className="rounded-full border border-black/10 px-2.5 py-1">
                      成交引用 {item._count.salesOrderItems}
                    </span>
                  </div>
                </div>

                <Link href={`/products/${item.id}`} className="crm-button crm-button-secondary">
                  商品详情 / SKU
                </Link>
              </div>

              <form action={upsertAction} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="redirectTo" value={listHref} />

                <div className="grid gap-4 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">供货商</span>
                    <select
                      name="supplierId"
                      required
                      className="crm-select"
                      defaultValue={item.supplier.id}
                      disabled={!canManage}
                    >
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name} ({supplier.code}){supplier.enabled ? "" : " - 已停用"}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">商品编码</span>
                    <input
                      name="code"
                      defaultValue={item.code}
                      required
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="space-y-2 xl:col-span-2">
                    <span className="crm-label">商品名称</span>
                    <input
                      name="name"
                      defaultValue={item.name}
                      required
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="crm-label">说明</span>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={item.description ?? ""}
                    className="crm-textarea"
                    disabled={!canManage}
                  />
                </label>

                {canManage ? (
                  <div className="flex justify-end">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存商品
                    </button>
                  </div>
                ) : null}
              </form>

              {canManage ? (
                <form action={toggleAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={listHref} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.enabled ? "停用商品" : "启用商品"}
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="暂无商品" description="请先创建商品，再继续维护 SKU 并进入后续使用。" />
      )}
    </div>
  );
}
