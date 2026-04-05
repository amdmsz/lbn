import Link from "next/link";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/customers/metadata";

type SupplierItem = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  remark: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  _count: {
    products: number;
  };
};

export function SuppliersSection({
  items,
  filters,
  canManage,
  redirectTo,
  upsertAction,
  toggleAction,
}: Readonly<{
  items: SupplierItem[];
  filters: {
    supplierQ: string;
    supplierStatus: string;
  };
  canManage: boolean;
  redirectTo: string;
  upsertAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-6">
      <section className="crm-filter-panel space-y-4">
        <form method="get" className="crm-filter-grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto]">
          <input type="hidden" name="tab" value="suppliers" />

          <label className="space-y-2">
            <span className="crm-label">搜索供货商</span>
            <input
              name="supplierQ"
              defaultValue={filters.supplierQ}
              placeholder="名称 / 编码 / 联系人 / 电话"
              className="crm-input"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">状态</span>
            <select name="supplierStatus" defaultValue={filters.supplierStatus} className="crm-select">
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              应用
            </button>
            <Link href="/products?tab=suppliers" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>
      </section>

      {canManage ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">新增供货商</h3>
            <p className="text-sm leading-7 text-black/60">
              供货商管理收进商品域内部，记录只聚焦身份信息、联系人、启停状态与备注。
            </p>
          </div>

          <form action={upsertAction} className="mt-6 space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />

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
                新增供货商
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-4">
          {items.map((item) => (
            <details key={item.id} className="crm-card-muted overflow-hidden">
              <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4 px-5 py-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.enabled} />
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      {item.code}
                    </span>
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      关联商品 {item._count.products}
                    </span>
                  </div>

                  <div>
                    <div className="text-base font-semibold text-black/84">{item.name}</div>
                    <div className="mt-1 text-sm text-black/58">
                      {item.contactName || "未填写联系人"} / {item.contactPhone || "未填写电话"}
                    </div>
                  </div>

                  <div className="text-xs text-black/48">
                    最近使用：{item.lastUsedAt ? formatDateTime(item.lastUsedAt) : "暂无使用记录"}
                  </div>
                </div>

                <div className="max-w-xl text-sm leading-6 text-black/56">
                  {item.remark || "暂无备注"}
                </div>
              </summary>

              <div className="border-t border-black/6 px-5 py-4">
                {canManage ? (
                  <>
                    <form action={upsertAction} className="space-y-4">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="redirectTo" value={redirectTo} />

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

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-black/48">
                          创建于：{formatDateTime(item.createdAt)} / 更新于：{formatDateTime(item.updatedAt)}
                        </div>
                        <button type="submit" className="crm-button crm-button-primary">
                          保存供货商
                        </button>
                      </div>
                    </form>

                    <form action={toggleAction} className="mt-3 flex justify-end">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <button type="submit" className="crm-button crm-button-secondary">
                        {item.enabled ? "停用供货商" : "启用供货商"}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="text-sm text-black/60">当前角色对供货商管理仅可只读查看。</div>
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无供货商"
          description="请调整搜索或状态筛选，或直接在同一商品域内新增供货商。"
        />
      )}
    </div>
  );
}
