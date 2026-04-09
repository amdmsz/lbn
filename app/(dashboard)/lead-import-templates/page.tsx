import Link from "next/link";
import { redirect } from "next/navigation";
import { toggleLeadImportTemplateAction, upsertLeadImportTemplateAction } from "@/app/(dashboard)/lead-imports/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessLeadImportModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  customerContinuationImportFieldDefinitions,
  getLeadImportMode,
  getLeadImportSourceLabel,
  getTemplateDefaultMappingValue,
  leadImportFieldDefinitions,
  parseLeadImportNotice,
  summarizeLeadImportMapping,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";
import { getLeadImportTemplatePageData } from "@/lib/lead-imports/queries";

function getTemplateMapping(mapping: unknown): LeadImportMappingConfig {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return {};
  }

  return mapping as LeadImportMappingConfig;
}

export default async function LeadImportTemplatesPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessLeadImportModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = parseLeadImportNotice(resolvedSearchParams);
  const requestedMode = getLeadImportMode(resolvedSearchParams);
  const data = await getLeadImportTemplatePageData({
    id: session.user.id,
    role: session.user.role,
  });
  const backHref =
    requestedMode === "customer_continuation"
      ? "/lead-imports?mode=customer_continuation"
      : "/lead-imports";

  return (
    <div className="crm-page">
      <PageHeader
        title="导入模板管理"
        description="统一查看线索导入自定义模板和客户续接固定模板，减少重复解释和字段口径不一致。"
        actions={
          <>
            <StatusBadge label={`${data.items.length} 个模板`} variant="info" />
            <StatusBadge label="客户续接固定模板" variant="neutral" />
            <Link href={backHref} className="crm-button crm-button-secondary">
              返回导入中心
            </Link>
          </>
        }
      />

      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title="客户续接固定模板"
        description="客户续接当前走固定模板，不单独保存数据库模板；这里统一查看字段别名、下载模板和承接规则。"
        toolbar={
          <a
            href="/lead-imports/template?mode=customer_continuation"
            download
            className="crm-button crm-button-secondary"
          >
            下载续接模板
          </a>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {customerContinuationImportFieldDefinitions.map((field) => (
              <div key={field.key} className="crm-subtle-panel">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-black/82">{field.label}</p>
                  <StatusBadge
                    label={field.required ? "必填" : "可选"}
                    variant={field.required ? "warning" : "neutral"}
                  />
                </div>
                <p className="mt-2 text-xs leading-6 text-black/55">
                  别名：{field.aliases.slice(0, 5).join(" / ")}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">标签与承接规则</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge label="A/B/C/D -> 已加微信" variant="success" />
                <StatusBadge label="D -> 待邀约" variant="info" />
                <StatusBadge label="未接/拒接 -> 挂断待回访" variant="warning" />
                <StatusBadge label="拒绝添加 / 无效号码" variant="danger" />
              </div>
              <p className="mt-3 text-sm leading-6 text-black/60">
                跟进客户、拒绝添加、无效客户这类信号词不会被当成业务标签 warning，它们会直接映射到对应承接结果。
              </p>
            </div>

            <div className="crm-subtle-panel">
              <p className="crm-detail-label">使用建议</p>
              <p className="mt-2 text-sm leading-7 text-black/60">
                负责人建议填写销售账号；标签列优先放 A/B/C/D 这类业务标签，老系统跟进结果也可以继续写在标签列或跟进结果列，系统会自动识别。
              </p>
            </div>
          </div>
        </div>
      </DataTableWrapper>

      <DataTableWrapper
        title="新建模板"
        description="至少配置手机号映射。模板保存后可在导入中心直接复用。"
      >
        <form action={upsertLeadImportTemplateAction} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="crm-label">模板名称</span>
              <input
                name="name"
                className="crm-input"
                placeholder="例如：渠道 Excel 标准模板"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="crm-label">导入来源</span>
              <select name="defaultLeadSource" className="crm-select" defaultValue="INFO_FLOW">
                {data.sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2 xl:col-span-1">
              <span className="crm-label">模板描述</span>
              <input
                name="description"
                className="crm-input"
                placeholder="例如：适配渠道名单导入"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {leadImportFieldDefinitions.map((field) => (
              <label key={field.key} className="space-y-2">
                <span className="crm-label">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                <input
                  name={`mapping_${field.key}`}
                  className="crm-input"
                  placeholder={`填写对应表头，例如：${field.label}`}
                  required={field.required}
                />
              </label>
            ))}
          </div>

          <div className="flex justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              保存模板
            </button>
          </div>
        </form>
      </DataTableWrapper>

      <DataTableWrapper
        title="模板列表"
        description="可直接修改模板、启停模板，并查看被多少个导入批次复用。"
      >
        {data.items.length > 0 ? (
          <div className="grid gap-4">
            {data.items.map((item) => (
              <div key={item.id} className="crm-card-muted p-5">
                <form action={upsertLeadImportTemplateAction} className="space-y-4">
                  <input type="hidden" name="id" value={item.id} />

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={item.isActive ? "启用中" : "已停用"}
                      variant={item.isActive ? "success" : "neutral"}
                    />
                    <StatusBadge
                      label={`已用于 ${item._count.batches} 个批次`}
                      variant="info"
                    />
                    <StatusBadge
                      label={getLeadImportSourceLabel(item.defaultLeadSource)}
                      variant="neutral"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2">
                      <span className="crm-label">模板名称</span>
                      <input
                        name="name"
                        defaultValue={item.name}
                        className="crm-input"
                        required
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="crm-label">导入来源</span>
                      <select
                        name="defaultLeadSource"
                        defaultValue={item.defaultLeadSource}
                        className="crm-select"
                      >
                        {data.sourceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 md:col-span-2 xl:col-span-1">
                      <span className="crm-label">模板描述</span>
                      <input
                        name="description"
                        defaultValue={item.description ?? ""}
                        className="crm-input"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {leadImportFieldDefinitions.map((field) => (
                      <label key={field.key} className="space-y-2">
                        <span className="crm-label">
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                        <input
                          name={`mapping_${field.key}`}
                          defaultValue={getTemplateDefaultMappingValue(
                            item.mappingConfig,
                            field.key,
                          )}
                          className="crm-input"
                          required={field.required}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="crm-subtle-panel">
                    <p className="crm-detail-label">映射摘要</p>
                    <p className="mt-2 text-sm leading-7 text-black/65">
                      {summarizeLeadImportMapping(getTemplateMapping(item.mappingConfig)) ||
                        "未配置映射"}
                    </p>
                    <p className="mt-2 text-sm text-black/45">
                      创建人：{item.createdBy?.name ?? "系统"} / 创建时间：
                      {" "}
                      {new Intl.DateTimeFormat("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(item.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <button type="submit" className="crm-button crm-button-primary">
                      保存模板
                    </button>
                  </div>
                </form>

                <form action={toggleLeadImportTemplateAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="crm-button crm-button-secondary">
                    {item.isActive ? "停用模板" : "启用模板"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="暂无导入模板"
            description="你还没有保存任何字段映射模板。可以先创建一个常用模板，后续导入时直接套用。"
          />
        )}
      </DataTableWrapper>
    </div>
  );
}
