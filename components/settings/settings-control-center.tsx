import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { SettingsWorkspaceNav } from "@/components/settings/settings-workspace-nav";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailSidebar } from "@/components/shared/detail-sidebar";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import { roleLabels } from "@/lib/auth/access";
import { cn } from "@/lib/utils";
import { getMasterDataOverviewData } from "@/lib/master-data/queries";
import {
  getVisibleSettingsWorkspaceSections,
  settingsWorkspaceSections,
  type SettingsWorkspaceItem,
  type SettingsWorkspaceValue,
} from "@/lib/settings/metadata";

type SettingsData = Awaited<ReturnType<typeof getMasterDataOverviewData>> & {
  callResultsSummary: {
    totalCount: number;
    enabledCount: number;
    customCount: number;
  };
};

type EntryMeta = {
  stat: string;
  note: string;
  state: "已接入" | "配置预览" | "下一阶段";
};

type EntryItem = SettingsWorkspaceItem & EntryMeta;

function buildEntryMeta(data: SettingsData): Partial<Record<SettingsWorkspaceValue, EntryMeta>> {
  return {
    site: {
      stat: "基础",
      note: "站点展示",
      state: "配置预览",
    },
    security: {
      stat: "策略",
      note: "登录与会话",
      state: "下一阶段",
    },
    users: {
      stat: String(data.overview.userCount),
      note: `启用 ${data.overview.activeUserCount}`,
      state: "已接入",
    },
    teams: {
      stat: String(data.overview.teamCount),
      note: "组织关系",
      state: "已接入",
    },
    "tag-groups": {
      stat: String(data.overview.tagGroupCount),
      note: `${data.overview.tagCategoryCount} 个分类`,
      state: "已接入",
    },
    "tag-categories": {
      stat: String(data.overview.tagCategoryCount),
      note: "二级归类",
      state: "已接入",
    },
    tags: {
      stat: String(data.overview.tagCount),
      note: "标签资产",
      state: "已接入",
    },
    dictionaries: {
      stat: String(
        data.overview.categoryCount +
          data.overview.dictionaryTypeCount +
          data.overview.dictionaryItemCount,
      ),
      note: `${data.overview.dictionaryTypeCount} 个类型`,
      state: "已接入",
    },
    "call-results": {
      stat: String(data.callResultsSummary.totalCount),
      note: `自定义 ${data.callResultsSummary.customCount}`,
      state: "已接入",
    },
    "recording-storage": {
      stat: "LOCAL",
      note: "内网存储",
      state: "配置预览",
    },
    "outbound-call": {
      stat: "CTI",
      note: "坐席外呼",
      state: "配置预览",
    },
    "call-ai": {
      stat: "ASR/LLM",
      note: "转写与分析",
      state: "配置预览",
    },
    audit: {
      stat: "日志",
      note: "SYSTEM",
      state: "配置预览",
    },
  };
}

function getStateVariant(state: EntryMeta["state"]): StatusBadgeVariant {
  switch (state) {
    case "已接入":
      return "success";
    case "配置预览":
      return "warning";
    default:
      return "warning";
  }
}

function SettingsBadge({
  label,
  variant,
}: Readonly<{
  label: string;
  variant: StatusBadgeVariant;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-[0.18rem] text-[10px] font-medium uppercase tracking-wider",
        variant === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          : variant === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400",
      )}
    >
      {label}
    </span>
  );
}

function EntryList({
  items,
}: Readonly<{
  items: EntryItem[];
}>) {
  return (
    <div className="divide-y divide-border/40">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group block rounded-md px-3 py-3 transition-colors hover:bg-muted/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="text-sm font-semibold text-foreground">{item.label}</div>
                <SettingsBadge label={item.state} variant={getStateVariant(item.state)} />
                {item.access === "admin" ? (
                  <SettingsBadge label="ADMIN" variant="neutral" />
                ) : null}
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {item.description}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-sm font-semibold tracking-tight text-foreground">
                {item.stat}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{item.note}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function getEntryGroups(data: SettingsData, actorRole: RoleCode) {
  const entryMeta = buildEntryMeta(data);
  const visibleSections = getVisibleSettingsWorkspaceSections(actorRole);

  return visibleSections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => {
          const meta = entryMeta[item.value];

          if (!meta) {
            return null;
          }

          return {
            ...item,
            ...meta,
          };
        })
        .filter((item): item is EntryItem => Boolean(item)),
    }))
    .filter((section) => section.items.length > 0);
}

