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
import { toggleTagGroupAction, upsertTagGroupAction } from "@/lib/master-data/actions";
import { getTagGroupPageData } from "@/lib/master-data/queries";

const redirectTo = "/settings/tag-groups";

export default async function TagGroupsPage({
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
  const data = await getTagGroupPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return (
    <div className="crm-page">
      <PageHeader
        title="标签组"
        description="标签组用于承载一类业务标签，例如客户分层、跟进信号或直播表现。管理员和主管可新增、修改和启停。"
        actions={
          <>
            <StatusBadge label={`共 ${data.items.length} 个标签组`} variant="info" />
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
        <SettingsWorkspaceNav activeValue="tag-groups" />
      </div>

      <DataTableWrapper
        className="mt-5"
        title="新增标签组"
        description="编码建议使用英文大写和下划线，便于后续复用。"
      >
        <form action={upsertTagGroupAction} className="grid gap-3.5 xl:grid-cols-[1fr_1fr_160px]">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="space-y-1.5">
            <span className="crm-label">名称</span>
            <input name="name" className="crm-input" placeholder="例如：客户分层" required />
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">编码</span>
            <input
              name="code"
              className="crm-input"
              placeholder="例如：CUSTOMER_SEGMENT"
              required
            />
          </label>
          <label className="space-y-1.5">
            <span className="crm-label">排序</span>
            <input type="number" name="sortOrder" min="0" defaultValue="0" className="crm-input" />
          </label>
          <label className="space-y-1.5 xl:col-span-2">
            <span className="crm-label">描述</span>
            <textarea
              name="description"
              rows={3}
              maxLength={1000}
              className="crm-textarea"
              placeholder="补充说明这个标签组的业务范围"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-primary w-full">
              创建标签组
            </button>
          </div>
        </form>
      </DataTableWrapper>

      <DataTableWrapper
        className="mt-5"
        title="标签组列表"
        description="支持直接修改基础信息，并按业务需要启停。"
      >
        {data.items.length > 0 ? (
          <div className="grid gap-3.5">
            {data.items.map((item) => (
              <div key={item.id} className="crm-card-muted p-4">
                <form action={upsertTagGroupAction} className="space-y-3.5">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />

                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.isActive} />
                    <StatusBadge label={`${item._count.categories} 个分类`} variant="neutral" />
                    <StatusBadge label={`${item._count.tags} 个标签`} variant="neutral" />
                  </div>

                  <div className="grid gap-3.5 xl:grid-cols-[1fr_1fr_160px]">
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

                  <label className="block space-y-1.5">
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

                <form action={toggleTagGroupAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.isActive ? "停用标签组" : "启用标签组"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="暂无标签组"
            description="还没有创建任何标签组，请先新增一个可供标签复用的业务分组。"
          />
        )}
      </DataTableWrapper>
    </div>
  );
}
