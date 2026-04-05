import {
  ProductSupplierField,
  type SupplierOption,
} from "@/components/products/product-supplier-field";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/fulfillment/metadata";

type ProductDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    code: string;
    enabled: boolean;
  };
  skus: Array<{
    id: string;
    skuCode: string;
    skuName: string;
    specText: string;
    unit: string;
    defaultUnitPrice: { toString(): string };
    codSupported: boolean;
    insuranceSupported: boolean;
    defaultInsuranceAmount: { toString(): string };
    enabled: boolean;
    createdAt: Date;
    _count: {
      salesOrderItems: number;
    };
  }>;
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

export function ProductDetailSection({
  product,
  suppliers,
  canManage,
  canQuickCreateSupplier,
  upsertProductAction,
  toggleProductAction,
  upsertProductSkuAction,
  toggleProductSkuAction,
  createInlineSupplierAction,
}: Readonly<{
  product: ProductDetail;
  suppliers: SupplierOption[];
  canManage: boolean;
  canQuickCreateSupplier: boolean;
  upsertProductAction: (formData: FormData) => Promise<void>;
  toggleProductAction: (formData: FormData) => Promise<void>;
  upsertProductSkuAction: (formData: FormData) => Promise<void>;
  toggleProductSkuAction: (formData: FormData) => Promise<void>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  return (
    <div className="space-y-6">
      <section className="crm-section-card">
        <div className="flex flex-wrap items-center gap-2">
          <MasterDataStatusBadge isActive={product.enabled} />
          <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
            当前供货商：{product.supplier.name}
          </span>
        </div>

        <form action={upsertProductAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="redirectTo" value={`/products/${product.id}`} />

          <div className="grid gap-4 xl:grid-cols-2">
            <ProductSupplierField
              suppliers={suppliers}
              initialSelectedSupplierId={product.supplierId}
              disabled={!canManage}
              canQuickCreateSupplier={canQuickCreateSupplier}
              createInlineSupplierAction={createInlineSupplierAction}
            />

            <label className="space-y-2">
              <span className="crm-label">商品编码</span>
              <input
                name="code"
                defaultValue={product.code}
                required
                className="crm-input"
                disabled={!canManage}
              />
            </label>

            <label className="space-y-2">
              <span className="crm-label">商品名称</span>
              <input
                name="name"
                defaultValue={product.name}
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
              defaultValue={product.description ?? ""}
              className="crm-textarea"
              disabled={!canManage}
            />
          </label>

          {canManage ? (
            <div className="flex flex-wrap justify-end gap-3">
              <button type="submit" className="crm-button crm-button-primary">
                保存商品
              </button>
            </div>
          ) : null}
        </form>

        {canManage ? (
          <form action={toggleProductAction} className="mt-3 flex justify-end">
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="redirectTo" value={`/products/${product.id}`} />
            <button type="submit" className="crm-button crm-button-secondary">
              {product.enabled ? "停用商品" : "启用商品"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="crm-section-card">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-black/85">直播商品绑定预留</h3>
          <p className="text-sm leading-7 text-black/60">
            当前阶段只保留后续直播商品绑定的占位说明，本轮不引入新的运行时商品到直播链路绑定。
          </p>
        </div>
      </section>

      {canManage ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">新建 SKU</h3>
            <p className="text-sm leading-7 text-black/60">
              SKU 承载规格、默认单价、货到付款支持和保价支持能力。
            </p>
          </div>

          <form action={upsertProductSkuAction} className="mt-6 space-y-4">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="redirectTo" value={`/products/${product.id}`} />

            <div className="grid gap-4 xl:grid-cols-2">
              <label className="space-y-2">
                <span className="crm-label">SKU 编码</span>
                <input name="skuCode" required className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">SKU 名称</span>
                <input name="skuName" required className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">规格</span>
                <input name="specText" required className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">单位</span>
                <input name="unit" required className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">默认单价</span>
                <input
                  type="number"
                  name="defaultUnitPrice"
                  min="0"
                  step="0.01"
                  required
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">默认保价金额</span>
                <input
                  type="number"
                  name="defaultInsuranceAmount"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">支持货到付款</span>
                <select name="codSupported" defaultValue="false" className="crm-select">
                  <option value="false">否</option>
                  <option value="true">是</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">支持保价</span>
                <select name="insuranceSupported" defaultValue="false" className="crm-select">
                  <option value="false">否</option>
                  <option value="true">是</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="crm-button crm-button-primary">
                新建 SKU
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {product.skus.length > 0 ? (
        <div className="grid gap-4">
          {product.skus.map((sku) => (
            <div key={sku.id} className="crm-card-muted p-5">
              <div className="flex flex-wrap items-center gap-2">
                <MasterDataStatusBadge isActive={sku.enabled} />
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                  成交引用 {sku._count.salesOrderItems}
                </span>
              </div>

              <form action={upsertProductSkuAction} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={sku.id} />
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="redirectTo" value={`/products/${product.id}`} />

                <div className="grid gap-4 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">SKU 编码</span>
                    <input
                      name="skuCode"
                      defaultValue={sku.skuCode}
                      required
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">SKU 名称</span>
                    <input
                      name="skuName"
                      defaultValue={sku.skuName}
                      required
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">规格</span>
                    <input
                      name="specText"
                      defaultValue={sku.specText}
                      required
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">单位</span>
                    <input
                      name="unit"
                      defaultValue={sku.unit}
                      required
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">默认单价</span>
                    <input
                      type="number"
                      name="defaultUnitPrice"
                      min="0"
                      step="0.01"
                      defaultValue={sku.defaultUnitPrice.toString()}
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">默认保价金额</span>
                    <input
                      type="number"
                      name="defaultInsuranceAmount"
                      min="0"
                      step="0.01"
                      defaultValue={sku.defaultInsuranceAmount.toString()}
                      className="crm-input"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">支持货到付款</span>
                    <select
                      name="codSupported"
                      defaultValue={String(sku.codSupported)}
                      className="crm-select"
                      disabled={!canManage}
                    >
                      <option value="false">否</option>
                      <option value="true">是</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">支持保价</span>
                    <select
                      name="insuranceSupported"
                      defaultValue={String(sku.insuranceSupported)}
                      className="crm-select"
                      disabled={!canManage}
                    >
                      <option value="false">否</option>
                      <option value="true">是</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-2 text-sm text-black/60">
                  <div>默认单价：{formatCurrency(sku.defaultUnitPrice)}</div>
                  <div>默认保价金额：{formatCurrency(sku.defaultInsuranceAmount)}</div>
                </div>

                {canManage ? (
                  <div className="flex justify-end">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存 SKU
                    </button>
                  </div>
                ) : null}
              </form>

              {canManage ? (
                <form action={toggleProductSkuAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={sku.id} />
                  <input type="hidden" name="redirectTo" value={`/products/${product.id}`} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {sku.enabled ? "停用 SKU" : "启用 SKU"}
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无 SKU"
          description="当前商品还没有 SKU，请先补充规格、价格与货到付款或保价能力。"
        />
      )}
    </div>
  );
}
