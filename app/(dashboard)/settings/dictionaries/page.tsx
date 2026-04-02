import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsWorkspaceNav } from "@/components/settings/settings-workspace-nav";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
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

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessSettingsModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getDictionariesPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return (
    <div className="crm-page">
      <PageHeader
        title="字典中心"
        description="本页统一维护通用分类、字典类型和字典项，便于后续业务模块复用同一套主数据。"
        actions={
          <>
            <StatusBadge
              label={`分类 ${data.categories.length} / 类型 ${data.types.length} / 字典项 ${data.items.length}`}
              variant="info"
            />
            <Link href="/settings" className="crm-button crm-button-secondary">
              返回主数据中心
            </Link>
          </>
        }
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone} className="mt-6">
          {data.notice.message}
        </ActionBanner>
      ) : null}

      <div className="crm-subtle-panel">
        <SettingsWorkspaceNav activeValue="dictionaries" />
      </div>

      <DataTableWrapper className="mt-6" title="通用分类" description="用于承接字典类型的大类。">
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
            <span className="crm-label">描述</span>
            <textarea name="description" rows={3} maxLength={1000} className="crm-textarea" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-primary w-full">
              创建分类
            </button>
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
                    <label className="space-y-2">
                      <span className="crm-label">名称</span>
                      <input name="name" defaultValue={item.name} className="crm-input" required />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">编码</span>
                      <input name="code" defaultValue={item.code} className="crm-input" required />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">排序</span>
                      <input
                        type="number"
                        name="sortOrder"
                        min="0"
                        defaultValue={item.sortOrder}
                        className="crm-input"
                      />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="crm-label">描述</span>
                    <textarea
                      name="description"
                      rows={3}
                      maxLength={1000}
                      defaultValue={item.description ?? ""}
                      className="crm-textarea"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存
                    </button>
                  </div>
                </form>
                <form action={toggleCategoryAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.isActive ? "停用分类" : "启用分类"}
                  </button>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="暂无分类" description="还没有创建通用分类。" />
          )}
        </div>
      </DataTableWrapper>

      <DataTableWrapper className="mt-6" title="字典类型" description="字典类型可归属于某个分类，也可以独立存在。">
        <form
          action={upsertDictionaryTypeAction}
          className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_160px]"
        >
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-2">
            <span className="crm-label">所属分类</span>
            <select name="categoryId" className="crm-select" defaultValue="">
              <option value="">不指定分类</option>
              {data.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="crm-label">名称</span>
            <input name="name" className="crm-input" placeholder="例如：跟进原因" required />
          </label>
          <label className="space-y-2">
            <span className="crm-label">编码</span>
            <input name="code" className="crm-input" placeholder="例如：FOLLOW_UP_REASON" required />
          </label>
          <label className="space-y-2">
            <span className="crm-label">排序</span>
            <input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" />
          </label>
          <label className="space-y-2 xl:col-span-3">
            <span className="crm-label">描述</span>
            <textarea name="description" rows={3} maxLength={1000} className="crm-textarea" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-primary w-full">
              创建字典类型
            </button>
          </div>
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
                    <StatusBadge label={`分类：${item.category?.name ?? "未分类"}`} variant="neutral" />
                    <StatusBadge label={`${item._count.items} 个字典项`} variant="neutral" />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_160px]">
                    <label className="space-y-2">
                      <span className="crm-label">所属分类</span>
                      <select name="categoryId" className="crm-select" defaultValue={item.categoryId ?? ""}>
                        <option value="">不指定分类</option>
                        {data.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name} ({category.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">名称</span>
                      <input name="name" defaultValue={item.name} className="crm-input" required />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">编码</span>
                      <input name="code" defaultValue={item.code} className="crm-input" required />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">排序</span>
                      <input
                        type="number"
                        name="sortOrder"
                        min="0"
                        defaultValue={item.sortOrder}
                        className="crm-input"
                      />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="crm-label">描述</span>
                    <textarea
                      name="description"
                      rows={3}
                      maxLength={1000}
                      defaultValue={item.description ?? ""}
                      className="crm-textarea"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存
                    </button>
                  </div>
                </form>
                <form action={toggleDictionaryTypeAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.isActive ? "停用字典类型" : "启用字典类型"}
                  </button>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="暂无字典类型" description="还没有创建可复用的字典类型。" />
          )}
        </div>
      </DataTableWrapper>

      <DataTableWrapper className="mt-6" title="字典项" description="字典项从属于字典类型，保存可复用的标准值。">
        <form
          action={upsertDictionaryItemAction}
          className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_160px]"
        >
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-2">
            <span className="crm-label">字典类型</span>
            <select name="typeId" className="crm-select" defaultValue="" required>
              <option value="" disabled>
                选择字典类型
              </option>
              {data.types.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="crm-label">名称</span>
            <input name="label" className="crm-input" placeholder="例如：价格顾虑" required />
          </label>
          <label className="space-y-2">
            <span className="crm-label">编码</span>
            <input name="code" className="crm-input" placeholder="例如：PRICE_CONCERN" required />
          </label>
          <label className="space-y-2">
            <span className="crm-label">值</span>
            <input name="value" className="crm-input" placeholder="例如：price_concern" required />
          </label>
          <label className="space-y-2">
            <span className="crm-label">排序</span>
            <input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" />
          </label>
          <label className="space-y-2 xl:col-span-4">
            <span className="crm-label">描述</span>
            <textarea name="description" rows={3} maxLength={1000} className="crm-textarea" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-primary w-full">
              创建字典项
            </button>
          </div>
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
                          <option key={type.id} value={type.id}>
                            {type.name} ({type.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">名称</span>
                      <input name="label" defaultValue={item.label} className="crm-input" required />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">编码</span>
                      <input name="code" defaultValue={item.code} className="crm-input" required />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">值</span>
                      <input name="value" defaultValue={item.value} className="crm-input" required />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">排序</span>
                      <input
                        type="number"
                        name="sortOrder"
                        min="0"
                        defaultValue={item.sortOrder}
                        className="crm-input"
                      />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="crm-label">描述</span>
                    <textarea
                      name="description"
                      rows={3}
                      maxLength={1000}
                      defaultValue={item.description ?? ""}
                      className="crm-textarea"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存
                    </button>
                  </div>
                </form>
                <form action={toggleDictionaryItemAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.isActive ? "停用字典项" : "启用字典项"}
                  </button>
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
