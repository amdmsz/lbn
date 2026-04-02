import { redirect } from "next/navigation";
import { LeadImportBatchStatus } from "@prisma/client";
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
} from "@/lib/lead-imports/metadata";
import { getLeadImportListData } from "@/lib/lead-imports/queries";

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: LeadImportBatchStatus.COMPLETED, label: "已完成" },
  { value: LeadImportBatchStatus.IMPORTING, label: "导入中" },
  { value: LeadImportBatchStatus.FAILED, label: "已失败" },
  { value: LeadImportBatchStatus.DRAFT, label: "待导入" },
] as const;

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
                <StatusBadge
                  label={getLeadImportBatchStatusLabel(item.status)}
                  variant={getLeadImportBatchStatusVariant(item.status)}
                />
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

  return (
    <div className="crm-page">
      <SummaryHeader
        eyebrow="客户运营 / 导入中心"
        title="导入中心"
        description="这里是 ADMIN / SUPERVISOR 的批次管理与归并查看台，承接上传、结果回看和导入质量检查。"
        badges={
          <>
            <StatusBadge label="批次管理" variant="info" />
            <StatusBadge label="导入复核台" variant="success" />
          </>
        }
        actions={
          <a href="/lead-imports/template" download className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
            下载模板
          </a>
        }
        metrics={[
          {
            label: "批次总数",
            value: String(data.overview.totalBatches),
            hint: "符合当前筛选条件的导入批次数量。",
          },
          {
            label: "已完成",
            value: String(data.overview.completedBatches),
            hint: "已生成结果报告的导入批次。",
          },
          {
            label: "异常批次",
            value: String(data.overview.failedBatches),
            hint: "失败批次或仍包含失败行的批次。",
          },
          {
            label: "导入中 / 待导入",
            value: `${data.overview.importingBatches} / ${data.overview.draftBatches}`,
            hint: "快速查看当前处理节奏。",
          },
        ]}
      />

      <WorkspaceGuide
        title="导入中心承接方式"
        description="导入中心负责批次上传、结果回看和归并质量检查。线索分配与审计仍回到线索中心处理。"
        items={[
          {
            title: "上传新批次",
            description: "上传 Excel 或 CSV，统一走固定模板和标准化校验。",
            badgeLabel: "批次入口",
            badgeVariant: "info",
          },
          {
            title: "失败与重复回看",
            description: "优先回看失败行、重复行和异常批次，避免问题直接流入客户主链。",
            badgeLabel: "质量检查",
            badgeVariant: "warning",
          },
          {
            title: "回到线索中心",
            description: "导入完成后，从线索中心继续处理分配、归并回看和审计。",
            href: "/leads",
            hrefLabel: "进入线索中心",
            badgeLabel: "下游入口",
            badgeVariant: "success",
          },
        ]}
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      <SectionCard
        eyebrow="上传导入"
        title="上传导入文件"
        description="上传 Excel 或 CSV 后，系统会校验必填列、手机号标准化和文件内重复。"
      >
        <LeadImportUploadForm sourceOptions={data.sourceOptions} />
      </SectionCard>

      <SectionCard
        eyebrow="导入统计"
        title="导入结果概览"
        description="重点关注行质量、客户创建情况和异常分布。"
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
              成功导入的线索行和新增客户数量。
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
            description="可继续进入客户承接与后续执行的批次。"
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
            statusOptions={statusOptions}
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
