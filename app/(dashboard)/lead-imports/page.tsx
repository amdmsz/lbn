import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeadImportBatchStatus } from "@prisma/client";
import { LeadImportBatchesTable } from "@/components/lead-imports/lead-import-batches-table";
import { LeadImportListFiltersForm } from "@/components/lead-imports/lead-import-list-filters";
import { LeadImportUploadForm } from "@/components/lead-imports/lead-import-upload-form";
import { ActionBanner } from "@/components/shared/action-banner";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import { WorkspaceGuide } from "@/components/shared/workspace-guide";
import {
  canAccessLeadImportModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  formatImportDateTime,
  getLeadImportBatchStatusLabel,
  getLeadImportBatchStatusVariant,
  leadImportBatchStatusOptions,
  type LeadImportMode,
} from "@/lib/lead-imports/metadata";
import { getLeadImportListData } from "@/lib/lead-imports/queries";

function buildModeHref(mode: LeadImportMode) {
  return mode === "customer_continuation"
    ? "/lead-imports?mode=customer_continuation"
    : "/lead-imports";
}

function buildDeletionBatchHref(input: {
  sourceBatchId: string;
  sourceMode: "LEAD" | "CUSTOMER_CONTINUATION";
}) {
  return input.sourceMode === "CUSTOMER_CONTINUATION"
    ? `/lead-imports/${input.sourceBatchId}?mode=customer_continuation`
    : `/lead-imports/${input.sourceBatchId}`;
}

