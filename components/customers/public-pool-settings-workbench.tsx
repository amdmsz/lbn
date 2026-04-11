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
      className="inline-flex h-9 items-center rounded-[0.85rem] border border-black/8 bg-[rgba(247,248,250,0.84)] px-3.5 text-sm text-black/66 transition-colors hover:border-black/12 hover:bg-white hover:text-black/84"
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
    <label className="rounded-[1rem] border border-black/8 bg-[rgba(247,248,250,0.7)] p-3.5 transition-colors hover:border-black/12 hover:bg-white/84">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-black/82">{label}</p>
          {description ? (
            <p className="mt-1 text-[13px] leading-6 text-black/56">{description}</p>
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
    <label className="space-y-2 rounded-[1rem] border border-black/8 bg-[rgba(247,248,250,0.7)] p-3.5 transition-colors hover:border-black/12 hover:bg-white/84">
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
        <p className="text-[13px] leading-6 text-black/56">{description}</p>
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
    <label className="space-y-2 rounded-[1rem] border border-black/8 bg-[rgba(247,248,250,0.7)] p-3.5 transition-colors hover:border-black/12 hover:bg-white/84">
      <span className="text-sm font-medium text-black/82">{label}</span>
      <select name={name} defaultValue={defaultValue} className="crm-select">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description ? (
        <p className="text-[13px] leading-6 text-black/56">{description}</p>
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
      label: "鍏捣姹犲伐浣滃彴",
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
                label="杩斿洖鍏捣姹?"
                trail={["瀹㈡埛涓績", "鍏捣姹?", "鍥㈤槦瑙勫垯"]}
              />
            }
            eyebrow="Customer Ownership Lifecycle"
            title="鍥㈤槦鍏捣瑙勫垯"
            description="鎸夊洟闃熸敹鍙ｅ洖鏀躲€佷繚鎶ゆ湡涓庤嚜鍔ㄥ垎閰嶏紝淇濇寔瀹㈡埛 ownership lifecycle 鍦ㄥ悓涓€濂楀伐浣滃彴璇█鍐呰〃杈俱€?"
            className="border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,246,242,0.9))] shadow-[0_14px_30px_rgba(15,23,42,0.04)]"
            meta={
              <>
                <StatusBadge
                  label={data.canManageAcrossTeams ? "ADMIN 鍙法鍥㈤槦璋冩暣" : "涓荤浠呯鐞嗘湰鍥㈤槦"}
                  variant={data.canManageAcrossTeams ? "info" : "warning"}
                />
                <StatusBadge
                  label={data.setting.source === "custom" ? "褰撳墠浣跨敤鍥㈤槦瑕嗙洊" : "褰撳墠浣跨敤榛樿瑙勫垯"}
                  variant={data.setting.source === "custom" ? "success" : "neutral"}
                />
                <StatusBadge
                  label={
                    data.setting.autoAssignEnabled
                      ? publicPoolAutoAssignStrategyLabels[data.setting.autoAssignStrategy]
                      : "鑷姩鍒嗛厤鏈惎鐢?"
                  }
                  variant={data.setting.autoAssignEnabled ? "info" : "neutral"}
                />
              </>
            }
            actions={
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <HeaderActionLink href="/customers/public-pool" label="杩斿洖鍏捣姹?" />
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
            eyebrow="Rules Scope"
            title="鍥㈤槦涓庢ā鍧楄瑙?"
            description="鍏堝垏鎹㈠洟闃熷拰妯″潡锛屽啀鍦ㄥ悓涓€涓伐浣滃彴鍐呯淮鎶よ鍒欍€?"
            density="compact"
            className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
            actions={
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge label={`鍙鍥㈤槦 ${data.teamOptions.length}`} variant="neutral" />
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
            eyebrow="Recycle Rules"
            title="鍩虹鍥炴敹瑙勫垯"
            description="鍥炴敹寮€鍏充笌鍩虹闃堝€硷紝鍏堟敹鍙ｅ綋鍓嶇湡姝ｅ奖鍝?ownership lifecycle 鐨勬潯浠躲€?"
            density="compact"
            className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle
                name="autoRecycleEnabled"
                label="鍚敤鑷姩鍥炴敹"
                description="瓒呮椂鍚庤嚜鍔ㄥ洖鏀躲€?"
                defaultChecked={data.setting.autoRecycleEnabled}
              />
              <SettingToggle
                name="ownerExitRecycleEnabled"
                label="鍚敤绂昏亴鍥炴敹"
                description="绂昏亴鍚庤嚜鍔ㄥ洖鏀躲€?"
                defaultChecked={data.setting.ownerExitRecycleEnabled}
              />
              <SettingNumberInput
                name="defaultInactiveDays"
                label="榛樿 inactivity days"
                description="瓒呮椂澶╂暟銆?"
                defaultValue={data.setting.defaultInactiveDays}
                min={1}
                max={180}
              />
              <SettingToggle
                name="respectClaimLock"
                label="鑷姩鍥炴敹灏婇噸 claim lock"
                description="淇濇姢鏈熷唴涓嶆彁鍓嶅洖鏀躲€?"
                defaultChecked={data.setting.respectClaimLock}
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Effective Follow-up"
            title="鏈夋晥璺熻繘涓庝繚鎶ゆ湡"
            description="淇濇寔寮哄姩浣滃拰寮卞姩浣滅殑闃堝€间笌淇濇姢鏈熻〃杈惧湪鍚屼竴灞傘€?"
            density="compact"
            className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
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
                description="涓姩浣滀繚鎶ゆ湡銆?"
                defaultValue={data.setting.mediumEffectProtectionDays}
                min={0}
                max={60}
              />
              <SettingToggle
                name="weakEffectResetsClock"
                label="WEAK 涔熼噸缃洖鏀舵椂閽?"
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
            eyebrow="Auto Assign"
            title="鑷姩鍒嗛厤寮曟搸"
            description="鑷姩鍒嗛厤渚濈劧鏄?public-pool 鍐呴儴鐨?ownership 鎵胯鍔ㄤ綔锛屼笉鍙︾珛鏂颁笟鍔″叆鍙ｃ€?"
            density="compact"
            className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
            actions={
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge
                  label={
                    data.setting.autoAssignEnabled
                      ? publicPoolAutoAssignStrategyLabels[data.setting.autoAssignStrategy]
                      : "褰撳墠鏈惎鐢?"
                  }
                  variant={data.setting.autoAssignEnabled ? "info" : "neutral"}
                />
                <StatusBadge
                  label={
                    data.roundRobinCursorUser
                      ? `褰撳墠娓告爣 ${data.roundRobinCursorUser.name}`
                      : "褰撳墠娓告爣鏈褰?"
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
                label="鍚敤鑷姩鍒嗛厤"
                description="鍏佽棰勮涓庢墽琛屻€?"
                defaultChecked={data.setting.autoAssignEnabled}
              />
              <SettingSelect
                name="autoAssignStrategy"
                label="鑷姩鍒嗛厤绛栫暐"
                description="杞浆鎴栦綆璐熻浇浼樺厛銆?"
                defaultValue={data.setting.autoAssignStrategy}
                options={publicPoolAutoAssignStrategyOptions}
              />
              <SettingNumberInput
                name="autoAssignBatchSize"
                label="鑷姩鍒嗛厤 batch size"
                description="鍗曟澶勭悊涓婇檺銆?"
                defaultValue={data.setting.autoAssignBatchSize}
                min={1}
                max={200}
              />
              <SettingNumberInput
                name="maxActiveCustomersPerSales"
                label="鍗曚汉鏈€澶ф壙鎺ュ鎴?"
                description="杈惧埌涓婇檺鏃惰烦杩囥€?"
                defaultValue={data.setting.maxActiveCustomersPerSales}
                min={1}
                max={500}
                placeholder="涓嶈涓婇檺"
              />
            </div>
            <div className="mt-4 rounded-[1rem] border border-black/8 bg-[rgba(247,248,250,0.64)] px-4 py-3 text-[13px] leading-6 text-black/56">
              <p className="font-medium text-black/72">娓告爣璇存槑</p>
              <p className="mt-1">绯荤粺浼氳嚜鍔ㄧ画浣嶏紝杞浆鍒嗛厤鍜屼綆璐熻浇鍒嗛厤閮藉湪鍚屼竴濂楀洟闃熻鍒欎笅鐢熸晥銆?</p>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Action Boundary"
            title="鍏捣鎿嶄綔杈圭晫"
            description="淇濇寔璁ら銆佹寚娲俱€佸洖鏀剁殑鏉冮檺鍔熻兘鏀跺彛鍦?ownership lifecycle 涓紝涓嶆墿鎴愮涓夊椾紪鎺掋€?"
            density="compact"
            className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle
                name="salesCanClaim"
                label="SALES 鍙棰嗗洟闃熷叕娴?"
                description="鍏抽棴鍚庝笉鍙富鍔ㄨ棰嗐€?"
                defaultChecked={data.setting.salesCanClaim}
              />
              <SettingToggle
                name="salesCanRelease"
                label="SALES 鍙富鍔ㄩ噴鏀惧鎴?"
                description="褰撳墠浠嶆棤閿€鍞噴鏀惧叆鍙ｃ€?"
                defaultChecked={data.setting.salesCanRelease}
              />
              <SettingToggle
                name="batchRecycleEnabled"
                label="鍏佽鎵归噺鍥炴敹"
                description="鍏抽棴鍚庝粎鍙崟涓洖鏀躲€?"
                defaultChecked={data.setting.batchRecycleEnabled}
              />
              <SettingToggle
                name="batchAssignEnabled"
                label="鍏佽鎵归噺鎸囨淳"
                description="鍏抽棴鍚庝粎鍙崟涓寚娲俱€?"
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
          eyebrow="Team Scope"
          title="鍏堥€夋嫨鍥㈤槦"
          description="璇峰厛閫夋嫨鍥㈤槦锛屽啀鍦ㄥ綋鍓嶅伐浣滃彴鍐呯淮鎶ゅ洟闃熻鍒欍€?"
          density="compact"
          className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
        >
          <EmptyState title="鍏堥€夋嫨鍥㈤槦" description="璇峰厛閫夋嫨鍥㈤槦銆?" />
        </SectionCard>
      )}

      <SectionCard
        eyebrow="Reserved"
        title="鍚庣画娣卞寲"
        description="杩欎簺鑳藉姏鏆備笉寮€鏀撅紝淇濇寔鍦ㄥ綋鍓嶈鍒欏伐浣滃彴鍐呰娓呮櫚鍦版彁绀恒€?"
        density="compact"
        className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {data.reservedRules.map((item) => (
            <div
              key={item.label}
              className="rounded-[1rem] border border-dashed border-black/12 bg-[rgba(247,248,250,0.68)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-black/78">{item.label}</p>
                <StatusBadge label="鍚庣画寮€鏀?" variant="neutral" />
              </div>
              <p className="mt-2 text-[13px] leading-6 text-black/56">{item.description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </WorkbenchLayout>
  );
}
