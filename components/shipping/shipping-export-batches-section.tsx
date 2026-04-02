import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { formatDateTime } from "@/lib/customers/metadata";

type ExportBatchItem = {
  id: string;
  exportNo: string;
  orderCount: number;
  fileName: string;
  fileUrl: string | null;
  remark: string | null;
  exportedAt: Date;
  supplier: {
    id: string;
    name: string;
  };
  exportedBy: {
    id: string;
    name: string;
    username: string;
  } | null;
  _count: {
    shippingTasks: number;
  };
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function buildPageHref(page: number) {
  return page > 1 ? `/shipping/export-batches?page=${page}` : "/shipping/export-batches";
}

export function ShippingExportBatchesSection({
  items,
  pagination,
}: Readonly<{
  items: ExportBatchItem[];
  pagination: PaginationData;
}>) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="暂无报单批次"
        description="先在发货中心按供货商创建报单批次，再回到这里查看导出文件和批次记录。"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 text-sm text-black/60">
        <span>
          共 {pagination.totalCount} 个报单批次，当前第 {pagination.page} / {pagination.totalPages} 页
        </span>
        <Link href="/shipping" className="crm-text-link">
          返回发货中心
        </Link>
      </div>

      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.id} className="crm-card-muted p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-black/80">{item.exportNo}</div>
                <div className="mt-1 text-xs text-black/45">
                  供货商：{item.supplier.name} / 导出时间：{formatDateTime(item.exportedAt)}
                </div>
              </div>
              <div className="text-xs text-black/45">
                导出人：{item.exportedBy?.name || item.exportedBy?.username || "系统"}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                文件名：{item.fileName}
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                订单数：{item.orderCount}
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                关联任务：{item._count.shippingTasks}
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                下载：
                {item.fileUrl ? (
                  <a href={item.fileUrl} className="ml-1 crm-text-link">
                    查看文件
                  </a>
                ) : (
                  "文件不可用"
                )}
              </div>
            </div>

            {item.remark ? (
              <div className="mt-4 text-sm leading-7 text-black/60">备注：{item.remark}</div>
            ) : null}
          </div>
        ))}
      </div>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        summary={`本页显示 ${(pagination.page - 1) * pagination.pageSize + 1} - ${Math.min(
          pagination.page * pagination.pageSize,
          pagination.totalCount,
        )} 个批次，共 ${pagination.totalCount} 个`}
        buildHref={buildPageHref}
      />
    </div>
  );
}
