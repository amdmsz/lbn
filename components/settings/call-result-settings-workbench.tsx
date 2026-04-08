import type { ReactNode } from "react";
import {
  deleteCallResultSettingAction,
  saveCallResultSettingAction,
} from "@/app/(dashboard)/settings/call-results/actions";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  CALL_RESULT_EFFECT_LEVELS,
  CALL_RESULT_WECHAT_SYNC_ACTIONS,
  callResultEffectLevelLabels,
  callResultWechatSyncActionLabels,
} from "@/lib/calls/metadata";
import type { CallResultSettingsPageData } from "@/lib/calls/settings";

function Field({
  label,
  children,
  description,
}: Readonly<{
  label: string;
  children: ReactNode;
  description?: string;
}>) {
  return (
    <label className="space-y-2">
      <span className="crm-label">{label}</span>
      {children}
      {description ? (
        <p className="text-sm leading-6 text-black/56">{description}</p>
      ) : null}
    </label>
  );
}

function ToggleField({
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
    <label className="rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.72)] p-3.5">
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

function ResultEditor({
  item,
}: Readonly<{
  item: CallResultSettingsPageData["items"][number];
}>) {
  return (
    <div className="rounded-[1rem] border border-black/7 bg-white/78 p-4">
      <form action={saveCallResultSettingAction} className="space-y-4">
        <input type="hidden" name="id" value={item.id ?? ""} />
        <input type="hidden" name="code" value={item.code} />
        <input type="hidden" name="isSystem" value={item.isSystem ? "true" : "false"} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={item.isSystem ? "系统结果" : "自定义结果"}
                variant={item.isSystem ? "info" : "warning"}
              />
              <StatusBadge
                label={item.isEnabled ? "已启用" : "已停用"}
                variant={item.isEnabled ? "success" : "neutral"}
              />
              <StatusBadge label={`引用 ${item.usageCount}`} variant="neutral" />
            </div>
            <div className="text-base font-semibold text-black/84">{item.label}</div>
            <div className="text-[12px] text-black/46">
              {item.code} ·{" "}
              {item.source === "system-default"
                ? "内置默认"
                : item.source === "system-override"
                  ? "系统覆盖"
                  : "数据库配置"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {item.canDelete ? (
              <button
                formAction={deleteCallResultSettingAction}
                name="id"
                value={item.id ?? ""}
                className="crm-button crm-button-secondary"
              >
                删除
              </button>
            ) : null}
            <button type="submit" className="crm-button crm-button-primary">
              保存
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[220px_1fr_160px]">
          <Field
            label="稳定 code"
            description={
              item.isSystem ? "系统结果固定。" : "创建后只读。"
            }
          >
            <input value={item.code} readOnly className="crm-input bg-[rgba(247,248,250,0.9)]" />
          </Field>

          <Field label="结果名称">
            <input
              name="label"
              defaultValue={item.label}
              required
              maxLength={50}
              className="crm-input"
            />
          </Field>

          <Field label="排序">
            <input
              type="number"
              name="sortOrder"
              min={0}
              max={9999}
              defaultValue={item.sortOrder}
              className="crm-input"
            />
          </Field>
        </div>

        <Field label="说明">
          <textarea
            name="description"
            rows={3}
            maxLength={1000}
            defaultValue={item.description ?? ""}
            className="crm-textarea"
          />
        </Field>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_180px]">
          <Field label="effectLevel">
            <select name="effectLevel" defaultValue={item.effectLevel} className="crm-select">
              {CALL_RESULT_EFFECT_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {callResultEffectLevelLabels[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="wechatSyncAction">
            <select
              name="wechatSyncAction"
              defaultValue={item.wechatSyncAction}
              className="crm-select"
            >
              {CALL_RESULT_WECHAT_SYNC_ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {callResultWechatSyncActionLabels[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="claimProtectionDays"
            description="保留字段。"
          >
            <input
              type="number"
              name="claimProtectionDays"
              min={0}
              max={60}
              defaultValue={item.claimProtectionDays}
              className="crm-input"
            />
          </Field>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <ToggleField
            name="isEnabled"
            label="启用结果"
            description="停用后不可选。"
            defaultChecked={item.isEnabled}
          />
          <ToggleField
            name="resetsPublicPoolClock"
            label="保留时钟标记"
            description="仅保留字段。"
            defaultChecked={item.resetsPublicPoolClock}
          />
          <ToggleField
            name="requiresSupervisorReview"
            label="主管关注"
            description="用于风险结果。"
            defaultChecked={item.requiresSupervisorReview}
          />
        </div>

        {!item.canDelete ? (
          <div className="text-sm leading-6 text-black/50">
            {item.isSystem
              ? "系统结果不允许删除。"
              : item.usageCount > 0
                ? "已有历史引用，只允许停用，不允许删除。"
                : "当前结果不可删除。"}
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function CallResultSettingsWorkbench({
  data,
}: Readonly<{
  data: CallResultSettingsPageData;
}>) {
  const systemItems = data.items.filter((item) => item.isSystem);
  const customItems = data.items.filter((item) => !item.isSystem);

  return (
    <div className="crm-page">
      <SettingsPageHeader
        activeValue="call-results"
        title="通话结果"
        description="维护系统结果与自定义结果。"
        badges={
          <>
            <StatusBadge label="设置域子页" variant="info" />
            <StatusBadge label="Calls 已剔出公海池有效跟进" variant="warning" />
          </>
        }
        metrics={[
          {
            label: "总结果数",
            value: String(data.summary.totalCount),
            hint: "系统结果和自定义结果合并视图",
          },
          {
            label: "启用中",
            value: String(data.summary.enabledCount),
            hint: "可在通话录入中选择",
          },
          {
            label: "系统结果",
            value: String(data.summary.systemCount),
            hint: "稳定 code，不允许删除",
          },
          {
            label: "自定义结果",
            value: String(data.summary.customCount),
            hint: "支持新增、停用和按引用规则删除",
          },
          {
            label: "已有引用",
            value: String(data.summary.referencedCount),
            hint: "已有历史引用时不可硬删",
          },
        ]}
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      <DataTableWrapper
        title="新增自定义结果"
        description="新增自定义结果。"
      >
        <form action={saveCallResultSettingAction} className="space-y-4">
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="isSystem" value="false" />

          <div className="grid gap-4 xl:grid-cols-[220px_1fr_160px]">
            <Field label="code" description="建议使用大写与下划线。">
              <input
                name="code"
                required
                maxLength={64}
                placeholder="例如 FOLLOW_UP_LATER"
                className="crm-input"
              />
            </Field>
            <Field label="结果名称">
              <input
                name="label"
                required
                maxLength={50}
                placeholder="例如 约定稍后回电"
                className="crm-input"
              />
            </Field>
            <Field label="排序">
              <input
                type="number"
                name="sortOrder"
                min={0}
                max={9999}
                defaultValue={900}
                className="crm-input"
              />
            </Field>
          </div>

          <Field label="说明">
            <textarea name="description" rows={3} maxLength={1000} className="crm-textarea" />
          </Field>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_180px]">
            <Field label="effectLevel">
              <select name="effectLevel" defaultValue="MEDIUM" className="crm-select">
                {CALL_RESULT_EFFECT_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {callResultEffectLevelLabels[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="wechatSyncAction">
              <select name="wechatSyncAction" defaultValue="NONE" className="crm-select">
                {CALL_RESULT_WECHAT_SYNC_ACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {callResultWechatSyncActionLabels[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="claimProtectionDays" description="保留字段。">
              <input
                type="number"
                name="claimProtectionDays"
                min={0}
                max={60}
                defaultValue={0}
                className="crm-input"
              />
            </Field>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ToggleField
              name="isEnabled"
              label="创建后立即启用"
              description="创建后可直接使用。"
              defaultChecked
            />
            <ToggleField
              name="resetsPublicPoolClock"
              label="保留时钟标记"
              description="仅保留字段。"
              defaultChecked={false}
            />
            <ToggleField
              name="requiresSupervisorReview"
              label="主管关注"
              description="用于风险结果。"
              defaultChecked={false}
            />
          </div>

          <div className="flex justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              创建自定义结果
            </button>
          </div>
        </form>
      </DataTableWrapper>

      <div className="grid gap-5 xl:grid-cols-2">
        <DataTableWrapper
          title="系统结果"
          description="系统结果。"
        >
          <div className="space-y-4">
            {systemItems.map((item) => (
              <ResultEditor key={item.code} item={item} />
            ))}
          </div>
        </DataTableWrapper>

        <DataTableWrapper
          title="自定义结果"
          description="自定义结果。"
        >
          <div className="space-y-4">
            {customItems.map((item) => (
              <ResultEditor key={item.code} item={item} />
            ))}
            {customItems.length === 0 ? (
              <div className="rounded-[1rem] border border-dashed border-black/10 bg-[rgba(247,248,250,0.68)] px-4 py-6 text-sm leading-7 text-black/56">
                当前还没有自定义结果。
              </div>
            ) : null}
          </div>
        </DataTableWrapper>
      </div>
    </div>
  );
}
