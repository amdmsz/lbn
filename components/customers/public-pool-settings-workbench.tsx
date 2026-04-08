import Link from "next/link";
import { saveCustomerPublicPoolSettingsAction } from "@/app/(dashboard)/customers/public-pool/settings/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContextLink } from "@/components/shared/page-context-link";
import { RecordTabs } from "@/components/shared/record-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import {
  buildCustomerPublicPoolHref,
  buildCustomerPublicPoolReportsHref,
  buildCustomerPublicPoolSettingsHref,
} from "@/lib/customers/public-pool-filter-url";
import {
  publicPoolAutoAssignStrategyOptions,
  publicPoolAutoAssignStrategyLabels,
} from "@/lib/customers/public-pool-metadata";
import type { CustomerPublicPoolSettingsPageData } from "@/lib/customers/public-pool-settings";

function SettingToggle({
  name,
  label,
  description,
  defaultChecked,
}: Readonly<{
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
}>) {
  return (
    <label className="rounded-[16px] border border-black/8 bg-white/72 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-black/82">{label}</p>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-black/56">{description}</p>
          ) : null}
        </div>
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="mt-1 h-4 w-4 rounded border-black/20 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
        />
      </div>
    </label>
  );
}

function SettingNumberInput({
  name,
  label,
  description,
  defaultValue,
  min,
  max,
  placeholder,
}: Readonly<{
  name: string;
  label: string;
  description?: string;
  defaultValue: number | null;
  min: number;
  max: number;
  placeholder?: string;
}>) {
  return (
    <label className="space-y-2 rounded-[16px] border border-black/8 bg-white/72 p-4">
      <span className="text-sm font-medium text-black/82">{label}</span>
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="crm-input"
      />
      {description ? (
        <p className="text-sm leading-6 text-black/56">{description}</p>
      ) : null}
    </label>
  );
}

function SettingSelect({
  name,
  label,
  description,
  defaultValue,
  options,
}: Readonly<{
  name: string;
  label: string;
  description?: string;
  defaultValue: string;
  options: Array<{
    value: string;
    label: string;
  }>;
}>) {
  return (
    <label className="space-y-2 rounded-[16px] border border-black/8 bg-white/72 p-4">
      <span className="text-sm font-medium text-black/82">{label}</span>
      <select name={name} defaultValue={defaultValue} className="crm-select">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? (
        <p className="text-sm leading-6 text-black/56">{description}</p>
      ) : null}
    </label>
  );
}

