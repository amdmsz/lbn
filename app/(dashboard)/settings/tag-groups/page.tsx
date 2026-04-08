import { redirect } from "next/navigation";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
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
      <SettingsPageHeader
        activeValue="tag-groups"
        title="标签组"
        description="标签组继续作为标签体系的一级分组，用来承载客户分层、跟进信号和直播表现等标签资产。"
        metrics={[
          {
            label: "标签组",
            value: String(data.items.length),
            hint: "当前可维护的一级分组数",
          },
        ]}
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      <DataTableWrapper
        title="新增标签组"
        description="建议使用稳定编码，便于后续复用和筛选。"
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
            <span className="crm-label">说明</span>
            <textarea
              name="description"
              rows={3}
              maxLength={1000}
              className="crm-textarea"
              placeholder="补充这个标签组的业务范围"
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
                    <span className="crm-label">说明</span>
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
