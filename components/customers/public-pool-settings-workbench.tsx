import Link from "next/link";
import { saveCustomerPublicPoolSettingsAction } from "@/app/(dashboard)/customers/public-pool/settings/actions";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageContextLink } from "@/components/shared/page-context-link";
import { PageHeader } from "@/components/shared/page-header";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  buildCustomerPublicPoolHref,
  buildCustomerPublicPoolReportsHref,
  buildCustomerPublicPoolSettingsHref,
} from "@/lib/customers/public-pool-filter-url";
import {
  publicPoolAutoAssignStrategyLabels,
  publicPoolAutoAssignStrategyOptions,
} from "@/lib/customers/public-pool-metadata";
import type { CustomerPublicPoolSettingsPageData } from "@/lib/customers/public-pool-settings";

const workspaceShellClassName = "crm-workspace-shell";

function HeaderActionLink({
  href,
  label,
}: Readonly<{
  href: string;
  label: string;
}>) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-md border border-border/60 bg-[var(--color-shell-surface-soft)] px-3.5 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-[var(--color-shell-hover)] hover:text-foreground"
    >
      {label}
    </Link>
  );
}

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
    <label className="rounded-xl border border-border/60 bg-[rgba(247,248,250,0.7)] p-3.5 transition-colors hover:border-border hover:bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description ? (
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="mt-1 h-4 w-4 rounded border-border text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
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
    <label className="space-y-2 rounded-xl border border-border/60 bg-[rgba(247,248,250,0.7)] p-3.5 transition-colors hover:border-border hover:bg-card">
      <span className="text-sm font-medium text-foreground">{label}</span>
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
        <p className="text-[13px] leading-6 text-muted-foreground">{description}</p>
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
    <label className="space-y-2 rounded-xl border border-border/60 bg-[rgba(247,248,250,0.7)] p-3.5 transition-colors hover:border-border hover:bg-card">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <select name={name} defaultValue={defaultValue} className="crm-select">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? (
        <p className="text-[13px] leading-6 text-muted-foreground">{description}</p>
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
        ownerId: "",
        calledRange: "any",
        callOutcome: "all",
        targetSalesId: "",
        dialBucket: "all",
        page: 1,
        pageSize: 20,
      }),
    },
    {
      value: "settings",
      label: "鍥㈤槦瑙勫垯",
      href: buildCustomerPublicPoolSettingsHref(data.selectedTeam?.id ?? ""),
    },
    {
      value: "reports",
      label: "杩愯惀鎶ヨ〃",
      href: buildCustomerPublicPoolReportsHref({
        teamId: data.selectedTeam?.id ?? "",
      }),
    },
  ];

  return (
    <WorkbenchLayout
      className="!gap-0"
      header={
        <div className={workspaceShellClassName}>
          <PageHeader
            context={
              <PageContextLink
                href="/customers/public-pool"
                label="返回公海池"
                trail={["客户中心", "公海池", "团队规则"]}
              />
            }
            eyebrow="客户归属生命周期"
            title="团队公海规则"
            description="按团队收口回收、保护期与自动分配，保持客户 ownership lifecycle 在同一套工作台语言内表达。"
            className="border-border/60 bg-card shadow-sm"
            meta={
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
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <HeaderActionLink href="/customers/public-pool" label="返回公海池" />
                <HeaderActionLink
                  href={buildCustomerPublicPoolReportsHref({
                    teamId: data.selectedTeam?.id ?? "",
                  })}
                  label="鏌ョ湅杩愯惀鎶ヨ〃"
                />
              </div>
            }
          />
        </div>
      }
      summary={
        <div className={workspaceShellClassName}>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {data.policySummary.map((item) => (
              <MetricCard
                key={item.label}
                label={item.label}
                value={item.value}
                note={item.hint}
                density="strip"
              />
            ))}
          </div>
        </div>
      }
      toolbar={
        <div className={workspaceShellClassName}>
          <SectionCard
            eyebrow="规则范围"
            title="团队与模块规则"
            description="先切换团队和模块，再在同一套工作台内维护规则。"
            density="compact"
            className="rounded-xl border-border/60 bg-card shadow-sm"
            actions={
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge label={`可见团队 ${data.teamOptions.length}`} variant="neutral" />
                {data.selectedTeam ? (
                  <StatusBadge label={`褰撳墠鍥㈤槦 ${data.selectedTeam.name}`} variant="info" />
                ) : (
                  <StatusBadge label="璇峰厛閫夋嫨鍥㈤槦" variant="warning" />
                )}
              </div>
            }
          >
            <div className="space-y-4">
              <RecordTabs items={moduleTabs} activeValue="settings" />

              <form
                action="/customers/public-pool/settings"
                method="get"
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <label className="space-y-2">
                  <span className="crm-label">鏌ョ湅鍥㈤槦</span>
                  <select
                    name="teamId"
                    defaultValue={data.selectedTeam?.id ?? ""}
                    className="crm-select"
                  >
                    {data.canManageAcrossTeams ? <option value="">璇烽€夋嫨鍥㈤槦</option> : null}
                    {data.teamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <button type="submit" className="crm-button crm-button-secondary">
                    鍒囨崲鍥㈤槦
                  </button>
                </div>
              </form>
            </div>
          </SectionCard>
        </div>
      }
    >
      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      {data.selectedTeam ? (
        <form action={saveCustomerPublicPoolSettingsAction} className="space-y-4">
          <input type="hidden" name="teamId" value={data.selectedTeam.id} />

          <SectionCard
            eyebrow="回收规则"
            title="基础回收规则"
            description="回收开关与基础阈值，先收口当前真正影响 ownership lifecycle 的条件。"
            density="compact"
            className="rounded-xl border-border/60 bg-card shadow-sm"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle
                name="autoRecycleEnabled"
                label="启用自动回收"
                description="瓒呮椂鍚庤嚜鍔ㄥ洖鏀躲€?"
                defaultChecked={data.setting.autoRecycleEnabled}
              />
              <SettingToggle
                name="ownerExitRecycleEnabled"
                label="启用离职回收"
                description="绂昏亴鍚庤嚜鍔ㄥ洖鏀躲€?"
                defaultChecked={data.setting.ownerExitRecycleEnabled}
              />
              <SettingNumberInput
                name="defaultInactiveDays"
                label="默认 inactivity days"
                description="瓒呮椂澶╂暟銆?"
                defaultValue={data.setting.defaultInactiveDays}
                min={1}
                max={180}
              />
              <SettingToggle
                name="respectClaimLock"
                label="自动回收尊重 claim lock"
                description="淇濇姢鏈熷唴涓嶆彁鍓嶅洖鏀躲€?"
                defaultChecked={data.setting.respectClaimLock}
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="有效跟进"
            title="鏈夋晥璺熻繘涓庝繚鎶ゆ湡"
            description="淇濇寔寮哄姩浣滃拰寮卞姩浣滅殑闃堝€间笌淇濇姢鏈熻〃杈惧湪鍚屼竴灞傘€?"
            density="compact"
            className="rounded-xl border-border/60 bg-card shadow-sm"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingNumberInput
                name="strongEffectProtectionDays"
                label="STRONG 淇濇姢鏈熷ぉ鏁?"
                description="寮哄姩浣滀繚鎶ゆ湡銆?"
                defaultValue={data.setting.strongEffectProtectionDays}
                min={0}
                max={60}
              />
              <SettingNumberInput
                name="mediumEffectProtectionDays"
                label="MEDIUM 淇濇姢鏈熷ぉ鏁?"
                description="有效动作保护期。"
                defaultValue={data.setting.mediumEffectProtectionDays}
                min={0}
                max={60}
              />
              <SettingToggle
                name="weakEffectResetsClock"
                label="WEAK 也重置回收时钟"
                description="寮卞姩浣滀粎閲嶇疆鏃堕挓銆?"
                defaultChecked={data.setting.weakEffectResetsClock}
              />
              <SettingToggle
                name="negativeRequiresSupervisorReview"
                label="NEGATIVE 闇€瑕佷富绠″叧娉?"
                description="璐熷悜鍔ㄤ綔淇濈暀鍏虫敞鏍囪瘑銆?"
                defaultChecked={data.setting.negativeRequiresSupervisorReview}
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="自动分配"
            title="自动分配引擎"
            description="自动分配依然是 public-pool 内部的 ownership 承接动作，不另立新业务入口。"
            density="compact"
            className="rounded-xl border-border/60 bg-card shadow-sm"
            actions={
              <div className="flex flex-wrap gap-1.5">
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
                      ? `褰撳墠娓告爣 ${data.roundRobinCursorUser.name}`
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
                description="杈惧埌涓婇檺鏃惰烦杩囥€?"
                defaultValue={data.setting.maxActiveCustomersPerSales}
                min={1}
                max={500}
                placeholder="不设上限"
              />
            </div>
            <div className="mt-4 rounded-xl border border-border/60 bg-[var(--color-shell-surface-soft)] px-4 py-3 text-[13px] leading-6 text-muted-foreground">
              <p className="font-medium text-foreground/70">游标说明</p>
              <p className="mt-1">系统会自动续位，轮转分配和低负载分配都在同一套团队规则下生效。</p>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="动作边界"
            title="公海操作边界"
            description="保持认领、指派、回收的权限功能收口在 ownership lifecycle 中，不扩成第三方编排。"
            density="compact"
            className="rounded-xl border-border/60 bg-card shadow-sm"
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
          </SectionCard>

          <div className="flex justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              淇濆瓨鍥㈤槦瑙勫垯
            </button>
          </div>
        </form>
      ) : (
        <SectionCard
          eyebrow="团队范围"
          title="鍏堥€夋嫨鍥㈤槦"
          description="请先选择团队，再在当前工作台内维护团队规则。"
          density="compact"
          className="rounded-xl border-border/60 bg-card shadow-sm"
        >
          <EmptyState title="鍏堥€夋嫨鍥㈤槦" description="璇峰厛閫夋嫨鍥㈤槦銆?" />
        </SectionCard>
      )}

      <SectionCard
        eyebrow="预留"
        title="鍚庣画娣卞寲"
        description="这些能力暂不开放，保持在当前规则工作台内清晰地提示。"
        density="compact"
        className="rounded-xl border-border/60 bg-card shadow-sm"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {data.reservedRules.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-dashed border-border bg-[var(--color-shell-surface-soft)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <StatusBadge label="鍚庣画寮€鏀?" variant="neutral" />
              </div>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </WorkbenchLayout>
  );
}