export function CustomerPublicPoolSettingsWorkbench({
  data,
}: Readonly<{
  data: CustomerPublicPoolSettingsPageData;
}>) {
  const moduleTabs = [
    {
      value: "workbench",
      label: "公海池工作台",
      href: buildCustomerPublicPoolHref({
        view: "pool",
        segment: "all",
        search: "",
        reason: "",
        teamId: data.selectedTeam?.id ?? "",
        hasOrders: "all",
        page: 1,
        pageSize: 20,
      }),
    },
    {
      value: "settings",
      label: "团队规则",
      href: buildCustomerPublicPoolSettingsHref(data.selectedTeam?.id ?? ""),
    },
    {
      value: "reports",
      label: "运营报表",
      href: buildCustomerPublicPoolReportsHref({
        teamId: data.selectedTeam?.id ?? "",
      }),
    },
  ];

  return (
    <div className="crm-page">
      <SummaryHeader
        context={
          <PageContextLink
            href="/customers/public-pool"
            label="返回公海池"
            trail={["客户中心", "公海池", "团队规则"]}
          />
        }
        eyebrow="Team Public Pool Rules"
        title="团队公海规则"
        description="按团队维护回收、保护期与自动分配。"
        badges={
          <>
            <StatusBadge
              label={data.canManageAcrossTeams ? "ADMIN 可跨团队调整" : "主管仅管理本团队"}
              variant={data.canManageAcrossTeams ? "info" : "warning"}
            />
            <StatusBadge
              label={data.setting.source === "custom" ? "当前使用团队覆盖" : "当前使用默认规则"}
              variant={data.setting.source === "custom" ? "success" : "neutral"}
            />
            <StatusBadge
              label={
                data.setting.autoAssignEnabled
                  ? publicPoolAutoAssignStrategyLabels[data.setting.autoAssignStrategy]
                  : "自动分配未启用"
              }
              variant={data.setting.autoAssignEnabled ? "info" : "neutral"}
            />
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/customers/public-pool" className="crm-button crm-button-secondary">
              返回公海池
            </Link>
            <Link
              href={buildCustomerPublicPoolReportsHref({
                teamId: data.selectedTeam?.id ?? "",
              })}
              className="crm-button crm-button-secondary"
            >
              查看运营报表
            </Link>
          </div>
        }
        metrics={data.policySummary}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <div className="crm-subtle-panel">
        <RecordTabs items={moduleTabs} activeValue="settings" />
      </div>

      <DataTableWrapper
        className="mt-5"
        title="规则作用范围"
        description="按团队生效。"
        toolbar={
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={`可见团队 ${data.teamOptions.length}`} variant="neutral" />
            {data.selectedTeam ? (
              <StatusBadge label={`当前团队 ${data.selectedTeam.name}`} variant="info" />
            ) : (
              <StatusBadge label="请先选择团队" variant="warning" />
            )}
          </div>
        }
      >
        <form
          action="/customers/public-pool/settings"
          method="get"
          className="grid gap-3 md:grid-cols-2"
        >
          <label className="space-y-2">
            <span className="crm-label">查看团队</span>
            <select name="teamId" defaultValue={data.selectedTeam?.id ?? ""} className="crm-select">
              {data.canManageAcrossTeams ? <option value="">请选择团队</option> : null}
              {data.teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="crm-button crm-button-secondary">
              切换团队
            </button>
          </div>
        </form>
      </DataTableWrapper>

      {data.selectedTeam ? (
        <form action={saveCustomerPublicPoolSettingsAction} className="mt-5 space-y-5">
          <input type="hidden" name="teamId" value={data.selectedTeam.id} />

          <DataTableWrapper
            title="基础回收规则"
            description="回收开关与阈值。"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle
                name="autoRecycleEnabled"
                label="启用自动回收"
                description="超时后自动回收。"
                defaultChecked={data.setting.autoRecycleEnabled}
              />
              <SettingToggle
                name="ownerExitRecycleEnabled"
                label="启用离职回收"
                description="离职后自动回收。"
                defaultChecked={data.setting.ownerExitRecycleEnabled}
              />
              <SettingNumberInput
                name="defaultInactiveDays"
                label="默认 inactivity days"
                description="超时天数。"
                defaultValue={data.setting.defaultInactiveDays}
                min={1}
                max={180}
              />
              <SettingToggle
                name="respectClaimLock"
                label="自动回收尊重 claim lock"
                description="保护期内不提前回收。"
                defaultChecked={data.setting.respectClaimLock}
              />
            </div>
          </DataTableWrapper>

          <DataTableWrapper
            title="有效跟进与保护期"
            description="有效动作与保护期。"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingNumberInput
                name="strongEffectProtectionDays"
                label="STRONG 保护期天数"
                description="强动作保护期。"
                defaultValue={data.setting.strongEffectProtectionDays}
                min={0}
                max={60}
              />
              <SettingNumberInput
                name="mediumEffectProtectionDays"
                label="MEDIUM 保护期天数"
                description="中动作保护期。"
                defaultValue={data.setting.mediumEffectProtectionDays}
                min={0}
                max={60}
              />
              <SettingToggle
                name="weakEffectResetsClock"
                label="WEAK 也重置回收时钟"
                description="弱动作仅重置时钟。"
                defaultChecked={data.setting.weakEffectResetsClock}
              />
              <SettingToggle
                name="negativeRequiresSupervisorReview"
                label="NEGATIVE 需要主管关注"
                description="负向动作保留关注标识。"
                defaultChecked={data.setting.negativeRequiresSupervisorReview}
              />
            </div>
          </DataTableWrapper>

          <DataTableWrapper
            title="自动分配引擎"
            description="自动分配规则。"
            toolbar={
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={
                    data.setting.autoAssignEnabled
                      ? publicPoolAutoAssignStrategyLabels[data.setting.autoAssignStrategy]
                      : "当前未启用"
                  }
                  variant={data.setting.autoAssignEnabled ? "info" : "neutral"}
                />
                <StatusBadge
                  label={
                    data.roundRobinCursorUser
                      ? `当前游标 ${data.roundRobinCursorUser.name}`
                      : "当前游标未记录"
                  }
                  variant={
                    data.setting.autoAssignStrategy === "ROUND_ROBIN" ? "success" : "neutral"
                  }
                />
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle
                name="autoAssignEnabled"
                label="启用自动分配"
                description="允许预览与执行。"
                defaultChecked={data.setting.autoAssignEnabled}
              />
              <SettingSelect
                name="autoAssignStrategy"
                label="自动分配策略"
                description="轮转或低负载优先。"
                defaultValue={data.setting.autoAssignStrategy}
                options={publicPoolAutoAssignStrategyOptions}
              />
              <SettingNumberInput
                name="autoAssignBatchSize"
                label="自动分配 batch size"
                description="单次处理上限。"
                defaultValue={data.setting.autoAssignBatchSize}
                min={1}
                max={200}
              />
              <SettingNumberInput
                name="maxActiveCustomersPerSales"
                label="单人最大承接客户"
                description="达到上限时跳过。"
                defaultValue={data.setting.maxActiveCustomersPerSales}
                min={1}
                max={500}
                placeholder="不设上限"
              />
            </div>
            <div className="mt-4 rounded-[16px] border border-black/8 bg-[rgba(247,248,250,0.7)] px-4 py-3 text-sm leading-6 text-black/56">
              <p className="font-medium text-black/72">游标说明</p>
              <p className="mt-1">系统会自动续位。</p>
            </div>
          </DataTableWrapper>

          <DataTableWrapper
            title="公海操作边界"
            description="操作权限。"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle
                name="salesCanClaim"
                label="SALES 可认领团队公海"
                description="关闭后不可主动认领。"
                defaultChecked={data.setting.salesCanClaim}
              />
              <SettingToggle
                name="salesCanRelease"
                label="SALES 可主动释放客户"
                description="当前仍无销售释放入口。"
                defaultChecked={data.setting.salesCanRelease}
              />
              <SettingToggle
                name="batchRecycleEnabled"
                label="允许批量回收"
                description="关闭后仅可单个回收。"
                defaultChecked={data.setting.batchRecycleEnabled}
              />
              <SettingToggle
                name="batchAssignEnabled"
                label="允许批量指派"
                description="关闭后仅可单个指派。"
                defaultChecked={data.setting.batchAssignEnabled}
              />
            </div>
          </DataTableWrapper>

          <div className="flex justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              保存团队规则
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="先选择团队"
            description="请先选择团队。"
          />
        </div>
      )}

      <DataTableWrapper
        className="mt-5"
        title="后续深化"
        description="暂不开放。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {data.reservedRules.map((item) => (
            <div
              key={item.label}
              className="rounded-[16px] border border-dashed border-black/12 bg-[rgba(247,248,250,0.7)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-black/78">{item.label}</p>
                <StatusBadge label="后续开放" variant="neutral" />
              </div>
            </div>
          ))}
        </div>
      </DataTableWrapper>
    </div>
  );
}
