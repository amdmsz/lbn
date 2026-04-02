import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailItem } from "@/components/shared/detail-item";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessLeadImportModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  formatImportDateTime,
  getLeadCustomerMergeActionLabel,
  getLeadCustomerMergeActionVariant,
  getLeadDedupTypeLabel,
  getLeadDedupTypeVariant,
  getLeadImportBatchStatusLabel,
  getLeadImportBatchStatusVariant,
  getLeadImportFileTypeLabel,
  getLeadImportRowStatusLabel,
  getLeadImportRowStatusVariant,
  getLeadImportSourceLabel,
  parseLeadImportNotice,
  summarizeLeadImportMapping,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";
import { getLeadImportDetailData } from "@/lib/lead-imports/queries";

function getHeaders(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getMapping(value: Prisma.JsonValue | null): LeadImportMappingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as LeadImportMappingConfig;
}

function formatMappedPreview(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  const entries = Object.entries(value)
    .filter(([, item]) => typeof item === "string" && item.trim().length > 0)
    .slice(0, 4)
    .map(([key, item]) => `${key}: ${item}`);

  return entries.length > 0 ? entries.join(" / ") : "-";
}

export default async function LeadImportDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessLeadImportModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = parseLeadImportNotice(resolvedSearchParams);
  const batch = await getLeadImportDetailData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    id,
  );

  if (!batch) {
    notFound();
  }

  const headers = getHeaders(batch.headers);
  const mapping = getMapping(batch.mappingConfig);

  return (
    <div className="crm-page">
      <PageHeader
        title="导入批次详情"
        description="查看该批次的线索导入结果、重复剔除情况、客户归并结果以及固定模板字段映射。"
        actions={
          <>
            <StatusBadge
              label={getLeadImportBatchStatusLabel(batch.status)}
              variant={getLeadImportBatchStatusVariant(batch.status)}
            />
            <StatusBadge
              label={`${getLeadImportFileTypeLabel(batch.fileType)} / ${getLeadImportSourceLabel(batch.defaultLeadSource)}`}
              variant="info"
            />
          </>
        }
      />

      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      <div className="crm-page-meta">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/lead-imports" className="crm-text-link">
            返回导入中心
          </Link>
          <Link href="/lead-imports/template" className="crm-text-link">
            下载固定模板
          </Link>
        </div>
        <p className="text-sm text-black/55">
          创建于 {formatImportDateTime(batch.createdAt)}，完成于{" "}
          {batch.importedAt ? formatImportDateTime(batch.importedAt) : "未完成"}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {batch.reportMetrics.map((metric) => (
          <div key={metric.label} className="crm-section-card">
            <p className="text-xs uppercase tracking-[0.18em] text-black/45">
              {metric.label}
            </p>
            <p className="mt-3 text-4xl font-semibold text-black/85">{metric.value}</p>
          </div>
        ))}
      </section>

      <section className="crm-card p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="文件名" value={batch.fileName} />
          <DetailItem
            label="创建人"
            value={`${batch.createdBy.name} (@${batch.createdBy.username})`}
          />
          <DetailItem label="使用模板" value={batch.template?.name ?? "固定模板导入"} />
          <DetailItem
              label="导入来源"
            value={getLeadImportSourceLabel(batch.defaultLeadSource)}
          />
        </div>

        {batch.errorMessage ? (
          <div className="mt-4">
            <ActionBanner tone="danger">{batch.errorMessage}</ActionBanner>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="crm-subtle-panel">
            <p className="crm-detail-label">固定模板映射</p>
            <p className="mt-2 text-sm leading-7 text-black/70">
              {summarizeLeadImportMapping(mapping) || "未记录字段映射"}
            </p>
          </div>

          <div className="crm-subtle-panel">
            <p className="crm-detail-label">实际表头</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {headers.length > 0 ? (
                headers.map((header) => (
                  <span
                    key={header}
                    className="rounded-full border border-black/8 bg-white/70 px-3 py-1 text-xs text-black/60"
                  >
                    {header}
                  </span>
                ))
              ) : (
                <span className="text-sm text-black/55">未记录表头</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="crm-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black/85">失败行</h2>
            <StatusBadge label={`${batch.failureRows.length} 行`} variant="danger" />
          </div>

          {batch.failureRows.length > 0 ? (
            <div className="mt-4 crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>姓名</th>
                    <th>手机号</th>
                    <th>失败原因</th>
                    <th>映射预览</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.failureRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.rowNumber}</td>
                      <td>{row.mappedName || "-"}</td>
                      <td>{row.phoneRaw || "-"}</td>
                      <td className="text-[var(--color-danger)]">
                        {row.errorReason || "未知错误"}
                      </td>
                      <td>{formatMappedPreview(row.mappedData)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="没有失败行" description="该批次没有校验失败的行。" />
            </div>
          )}
        </div>

        <div className="crm-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black/85">重复剔除</h2>
            <StatusBadge label={`${batch.duplicateRows.length} 行`} variant="warning" />
          </div>

          {batch.duplicateRows.length > 0 ? (
            <div className="mt-4 space-y-3">
              {batch.duplicateRows.map((row) => (
                <div key={row.id} className="crm-subtle-panel">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getLeadImportRowStatusLabel(row.status)}
                      variant={getLeadImportRowStatusVariant(row.status)}
                    />
                    {row.dedupType ? (
                      <StatusBadge
                        label={getLeadDedupTypeLabel(row.dedupType)}
                        variant={getLeadDedupTypeVariant(row.dedupType)}
                      />
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-medium text-black/80">
                    第 {row.rowNumber} 行 / {row.mappedName || row.phoneRaw || "未识别"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-black/60">
                    {row.errorReason || "该行因手机号重复被直接剔除。"}
                  </p>
                  <p className="mt-1 text-sm text-black/55">
                    手机号：{row.normalizedPhone || row.phoneRaw || "-"}
                  </p>
                  <p className="mt-1 text-sm text-black/55">
                    命中线索：{row.matchedLeadId ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="没有重复剔除" description="该批次没有命中手机号重复。" />
            </div>
          )}
        </div>
      </section>

      <section className="crm-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black/85">导入结果</h2>
          <StatusBadge label={`展示前 ${batch.rows.length} 行`} variant="neutral" />
        </div>

        {batch.rows.length > 0 ? (
          <div className="mt-4 crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>行号</th>
                  <th>状态</th>
                  <th>姓名</th>
                  <th>手机号</th>
                  <th>线索</th>
                  <th>客户</th>
                  <th>归并结果</th>
                  <th>标签同步</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rowNumber}</td>
                    <td>
                      <StatusBadge
                        label={getLeadImportRowStatusLabel(row.status)}
                        variant={getLeadImportRowStatusVariant(row.status)}
                      />
                    </td>
                    <td>{row.mappedName || "-"}</td>
                    <td>{row.normalizedPhone || row.phoneRaw || "-"}</td>
                    <td>{row.importedLeadId || row.matchedLeadId || "-"}</td>
                    <td>
                      {row.customerMerge?.customer ? (
                        <div className="space-y-1">
                          <p>{row.customerMerge.customer.name}</p>
                          <p className="text-xs text-black/45">
                            {row.customerMerge.customer.phone}
                          </p>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {row.customerMerge ? (
                        <StatusBadge
                          label={getLeadCustomerMergeActionLabel(row.customerMerge.action)}
                          variant={getLeadCustomerMergeActionVariant(
                            row.customerMerge.action,
                          )}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{row.customerMerge ? (row.customerMerge.tagSynced ? "已同步" : "未同步") : "-"}</td>
                    <td>{row.errorReason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState title="没有行结果" description="该批次尚未生成可展示的行结果。" />
          </div>
        )}
      </section>
    </div>
  );
}
