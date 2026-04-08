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
  toggleTagCategoryAction,
  upsertTagCategoryAction,
} from "@/lib/master-data/actions";
import { getTagCategoryPageData } from "@/lib/master-data/queries";

const redirectTo = "/settings/tag-categories";

export default async function TagCategoriesPage({
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
  const data = await getTagCategoryPageData(
    { id: session.user.id, role: session.user.role },
    resolvedSearchParams,
  );

  return (
    <div className="crm-page">
      <SettingsPageHeader
        activeValue="tag-categories"
        title="标签分类"
        description="标签分类是标签组下的二级归类，用于让同类标签的维护和展示更清楚。"
        metrics={[
          { label: "标签分类", value: String(data.items.length), hint: "当前二级分类数" },
        ]}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper title="新增标签分类" description="每个分类都必须归属于一个已启用标签组。">
        <form action={upsertTagCategoryAction} className="grid gap-3.5 xl:grid-cols-[1fr_1fr_1fr_160px]">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-1.5">
            <span className="crm-label">所属标签组</span>
            <select name="groupId" className="crm-select" defaultValue="" required>
              <option value="" disabled>选择标签组</option>
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name} ({group.code})</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">名称</span>
            <input name="name" className="crm-input" placeholder="例如：意向等级" required />
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">编码</span>
            <input name="code" className="crm-input" placeholder="例如：INTENT_LEVEL" required />
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">排序</span>
            <input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" />
          </label>
          <label className="space-y-1.5 xl:col-span-3">
            <span className="crm-label">说明</span>
            <textarea name="description" rows={3} maxLength={1000} className="crm-textarea" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-primary w-full">创建分类</button>
          </div>
        </form>
      </DataTableWrapper>

      <DataTableWrapper className="mt-5" title="标签分类列表" description="分类支持调整所属标签组、名称、编码与启停状态。">
        {data.items.length > 0 ? (
          <div className="grid gap-3.5">
            {data.items.map((item) => (
              <div key={item.id} className="crm-card-muted p-4">
                <form action={upsertTagCategoryAction} className="space-y-3.5">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.isActive} />
                    <StatusBadge label={`所属组：${item.group.name}`} variant="neutral" />
                    <StatusBadge label={`${item._count.tags} 个标签`} variant="neutral" />
                  </div>
                  <div className="grid gap-3.5 xl:grid-cols-[1fr_1fr_1fr_160px]">
                    <label className="space-y-1.5">
                      <span className="crm-label">所属标签组</span>
                      <select name="groupId" className="crm-select" defaultValue={item.groupId} required>
                        {data.groups.map((group) => (
                          <option key={group.id} value={group.id}>{group.name} ({group.code})</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="crm-label">名称</span>
                      <input name="name" defaultValue={item.name} className="crm-input" required />
                    </label>
                    <label className="space-y-1.5">
                      <span className="crm-label">编码</span>
                      <input name="code" defaultValue={item.code} className="crm-input" required />
                    </label>
                    <label className="space-y-1.5">
                      <span className="crm-label">排序</span>
                      <input type="number" name="sortOrder" min="0" defaultValue={item.sortOrder} className="crm-input" />
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="crm-label">说明</span>
                    <textarea name="description" rows={3} maxLength={1000} defaultValue={item.description ?? ""} className="crm-textarea" />
                  </label>
                  <div className="flex justify-end">
                    <button type="submit" className="crm-button crm-button-primary">保存</button>
                  </div>
                </form>

                <form action={toggleTagCategoryAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.isActive ? "停用分类" : "启用分类"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无标签分类" description="请先在标签组下新增分类，用于后续创建标签时细化归类。" />
        )}
      </DataTableWrapper>
    </div>
  );
}
