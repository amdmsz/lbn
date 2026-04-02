import Link from "next/link";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { SettingsWorkspaceNav } from "@/components/settings/settings-workspace-nav";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailSidebar } from "@/components/shared/detail-sidebar";
import { MetricCard } from "@/components/shared/metric-card";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import { accountManagementLinks } from "@/lib/account-management/metadata";
import { masterDataLinks } from "@/lib/master-data/metadata";
import { getMasterDataOverviewData } from "@/lib/master-data/queries";

type SettingsData = Awaited<ReturnType<typeof getMasterDataOverviewData>>;

function buildSummaryItems(data: SettingsData): PageSummaryStripItem[] {
  return [
    {
      label: "账号",
      value: String(data.overview.userCount),
      note: `启用中 ${data.overview.activeUserCount}`,
      emphasis: "info",
    },
    {
      label: "团队",
      value: String(data.overview.teamCount),
      note: "组织结构维护入口",
      emphasis: "success",
    },
    {
      label: "标签资产",
      value: String(data.overview.tagCount),
      note: `${data.overview.tagGroupCount} 个标签组`,
      emphasis: "warning",
    },
    {
      label: "字典与类目",
      value: String(data.overview.dictionaryTypeCount + data.overview.dictionaryItemCount + data.overview.categoryCount),
      note: "主数据基础配置",
    },
  ];
}

function EntryGrid({
  items,
}: Readonly<{
  items: Array<{
    href: string;
    title: string;
    description: string;
    value?: number;
    subValue?: string;
  }>;
}>) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="crm-card border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,247,243,0.9))] p-4 shadow-[0_14px_28px_rgba(18,24,31,0.05)] transition-colors hover:border-[var(--color-accent)]/24 hover:bg-white"
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold text-black/84">{item.title}</p>
            <p className="text-sm leading-6 text-black/56">{item.description}</p>
            {typeof item.value === "number" ? (
              <div className="pt-1">
                <p className="text-[1.75rem] font-semibold tracking-tight text-black/86">
                  {item.value}
                </p>
                {item.subValue ? (
                  <p className="text-sm leading-6 text-black/52">{item.subValue}</p>
                ) : null}
              </div>
            ) : null}
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
  return (
    <WorkbenchLayout
      header={
        <SummaryHeader
          eyebrow="组织与主数据中台"
          title="设置中心"
          description="设置页只保留组织管理和主数据维护，不再做一屏入口拼盘。先分组，再进入具体维护页。"
          badges={
            <>
              <StatusBadge label="管理入口" variant="info" />
              <StatusBadge label="ADMIN / SUPERVISOR" variant="success" />
            </>
          }
          actions={
            <div className="crm-toolbar-cluster">
              <Link href="/settings/users" className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
                账号管理
              </Link>
              <Link href="/settings/tag-groups" className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
                标签维护
              </Link>
            </div>
          }
          metrics={[
            { label: "账号", value: String(data.overview.userCount), hint: "含启用和停用账号" },
            { label: "团队", value: String(data.overview.teamCount), hint: "组织结构与归属关系" },
            { label: "标签", value: String(data.overview.tagCount), hint: "客户与线索标签资产" },
            {
              label: "字典项",
              value: String(data.overview.dictionaryItemCount),
              hint: "类型、项和值域维护",
            },
          ]}
        />
      }
      summary={<PageSummaryStrip items={buildSummaryItems(data)} />}
      sidebar={
        <DetailSidebar
          sections={[
            {
              eyebrow: "维护边界",
              title: "设置页职责",
              description: "这里是组织与主数据中台，不承担商品交易、收款和履约执行。",
              items: [
                { label: "组织管理", value: "账号、团队、角色和状态维护" },
                { label: "主数据", value: "标签组、标签、字典和基础类目" },
                { label: "不承担", value: "订单、收款、发货、财务执行页" },
              ],
            },
            {
              eyebrow: "当前概况",
              title: "维护摘要",
              items: [
                { label: "启用账号", value: String(data.overview.activeUserCount) },
                { label: "标签组", value: String(data.overview.tagGroupCount) },
                { label: "标签分类", value: String(data.overview.tagCategoryCount) },
                { label: "字典类型", value: String(data.overview.dictionaryTypeCount) },
              ],
            },
          ]}
        />
      }
    >
      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <SectionCard
        eyebrow="工作区"
        title="设置工作区"
        description="设置页首屏只保留业务组入口，不做冗长说明。"
      >
        <SettingsWorkspaceNav activeValue="overview" />
      </SectionCard>

      <SectionCard
        eyebrow="组织与账号"
        title="组织管理"
        description="组织结构和内部账号归口到同一组，减少重复入口。"
      >
        <EntryGrid items={data.organizationCards} />
      </SectionCard>

      <SectionCard
        eyebrow="主数据"
        title="主数据维护"
        description="标签体系、字典和值域按主数据资产统一归口。"
      >
        <EntryGrid items={data.masterDataCards} />
      </SectionCard>

      <SectionCard
        eyebrow="快捷入口"
        title="常用维护入口"
        description="保留高频维护页，按业务组分区呈现。"
      >
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="crm-eyebrow">组织组</p>
              <h3 className="text-base font-semibold text-black/84">组织与账号</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {accountManagementLinks.map((item) => (
                <MetricCard
                  key={item.href}
                  label={item.title}
                  value="入口"
                  note={item.description}
                  href={item.href}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <p className="crm-eyebrow">主数据组</p>
              <h3 className="text-base font-semibold text-black/84">标签与字典</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {masterDataLinks.map((item) => (
                <MetricCard
                  key={item.href}
                  label={item.title}
                  value="入口"
                  note={item.description}
                  href={item.href}
                />
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </WorkbenchLayout>
  );
}