export function SettingsControlCenter({
  data,
  actorRole,
}: Readonly<{
  data: SettingsData;
  actorRole: RoleCode;
}>) {
  const isAdmin = actorRole === "ADMIN";
  const entryGroups = getEntryGroups(data, actorRole);
  const totalItemCount = entryGroups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const adminItemCount = settingsWorkspaceSections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.access === "admin").length,
    0,
  );

  return (
    <WorkbenchLayout
      header={
        <SummaryHeader
          eyebrow="管理员设置"
          title="设置中心"
          description={
            isAdmin
              ? "统一维护账号权限、业务主数据、录音存储、AI 转写分析和系统运行配置。"
              : "主管当前可维护账号协作、标签、字典和通话结果；全局系统配置由管理员维护。"
          }
          badges={
            <>
              <StatusBadge label={roleLabels[actorRole]} variant={isAdmin ? "info" : "warning"} />
              <StatusBadge label={isAdmin ? "全局配置视图" : "主数据视图"} variant="success" />
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
              {isAdmin ? (
                <Link
                  href="/settings/call-ai"
                  className="inline-flex min-h-0 items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90"
                >
                  AI 配置
                </Link>
              ) : (
                <Link
                  href="/settings/call-results"
                  className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                >
                  通话结果
                </Link>
              )}
            </div>
          }
          metrics={[
            {
              label: "可见配置",
              value: String(totalItemCount),
              hint: isAdmin ? "管理员可见全量设置入口" : "主管只看主数据设置入口",
            },
            {
              label: "账号",
              value: String(data.overview.userCount),
              hint: `启用 ${data.overview.activeUserCount}`,
            },
            {
              label: "团队",
              value: String(data.overview.teamCount),
              hint: "组织结构与负责人",
            },
            {
              label: "主数据",
              value: String(
                data.overview.tagCount + data.overview.dictionaryItemCount,
              ),
              hint: "标签与字典项合计",
            },
            {
              label: "系统配置",
              value: isAdmin ? String(adminItemCount) : "受限",
              hint: isAdmin ? "录音、AI、安全和审计" : "仅管理员可维护",
            },
          ]}
        />
      }
      sidebar={
        <DetailSidebar
          sections={[
            {
              eyebrow: "Phase 1",
              title: "当前改造边界",
              description:
                "本期先完成设置中心入口和只读配置预览，不改数据库配置模型。",
              items: [
                { label: "配置保存", value: "下一阶段接入 SystemSetting" },
                { label: "权限边界", value: "ADMIN 全局配置，SUPERVISOR 主数据配置" },
                { label: "运行时", value: "录音和 AI 当前仍走环境变量 fallback" },
              ],
            },
            {
              eyebrow: "重点链路",
              title: "后续接入顺序",
              items: [
                { label: "录音存储", value: "本地挂载路径、分片和保留周期" },
                { label: "ASR", value: "内网 LOCAL_HTTP_ASR / FunASR / SenseVoice" },
                { label: "LLM", value: "DeepSeek、通义、Kimi、智谱、火山、混元" },
                { label: "Diarization", value: "销售 / 客户说话人分离" },
              ],
            },
          ]}
        />
      }
    >
      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      <SectionCard eyebrow="导航" title="设置工作区" contentClassName="p-2.5">
        <SettingsWorkspaceNav activeValue="overview" viewerRole={actorRole} />
      </SectionCard>

      <div className="grid gap-4 2xl:grid-cols-2">
        {entryGroups.map((group) => (
          <SectionCard
            key={group.key}
            eyebrow="配置分区"
            title={group.title}
          >
            <EntryList items={group.items} />
          </SectionCard>
        ))}
      </div>
    </WorkbenchLayout>
  );
}
