import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { EmptyState } from "@/components/shared/empty-state";

type SupplierItem = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  remark: string | null;
  enabled: boolean;
  createdAt: Date;
  _count: {
    products: number;
    salesOrders: number;
    shippingTasks: number;
  };
};

export function SuppliersSection({
  items,
  canManage,
  upsertAction,
  toggleAction,
}: Readonly<{
  items: SupplierItem[];
  canManage: boolean;
  upsertAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-6">
      {canManage ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">新增供货商</h3>
            <p className="text-sm leading-7 text-black/60">
              由管理员或主管维护供货商主数据，为商品中心、订单和发货中心提供统一来源。
            </p>
          </div>

          <form action={upsertAction} className="mt-6 space-y-4">
            <input type="hidden" name="redirectTo" value="/suppliers" />
            <div className="grid gap-4 xl:grid-cols-2">
              <label className="space-y-2">
                <span className="crm-label">编码</span>
                <input name="code" required className="crm-input" />
              </label>
              <label className="space-y-2">
                <span className="crm-label">名称</span>
                <input name="name" required className="crm-input" />
              </label>
              <label className="space-y-2">
                <span className="crm-label">联系人</span>
                <input name="contactName" className="crm-input" />
              </label>
              <label className="space-y-2">
                <span className="crm-label">联系电话</span>
                <input name="contactPhone" className="crm-input" />
              </label>
            </div>
            <label className="block space-y-2">
              <span className="crm-label">备注</span>
              <textarea name="remark" rows={3} className="crm-textarea" />
            </label>
            <div className="flex justify-end">
              <button type="submit" className="crm-button crm-button-primary">
                创建供货商
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-4">
          {items.map((item) => (
            <div key={item.id} className="crm-card-muted p-5">
              <div className="flex flex-wrap items-center gap-2">
                <MasterDataStatusBadge isActive={item.enabled} />
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                  商品 {item._count.products}
                </span>
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                  新订单 {item._count.salesOrders}
                </span>
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                  发货任务 {item._count.shippingTasks}
                </span>
              </div>

              <form action={upsertAction} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="redirectTo" value="/suppliers" />
                <div className="grid gap-4 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">编码</span>
                    <input name="code" defaultValue={item.code} required className="crm-input" />
                  </label>
                  <label className="space-y-2">
                    <span className="crm-label">名称</span>
                    <input name="name" defaultValue={item.name} required className="crm-input" />
                  </label>
                  <label className="space-y-2">
                    <span className="crm-label">联系人</span>
                    <input
                      name="contactName"
                      defaultValue={item.contactName ?? ""}
                      className="crm-input"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="crm-label">联系电话</span>
                    <input
                      name="contactPhone"
                      defaultValue={item.contactPhone ?? ""}
                      className="crm-input"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="crm-label">备注</span>
                  <textarea
                    name="remark"
                    rows={3}
                    defaultValue={item.remark ?? ""}
                    className="crm-textarea"
                  />
                </label>

                {canManage ? (
                  <div className="flex flex-wrap justify-end gap-3">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存
                    </button>
                  </div>
                ) : null}
              </form>

              {canManage ? (
                <form action={toggleAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value="/suppliers" />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.enabled ? "停用供货商" : "启用供货商"}
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无供货商"
          description="先创建供货商，再继续维护商品和发货链路。"
        />
      )}
    </div>
  );
}
