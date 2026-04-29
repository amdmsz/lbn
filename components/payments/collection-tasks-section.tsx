import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  collectionTaskStatusOptions,
  collectionTaskTypeOptions,
  getCollectionTaskStatusLabel,
  getCollectionTaskStatusVariant,
  getCollectionTaskTypeLabel,
  getCollectionTaskTypeVariant,
  getPaymentCollectionChannelLabel,
  getPaymentPlanProgressSummary,
  getPaymentPlanStageLabel,
  getPaymentPlanStageVariant,
  getPaymentPlanStatusLabel,
  getPaymentPlanStatusVariant,
  getPaymentPlanSubjectLabel,
  getPaymentPlanSubjectVariant,
  getPaymentSourceLabel,
  paymentSourceOptions,
} from "@/lib/payments/metadata";
import type { CollectionTaskFilters } from "@/lib/payments/queries";

type OwnerOption = {
  id: string;
  name: string;
  username: string;
};

type CollectionTaskItem = {
  id: string;
  sourceType: "SALES_ORDER" | "GIFT_RECORD";
  taskType: "BALANCE_COLLECTION" | "COD_COLLECTION" | "FREIGHT_COLLECTION" | "GENERAL_COLLECTION";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  dueAt: Date | null;
  nextFollowUpAt: Date | null;
  lastContactAt: Date | null;
  closedAt: Date | null;
  remark: string | null;
  createdAt: Date;
  salesOrder: {
    id: string;
    orderNo: string;
  } | null;
  giftRecord: {
    id: string;
    giftName: string;
  } | null;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  owner: {
    id: string;
    name: string;
    username: string;
  };
  shippingTask: {
    id: string;
    shippingStatus: string;
    trackingNumber: string | null;
  } | null;
  paymentPlan: {
    id: string;
    subjectType: "GOODS" | "FREIGHT";
    stageType: "FULL" | "DEPOSIT" | "BALANCE";
    collectionChannel: "PREPAID" | "COD";
    plannedAmount: string;
    submittedAmount: string;
    confirmedAmount: string;
    remainingAmount: string;
    status: "PENDING" | "SUBMITTED" | "PARTIALLY_COLLECTED" | "COLLECTED" | "CANCELED";
  };
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function buildPageHref(filters: CollectionTaskFilters, page: number) {
  const params = new URLSearchParams();

  if (filters.keyword) {
    params.set("keyword", filters.keyword);
  }

  if (filters.ownerId) {
    params.set("ownerId", filters.ownerId);
  }

  if (filters.sourceType) {
    params.set("sourceType", filters.sourceType);
  }

  if (filters.taskType) {
    params.set("taskType", filters.taskType);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.dueState) {
    params.set("dueState", filters.dueState);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/collection-tasks?${query}` : "/collection-tasks";
}

const collectionFilterLabelClassName =
  "text-xs font-semibold uppercase tracking-widest text-muted-foreground";

const collectionControlClassName =
  "w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const collectionPrimaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const collectionResetButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-border/60 bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground";

const collectionTableHeaderCellClassName =
  "border-b border-border/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground first:pl-5 last:pr-5";

const collectionTableCellClassName =
  "border-b border-border/40 px-4 py-4 align-top first:pl-5 last:pr-5";

const collectionTreatmentControlClassName =
  "w-full rounded-md border border-border/60 bg-background p-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50";

const collectionTreatmentSubmitClassName =
  "mt-3 self-end rounded-md bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-all hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60";

export function CollectionTasksSection({
  items,
  filters,
  ownerOptions,
  pagination,
  canManageCollectionTasks,
  updateCollectionTaskAction,
}: Readonly<{
  items: CollectionTaskItem[];
  filters: CollectionTaskFilters;
  ownerOptions: OwnerOption[];
  pagination: PaginationData;
  canManageCollectionTasks: boolean;
  updateCollectionTaskAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <form
          method="get"
          className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))_auto] xl:items-end"
        >
          <label className="space-y-2">
            <span className={collectionFilterLabelClassName}>搜索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className={collectionControlClassName}
              placeholder="订单 / 礼品 / 客户 / 手机号 / 负责人"
            />
          </label>

          <label className="space-y-2">
            <span className={collectionFilterLabelClassName}>负责人</span>
            <select
              name="ownerId"
              defaultValue={filters.ownerId}
              className={collectionControlClassName}
            >
              <option value="">全部负责人</option>
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name || owner.username}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={collectionFilterLabelClassName}>来源</span>
            <select
              name="sourceType"
              defaultValue={filters.sourceType}
              className={collectionControlClassName}
            >
              <option value="">全部来源</option>
              {paymentSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={collectionFilterLabelClassName}>任务类型</span>
            <select
              name="taskType"
              defaultValue={filters.taskType}
              className={collectionControlClassName}
            >
              <option value="">全部任务类型</option>
              {collectionTaskTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={collectionFilterLabelClassName}>状态</span>
            <select
              name="status"
              defaultValue={filters.status}
              className={collectionControlClassName}
            >
              <option value="">全部状态</option>
              {collectionTaskStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={collectionFilterLabelClassName}>到期状态</span>
            <select
              name="dueState"
              defaultValue={filters.dueState}
              className={collectionControlClassName}
            >
              <option value="">全部到期状态</option>
              <option value="OVERDUE">已逾期</option>
              <option value="DUE_SOON">即将到期</option>
              <option value="NO_DUE_DATE">未设到期日</option>
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button type="submit" className={collectionPrimaryButtonClassName}>
              筛选
            </button>
            <Link href="/collection-tasks" className={collectionResetButtonClassName}>
              重置
            </Link>
          </div>
        </form>
      </div>

      {items.length > 0 ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              共 {pagination.totalCount} 条催收任务，当前第 {pagination.page} / {pagination.totalPages} 页
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-sm">
                <thead className="bg-transparent">
                  <tr>
                    <th className={collectionTableHeaderCellClassName}>来源</th>
                    <th className={collectionTableHeaderCellClassName}>客户与负责人</th>
                    <th className={collectionTableHeaderCellClassName}>计划</th>
                    <th className={collectionTableHeaderCellClassName}>任务</th>
                    <th className={collectionTableHeaderCellClassName}>处理</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-muted/30">
                      <td className={collectionTableCellClassName}>
                        <div className="font-medium text-foreground">
                          {getPaymentSourceLabel(item.sourceType)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.salesOrder ? `订单 ${item.salesOrder.orderNo}` : item.giftRecord?.giftName}
                        </div>
                        {item.salesOrder ? (
                          <Link href={`/orders/${item.salesOrder.id}`} className="crm-text-link text-xs">
                            查看订单
                          </Link>
                        ) : null}
                      </td>
                      <td className={collectionTableCellClassName}>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="font-medium text-foreground">
                            {item.customer.name} / {item.customer.phone}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            负责人：{item.owner.name || item.owner.username}
                          </div>
                          {item.shippingTask ? (
                            <div className="text-xs text-muted-foreground">
                              发货：{item.shippingTask.shippingStatus} /{" "}
                              {item.shippingTask.trackingNumber || "未回填单号"}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={collectionTableCellClassName}>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge
                              label={getPaymentPlanSubjectLabel(item.paymentPlan.subjectType)}
                              variant={getPaymentPlanSubjectVariant(item.paymentPlan.subjectType)}
                            />
                            <StatusBadge
                              label={getPaymentPlanStageLabel(item.paymentPlan.stageType)}
                              variant={getPaymentPlanStageVariant(item.paymentPlan.stageType)}
                            />
                            <StatusBadge
                              label={getPaymentPlanStatusLabel(item.paymentPlan.status)}
                              variant={getPaymentPlanStatusVariant(item.paymentPlan.status)}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getPaymentCollectionChannelLabel(item.paymentPlan.collectionChannel)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getPaymentPlanProgressSummary(item.paymentPlan)}
                          </div>
                        </div>
                      </td>
                      <td className={collectionTableCellClassName}>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge
                              label={getCollectionTaskTypeLabel(item.taskType)}
                              variant={getCollectionTaskTypeVariant(item.taskType)}
                            />
                            <StatusBadge
                              label={getCollectionTaskStatusLabel(item.status)}
                              variant={getCollectionTaskStatusVariant(item.status)}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            到期时间：{item.dueAt ? formatDateTime(item.dueAt) : "未设置"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            下次跟进：{" "}
                            {item.nextFollowUpAt ? formatDateTime(item.nextFollowUpAt) : "未设置"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            最近联系：{" "}
                            {item.lastContactAt ? formatDateTime(item.lastContactAt) : "未设置"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            备注：{item.remark || "无"}
                          </div>
                        </div>
                      </td>
                      <td className={`${collectionTableCellClassName} min-w-[300px]`}>
                        {canManageCollectionTasks ? (
                          <form action={updateCollectionTaskAction} className="flex flex-col gap-2">
                            <input type="hidden" name="collectionTaskId" value={item.id} />
                            <input
                              type="hidden"
                              name="redirectTo"
                              value={buildPageHref(filters, pagination.page)}
                            />
                            <select
                              name="ownerId"
                              defaultValue={item.owner.id}
                              className={collectionTreatmentControlClassName}
                            >
                              {ownerOptions.map((owner) => (
                                <option key={owner.id} value={owner.id}>
                                  {owner.name || owner.username}
                                </option>
                              ))}
                            </select>
                            <select
                              name="status"
                              defaultValue={item.status}
                              className={collectionTreatmentControlClassName}
                            >
                              <option value="PENDING">待处理</option>
                              <option value="IN_PROGRESS">跟进中</option>
                              <option value="COMPLETED">已完成</option>
                              <option value="CANCELED">已取消</option>
                            </select>
                            <input
                              type="date"
                              name="nextFollowUpAt"
                              defaultValue={item.nextFollowUpAt?.toISOString().slice(0, 10) ?? ""}
                              className={collectionTreatmentControlClassName}
                            />
                            <input
                              type="date"
                              name="lastContactAt"
                              defaultValue={item.lastContactAt?.toISOString().slice(0, 10) ?? ""}
                              className={collectionTreatmentControlClassName}
                            />
                            <textarea
                              name="remark"
                              rows={2}
                              defaultValue={item.remark || ""}
                              className={`${collectionTreatmentControlClassName} resize-none`}
                            />
                            <button type="submit" className={collectionTreatmentSubmitClassName}>
                              保存任务
                            </button>
                          </form>
                        ) : (
                          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                            <div>创建时间：{formatDateTime(item.createdAt)}</div>
                            <div>
                              关闭时间：{item.closedAt ? formatDateTime(item.closedAt) : "未关闭"}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`本页显示 ${(pagination.page - 1) * pagination.pageSize + 1} - ${Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalCount,
            )} 条，共 ${pagination.totalCount} 条催收任务`}
            buildHref={(pageNumber) => buildPageHref(filters, pageNumber)}
          />
        </div>
      ) : (
        <EmptyState
          title="暂无催收任务"
          description="当前筛选条件下没有匹配的催收任务。"
        />
      )}
    </div>
  );
}
