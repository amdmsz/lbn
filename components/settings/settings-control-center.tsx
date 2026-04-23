import Link from "next/link";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { SettingsWorkspaceNav } from "@/components/settings/settings-workspace-nav";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailSidebar } from "@/components/shared/detail-sidebar";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import { getMasterDataOverviewData } from "@/lib/master-data/queries";

type SettingsData = Awaited<ReturnType<typeof getMasterDataOverviewData>> & {
  callResultsSummary: {
    totalCount: number;
    enabledCount: number;
    customCount: number;
  };
};

function EntryList({
  items,
}: Readonly<{
  items: Array<{
    href: string;
    title: string;
    description?: string;
    stat: string;
    note?: string;
  }>;
}>) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group rounded-[1rem] border border-black/7 bg-white/78 px-4 py-3.5 transition-colors hover:border-black/12 hover:bg-white"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-medium text-black/82">{item.title}</div>
              {item.description ? (
                <div className="text-[13px] leading-5 text-black/54">{item.description}</div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-base font-semibold tracking-tight text-black/84">
                {item.stat}
              </div>
              {item.note ? (
                <div className="mt-1 text-[12px] text-black/46">{item.note}</div>
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function SettingsControlCenter({
  data,
}: Readonly<{
  data: SettingsData;
}>) {
  const organizationItems = [
    {
      href: "/settings/users",
      title: "账号管理",
      description: "账号与角色。",
      stat: String(data.overview.userCount),
      note: `启用 ${data.overview.activeUserCount}`,
    },
    {
      href: "/settings/teams",
      title: "团队管理",
      description: "团队与负责人。",
      stat: String(data.overview.teamCount),
      note: "组织关系",
    },
  ];

  const tagItems = [
    {
      href: "/settings/tag-groups",
      title: "标签组",
      description: "一级分组。",
      stat: String(data.overview.tagGroupCount),
      note: `${data.overview.tagCategoryCount} 个分类`,
    },
    {
      href: "/settings/tag-categories",
      title: "标签分类",
      description: "二级分类。",
      stat: String(data.overview.tagCategoryCount),
      note: "结构层",
    },
    {
      href: "/settings/tags",
      title: "标签",
      description: "业务标签。",
      stat: String(data.overview.tagCount),
      note: "实际资产",
    },
  ];

  const dictionaryItems = [
    {
      href: "/settings/dictionaries",
      title: "字典与类目",
      description: "字典与类目。",
      stat: String(
        data.overview.categoryCount +
          data.overview.dictionaryTypeCount +
          data.overview.dictionaryItemCount,
      ),
      note: `${data.overview.dictionaryTypeCount} 个类型`,
    },
  ];

  const followUpItems = [
    {
      href: "/settings/call-results",
      title: "通话结果",
      description: "结果与联动。",
      stat: String(data.callResultsSummary.totalCount),
      note: `自定义 ${data.callResultsSummary.customCount}`,
    },
  ];

  return (
    <WorkbenchLayout
      header={
        <SummaryHeader
          eyebrow="设置域"
          title="设置中心"
          description="统一维护账号、标签、字典与通话结果。"
          badges={
            <>
              <StatusBadge label="统一设置域" variant="info" />
              <StatusBadge label="ADMIN / SUPERVISOR" variant="success" />
            </>
          }
          actions={
            <div className="crm-toolbar-cluster">
              <Link
                href="/settings/users"
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                账号管理
              </Link>
              <Link
                href="/settings/call-results"
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                通话结果
              </Link>
            </div>
          }
          metrics={[
            {
              label: "账号",
              value: String(data.overview.userCount),
              hint: "内部账号与角色状态",
            },
            {
              label: "团队",
              value: String(data.overview.teamCount),
              hint: "组织结构与负责人",
            },
            {
              label: "标签",
              value: String(data.overview.tagCount),
              hint: "标签资产规模",
            },
            {
              label: "字典项",
              value: String(data.overview.dictionaryItemCount),
              hint: "通用值域配置",
            },
            {
              label: "通话结果",
              value: String(data.callResultsSummary.totalCount),
              hint: `启用 ${data.callResultsSummary.enabledCount} / 自定义 ${data.callResultsSummary.customCount}`,
            },
          ]}
        />
      }
      sidebar={
        <DetailSidebar
          sections={[
            {
              eyebrow: "设置边界",
              title: "当前收口范围",
              items: [
                { label: "组织与账号", value: "账号、团队与角色边界" },
                { label: "标签体系", value: "标签组、标签分类和标签" },
                { label: "字典配置", value: "类目、类型和值域" },
                { label: "通话与跟进", value: "通话结果与微信联动" },
              ],
            },
            {
              eyebrow: "设置摘要",
              title: "当前概况",
              items: [
                { label: "启用账号", value: String(data.overview.activeUserCount) },
                { label: "标签组", value: String(data.overview.tagGroupCount) },
                { label: "字典类型", value: String(data.overview.dictionaryTypeCount) },
                { label: "启用通话结果", value: String(data.callResultsSummary.enabledCount) },
              ],
            },
          ]}
        />
      }
    >
      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      <SectionCard
        eyebrow="工作区导航"
        title="设置工作台"
      >
        <SettingsWorkspaceNav activeValue="overview" />
      </SectionCard>

      <div className="grid gap-5 2xl:grid-cols-2">
        <SectionCard
          eyebrow="组织与账号"
          title="组织与账号"
        >
          <EntryList items={organizationItems} />
        </SectionCard>

        <SectionCard
          eyebrow="通话与跟进"
          title="通话与跟进"
        >
          <EntryList items={followUpItems} />
        </SectionCard>
      </div>

      <div className="grid gap-5 2xl:grid-cols-2">
        <SectionCard
          eyebrow="标签体系"
          title="标签体系"
        >
          <EntryList items={tagItems} />
        </SectionCard>

        <SectionCard
          eyebrow="字典配置"
          title="字典配置"
        >
          <EntryList items={dictionaryItems} />
        </SectionCard>
      </div>
    </WorkbenchLayout>
  );
}
