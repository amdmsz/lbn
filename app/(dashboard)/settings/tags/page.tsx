import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsWorkspaceNav } from "@/components/settings/settings-workspace-nav";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TagPill } from "@/components/shared/tag-pill";
import { canAccessSettingsModule, getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { toggleTagAction, upsertTagAction } from "@/lib/master-data/actions";
import { getTagsPageData } from "@/lib/master-data/queries";

const redirectTo = "/settings/tags";

export default async function TagsPage({
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
  const data = await getTagsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return (
    <div className="crm-page">
      <PageHeader
        title="标签"
        description="标签会被客户与线索直接使用，可用于展示、筛选和后续业务规则扩展。"
        actions={
          <>
            <StatusBadge label={`共 ${data.items.length} 个标签`} variant="info" />
            <Link href="/settings" className="crm-button crm-button-secondary">
              返回主数据中心
            </Link>
          </>
        }
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone} className="mt-5">
          {data.notice.message}
        </ActionBanner>
      ) : null}

      <div className="crm-subtle-panel">
        <SettingsWorkspaceNav activeValue="tags" />
      </div>

      <DataTableWrapper
        className="mt-5"
        title="新增标签"
        description="标签必须归属于标签组，可选标签分类，并支持设置颜色用于页面展示。"
      >
        <form
          action={upsertTagAction}
          className="grid gap-3.5 xl:grid-cols-[1fr_1fr_1fr_140px_140px]"
        >
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-1.5">
            <span className="crm-label">标签组</span>
            <select name="groupId" className="crm-select" defaultValue="" required>
              <option value="" disabled>
                选择标签组
              </option>
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.code})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">标签分类</span>
            <select name="categoryId" className="crm-select" defaultValue="">
              <option value="">不指定分类</option>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.code})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">名称</span>
            <input name="name" className="crm-input" placeholder="例如：高意向" required />
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">编码</span>
            <input name="code" className="crm-input" placeholder="例如：HIGH_INTENT" required />
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">排序</span>
            <input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" />
          </label>
          <label className="space-y-1.5 xl:col-span-2">
            <span className="crm-label">颜色</span>
            <input name="color" className="crm-input" placeholder="例如：#A65A2A" />
          </label>
          <label className="space-y-1.5 xl:col-span-2">
            <span className="crm-label">描述</span>
            <textarea name="description" rows={3} maxLength={1000} className="crm-textarea" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-primary w-full">
              创建标签
            </button>
          </div>
        </form>
      </DataTableWrapper>

      <DataTableWrapper
        className="mt-5"
        title="标签列表"
        description="停用后的标签不会出现在新增入口，但已挂到客户 / 线索上的历史标签仍会保留展示。"
      >
        {data.items.length > 0 ? (
          <div className="grid gap-3.5">
            {data.items.map((item) => (
              <div key={item.id} className="crm-card-muted p-4">
                <form action={upsertTagAction} className="space-y-3.5">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />

                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.isActive} />
                    <TagPill label={item.name} color={item.color} />
                    <StatusBadge label={`标签组：${item.group.name}`} variant="neutral" />
                    <StatusBadge label={`分类：${item.category?.name ?? "未分类"}`} variant="neutral" />
                    <StatusBadge label={`客户 ${item._count.customerTags}`} variant="neutral" />
                    <StatusBadge label={`线索 ${item._count.leadTags}`} variant="neutral" />
                  </div>

                  <div className="grid gap-3.5 xl:grid-cols-[1fr_1fr_1fr_140px_140px]">
                    <label className="space-y-1.5">
                      <span className="crm-label">标签组</span>
                      <select name="groupId" className="crm-select" defaultValue={item.groupId} required>
                        {data.groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} ({group.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="crm-label">标签分类</span>
                      <select name="categoryId" className="crm-select" defaultValue={item.categoryId ?? ""}>
                        <option value="">不指定分类</option>
                        {data.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name} ({category.code})
                          </option>
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
                      <input
                        type="number"
                        name="sortOrder"
                        min="0"
                        defaultValue={item.sortOrder}
                        className="crm-input"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3.5 xl:grid-cols-[1fr_2fr]">
                    <label className="space-y-1.5">
                      <span className="crm-label">颜色</span>
                      <input name="color" defaultValue={item.color ?? ""} className="crm-input" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="crm-label">描述</span>
                      <textarea
                        name="description"
                        rows={3}
                        maxLength={1000}
                        defaultValue={item.description ?? ""}
                        className="crm-textarea"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存
                    </button>
                  </div>
                </form>

                <form action={toggleTagAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.isActive ? "停用标签" : "启用标签"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="暂无标签"
            description="请先创建业务标签，后续客户与线索才能展示并使用这些标签。"
          />
        )}
      </DataTableWrapper>
    </div>
  );
}
