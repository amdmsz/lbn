import Link from "next/link";
import { saveCustomerPublicPoolSettingsAction } from "@/app/(dashboard)/customers/public-pool/settings/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
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
  description: string;
  defaultChecked: boolean;
}>) {
  return (
    <label className="rounded-[16px] border border-black/8 bg-white/72 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-black/82">{label}</p>
          <p className="mt-1 text-sm leading-6 text-black/56">{description}</p>
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
  description: string;
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
      <p className="text-sm leading-6 text-black/56">{description}</p>
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
  description: string;
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
      <p className="text-sm leading-6 text-black/56">{description}</p>
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
        eyebrow="Team Public Pool Rules"
        title="团队公海规则"
        description="按团队管理自动回收、离职回收、有效跟进保护期和自动分配策略。当前只开放已经真正接入 ownership lifecycle 的规则，不把自动分配做成假配置。"
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
        description="规则先按团队生效。SUPERVISOR 只配置自己的团队，ADMIN 可切换团队查看和调整。"
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
          className="grid gap-3 md:grid-cols-[minmax(0,280px)_auto]"
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
            description="控制自动回收和离职回收的启用状态、默认 inactivity 阈值，以及 claim lock 对自动回收的影响。"
          >
            <div className="grid gap-3 xl:grid-cols-2">
              <SettingToggle
                name="autoRecycleEnabled"
                label="启用自动回收"
                description="当私有客户超过阈值没有有效跟进时，自动从 PRIVATE 回收到 PUBLIC。"
                defaultChecked={data.setting.autoRecycleEnabled}
              />
              <SettingToggle
                name="ownerExitRecycleEnabled"
                label="启用离职回收"
                description="当 owner 被禁用、失去销售资格或脱离承接团队时，自动回收到 PUBLIC。"
                defaultChecked={data.setting.ownerExitRecycleEnabled}
              />
              <SettingNumberInput
                name="defaultInactiveDays"
                label="默认 inactivity days"
                description="没有新的有效跟进超过多少天后，客户进入自动回收候选。"
                defaultValue={data.setting.defaultInactiveDays}
                min={1}
                max={180}
              />
              <SettingToggle
                name="respectClaimLock"
                label="自动回收尊重 claim lock"
                description="开启后，保护期内客户不会被 inactive recycle 提前回收；离职回收仍然忽略 claim lock。"
                defaultChecked={data.setting.respectClaimLock}
              />
            </div>
          </DataTableWrapper>

          <DataTableWrapper
            title="有效跟进与保护期"
            description="这里配置的是规则应用阈值，不直接改 CallResult / Wechat 的原始枚举定义。"
          >
            <div className="grid gap-3 xl:grid-cols-2">
              <SettingNumberInput
                name="strongEffectProtectionDays"
                label="STRONG 保护期天数"
                description="强有效推进动作命中后，锁定/保护期延长多少天。"
                defaultValue={data.setting.strongEffectProtectionDays}
                min={0}
                max={60}
              />
              <SettingNumberInput
                name="mediumEffectProtectionDays"
                label="MEDIUM 保护期天数"
                description="中有效动作命中后，锁定/保护期延长多少天。"
                defaultValue={data.setting.mediumEffectProtectionDays}
                min={0}
                max={60}
              />
              <SettingToggle
                name="weakEffectResetsClock"
                label="WEAK 也重置回收时钟"
                description="开启后，弱动作会更新 lastEffectiveFollowUpAt，但不会额外延长保护期。"
                defaultChecked={data.setting.weakEffectResetsClock}
              />
              <SettingToggle
                name="negativeRequiresSupervisorReview"
                label="NEGATIVE 需要主管关注"
                description="开启后，负向动作继续保持主管关注标识，便于后续规则和报表识别。"
                defaultChecked={data.setting.negativeRequiresSupervisorReview}
              />
            </div>
          </DataTableWrapper>

          <DataTableWrapper
            title="自动分配引擎"
            description="这部分是真正接入 ownership lifecycle 的自动分配规则。仅支持团队内 ROUND_ROBIN 和 LOAD_BALANCING，不做跨团队路由矩阵。"
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
            <div className="grid gap-3 xl:grid-cols-2">
              <SettingToggle
                name="autoAssignEnabled"
                label="启用自动分配"
                description="开启后，团队可在公海池工作台预览并执行自动分配；默认不自动开启。"
                defaultChecked={data.setting.autoAssignEnabled}
              />
              <SettingSelect
                name="autoAssignStrategy"
                label="自动分配策略"
                description="ROUND_ROBIN 按稳定顺序轮转续位，LOAD_BALANCING 按当前私有客户负载低优先。"
                defaultValue={data.setting.autoAssignStrategy}
                options={publicPoolAutoAssignStrategyOptions}
              />
              <SettingNumberInput
                name="autoAssignBatchSize"
                label="自动分配 batch size"
                description="每次 apply 最多处理多少位公海客户。先做可控批次，不做一次性大规模灌入。"
                defaultValue={data.setting.autoAssignBatchSize}
                min={1}
                max={200}
              />
              <SettingNumberInput
                name="maxActiveCustomersPerSales"
                label="单人最大承接客户"
                description="为空表示不设上限；设置后，达到上限的 SALES 会被自动分配跳过。"
                defaultValue={data.setting.maxActiveCustomersPerSales}
                min={1}
                max={500}
                placeholder="不设上限"
              />
            </div>
            <div className="mt-4 rounded-[16px] border border-black/8 bg-[rgba(247,248,250,0.7)] px-4 py-3 text-sm leading-6 text-black/56">
              <p className="font-medium text-black/72">游标说明</p>
              <p className="mt-1">
                Round robin 的续位不在页面里手工编辑。系统会在每次自动分配成功后，把最后一个成功承接的
                SALES 记录为当前游标，下一次从他后面继续轮转。
              </p>
            </div>
          </DataTableWrapper>

          <DataTableWrapper
            title="公海操作边界"
            description="当前只开放已经落地能力的操作限制。跨团队指派仍保持 ADMIN 手动处理，不放到自动分配里。"
          >
            <div className="grid gap-3 xl:grid-cols-2">
              <SettingToggle
                name="salesCanClaim"
                label="SALES 可认领团队公海"
                description="关闭后，销售仍可看到授权范围内公海，但不能主动认领。"
                defaultChecked={data.setting.salesCanClaim}
              />
              <SettingToggle
                name="salesCanRelease"
                label="SALES 可主动释放客户"
                description="当前主工作台仍不新增销售释放入口；这条规则先约束 service，后续详情页动作可直接复用。"
                defaultChecked={data.setting.salesCanRelease}
              />
              <SettingToggle
                name="batchRecycleEnabled"
                label="允许批量回收"
                description="关闭后，主管 / ADMIN 仍可做单个回收，但不能批量回收。"
                defaultChecked={data.setting.batchRecycleEnabled}
              />
              <SettingToggle
                name="batchAssignEnabled"
                label="允许批量指派"
                description="关闭后，主管 / ADMIN 仍可做单个指派，但不能批量手动指派。"
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
            description="规则设置按团队生效。请先选择一个团队，再查看或保存公海池规则。"
          />
        </div>
      )}

      <DataTableWrapper
        className="mt-5"
        title="后续深化"
        description="这些能力明确留给后续深化，不在本轮硬做半套。"
      >
        <div className="grid gap-3 xl:grid-cols-2">
          {data.reservedRules.map((item) => (
            <div
              key={item.label}
              className="rounded-[16px] border border-dashed border-black/12 bg-[rgba(247,248,250,0.7)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-black/78">{item.label}</p>
                <StatusBadge label="后续开放" variant="neutral" />
              </div>
              <p className="mt-2 text-sm leading-6 text-black/56">{item.description}</p>
            </div>
          ))}
        </div>
      </DataTableWrapper>
    </div>
  );
}
