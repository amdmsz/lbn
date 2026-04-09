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
  getLeadImportBatchStatusLabel,
  getLeadImportBatchStatusVariant,
  getLeadImportFileTypeLabel,
  getLeadImportSourceLabel,
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
  createdBy: {
    name: string;
    username: string;
  };
  template: {
    id: string;
    name: string;
  } | null;
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

  if (filters.mode && filters.mode !== "lead") {
    params.set("mode", filters.mode);
  }

  if (filters.keyword) {
    params.set("keyword", filters.keyword);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

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
              <th>状态</th>
              <th>导入类型</th>
              <th>来源</th>
              <th>导入结果</th>
              <th>客户结果</th>
              <th>创建人</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
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
                  <StatusBadge
                    label={getLeadImportBatchStatusLabel(item.status)}
                    variant={getLeadImportBatchStatusVariant(item.status)}
                  />
                </td>
                <td>
                  {item.importKind === "CUSTOMER_CONTINUATION" ? "客户续接" : "线索导入"}
                </td>
                <td>{getLeadImportSourceLabel(item.defaultLeadSource)}</td>
                <td>
                  <div className="space-y-0.5 text-sm text-black/65">
                    <p>
                      {item.importKind === "CUSTOMER_CONTINUATION" ? "成功客户" : "成功线索"}：
                      {item.successRows}
                    </p>
                    <p className="text-[var(--color-warning)]">重复剔除：{item.duplicateRows}</p>
                    <p className="text-[var(--color-danger)]">失败行：{item.failedRows}</p>
                  </div>
                </td>
                <td>
                  <div className="space-y-0.5 text-sm text-black/65">
                    <p className="text-[var(--color-success)]">新增客户：{item.createdCustomerRows}</p>
                    <p className="text-[var(--color-info)]">命中已有：{item.matchedCustomerRows}</p>
                  </div>
                </td>
                <td>
                  {item.createdBy.name}
                  <p className="text-xs text-black/45">@{item.createdBy.username}</p>
                </td>
                <td className="whitespace-nowrap">
                  <div className="space-y-0.5 text-sm text-black/65">
                    <p>创建：{formatImportDateTime(item.createdAt)}</p>
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
            ))}
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
