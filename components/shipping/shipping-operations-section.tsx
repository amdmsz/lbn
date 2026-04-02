import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  codCollectionStatusOptions,
  formatCurrency,
  getCodCollectionStatusLabel,
  getCodCollectionStatusVariant,
  getLogisticsFollowUpTaskStatusLabel,
  getLogisticsFollowUpTaskStatusVariant,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderPaymentSchemeVariant,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
  getShippingReportStatusVariant,
  shippingFulfillmentStatusOptions,
  shippingReportStatusOptions,
} from "@/lib/fulfillment/metadata";
import type { ShippingOperationsFilters } from "@/lib/shipping/queries";
import {
  getPaymentRecordStatusLabel,
  getPaymentRecordStatusVariant,
} from "@/lib/payments/metadata";
import { cn } from "@/lib/utils";

type SupplierOption = {
  id: string;
  name: string;
};

type ShippingItem = {
  id: string;
  reportStatus: "PENDING" | "REPORTED";
  shippingStatus:
    | "PENDING"
    | "READY_TO_SHIP"
    | "SHIPPED"
    | "DELIVERED"
    | "COMPLETED"
    | "CANCELED";
  shippingProvider: string | null;
  trackingNumber: string | null;
  codAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
  reportedAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  exportBatch: {
    id: string;
    exportNo: string;
  } | null;
  supplier: {
    id: string;
    name: string;
  } | null;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  salesOrder: {
    id: string;
    orderNo: string;
    reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    paymentScheme:
      | "FULL_PREPAID"
      | "DEPOSIT_PLUS_BALANCE"
      | "FULL_COD"
      | "DEPOSIT_PLUS_COD";
    receiverNameSnapshot: string;
    receiverPhoneSnapshot: string;
    receiverAddressSnapshot: string;
    items: Array<{
      id: string;
      productNameSnapshot: string;
      qty: number;
    }>;
  } | null;
  logisticsFollowUpTasks: Array<{
    id: string;
    status: "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELED";
    nextTriggerAt: Date;
    owner: {
      id: string;
      name: string;
      username: string;
    };
  }>;
  codCollectionRecords: Array<{
    id: string;
    status:
      | "PENDING_COLLECTION"
      | "COLLECTED"
      | "EXCEPTION"
      | "REJECTED"
      | "UNCOLLECTED";
    expectedAmount: string;
    collectedAmount: string;
    occurredAt: Date | null;
    remark: string | null;
    paymentRecord: {
      id: string;
      amount: string;
      status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
      occurredAt: Date;
    } | null;
  }>;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function buildPageHref(filters: ShippingOperationsFilters, page: number) {
  const params = new URLSearchParams();

  if (filters.keyword) {
    params.set("keyword", filters.keyword);
  }

  if (filters.supplierId) {
    params.set("supplierId", filters.supplierId);
  }

  if (filters.reportStatus) {
    params.set("reportStatus", filters.reportStatus);
  }

  if (filters.shippingStatus) {
    params.set("shippingStatus", filters.shippingStatus);
  }

  if (filters.isCod) {
    params.set("isCod", filters.isCod);
  }

  if (filters.hasTrackingNumber) {
    params.set("hasTrackingNumber", filters.hasTrackingNumber);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/shipping?${query}` : "/shipping";
}

function getLatestCodRecord(item: ShippingItem) {
  return item.codCollectionRecords[0] ?? null;
}

export function ShippingOperationsSection({
  items,
  filters,
  suppliers,
  pagination,
  canManageReporting,
  createExportBatchAction,
  updateShippingAction,
}: Readonly<{
  items: ShippingItem[];
  filters: ShippingOperationsFilters;
  suppliers: SupplierOption[];
  pagination: PaginationData;
  canManageReporting: boolean;
  createExportBatchAction: (formData: FormData) => Promise<void>;
  updateShippingAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-6">
      <div className="crm-filter-panel space-y-4">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              报单状态
            </p>
            <p className="mt-2 text-sm leading-6 text-black/68">
              控制订单是否已导出给供货商。导出批次后才会标记为已报单。
            </p>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              发货状态
            </p>
            <p className="mt-2 text-sm leading-6 text-black/68">
              控制履约推进。只有回填物流单号后，才允许进入已发货及后续状态。
            </p>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              COD 闭环
            </p>
            <p className="mt-2 text-sm leading-6 text-black/68">
              COD 回款从履约中心登记，PaymentPlan 和 PaymentRecord 自动联动。
            </p>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              物流跟进
            </p>
            <p className="mt-2 text-sm leading-6 text-black/68">
              首次回填物流单号后自动生成物流跟进任务，订单和客户页都会回流展示。
            </p>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              当前范围
            </p>
            <p className="mt-2 text-sm leading-6 text-black/68">
              发货中心只展示已审核通过的 SalesOrder 履约任务。
            </p>
          </div>
        </div>

        <form
          method="get"
          className="crm-filter-grid xl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_auto]"
        >
          <label className="space-y-2">
            <span className="crm-label">快速搜索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              autoFocus
              className="crm-input text-base"
              placeholder="扫描或输入物流单号 / 客户名 / 手机号 / 订单号"
            />
          </label>
          <label className="space-y-2">
            <span className="crm-label">供货商</span>
            <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
              <option value="">全部供货商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">报单状态</span>
            <select name="reportStatus" defaultValue={filters.reportStatus} className="crm-select">
              <option value="">全部状态</option>
              {shippingReportStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">发货状态</span>
            <select name="shippingStatus" defaultValue={filters.shippingStatus} className="crm-select">
              <option value="">全部状态</option>
              {shippingFulfillmentStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">是否 COD</span>
            <select name="isCod" defaultValue={filters.isCod} className="crm-select">
              <option value="">全部订单</option>
              <option value="true">仅 COD</option>
              <option value="false">仅非 COD</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">是否已回填物流单号</span>
            <select
              name="hasTrackingNumber"
              defaultValue={filters.hasTrackingNumber}
              className="crm-select"
            >
              <option value="">全部</option>
              <option value="true">已回填</option>
              <option value="false">未回填</option>
            </select>
          </label>

          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              筛选
            </button>
            <Link href="/shipping" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>
      </div>

      {canManageReporting ? (
        <section className="crm-section-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-black/85">批量导出报单</h3>
              <p className="text-sm leading-7 text-black/60">
                按供货商导出已审核通过、待报单的销售订单。导出成功后，系统会自动记录批次并将任务标记为已报单。
              </p>
            </div>
            <Link href="/shipping/export-batches" className="crm-button crm-button-secondary">
              查看导出批次
            </Link>
          </div>

          <form
            action={createExportBatchAction}
            className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
          >
            <input type="hidden" name="redirectTo" value={buildPageHref(filters, pagination.page)} />
            <label className="space-y-2">
              <span className="crm-label">供货商</span>
              <select name="supplierId" required defaultValue={filters.supplierId} className="crm-select">
                <option value="">选择供货商</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="crm-label">文件名</span>
              <input
                name="fileName"
                required
                defaultValue={`shipping-export-${new Date().toISOString().slice(0, 10)}.csv`}
                className="crm-input"
              />
            </label>
            <label className="space-y-2">
              <span className="crm-label">备注</span>
              <input name="remark" className="crm-input" />
            </label>
            <div className="flex items-end">
              <button type="submit" className="crm-button crm-button-primary w-full">
                创建报单批次
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-black/60">
            <span>
              共 {pagination.totalCount} 条履约任务，当前第 {pagination.page} / {pagination.totalPages} 页
            </span>
          </div>

          {items.map((item) => {
            const codRecord = getLatestCodRecord(item);
            const isCod = Number(item.codAmount) > 0;
            const needsAttention =
              item.reportStatus === "PENDING" ||
              (item.reportStatus === "REPORTED" &&
                (!item.trackingNumber || item.trackingNumber.trim().length === 0));

            return (
              <section
                key={item.id}
                className={cn(
                  "crm-section-card",
                  needsAttention &&
                    "border-[rgba(155,106,29,0.18)] bg-[linear-gradient(180deg,rgba(255,251,242,0.95),rgba(255,255,255,0.92))]",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={getShippingReportStatusLabel(item.reportStatus)}
                        variant={getShippingReportStatusVariant(item.reportStatus)}
                      />
                      <StatusBadge
                        label={getShippingFulfillmentStatusLabel(item.shippingStatus)}
                        variant={getShippingFulfillmentStatusVariant(item.shippingStatus)}
                      />
                      {item.salesOrder ? (
                        <StatusBadge
                          label={getSalesOrderPaymentSchemeLabel(item.salesOrder.paymentScheme)}
                          variant={getSalesOrderPaymentSchemeVariant(item.salesOrder.paymentScheme)}
                        />
                      ) : null}
                      <StatusBadge label={isCod ? "COD" : "非 COD"} variant={isCod ? "warning" : "neutral"} />
                      {needsAttention ? (
                        <StatusBadge label="优先处理" variant="warning" />
                      ) : null}
                      {codRecord ? (
                        <StatusBadge
                          label={getCodCollectionStatusLabel(codRecord.status)}
                          variant={getCodCollectionStatusVariant(codRecord.status)}
                        />
                      ) : null}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-black/85">
                        {item.salesOrder?.orderNo || item.id}
                      </h3>
                      <p className="text-sm leading-7 text-black/60">
                        客户 {item.customer.name} / {item.customer.phone}
                        {item.supplier ? ` / 供货商 ${item.supplier.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-black/55">
                    创建时间：{formatDateTime(item.createdAt)}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="crm-subtle-panel">
                    <p className="crm-detail-label">订单与收件信息</p>
                    <div className="mt-3 space-y-2 text-sm text-black/70">
                      <div>
                        收件人：{item.salesOrder?.receiverNameSnapshot || item.customer.name} /{" "}
                        {item.salesOrder?.receiverPhoneSnapshot || item.customer.phone}
                      </div>
                      <div>
                        地址：
                        {item.salesOrder?.receiverAddressSnapshot || "未同步"}
                      </div>
                      <div>
                        商品：
                        {item.salesOrder?.items
                          .map((orderItem) => `${orderItem.productNameSnapshot} x ${orderItem.qty}`)
                          .join("，") || "暂无商品行"}
                      </div>
                      <div>代收金额：{formatCurrency(item.codAmount)}</div>
                      <div>
                        保价：{item.insuranceRequired ? "需要" : "不需要"} /{" "}
                        {formatCurrency(item.insuranceAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="crm-subtle-panel">
                    <p className="crm-detail-label">履约执行信息</p>
                    <div className="mt-3 space-y-2 text-sm text-black/70">
                      <div>报单时间：{item.reportedAt ? formatDateTime(item.reportedAt) : "未报单"}</div>
                      <div>发货时间：{item.shippedAt ? formatDateTime(item.shippedAt) : "未发货"}</div>
                      <div>承运商：{item.shippingProvider || "未填写"}</div>
                      <div>物流单号：{item.trackingNumber || "未回填"}</div>
                      <div>导出批次：{item.exportBatch?.exportNo || "未导出"}</div>
                    </div>
                    {codRecord ? (
                      <div className="mt-4 rounded-2xl border border-black/8 bg-white/70 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            label={getCodCollectionStatusLabel(codRecord.status)}
                            variant={getCodCollectionStatusVariant(codRecord.status)}
                          />
                          {codRecord.paymentRecord ? (
                            <StatusBadge
                              label={getPaymentRecordStatusLabel(codRecord.paymentRecord.status)}
                              variant={getPaymentRecordStatusVariant(codRecord.paymentRecord.status)}
                            />
                          ) : null}
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-black/65">
                          <div>应回款：{formatCurrency(codRecord.expectedAmount)}</div>
                          <div>已登记：{formatCurrency(codRecord.collectedAmount)}</div>
                          <div>
                            最近登记时间：
                            {codRecord.occurredAt ? formatDateTime(codRecord.occurredAt) : "未登记"}
                          </div>
                          <div>备注：{codRecord.remark || "无"}</div>
                        </div>
                      </div>
                    ) : isCod ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                        COD 记录会在订单进入已发货阶段后自动创建。
                      </div>
                    ) : null}
                  </div>

                  <div className="crm-subtle-panel">
                    <p className="crm-detail-label">物流跟进摘要</p>
                    <div className="mt-3 space-y-3">
                      {item.logisticsFollowUpTasks.length > 0 ? (
                        item.logisticsFollowUpTasks.map((task) => (
                          <div
                            key={task.id}
                            className="rounded-2xl border border-black/8 bg-white/70 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge
                                label={getLogisticsFollowUpTaskStatusLabel(task.status)}
                                variant={getLogisticsFollowUpTaskStatusVariant(task.status)}
                              />
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-black/65">
                              <div>
                                负责人：{task.owner.name || task.owner.username}
                              </div>
                              <div>下次触发：{formatDateTime(task.nextTriggerAt)}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                          回填物流单号后会自动生成物流跟进任务。
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-black/8 bg-white/65 p-4 text-sm leading-7 text-black/60">
                    <div className="font-medium text-black/80">状态说明</div>
                    <div className="mt-2">
                      报单状态只描述是否已导出给供货商，发货状态才描述履约推进阶段。回填物流单号前，不能进入已发货。
                    </div>
                  </div>

                  {canManageReporting ? (
                    <form action={updateShippingAction} className="space-y-3 rounded-2xl border border-black/8 bg-white/75 p-4">
                      <input type="hidden" name="shippingTaskId" value={item.id} />
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={buildPageHref(filters, pagination.page)}
                      />
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="crm-label">承运商</span>
                          <input
                            name="shippingProvider"
                            defaultValue={item.shippingProvider ?? ""}
                            placeholder="例如：顺丰、京东、德邦"
                            className="crm-input"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="crm-label">物流单号</span>
                          <input
                            name="trackingNumber"
                            defaultValue={item.trackingNumber ?? ""}
                            placeholder="回填物流单号后才可进入已发货"
                            className="crm-input"
                          />
                        </label>
                      </div>

                      <label className="space-y-2">
                        <span className="crm-label">发货状态</span>
                        <select name="shippingStatus" defaultValue={item.shippingStatus} className="crm-select">
                          {shippingFulfillmentStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {isCod ? (
                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="space-y-2">
                            <span className="crm-label">COD 回款状态</span>
                            <select
                              name="codCollectionStatus"
                              defaultValue={codRecord?.status ?? ""}
                              className="crm-select"
                            >
                              <option value="">不更新</option>
                              {codCollectionStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="crm-label">COD 回款金额</span>
                            <input
                              name="codCollectedAmount"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={codRecord?.collectedAmount ?? item.codAmount}
                              className="crm-input"
                            />
                          </label>
                          <label className="space-y-2 md:col-span-1">
                            <span className="crm-label">COD 备注</span>
                            <input
                              name="codRemark"
                              defaultValue={codRecord?.remark ?? ""}
                              className="crm-input"
                            />
                          </label>
                        </div>
                      ) : null}

                      <button type="submit" className="crm-button crm-button-primary w-full">
                        保存履约更新
                      </button>
                    </form>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                      当前角色仅可查看履约结果，不能在发货中心执行报单、回填物流或推进发货状态。
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`本页显示 ${(pagination.page - 1) * pagination.pageSize + 1} - ${Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalCount,
            )} 条任务，共 ${pagination.totalCount} 条`}
            buildHref={(pageNumber) => buildPageHref(filters, pageNumber)}
          />
        </div>
      ) : (
        <EmptyState
          title="暂无履约任务"
          description="当前筛选条件下没有符合条件的已审核订单履约任务。"
        />
      )}
    </div>
  );
}
