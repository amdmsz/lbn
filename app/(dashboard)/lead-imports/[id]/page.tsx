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
  getLeadDedupTypeLabel,
  getLeadDedupTypeVariant,
  getLeadCustomerMergeActionLabel,
  getLeadCustomerMergeActionVariant,
  getLeadImportFileTypeLabel,
  getLeadImportRowStatusLabel,
  getLeadImportRowStatusVariant,
  getLeadImportSourceLabel,
  isLeadImportBatchRollbackMode,
  summarizeCustomerContinuationImportMapping,
  summarizeLeadImportMapping,
  type CustomerContinuationImportSummary,
  type LeadImportBatchRollbackMode,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";
import { getLeadImportDetailData } from "@/lib/lead-imports/queries";
import {
  executeLeadImportBatchRollbackAction,
  replaceDuplicateCustomerWithNewLeadAction,
} from "../actions";

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

function formatOptionalDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : formatImportDateTime(date);
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

function buildDetailHref(
  batchId: string,
  mode: LeadImportDetailData["mode"],
  rollbackMode: LeadImportBatchRollbackMode,
) {
  const params = new URLSearchParams();

  if (mode === "customer_continuation") {
    params.set("mode", "customer_continuation");
  }
  if (mode === "lead" && rollbackMode !== "AUDIT_PRESERVED") {
    params.set("rollbackMode", rollbackMode);
  }

  const query = params.toString();
  return query ? `/lead-imports/${batchId}?${query}` : `/lead-imports/${batchId}`;
}

function buildNoticeHref(href: string, status: "success" | "error", message: string) {
  const [pathname, queryString = ""] = href.split("?");
  const params = new URLSearchParams(queryString);
  params.set("noticeStatus", status);
  params.set("noticeMessage", message);
  return `${pathname}?${params.toString()}`;
}

function getRequestedRollbackMode(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): LeadImportBatchRollbackMode {
  const value = Array.isArray(searchParams?.rollbackMode)
    ? searchParams.rollbackMode[0]
    : searchParams?.rollbackMode;

  return value && isLeadImportBatchRollbackMode(value)
    ? value
    : "AUDIT_PRESERVED";
}

function getRowCustomerSnapshot(row: LeadImportDetailRow) {
  const customerRemoved =
    row.rollback.execution?.outcome === "CUSTOMER_DELETED" ||
    row.rollback.execution?.outcome === "CUSTOMER_ALREADY_REMOVED";

  if (row.customerContinuation) {
    return {
      name:
        row.customerContinuation.result.customerName ??
        row.mappedName ??
        row.phoneRaw ??
        "-",
      phone: row.normalizedPhone ?? row.phoneRaw ?? "-",
      href:
        !customerRemoved && row.customerContinuation.result.customerId
          ? `/customers/${row.customerContinuation.result.customerId}`
          : null,
      helper: customerRemoved ? "客户已删除，当前展示导入快照" : null,
    };
  }

  const liveCustomer = row.customerMerge?.customer ?? null;

  return {
    name:
      liveCustomer?.name ??
      row.mappedName ??
      row.customerMerge?.note ??
      row.phoneRaw ??
      "-",
    phone:
      liveCustomer?.phone ??
      row.customerMerge?.phone ??
      row.normalizedPhone ??
      row.phoneRaw ??
      "-",
    href:
      !customerRemoved && liveCustomer?.id ? `/customers/${liveCustomer.id}` : null,
    helper:
      customerRemoved || !liveCustomer
        ? "客户已删除或已脱离 live relation，当前展示导入快照"
        : null,
  };
}

