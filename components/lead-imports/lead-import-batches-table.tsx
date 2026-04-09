import Link from "next/link";
import type {
  LeadImportBatchStatus,
  LeadImportFileType,
  LeadSource,
} from "@prisma/client";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  formatImportDateTime,
  getLeadImportFileTypeLabel,
  getLeadImportSourceLabel,
  type LeadImportBatchProgressSnapshot,
  type LeadImportKind,
} from "@/lib/lead-imports/metadata";

type LeadImportBatchListItem = {
  id: string;
  fileName: string;
  fileType: LeadImportFileType;
  status: LeadImportBatchStatus;
  defaultLeadSource: LeadSource;
  totalRows: number;
  successRows: number;
  failedRows: number;
  duplicateRows: number;
  createdCustomerRows: number;
  matchedCustomerRows: number;
  importedAt: Date | null;
  createdAt: Date;
  importKind: LeadImportKind;
  progress: LeadImportBatchProgressSnapshot;
  rollback: {
    id: string;
    modeLabel: string;
    modeVariant: "neutral" | "success" | "danger" | "warning" | "info";
    executedAt: Date;
    actor: { id: string; name: string; username: string };
    executionSummary: {
      deletedCustomerRows: number;
      auditPreservedLeadRows: number;
      hardDeletedLeadRows: number;
    } | null;
  } | null;
  createdBy: { name: string; username: string };
  template: { id: string; name: string } | null;
};

type LeadImportListFilters = {
  mode: string;
  keyword: string;
  status: string;
  page: number;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function buildPageHref(filters: LeadImportListFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.mode && filters.mode !== "lead") params.set("mode", filters.mode);
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/lead-imports?${query}` : "/lead-imports";
}

export function LeadImportBatchesTable({
  items,
  filters,
  pagination,
  scrollTargetId,
}: Readonly<{
  items: LeadImportBatchListItem[];
  filters: LeadImportListFilters;
  pagination: PaginationData;
  scrollTargetId?: string;
}>) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="暂无导入批次"
        description="当前模式下还没有批次记录。你可以先下载模板并上传 Excel 或 CSV。"
      />
    );
  }

  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <div className="space-y-4">
      <div className="crm-table-shell">
        <table className="crm-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>状态 / 阶段</th>
              <th>导入类型</th>
              <th>来源</th>
              <th>批次进度</th>
              <th>客户结果</th>
              <th>创建人</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const rollbackLeadRows =
                item.rollback?.executionSummary?.hardDeletedLeadRows ||
                item.rollback?.executionSummary?.auditPreservedLeadRows ||
                0;

              return (
                <tr key={item.id}>
                  <td>
                    <div className="space-y-0.5">
                      <p className="font-medium text-black/80">{item.fileName}</p>
                      <p className="text-xs text-black/50">
                        {getLeadImportFileTypeLabel(item.fileType)}
                      </p>
                    </div>
                  </td>
                  <td>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={item.progress.statusLabel} variant={item.progress.statusVariant} />
                        <StatusBadge label={item.progress.stageLabel} variant={item.progress.stageVariant} />
                        {item.rollback ? (
                          <StatusBadge
                            label={`已撤销 · ${item.rollback.modeLabel}`}
                            variant={item.rollback.modeVariant}
                          />
                        ) : null}
                      </div>
                      <p className="text-xs text-black/50">
                        {item.rollback
                          ? `执行于 ${formatImportDateTime(item.rollback.executedAt)} / ${item.rollback.actor.name}`
                          : item.progress.isTerminal
                            ? "批次已结束，可进入详情页查看结果。"
                            : `已处理 ${item.progress.processedRows} / ${item.progress.totalRows}，剩余 ${item.progress.remainingRows}。`}
                      </p>
                    </div>
                  </td>
                  <td>{item.importKind === "CUSTOMER_CONTINUATION" ? "客户续接" : "线索导入"}</td>
                  <td>{getLeadImportSourceLabel(item.defaultLeadSource)}</td>
                  <td>
                    <div className="space-y-2">
                      <div className="h-2 overflow-hidden rounded-full bg-black/6">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#4d8fe6_0%,#7ab4ff_100%)]"
                          style={{ width: `${item.progress.progressPercent}%` }}
                        />
                      </div>
                      <div className="space-y-0.5 text-sm text-black/65">
                        <p>{item.progress.progressPercent}%</p>
                        <p>
                          {item.importKind === "CUSTOMER_CONTINUATION" ? "成功客户" : "成功线索"}：
                          {item.successRows}
                        </p>
                        <p className="text-[var(--color-warning)]">重复剔除：{item.duplicateRows}</p>
                        <p className="text-[var(--color-danger)]">失败行：{item.failedRows}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="space-y-0.5 text-sm text-black/65">
                      <p className="text-[var(--color-success)]">新增客户：{item.createdCustomerRows}</p>
                      <p className="text-[var(--color-info)]">命中已有：{item.matchedCustomerRows}</p>
                      {item.rollback?.executionSummary ? (
                        <p className="text-xs text-black/50">
                          删客 {item.rollback.executionSummary.deletedCustomerRows} / Lead {rollbackLeadRows}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {item.createdBy.name}
                    <p className="text-xs text-black/45">@{item.createdBy.username}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="space-y-0.5 text-sm text-black/65">
                      <p>创建：{formatImportDateTime(item.createdAt)}</p>
                      <p>
                        {item.progress.lastHeartbeatAt
                          ? `心跳：${formatImportDateTime(item.progress.lastHeartbeatAt)}`
                          : "心跳：-"}
                      </p>
                      <p>完成：{item.importedAt ? formatImportDateTime(item.importedAt) : "-"}</p>
                    </div>
                  </td>
                  <td>
                    <Link
                      href={
                        item.importKind === "CUSTOMER_CONTINUATION"
                          ? `/lead-imports/${item.id}?mode=customer_continuation`
                          : `/lead-imports/${item.id}`
                      }
                      scroll={false}
                      className="crm-text-link"
                    >
                      查看报告
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        summary={`本页显示 ${start}-${end} 条，共 ${pagination.totalCount} 条批次记录`}
        buildHref={(pageNumber) => buildPageHref(filters, pageNumber)}
        scrollTargetId={scrollTargetId}
      />
    </div>
  );
}