function LeadImportModeSwitch({ activeMode }: Readonly<{ activeMode: LeadImportMode }>) {
  return (
    <div className="inline-flex rounded-full border border-black/8 bg-[rgba(247,248,250,0.92)] p-1 shadow-[0_8px_20px_rgba(18,24,31,0.04)]">
      {([
        ["lead", "线索导入"],
        ["customer_continuation", "客户续接"],
      ] as const).map(([mode, label]) => {
        const active = activeMode === mode;

        return (
          <Link
            key={mode}
            href={buildModeHref(mode)}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "inline-flex h-9 items-center rounded-full border border-[#c8d8ee] bg-[#eef4fb] px-4 text-sm font-semibold text-[#18324d] shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                : "inline-flex h-9 items-center rounded-full px-4 text-sm text-black/62 transition hover:bg-white hover:text-black/84"
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function LeadImportPartition({
  title,
  description,
  items,
}: Readonly<{
  title: string;
  description: string;
  items: Array<{
    id: string;
    fileName: string;
    status: LeadImportBatchStatus;
    successRows: number;
    failedRows: number;
    duplicateRows: number;
    createdAt: Date;
    importKind: "LEAD" | "CUSTOMER_CONTINUATION";
  }>;
}>) {
  return (
    <div className="crm-section-card space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-black/85">{title}</h3>
        <p className="text-sm leading-6 text-black/58">{description}</p>
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="crm-subtle-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-black/82">{item.fileName}</p>
                  <p className="mt-1 text-xs text-black/48">
                    创建时间：{formatImportDateTime(item.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={item.importKind === "CUSTOMER_CONTINUATION" ? "客户续接" : "线索导入"}
                    variant="neutral"
                  />
                  <StatusBadge
                    label={getLeadImportBatchStatusLabel(item.status)}
                    variant={getLeadImportBatchStatusVariant(item.status)}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-black/62">
                <span>成功 {item.successRows}</span>
                <span>重复 {item.duplicateRows}</span>
                <span>失败 {item.failedRows}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-black/12 bg-white/40 px-4 py-5 text-sm leading-6 text-black/55">
          当前筛选条件下暂无匹配批次。
        </div>
      )}
    </div>
  );
}

export default async function LeadImportsPage({
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
  const data = await getLeadImportListData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  const isCustomerContinuation = data.mode === "customer_continuation";
  const templateHref = isCustomerContinuation
    ? "/lead-imports/template?mode=customer_continuation"
    : "/lead-imports/template";
  const templateManagerHref = isCustomerContinuation
    ? "/lead-import-templates?mode=customer_continuation"
    : "/lead-import-templates";

  return (
    <div className="crm-page">
      <SummaryHeader
        eyebrow="客户运营 / 导入中心"
        title={data.modeMeta.title}
        description={data.modeMeta.description}
        badges={
          <>
            <StatusBadge label="双模式导入" variant="info" />
            <StatusBadge
              label={isCustomerContinuation ? "Customer 主链路" : "Lead 主链路"}
              variant="success"
            />
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LeadImportModeSwitch activeMode={data.mode} />
            <a
              href={templateHref}
              download
              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
            >
              {data.modeMeta.templateDownloadLabel}
            </a>
            <Link
              href={templateManagerHref}
              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
            >
              模板管理
            </Link>
          </div>
        }
        metrics={[
          {
            label: "批次总数",
            value: String(data.overview.totalBatches),
            hint: "当前模式和筛选条件下的批次总量。",
          },
          {
            label: "已完成",
            value: String(data.overview.completedBatches),
            hint: "已经完成导入并产出结果的批次。",
          },
          {
            label: "异常批次",
            value: String(data.overview.failedBatches),
            hint: "失败批次或仍包含失败行的批次。",
          },
          {
            label: "排队 / 导入 / 草稿",
            value: `${data.overview.queuedBatches} / ${data.overview.importingBatches} / ${data.overview.draftBatches}`,
            hint: "快速查看当前后台处理节奏。",
          },
        ]}
      />

      <WorkspaceGuide
        title={isCustomerContinuation ? "客户续接承接方式" : "线索导入承接方式"}
        description={
          isCustomerContinuation
            ? "客户续接导入直接落到 Customer 主链路，重点是保留负责人、标签和迁移摘要，并让客户进入后续承接视角。"
            : "线索导入中心负责批次上传、结果回看和归并质量检查，线索分配与审核仍回到线索中心处理。"
        }
        items={
          isCustomerContinuation
            ? [
                {
                  title: "上传续接模板",
                  description: "支持 Excel 和 CSV，按手机号命中已有客户或直接创建 Customer。",
                  badgeLabel: "批次入口",
                  badgeVariant: "info" as const,
                },
                {
                  title: "保留迁移摘要",
                  description: "负责人、标签和迁移参考消费/跟进摘要会写入日志与客户详情承接区。",
                  badgeLabel: "摘要承接",
                  badgeVariant: "success" as const,
                },
                {
                  title: "进入客户中心承接",
                  description: "导入后客户会进入待接续跟进视角，方便销售继续跟进。",
                  href: "/customers?queue=migration_pending_follow_up",
                  hrefLabel: "查看待接续跟进",
                  badgeLabel: "后续承接",
                  badgeVariant: "warning" as const,
                },
              ]
            : [
                {
                  title: "上传新批次",
                  description: "上传 Excel 或 CSV，统一走固定模板和标准化校验。",
                  badgeLabel: "批次入口",
                  badgeVariant: "info" as const,
                },
                {
                  title: "失败与重复回看",
                  description: "优先回看失败行、重复行和异常批次，避免问题直接流入客户主链。",
                  badgeLabel: "质量检查",
                  badgeVariant: "warning" as const,
                },
                {
                  title: "回到线索中心",
                  description: "导入完成后，从线索中心继续处理分配、归并回看和审计。",
                  href: "/leads",
                  hrefLabel: "进入线索中心",
                  badgeLabel: "下游入口",
                  badgeVariant: "success" as const,
                },
              ]
        }
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      <SectionCard
          eyebrow="删除审批"
          title="待审批导入客户删除"
          description="在导入中心直接回看最近的删除申请，主管和管理员可以从这里快速进入客户详情或批次详情处理。"
          actions={
            <StatusBadge
              label={`${data.pendingImportedCustomerDeletionRequests.totalCount} 条待审批`}
              variant={
                data.pendingImportedCustomerDeletionRequests.totalCount > 0
                  ? "warning"
                  : "neutral"
              }
            />
          }
        >
          {data.pendingImportedCustomerDeletionRequests.items.length > 0 ? (
            <div className="space-y-3">
              {data.pendingImportedCustomerDeletionRequests.items.map((item) => (
                <div key={item.id} className="crm-subtle-panel">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-black/82">
                          {item.customerNameSnapshot}
                        </p>
                        <StatusBadge
                          label={item.statusLabel}
                          variant={item.statusVariant}
                        />
                        <StatusBadge label={item.sourceModeLabel} variant="info" />
                      </div>
                      <p className="text-[13px] leading-6 text-black/56">
                        手机号：{item.customerPhoneSnapshot} / 申请人：{item.requestedBy.name}
                      </p>
                      <p className="text-[13px] leading-6 text-black/56">
                        批次：{item.sourceBatchFileName}
                        {item.sourceRowNumber ? ` / 第 ${item.sourceRowNumber} 行` : ""}
                      </p>
                      <p className="text-[13px] leading-6 text-black/56">
                        原因：{item.requestReason}
                      </p>
                      <p className="text-[12px] leading-5 text-black/45">
                        提交时间：{formatImportDateTime(item.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/customers/${item.customerIdSnapshot}`}
                        className="crm-text-link"
                      >
                        查看客户
                      </Link>
                      <Link
                        href={buildDeletionBatchHref({
                          sourceBatchId: item.sourceBatchId,
                          sourceMode: item.sourceMode,
                        })}
                        className="crm-text-link"
                      >
                        查看批次
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 px-4 py-5 text-sm leading-6 text-black/55">
              当前没有待审批的导入客户删除申请。
            </div>
          )}
      </SectionCard>

      <SectionCard
        eyebrow="上传导入"
        title={data.modeMeta.uploadTitle}
        description={data.modeMeta.uploadDescription}
      >
        <LeadImportUploadForm
          sourceOptions={data.sourceOptions}
          mode={data.mode}
          customerContinuationLookups={data.customerContinuationPreviewLookups}
        />
      </SectionCard>

      <SectionCard
        eyebrow="导入统计"
        title="导入结果概览"
        description="重点关注批次质量、成功导入量和客户承接结果。"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="crm-section-card">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-black/42">
              总行数
            </p>
            <p className="mt-3 text-2xl font-semibold text-black/85">
              {data.statistics.totalRows}
            </p>
            <p className="mt-2 text-sm leading-6 text-black/58">
              当前范围内所有批次累计行数。
            </p>
          </div>
          <div className="crm-section-card">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-black/42">
              成功 / 新增客户
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--color-success)]">
              {data.statistics.successRows} / {data.statistics.createdCustomerRows}
            </p>
            <p className="mt-2 text-sm leading-6 text-black/58">
              {isCustomerContinuation
                ? "成功导入客户数量与本次新增客户数量。"
                : "成功导入的线索数与由此新增的客户数量。"}
            </p>
          </div>
          <div className="crm-section-card">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-black/42">
              重复 / 失败
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--color-warning)]">
              {data.statistics.duplicateRows} / {data.statistics.failedRows}
            </p>
            <p className="mt-2 text-sm leading-6 text-black/58">
              导入质量检查的核心指标。
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="结果分区"
        title="失败、重复与成功批次"
        description="按结果分组查看批次，方便安排后续处理。"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <LeadImportPartition
            title="失败批次"
            description="批次失败或包含失败行的记录。"
            items={data.partitions.failed}
          />
          <LeadImportPartition
            title="重复较多批次"
            description="适合排查手机号重复较多的原始来源。"
            items={data.partitions.duplicate}
          />
          <LeadImportPartition
            title="成功批次"
            description={
              isCustomerContinuation
                ? "适合继续进入客户详情与客户中心承接。"
                : "适合继续进入线索分配与客户归并。"
            }
            items={data.partitions.success}
          />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="批次列表"
        title="导入批次"
        description="保留筛选、分页和结果报告入口。"
        anchorId="lead-import-batches"
      >
        <div className="space-y-6">
          <LeadImportListFiltersForm
            filters={data.filters}
            statusOptions={leadImportBatchStatusOptions}
            scrollTargetId="lead-import-batches"
          />

          <LeadImportBatchesTable
            items={data.items}
            filters={data.filters}
            pagination={data.pagination}
            scrollTargetId="lead-import-batches"
          />
        </div>
      </SectionCard>
    </div>
  );
}
