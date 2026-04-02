import Link from "next/link";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { EmptyState } from "@/components/shared/empty-state";

type SupplierOption = {
  id: string;
  name: string;
  code: string;
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

export function ProductsSection({
  items,
  suppliers,
  selectedSupplierId,
  canManage,
  upsertAction,
  toggleAction,
}: Readonly<{
  items: ProductItem[];
  suppliers: SupplierOption[];
  selectedSupplierId: string;
  canManage: boolean;
  upsertAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-6">
      <div className="crm-filter-panel">
        <form method="get" className="crm-filter-grid xl:grid-cols-[minmax(0,1fr)_auto]">
          <label className="space-y-2">
            <span className="crm-label">供货商</span>
            <select name="supplierId" defaultValue={selectedSupplierId} className="crm-select">
              <option value="">全部供货商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code})
                </option>
              ))}
            </select>
          </label>
          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              筛选
            </button>
            <Link href="/products" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>
      </div>

      {canManage ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">新增商品</h3>
            <p className="text-sm leading-7 text-black/60">
              商品主体只维护归属供货商和基础描述，规格、价格、代收和保价能力下沉到 SKU。
            </p>
          </div>

          <form action={upsertAction} className="mt-6 space-y-4">
            <input type="hidden" name="redirectTo" value="/products" />
            <div className="grid gap-4 xl:grid-cols-2">
              <label className="space-y-2">
                <span className="crm-label">供货商</span>
                <select name="supplierId" required className="crm-select" defaultValue="">
                  <option value="" disabled>
                    选择供货商
                  </option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} ({supplier.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="crm-label">商品编码</span>
                <input name="code" required className="crm-input" />
              </label>
              <label className="space-y-2 xl:col-span-2">
                <span className="crm-label">商品名称</span>
                <input name="name" required className="crm-input" />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="crm-label">描述</span>
              <textarea name="description" rows={3} className="crm-textarea" />
            </label>

            <div className="flex justify-end">
              <button type="submit" className="crm-button crm-button-primary">
                创建商品
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="crm-section-card">
          <h3 className="text-lg font-semibold text-black/85">商品只读视图</h3>
          <p className="mt-2 text-sm leading-7 text-black/60">
            当前角色可查看商品和 SKU 摘要，并为后续直播商品绑定保留入口，但不维护商品主数据。
          </p>
        </section>
      )}

      {items.length > 0 ? (
        <div className="grid gap-4">
          {items.map((item) => (
            <div key={item.id} className="crm-card-muted p-5">
              <div className="flex flex-wrap items-center gap-2">
                <MasterDataStatusBadge isActive={item.enabled} />
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                  供货商：{item.supplier.name}
                </span>
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                  SKU {item._count.skus}
                </span>
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                  下单 {item._count.salesOrderItems}
                </span>
              </div>

              <form action={upsertAction} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="redirectTo" value="/products" />
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
                          {supplier.name} ({supplier.code})
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
                  <span className="crm-label">描述</span>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={item.description ?? ""}
                    className="crm-textarea"
                    disabled={!canManage}
                  />
                </label>

                <div className="flex flex-wrap justify-between gap-3">
                  <Link href={`/products/${item.id}`} className="crm-button crm-button-secondary">
                    查看商品详情 / SKU
                  </Link>
                  {canManage ? (
                    <button type="submit" className="crm-button crm-button-primary">
                      保存
                    </button>
                  ) : null}
                </div>
              </form>

              {canManage ? (
                <form action={toggleAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value="/products" />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.enabled ? "停用商品" : "启用商品"}
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无商品"
          description="当前条件下还没有商品。先创建商品，再补充 SKU。"
        />
      )}
    </div>
  );
}
