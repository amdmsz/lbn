import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { LeadImportBatchProgressCard } from "@/components/lead-imports/lead-import-batch-progress-card";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailItem } from "@/components/shared/detail-item";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyActionBar } from "@/components/shared/sticky-action-bar";
import {
  canAccessLeadImportModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  formatImportDateTime,
  getLeadCustomerMergeActionLabel,
  getLeadCustomerMergeActionVariant,
  getLeadImportFileTypeLabel,
  getLeadImportRowStatusLabel,
  getLeadImportRowStatusVariant,
  getLeadImportSourceLabel,
  summarizeCustomerContinuationImportMapping,
  summarizeLeadImportMapping,
  type CustomerContinuationImportSummary,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";
import { getLeadImportDetailData } from "@/lib/lead-imports/queries";
import { deleteImportedCustomersFromBatchAction } from "../actions";

type LeadImportDetailData = NonNullable<
  Awaited<ReturnType<typeof getLeadImportDetailData>>
>;
type LeadImportDetailRow = LeadImportDetailData["rows"][number];

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

function formatLeadMappedPreview(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  const entries = Object.entries(value)
    .filter(([, item]) => typeof item === "string" && item.trim().length > 0)
    .slice(0, 4)
    .map(([key, item]) => `${key}: ${item}`);

  return entries.length > 0 ? entries.join(" / ") : "-";
}

function formatSummaryValue(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

function formatCustomerContinuationSummary(summary: CustomerContinuationImportSummary) {
  return [
    summary.latestPurchasedProduct ? `最近购买：${summary.latestPurchasedProduct}` : null,
    summary.latestIntent ? `最近意向：${summary.latestIntent}` : null,
    summary.latestFollowUpAt ? `最近跟进：${summary.latestFollowUpAt}` : null,
    summary.note ? `备注：${summary.note}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function getOwnerOutcomeLabel(value: string) {
  switch (value) {
    case "ASSIGNED":
      return "已匹配负责人";
    case "KEPT_EXISTING":
      return "保留原负责人";
    case "PUBLIC_POOL":
      return "进入公海";
    case "UNRESOLVED":
      return "负责人未识别";
    default:
      return value;
  }
}

function buildNoticeHref(
  href: string,
  status: "success" | "error",
  message: string,
) {
  const [pathname, queryString = ""] = href.split("?");
  const params = new URLSearchParams(queryString);
  params.set("noticeStatus", status);
  params.set("noticeMessage", message);
  return `${pathname}?${params.toString()}`;
}

function getRowCustomerSnapshot(row: LeadImportDetailRow) {
  if (row.customerContinuation) {
    return {
      name:
        row.deletion?.latestRequest?.customerNameSnapshot ??
        row.customerContinuation.result.customerName ??
        row.mappedName ??
        row.phoneRaw ??
        "-",
      phone:
        row.deletion?.latestRequest?.customerPhoneSnapshot ??
        row.normalizedPhone ??
        row.phoneRaw ??
        "-",
      href:
        row.deletion?.hasLiveCustomer && row.deletion.customerId
          ? `/customers/${row.deletion.customerId}`
          : null,
    };
  }

  return {
    name:
      row.customerMerge?.customer?.name ??
      row.deletion?.latestRequest?.customerNameSnapshot ??
      row.customerMerge?.note ??
      row.mappedName ??
      row.phoneRaw ??
      "-",
    phone:
      row.customerMerge?.customer?.phone ??
      row.deletion?.latestRequest?.customerPhoneSnapshot ??
      row.customerMerge?.phone ??
      row.normalizedPhone ??
      row.phoneRaw ??
      "-",
    href:
      row.customerMerge?.customer?.id ? `/customers/${row.customerMerge.customer.id}` : null,
  };
}

function getRowDeletionRequestNote(row: LeadImportDetailRow) {
  const request = row.deletion?.latestRequest;

  if (!request) {
    return null;
  }

  if (request.status === "PENDING_SUPERVISOR") {
    return `申请人：${request.requestedBy.name}`;
  }

  if (request.status === "REJECTED") {
    return request.rejectReason?.trim() || "申请已驳回";
  }

  if (request.status === "EXECUTED") {
    return request.executedAt
      ? `执行于 ${formatImportDateTime(request.executedAt)}`
      : "客户已删除";
  }

  return null;
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

  const notice =
    resolvedSearchParams && "noticeMessage" in resolvedSearchParams
      ? {
          tone:
            (Array.isArray(resolvedSearchParams.noticeStatus)
              ? resolvedSearchParams.noticeStatus[0]
              : resolvedSearchParams.noticeStatus) === "success"
              ? ("success" as const)
              : ("danger" as const),
          message:
            (Array.isArray(resolvedSearchParams.noticeMessage)
              ? resolvedSearchParams.noticeMessage[0]
              : resolvedSearchParams.noticeMessage) ?? "",
        }
      : null;
  const batchId = batch.id;
  const mode = batch.mode;
  const headers = getHeaders(batch.headers);
  const mapping = getMapping(batch.mappingConfig);
  const backHref =
    mode === "customer_continuation" ? "/lead-imports?mode=customer_continuation" : "/lead-imports";
  const detailHref =
    mode === "customer_continuation"
      ? `/lead-imports/${batchId}?mode=customer_continuation`
      : `/lead-imports/${batchId}`;
  const templateHref =
    mode === "customer_continuation"
      ? "/lead-imports/template?mode=customer_continuation"
      : "/lead-imports/template";
  const mappingSummary =
    mode === "customer_continuation"
      ? summarizeCustomerContinuationImportMapping(mapping as never)
      : summarizeLeadImportMapping(mapping);
  const customerContinuationMetricCards =
    mode === "customer_continuation"
      ? [
          { label: "A 类标签", value: batch.customerContinuationMetrics.categoryACustomers },
          { label: "B 类标签", value: batch.customerContinuationMetrics.categoryBCustomers },
          { label: "C 类标签", value: batch.customerContinuationMetrics.categoryCCustomers },
          { label: "D 类标签", value: batch.customerContinuationMetrics.categoryDCustomers },
          { label: "已加微信", value: batch.customerContinuationMetrics.wechatAddedCustomers },
          { label: "待邀约", value: batch.customerContinuationMetrics.pendingInvitationCustomers },
          { label: "待回访", value: batch.customerContinuationMetrics.pendingCallbackCustomers },
          { label: "拒绝添加", value: batch.customerContinuationMetrics.refusedWechatCustomers },
          { label: "无效号码", value: batch.customerContinuationMetrics.invalidNumberCustomers },
        ]
      : [];

  const deletableRows = batch.rows.filter((row) => row.deletion?.selectable);

  async function deleteImportedCustomersFormAction(formData: FormData) {
    "use server";

    const customerIds = formData
      .getAll("customerIds")
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const reasonValue = formData.get("reason");
    const reason = typeof reasonValue === "string" ? reasonValue : "";
    const result = await deleteImportedCustomersFromBatchAction({
      batchId,
      customerIds,
      reason,
    });

    redirect(
      buildNoticeHref(
        detailHref,
        result.status === "success" ? "success" : "error",
        result.message,
      ),
    );
  }

  return (
    <div className="crm-page">
      <PageHeader
        title={mode === "customer_continuation" ? "客户续接导入详情" : "导入批次详情"}
        description={
          mode === "customer_continuation"
            ? "查看续接迁移批次的客户命中、负责人解析、标签 warning 与迁移摘要。"
            : "查看该批次的线索导入结果、重复剔除、客户归并结果以及固定模板字段映射。"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={mode === "customer_continuation" ? "客户续接" : "线索导入"}
              variant="neutral"
            />
            <StatusBadge
              label={`${getLeadImportFileTypeLabel(batch.fileType)} / ${getLeadImportSourceLabel(batch.defaultLeadSource)}`}
              variant="info"
            />
            <StatusBadge label={batch.progress.statusLabel} variant={batch.progress.statusVariant} />
          </div>
        }
      />

      {notice?.message ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      <LeadImportBatchProgressCard
        batchId={batch.id}
        mode={mode}
        detailHref={detailHref}
        initialProgress={batch.progress}
        title="导入进度"
        description="批次详情页会持续轮询后台 Worker 的处理阶段；批次完成后，下方结果区会保留最终报告和行明细。"
      />

      <div className="crm-page-meta">
        <div className="flex flex-wrap items-center gap-4">
          <Link href={backHref} className="crm-text-link">
            返回导入中心
          </Link>
          <Link href={templateHref} className="crm-text-link">
            下载当前模板
          </Link>
        </div>
        <p className="text-sm text-black/55">
          创建于 {formatImportDateTime(batch.createdAt)}，完成于{" "}
          {batch.importedAt ? formatImportDateTime(batch.importedAt) : "尚未完成"}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {batch.reportMetrics.map((metric) => (
          <div key={metric.label} className="crm-section-card">
            <p className="text-xs uppercase tracking-[0.18em] text-black/45">{metric.label}</p>
            <p className="mt-3 text-4xl font-semibold text-black/85">{metric.value}</p>
          </div>
        ))}
      </section>

      {mode === "customer_continuation" ? (
        <section className="crm-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-black/85">映射统计</h2>
              <p className="mt-1 text-sm leading-6 text-black/58">
                直接查看这批续接客户里旧分类和承接结果的命中情况，方便复核标签、待邀约和待回访是否符合预期。
              </p>
            </div>
            <StatusBadge
              label={batch.customerContinuationMetricsEstimated ? "可见行估算" : "批次汇总"}
              variant={batch.customerContinuationMetricsEstimated ? "warning" : "info"}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customerContinuationMetricCards.map((metric) => (
              <div key={metric.label} className="crm-section-card">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                  {metric.label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-black/85">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="crm-card p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="文件名" value={batch.fileName} />
          <DetailItem
            label="创建人"
            value={`${batch.createdBy.name} (@${batch.createdBy.username})`}
          />
          <DetailItem
            label="使用模板"
            value={
              mode === "customer_continuation"
                ? "固定续接模板"
                : batch.template?.name ?? "固定模板导入"
            }
          />
          <DetailItem label="导入来源" value={getLeadImportSourceLabel(batch.defaultLeadSource)} />
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
              {mappingSummary || "未记录字段映射。"}
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
                <span className="text-sm text-black/55">未记录表头。</span>
              )}
            </div>
          </div>
        </div>

        {mode === "customer_continuation" && batch.customerContinuationReport ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">批次 warning</p>
              <div className="mt-3 space-y-2 text-sm text-black/62">
                <p>未识别负责人：{batch.customerContinuationReport.summary.unresolvedOwners}</p>
                <p>未识别标签：{batch.customerContinuationReport.summary.unresolvedTags}</p>
              </div>
            </div>
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">负责人 / 标签样本</p>
              <div className="mt-3 space-y-2 text-sm text-black/62">
                <p>
                  负责人 warning：
                  {batch.customerContinuationReport.warnings.unresolvedOwnerValues
                    .slice(0, 3)
                    .map((item) => `${item.value} (${item.count})`)
                    .join(" / ") || "无"}
                </p>
                <p>
                  标签 warning：
                  {batch.customerContinuationReport.warnings.unresolvedTagValues
                    .slice(0, 3)
                    .map((item) => `${item.value} (${item.count})`)
                    .join(" / ") || "无"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
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
                      <td>
                        {mode === "customer_continuation" && row.customerContinuation
                          ? formatCustomerContinuationSummary(
                              row.customerContinuation.mappedCustomer.summary,
                            ) || "-"
                          : formatLeadMappedPreview(row.mappedData)}
                      </td>
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
          <h2 className="text-lg font-semibold text-black/85">
            {mode === "customer_continuation" ? "续接结果" : "导入结果"}
          </h2>
          <StatusBadge label={`展示前 ${batch.rows.length} 行`} variant="neutral" />
        </div>

        {batch.rows.length > 0 ? (
          <form action={deleteImportedCustomersFormAction} className="mt-4 space-y-4">
            <StickyActionBar
              title="批量删除导入客户"
              description={
                deletableRows.length > 0
                  ? `当前批次有 ${deletableRows.length} 行满足“导入新建、无交易阻断、当前可删”条件。`
                  : "当前批次没有满足直接删除条件的导入新建客户，仍可通过下方状态回看审批与删除结果。"
              }
            >
              {deletableRows.length > 0 ? (
                <>
                  <input
                    name="reason"
                    required
                    className="crm-input w-full lg:min-w-[20rem]"
                    placeholder="请填写本次批量删除原因"
                  />
                  <button type="submit" className="crm-button crm-button-primary">
                    删除选中客户
                  </button>
                </>
              ) : null}
            </StickyActionBar>

            {mode === "customer_continuation" ? (
            <div className="crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>选择</th>
                    <th>删除状态</th>
                    <th>行号</th>
                    <th>状态</th>
                    <th>客户</th>
                    <th>负责人结果</th>
                    <th>标签结果</th>
                    <th>迁移摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.rows.map((row) => {
                    const continuation = row.customerContinuation;
                    const customer = getRowCustomerSnapshot(row);
                    const deletionRequestNote = getRowDeletionRequestNote(row);
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.deletion?.selectable && row.deletion.customerId ? (
                            <input
                              type="checkbox"
                              name="customerIds"
                              value={row.deletion.customerId}
                              className="h-4 w-4 rounded border border-black/20"
                            />
                          ) : (
                            <span className="text-xs text-black/30">-</span>
                          )}
                        </td>
                        <td>
                          {row.deletion ? (
                            <div className="space-y-1.5">
                              <StatusBadge
                                label={row.deletion.stateLabel}
                                variant={row.deletion.stateVariant}
                              />
                              <p className="text-xs leading-5 text-black/55">
                                {row.deletion.reason}
                              </p>
                              {deletionRequestNote ? (
                                <p className="text-xs leading-5 text-black/45">
                                  {deletionRequestNote}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{row.rowNumber}</td>
                        <td>
                          <StatusBadge
                            label={getLeadImportRowStatusLabel(row.status)}
                            variant={getLeadImportRowStatusVariant(row.status)}
                          />
                        </td>
                        <td>
                          <div className="space-y-1">
                            {customer.href ? (
                              <Link href={customer.href} className="crm-text-link">
                                {customer.name}
                              </Link>
                            ) : (
                              <p>{customer.name}</p>
                            )}
                            <p className="text-xs text-black/45">{customer.phone}</p>
                            {!customer.href && row.deletion?.latestRequest?.status === "EXECUTED" ? (
                              <p className="text-xs text-[var(--color-warning)]">
                                客户已删除，当前展示导入快照
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="space-y-1 text-sm text-black/65">
                            <p>{getOwnerOutcomeLabel(continuation?.result.ownerOutcome ?? "-")}</p>
                            <p className="text-xs text-black/45">
                              {formatSummaryValue(continuation?.mappedCustomer.ownerUsername)}
                            </p>
                          </div>
                        </td>
                        <td>
                          <div className="space-y-1 text-sm text-black/65">
                            <p>{continuation?.mappedCustomer.tags.join(" / ") || "无标签"}</p>
                            <p className="text-xs text-[var(--color-warning)]">
                              {continuation?.mappedCustomer.unresolvedTags.join(" / ") ||
                                "无 warning"}
                            </p>
                          </div>
                        </td>
                        <td className="max-w-[26rem]">
                          {continuation
                            ? formatCustomerContinuationSummary(
                                continuation.mappedCustomer.summary,
                              ) || "-"
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>选择</th>
                    <th>删除状态</th>
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
                  {batch.rows.map((row) => {
                    const customer = getRowCustomerSnapshot(row);
                    const deletionRequestNote = getRowDeletionRequestNote(row);

                    return (
                    <tr key={row.id}>
                      <td>
                        {row.deletion?.selectable && row.deletion.customerId ? (
                          <input
                            type="checkbox"
                            name="customerIds"
                            value={row.deletion.customerId}
                            className="h-4 w-4 rounded border border-black/20"
                          />
                        ) : (
                          <span className="text-xs text-black/30">-</span>
                        )}
                      </td>
                      <td>
                        {row.deletion ? (
                          <div className="space-y-1.5">
                            <StatusBadge
                              label={row.deletion.stateLabel}
                              variant={row.deletion.stateVariant}
                            />
                            <p className="text-xs leading-5 text-black/55">
                              {row.deletion.reason}
                            </p>
                            {deletionRequestNote ? (
                              <p className="text-xs leading-5 text-black/45">
                                {deletionRequestNote}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
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
                        <div className="space-y-1">
                          {customer.href ? (
                            <Link href={customer.href} className="crm-text-link">
                              {customer.name}
                            </Link>
                          ) : (
                            <p>{customer.name}</p>
                          )}
                          <p className="text-xs text-black/45">{customer.phone}</p>
                          {!customer.href && row.deletion?.latestRequest?.status === "EXECUTED" ? (
                            <p className="text-xs text-[var(--color-warning)]">
                              客户已删除，当前展示归并快照
                            </p>
                          ) : null}
                        </div>
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
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </form>
        ) : (
          <div className="mt-4">
            <EmptyState title="没有行结果" description="该批次尚未生成可展示的行结果。" />
          </div>
        )}
      </section>
    </div>
  );
}
