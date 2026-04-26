import { redirect } from "next/navigation";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { canAccessSettingsModule, getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  toggleCategoryAction,
  toggleDictionaryItemAction,
  toggleDictionaryTypeAction,
  upsertCategoryAction,
  upsertDictionaryItemAction,
  upsertDictionaryTypeAction,
} from "@/lib/master-data/actions";
import { getDictionariesPageData } from "@/lib/master-data/queries";

const redirectTo = "/settings/dictionaries";

export default async function DictionariesPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessSettingsModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getDictionariesPageData(
    { id: session.user.id, role: session.user.role },
    resolvedSearchParams,
  );

  return (
    <div className="crm-page">
      <SettingsPageHeader
        activeValue="dictionaries"
        viewerRole={session.user.role}
        title="字典与类目"
        description="这里统一维护通用类目、字典类型和字典项，供后续模块复用同一套主数据。"
        metrics={[
          {
            label: "类目 / 类型 / 字典项",
            value: `${data.categories.length} / ${data.types.length} / ${data.items.length}`,
            hint: "当前主数据规模",
          },
        ]}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper title="通用类目" description="用于承接字典类型的大类。">
        <form action={upsertCategoryAction} className="grid gap-4 xl:grid-cols-[1fr_1fr_160px]">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-2">
            <span className="crm-label">名称</span>
            <input name="name" className="crm-input" placeholder="例如：客户阶段" required />
          </label>
          <label className="space-y-2">
            <span className="crm-label">编码</span>
            <input name="code" className="crm-input" placeholder="例如：CUSTOMER_STAGE" required />
          </label>
          <label className="space-y-2">
            <span className="crm-label">排序</span>
            <input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" />
          </label>
          <label className="space-y-2 xl:col-span-2">
            <span className="crm-label">说明</span>
            <textarea name="description" rows={3} maxLength={1000} className="crm-textarea" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-primary w-full">创建类目</button>
          </div>
        </form>

        <div className="mt-6 grid gap-4">
          {data.categories.length > 0 ? (
            data.categories.map((item) => (
              <div key={item.id} className="crm-card-muted p-5">
                <form action={upsertCategoryAction} className="space-y-4">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.isActive} />
                    <StatusBadge label={`${item._count.dictionaryTypes} 个类型`} variant="neutral" />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[1fr_1fr_160px]">
                    <label className="space-y-2"><span className="crm-label">名称</span><input name="name" defaultValue={item.name} className="crm-input" required /></label>
                    <label className="space-y-2"><span className="crm-label">编码</span><input name="code" defaultValue={item.code} className="crm-input" required /></label>
                    <label className="space-y-2"><span className="crm-label">排序</span><input type="number" name="sortOrder" min="0" defaultValue={item.sortOrder} className="crm-input" /></label>
                  </div>
                  <label className="block space-y-2"><span className="crm-label">说明</span><textarea name="description" rows={3} maxLength={1000} defaultValue={item.description ?? ""} className="crm-textarea" /></label>
                  <div className="flex justify-end"><button type="submit" className="crm-button crm-button-primary">保存</button></div>
                </form>
                <form action={toggleCategoryAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">{item.isActive ? "停用类目" : "启用类目"}</button>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="暂无类目" description="还没有创建通用类目。" />
          )}
        </div>
      </DataTableWrapper>

      <DataTableWrapper className="mt-6" title="字典类型" description="字典类型可归属于某个类目，也可以独立存在。">
        <form action={upsertDictionaryTypeAction} className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_160px]">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-2">
            <span className="crm-label">所属类目</span>
            <select name="categoryId" className="crm-select" defaultValue="">
              <option value="">不指定类目</option>
              {data.categories.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
              ))}
            </select>
          </label>
          <label className="space-y-2"><span className="crm-label">名称</span><input name="name" className="crm-input" placeholder="例如：跟进原因" required /></label>
          <label className="space-y-2"><span className="crm-label">编码</span><input name="code" className="crm-input" placeholder="例如：FOLLOW_UP_REASON" required /></label>
          <label className="space-y-2"><span className="crm-label">排序</span><input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" /></label>
          <label className="space-y-2 xl:col-span-3"><span className="crm-label">说明</span><textarea name="description" rows={3} maxLength={1000} className="crm-textarea" /></label>
          <div className="flex items-end"><button type="submit" className="crm-button crm-button-primary w-full">创建字典类型</button></div>
        </form>

        <div className="mt-6 grid gap-4">
          {data.types.length > 0 ? (
            data.types.map((item) => (
              <div key={item.id} className="crm-card-muted p-5">
                <form action={upsertDictionaryTypeAction} className="space-y-4">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.isActive} />
                    <StatusBadge label={`类目：${item.category?.name ?? "未分类"}`} variant="neutral" />
                    <StatusBadge label={`${item._count.items} 个字典项`} variant="neutral" />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_160px]">
                    <label className="space-y-2">
                      <span className="crm-label">所属类目</span>
                      <select name="categoryId" className="crm-select" defaultValue={item.categoryId ?? ""}>
                        <option value="">不指定类目</option>
                        {data.categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name} ({category.code})</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2"><span className="crm-label">名称</span><input name="name" defaultValue={item.name} className="crm-input" required /></label>
                    <label className="space-y-2"><span className="crm-label">编码</span><input name="code" defaultValue={item.code} className="crm-input" required /></label>
                    <label className="space-y-2"><span className="crm-label">排序</span><input type="number" name="sortOrder" min="0" defaultValue={item.sortOrder} className="crm-input" /></label>
                  </div>
                  <label className="block space-y-2"><span className="crm-label">说明</span><textarea name="description" rows={3} maxLength={1000} defaultValue={item.description ?? ""} className="crm-textarea" /></label>
                  <div className="flex justify-end"><button type="submit" className="crm-button crm-button-primary">保存</button></div>
                </form>
                <form action={toggleDictionaryTypeAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">{item.isActive ? "停用字典类型" : "启用字典类型"}</button>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="暂无字典类型" description="还没有创建可复用的字典类型。" />
          )}
        </div>
      </DataTableWrapper>

      <DataTableWrapper className="mt-6" title="字典项" description="字典项从属于字典类型，保存可复用的标准值。">
        <form action={upsertDictionaryItemAction} className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_160px]">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-2">
            <span className="crm-label">字典类型</span>
            <select name="typeId" className="crm-select" defaultValue="" required>
              <option value="" disabled>选择字典类型</option>
              {data.types.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
              ))}
            </select>
          </label>
          <label className="space-y-2"><span className="crm-label">名称</span><input name="label" className="crm-input" placeholder="例如：价格顾虑" required /></label>
          <label className="space-y-2"><span className="crm-label">编码</span><input name="code" className="crm-input" placeholder="例如：PRICE_CONCERN" required /></label>
          <label className="space-y-2"><span className="crm-label">值</span><input name="value" className="crm-input" placeholder="例如：price_concern" required /></label>
          <label className="space-y-2"><span className="crm-label">排序</span><input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" /></label>
          <label className="space-y-2 xl:col-span-4"><span className="crm-label">说明</span><textarea name="description" rows={3} maxLength={1000} className="crm-textarea" /></label>
          <div className="flex items-end"><button type="submit" className="crm-button crm-button-primary w-full">创建字典项</button></div>
        </form>

        <div className="mt-6 grid gap-4">
          {data.items.length > 0 ? (
            data.items.map((item) => (
              <div key={item.id} className="crm-card-muted p-5">
                <form action={upsertDictionaryItemAction} className="space-y-4">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.isActive} />
                    <StatusBadge label={`类型：${item.type.name}`} variant="neutral" />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_160px]">
                    <label className="space-y-2">
                      <span className="crm-label">字典类型</span>
                      <select name="typeId" className="crm-select" defaultValue={item.typeId} required>
                        {data.types.map((type) => (
                          <option key={type.id} value={type.id}>{type.name} ({type.code})</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2"><span className="crm-label">名称</span><input name="label" defaultValue={item.label} className="crm-input" required /></label>
                    <label className="space-y-2"><span className="crm-label">编码</span><input name="code" defaultValue={item.code} className="crm-input" required /></label>
                    <label className="space-y-2"><span className="crm-label">值</span><input name="value" defaultValue={item.value} className="crm-input" required /></label>
                    <label className="space-y-2"><span className="crm-label">排序</span><input type="number" name="sortOrder" min="0" defaultValue={item.sortOrder} className="crm-input" /></label>
                  </div>
                  <label className="block space-y-2"><span className="crm-label">说明</span><textarea name="description" rows={3} maxLength={1000} defaultValue={item.description ?? ""} className="crm-textarea" /></label>
                  <div className="flex justify-end"><button type="submit" className="crm-button crm-button-primary">保存</button></div>
                </form>
                <form action={toggleDictionaryItemAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">{item.isActive ? "停用字典项" : "启用字典项"}</button>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="暂无字典项" description="请先创建字典类型，再补充可复用的字典项。" />
          )}
        </div>
      </DataTableWrapper>
    </div>
  );
}