function getRollbackActionSummary(row: LeadImportDetailRow) {
  const preview = row.rollback.preview;
  if (!preview) return null;

  const parts: string[] = [];

  if (preview.customerAction === "DELETE") {
    parts.push("删除本批新建客户");
  } else if (preview.customerAction === "ALREADY_REMOVED") {
    parts.push("客户已不存在");
  }

  if (preview.leadAction === "AUDIT_PRESERVE") {
    parts.push("保留 Lead 审计");
  } else if (preview.leadAction === "HARD_DELETE") {
    parts.push("硬删 Lead");
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

function getRollbackExecutionMeta(
  outcome: NonNullable<LeadImportDetailRow["rollback"]["execution"]>["outcome"],
) {
  switch (outcome) {
    case "CUSTOMER_DELETED":
      return { label: "已删客户", variant: "success" as const };
    case "CUSTOMER_ALREADY_REMOVED":
      return { label: "客户已不存在", variant: "neutral" as const };
    case "LEAD_AUDIT_PRESERVED":
      return { label: "Lead 已审计保留", variant: "info" as const };
    case "LEAD_HARD_DELETED":
      return { label: "Lead 已硬删", variant: "danger" as const };
    case "IGNORED":
    default:
      return { label: "无需执行", variant: "neutral" as const };
  }
}

function CustomerContinuationRowsTable({
  rows,
}: Readonly<{
  rows: LeadImportDetailRow[];
}>) {
  return (
    <div className="crm-table-shell">
      <table className="crm-table">
        <thead>
          <tr>
            <th>撤销预检</th>
            <th>执行结果</th>
            <th>行号</th>
            <th>导入状态</th>
            <th>客户</th>
            <th>负责人结果</th>
            <th>标签结果</th>
            <th>迁移摘要</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const continuation = row.customerContinuation;
            const customer = getRowCustomerSnapshot(row);
            const rollbackAction = getRollbackActionSummary(row);
            const executionMeta = row.rollback.execution
              ? getRollbackExecutionMeta(row.rollback.execution.outcome)
              : null;

            return (
              <tr key={row.id}>
                <td>
                  {row.rollback.preview ? (
                    <div className="space-y-1.5">
                      <StatusBadge
                        label={row.rollback.preview.stateLabel}
                        variant={row.rollback.preview.stateVariant}
                      />
                      <p className="text-xs leading-5 text-black/55">
                        {row.rollback.preview.reason}
                      </p>
                      {rollbackAction ? (
                        <p className="text-xs leading-5 text-black/45">{rollbackAction}</p>
                      ) : null}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {row.rollback.execution && executionMeta ? (
                    <div className="space-y-1.5">
                      <StatusBadge
                        label={executionMeta.label}
                        variant={executionMeta.variant}
                      />
                      <p className="text-xs leading-5 text-black/55">
                        {row.rollback.execution.note}
                      </p>
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
                    {customer.helper ? (
                      <p className="text-xs text-[var(--color-warning)]">{customer.helper}</p>
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
                      {continuation?.mappedCustomer.unresolvedTags.join(" / ") || "无 warning"}
                    </p>
                  </div>
                </td>
                <td className="max-w-[26rem]">
                  {continuation
                    ? formatCustomerContinuationSummary(continuation.mappedCustomer.summary) ||
                      "-"
                    : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function LeadImportDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessLeadImportModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const batch = await getLeadImportDetailData(
    { id: session.user.id, role: session.user.role, teamId: session.user.teamId },
    id,
    getRequestedRollbackMode(resolvedSearchParams),
  );

  if (!batch) notFound();

  const batchId = batch.id;
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

  const mode = batch.mode;
  const detailHref = buildDetailHref(batchId, mode, batch.rollback.selectedMode);
  const headers = getHeaders(batch.headers);
  const mapping = getMapping(batch.mappingConfig);
  const mappingSummary =
    mode === "customer_continuation"
      ? summarizeCustomerContinuationImportMapping(mapping as never)
      : summarizeLeadImportMapping(mapping);
  const rollbackPrecheck = batch.rollback.currentPrecheck;
  const rollbackSummary = rollbackPrecheck?.summary ?? null;
  const rollbackExecutionSummary = batch.rollback.executed?.execution?.summary ?? null;
  const customerContinuationResultSummary = batch.customerContinuationResultSummary;
  const customerContinuationGroupedRows = batch.customerContinuationGroupedRows;
  const customerContinuationMetricCards =
    mode === "customer_continuation"
      ? [
          { label: "A 类标签", value: batch.customerContinuationMetrics.categoryACustomers },
          { label: "B 类标签", value: batch.customerContinuationMetrics.categoryBCustomers },
          { label: "C 类标签", value: batch.customerContinuationMetrics.categoryCCustomers },
          { label: "D 类标签", value: batch.customerContinuationMetrics.categoryDCustomers },
          { label: "已加微信", value: batch.customerContinuationMetrics.wechatAddedCustomers },
          {
            label: "待邀约",
            value: batch.customerContinuationMetrics.pendingInvitationCustomers,
          },
          { label: "待回访", value: batch.customerContinuationMetrics.pendingCallbackCustomers },
        ]
      : [];

  async function executeRollbackFormAction(formData: FormData) {
    "use server";
    const rollbackModeValue = formData.get("rollbackMode");
    const reasonValue = formData.get("reason");
    const result = await executeLeadImportBatchRollbackAction({
      batchId,
      mode:
        typeof rollbackModeValue === "string" &&
        isLeadImportBatchRollbackMode(rollbackModeValue)
          ? rollbackModeValue
          : "AUDIT_PRESERVED",
      reason: typeof reasonValue === "string" ? reasonValue : "",
    });

    redirect(
      buildNoticeHref(
        buildDetailHref(batchId, mode, result.rollbackMode),
        result.status,
        result.message,
      ),
    );
  }

  async function replaceDuplicateCustomerFormAction(formData: FormData) {
    "use server";
    const rowId = formData.get("rowId");
    const reason = formData.get("reason");
    const result = await replaceDuplicateCustomerWithNewLeadAction({
      batchId,
      rowId: typeof rowId === "string" ? rowId : "",
      reason: typeof reason === "string" ? reason : "",
    });

    redirect(buildNoticeHref(detailHref, result.status, result.message));
  }

  const canReplaceDuplicateCustomer =
    session.user.role === "ADMIN" || session.user.role === "SUPERVISOR";

  return (
    <div className="crm-page">
      <PageHeader
        title={mode === "customer_continuation" ? "客户续接导入详情" : "导入批次详情"}
        description="查看导入结果、批次预检，以及整批撤销的执行快照。"
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
        description="批次完成后会保留结果和整批撤销快照。"
      />

      <div className="crm-page-meta">
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
                方便复核这批续接客户的旧分类、标签和承接结果是否符合预期。
              </p>
            </div>
            <StatusBadge
              label={batch.customerContinuationMetricsEstimated ? "可见行估算" : "批次汇总"}
              variant={batch.customerContinuationMetricsEstimated ? "warning" : "info"}
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <DetailItem label="创建人" value={`${batch.createdBy.name} (@${batch.createdBy.username})`} />
          <DetailItem label="模板映射" value={mappingSummary || "未记录字段映射"} />
          <DetailItem label="导入来源" value={getLeadImportSourceLabel(batch.defaultLeadSource)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {headers.map((header) => (
            <span
              key={header}
              className="rounded-full border border-black/8 bg-white/70 px-3 py-1 text-xs text-black/60"
            >
              {header}
            </span>
          ))}
        </div>
      </section>

      <section className="crm-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-black/85">整批撤销导入</h2>
            <p className="mt-1 text-sm leading-6 text-black/58">
              必须先做整批预检，只有整批所有有效行都可逆时才允许执行；不会做 partial rollback。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={batch.rollback.selectedModeLabel}
              variant={batch.rollback.selectedModeVariant}
            />
            {batch.rollback.executed ? (
              <StatusBadge
                label={`已撤销 · ${batch.rollback.executed.modeLabel}`}
                variant={batch.rollback.executed.modeVariant}
              />
            ) : rollbackPrecheck ? (
              <StatusBadge
                label={rollbackPrecheck.overallEligible ? "预检通过" : "预检未通过"}
                variant={rollbackPrecheck.overallEligible ? "success" : "danger"}
              />
            ) : null}
          </div>
        </div>

        {!batch.rollback.executed && batch.rollback.availableModes.length > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {batch.rollback.availableModes.map((item) => {
              const active = item.value === batch.rollback.selectedMode;

              return (
                <Link
                  key={item.value}
                  href={buildDetailHref(batch.id, mode, item.value)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "inline-flex items-center rounded-full border border-[#c8d8ee] bg-[#eef4fb] px-3 py-1.5 text-sm font-semibold text-[#18324d]"
                      : "inline-flex items-center rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-sm text-black/62 transition hover:text-black/84"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 crm-subtle-panel">
          <p className="crm-detail-label">当前回滚策略</p>
          <p className="mt-2 text-sm leading-7 text-black/68">
            {batch.rollback.selectedModeDescription}
          </p>
        </div>

        {rollbackSummary ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="crm-section-card">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">有效行</p>
              <p className="mt-3 text-3xl font-semibold text-black/85">
                {rollbackSummary.effectiveRows}
              </p>
            </div>
            <div className="crm-section-card">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">可逆行</p>
              <p className="mt-3 text-3xl font-semibold text-[var(--color-success)]">
                {rollbackSummary.rollbackableRows}
              </p>
            </div>
            <div className="crm-section-card">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">阻断行</p>
              <p className="mt-3 text-3xl font-semibold text-[var(--color-danger)]">
                {rollbackSummary.blockedRows}
              </p>
            </div>
            <div className="crm-section-card">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">删客 / Lead</p>
              <p className="mt-3 text-3xl font-semibold text-black/85">
                {rollbackSummary.customerDeleteRows} /{" "}
                {batch.rollback.selectedMode === "HARD_DELETE"
                  ? rollbackSummary.hardDeleteLeadRows
                  : rollbackSummary.auditPreservedLeadRows}
              </p>
            </div>
          </div>
        ) : null}

        {rollbackPrecheck?.blockedReason ? (
          <div className="mt-4">
            <ActionBanner tone="danger">{rollbackPrecheck.blockedReason}</ActionBanner>
          </div>
        ) : null}

        {batch.rollback.executed ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">执行快照</p>
              <div className="mt-3 space-y-2 text-sm text-black/62">
                <p>执行时间：{formatImportDateTime(batch.rollback.executed.executedAt)}</p>
                <p>
                  执行人：{batch.rollback.executed.actor.name} (@
                  {batch.rollback.executed.actor.username})
                </p>
                <p>删除客户：{rollbackExecutionSummary?.deletedCustomerRows ?? 0}</p>
                <p>
                  Lead 处理：
                  {batch.rollback.executed.mode === "HARD_DELETE"
                    ? rollbackExecutionSummary?.hardDeletedLeadRows ?? 0
                    : rollbackExecutionSummary?.auditPreservedLeadRows ?? 0}
                </p>
              </div>
            </div>
            <div className="crm-subtle-panel">
              <p className="crm-detail-label">预检快照</p>
              <div className="mt-3 space-y-2 text-sm text-black/62">
                <p>有效行：{rollbackSummary?.effectiveRows ?? 0}</p>
                <p>可逆行：{rollbackSummary?.rollbackableRows ?? 0}</p>
                <p>阻断行：{rollbackSummary?.blockedRows ?? 0}</p>
                <p>执行原因：{batch.rollback.executed.execution?.reason || "未记录"}</p>
              </div>
            </div>
          </div>
        ) : (
          <form
            id="lead-import-rollback-form"
            action={executeRollbackFormAction}
            className="mt-4"
          >
            <StickyActionBar
              title="执行整批撤销"
              description={
                rollbackPrecheck?.overallEligible
                  ? "执行时会在事务中重新预检，确保整批仍然可逆。"
                  : "当前预检未通过，整批撤销按钮会保持禁用。"
              }
            >
              <input
                type="hidden"
                name="rollbackMode"
                value={batch.rollback.selectedMode}
              />
              <input
                name="reason"
                required
                className="crm-input w-full lg:min-w-[20rem]"
                placeholder="请填写本次整批撤销原因"
              />
              <button
                type="submit"
                disabled={!rollbackPrecheck?.overallEligible}
                className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                执行整批撤销
              </button>
            </StickyActionBar>
          </form>
        )}
      </section>

      <section className="crm-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black/85">
            {mode === "customer_continuation" ? "续接结果分组" : "导入结果"}
          </h2>
          <StatusBadge
            label={
              mode === "customer_continuation"
                ? `6 组结果 / 展示前 ${batch.rows.length} 行`
                : `展示前 ${batch.rows.length} 行`
            }
            variant="neutral"
          />
        </div>

        {batch.rows.length > 0 ? (
          mode === "customer_continuation" ? (
            <div className="mt-4 space-y-6">
              {customerContinuationResultSummary ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="crm-section-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                      新建并匹配负责人
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--color-success)]">
                      {customerContinuationResultSummary.createdAssignedCount}
                    </p>
                  </div>
                  <div className="crm-section-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                      命中已有并补齐负责人
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--color-info)]">
                      {customerContinuationResultSummary.matchedAssignedCount}
                    </p>
                  </div>
                  <div className="crm-section-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                      命中已有并保留原负责人
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--color-info)]">
                      {customerContinuationResultSummary.matchedKeptExistingCount}
                    </p>
                  </div>
                  <div className="crm-section-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                      进入公海
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-black/85">
                      {customerContinuationResultSummary.publicPoolCount}
                    </p>
                  </div>
                  <div className="crm-section-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                      重复剔除
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--color-warning)]">
                      {customerContinuationResultSummary.duplicateCount}
                    </p>
                  </div>
                  <div className="crm-section-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-black/45">失败</p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--color-danger)]">
                      {customerContinuationResultSummary.failedCount}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-4">
                {[
                  {
                    key: "createdAssignedRows",
                    title: "新建客户并已匹配负责人",
                    description: "本批次直接新建 Customer，并同步完成负责人匹配。",
                    variant: "success" as const,
                    rows: customerContinuationGroupedRows?.createdAssignedRows ?? [],
                  },
                  {
                    key: "matchedAssignedRows",
                    title: "命中已有客户并补齐负责人",
                    description: "命中已有 Customer，但原先无人负责，本次导入完成了承接。",
                    variant: "info" as const,
                    rows: customerContinuationGroupedRows?.matchedAssignedRows ?? [],
                  },
                  {
                    key: "matchedKeptExistingRows",
                    title: "命中已有客户并保留原负责人",
                    description: "命中已有 Customer，且沿用原负责人，不改 owner 保留规则。",
                    variant: "info" as const,
                    rows: customerContinuationGroupedRows?.matchedKeptExistingRows ?? [],
                  },
                  {
                    key: "publicPoolRows",
                    title: "进入公海",
                    description: "导入后保留到 Customer 主链，但当前不绑定具体负责人。",
                    variant: "neutral" as const,
                    rows: customerContinuationGroupedRows?.publicPoolRows ?? [],
                  },
                ].map((group) => (
                  <div key={group.key} className="crm-subtle-panel">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-black/84">{group.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-black/58">
                          {group.description}
                        </p>
                      </div>
                      <StatusBadge label={`${group.rows.length} 行`} variant={group.variant} />
                    </div>

                    {group.rows.length > 0 ? (
                      <div className="mt-4">
                        <CustomerContinuationRowsTable rows={group.rows} />
                      </div>
                    ) : (
                      <div className="mt-4">
                        <EmptyState
                          title={`暂无${group.title}`}
                          description="当前批次在这一组里没有结果行。"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>撤销预检</th>
                    <th>执行结果</th>
                    <th>行号</th>
                    <th>导入状态</th>
                    <th>姓名</th>
                    <th>手机号</th>
                    <th>Lead</th>
                    <th>客户</th>
                    <th>归并结果</th>
                    <th>标签同步</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.rows.map((row) => {
                    const customer = getRowCustomerSnapshot(row);
                    const rollbackAction = getRollbackActionSummary(row);
                    const executionMeta = row.rollback.execution
                      ? getRollbackExecutionMeta(row.rollback.execution.outcome)
                      : null;

                    return (
                      <tr key={row.id}>
                        <td>
                          {row.rollback.preview ? (
                            <div className="space-y-1.5">
                              <StatusBadge
                                label={row.rollback.preview.stateLabel}
                                variant={row.rollback.preview.stateVariant}
                              />
                              <p className="text-xs leading-5 text-black/55">
                                {row.rollback.preview.reason}
                              </p>
                              {rollbackAction ? (
                                <p className="text-xs leading-5 text-black/45">
                                  {rollbackAction}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {row.rollback.execution && executionMeta ? (
                            <div className="space-y-1.5">
                              <StatusBadge
                                label={executionMeta.label}
                                variant={executionMeta.variant}
                              />
                              <p className="text-xs leading-5 text-black/55">
                                {row.rollback.execution.note}
                              </p>
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
                            {customer.helper ? (
                              <p className="text-xs text-[var(--color-warning)]">
                                {customer.helper}
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
                        <td>{row.rollback.preview?.reason || row.errorReason || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="mt-4">
            <EmptyState title="没有行结果" description="该批次尚未生成可展示的行结果。" />
          </div>
        )}
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
              {batch.duplicateRows.map((row) => {
                const duplicateCustomer = row.duplicateCustomer;

                return (
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
                      {duplicateCustomer ? (
                        <StatusBadge
                          label={duplicateCustomer.executionClassLabel}
                          variant={
                            duplicateCustomer.replacementEligible ? "success" : "neutral"
                          }
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

                    {duplicateCustomer ? (
                      <div className="mt-3 rounded-[0.9rem] border border-black/8 bg-white/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.08em] text-black/40">
                              命中客户
                            </p>
                            <Link
                              href={`/customers/${duplicateCustomer.customerId}`}
                              className="crm-text-link text-sm font-semibold"
                            >
                              {duplicateCustomer.name} / {duplicateCustomer.phone}
                            </Link>
                          </div>
                          <StatusBadge
                            label={
                              duplicateCustomer.replacementEligible
                                ? "可作为新线索"
                                : "不能替换"
                            }
                            variant={
                              duplicateCustomer.replacementEligible ? "success" : "warning"
                            }
                          />
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <DetailItem label="客户分类" value={duplicateCustomer.executionClassLabel} />
                          <DetailItem label="客户状态" value={duplicateCustomer.statusLabel} />
                          <DetailItem label="客户等级" value={duplicateCustomer.levelLabel} />
                          <DetailItem label="归属分组" value={duplicateCustomer.ownershipLabel} />
                          <DetailItem label="负责人" value={duplicateCustomer.ownerLabel} />
                          <DetailItem
                            label="通话 / 微信"
                            value={`${duplicateCustomer.callRecordCount} / ${duplicateCustomer.wechatRecordCount}`}
                          />
                          <DetailItem
                            label="最近通话"
                            value={`${duplicateCustomer.latestCallResultLabel ?? "-"} · ${formatOptionalDateTime(
                              duplicateCustomer.latestCallAt,
                            )}`}
                          />
                          <DetailItem
                            label="最近微信"
                            value={formatOptionalDateTime(duplicateCustomer.latestWechatAt)}
                          />
                        </div>
                        <p className="mt-3 text-sm leading-7 text-black/60">
                          {duplicateCustomer.replacementReason}
                        </p>

                        {canReplaceDuplicateCustomer ? (
                          <form
                            action={replaceDuplicateCustomerFormAction}
                            className="mt-3 space-y-2 border-t border-black/8 pt-3"
                          >
                            <input type="hidden" name="rowId" value={row.id} />
                            <textarea
                              name="reason"
                              required
                              rows={2}
                              defaultValue={`原客户仍为${duplicateCustomer.executionClassLabel}，未接通且未加微信，作为新线索重新分配。`}
                              className="crm-input min-h-[4.5rem] w-full resize-y text-sm"
                              disabled={!duplicateCustomer.replacementEligible}
                            />
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="submit"
                                disabled={!duplicateCustomer.replacementEligible}
                                className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
                                title={
                                  duplicateCustomer.replacementEligible
                                    ? "剔除老客户并创建待分配新线索"
                                    : duplicateCustomer.replacementReason
                                }
                              >
                                作为新线索
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    ) : row.dedupType === "EXISTING_CUSTOMER" ? (
                      <p className="mt-3 rounded-[0.9rem] border border-[var(--color-border-soft)] bg-white/70 px-3 py-2 text-sm leading-7 text-black/55">
                        历史导入行缺少重复客户快照；重新导入后可查看客户分类并执行主管判断。
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="没有重复剔除" description="该批次没有命中手机号重复。" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
