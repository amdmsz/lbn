"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGiftRecordAction,
  saveGiftFulfillmentCompatAction,
  updateGiftReviewAction,
} from "@/app/(dashboard)/gifts/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  formatCurrency,
  getGiftQualificationSourceLabel,
  getGiftReviewStatusLabel,
  getGiftReviewStatusVariant,
  getShippingStatusLabel,
  getShippingStatusVariant,
  getShippingTaskStatusLabel,
  getShippingTaskStatusVariant,
  giftQualificationSourceOptions,
  giftReviewStatusOptions,
  shippingStatusOptions,
  shippingTaskStatusOptions,
} from "@/lib/fulfillment/metadata";
import type { GiftListFilters } from "@/lib/gifts/queries";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type GiftItem = {
  id: string;
  giftName: string;
  qualificationSource: "LIVE_SESSION" | "SALES_CAMPAIGN" | "MANUAL_APPROVAL" | "OTHER";
  freightAmount: string;
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  shippingStatus: "PENDING" | "READY" | "SHIPPED" | "SIGNED" | "FINISHED" | "CANCELED";
  receiverInfo: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  remark: string | null;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    phone: string;
    owner: {
      id: string;
      name: string;
      username: string;
    } | null;
  };
  sales: {
    id: string;
    name: string;
    username: string;
  } | null;
  liveSession: {
    id: string;
    title: string;
    startAt: Date;
  } | null;
  shippingTask: {
    id: string;
    status: "PENDING" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELED";
    trackingNumber: string | null;
    remark: string | null;
    shippedAt: Date | null;
    assignee: {
      id: string;
      name: string;
      username: string;
    } | null;
  } | null;
};

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
};

type LiveSessionOption = {
  id: string;
  title: string;
  startAt: Date;
};

type AssigneeOption = {
  id: string;
  name: string;
  username: string;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

function buildPageHref(filters: GiftListFilters, page: number) {
  const params = new URLSearchParams();

  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }

  if (filters.reviewStatus) {
    params.set("reviewStatus", filters.reviewStatus);
  }

  if (filters.shippingStatus) {
    params.set("shippingStatus", filters.shippingStatus);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/gifts?${query}` : "/gifts";
}

export function GiftsSection({
  items,
  filters,
  customers,
  liveSessions,
  assignees,
  pagination,
  canCreate,
  canReview,
  canManageFulfillmentCompat,
  defaultCustomerId,
}: Readonly<{
  items: GiftItem[];
  filters: GiftListFilters;
  customers: CustomerOption[];
  liveSessions: LiveSessionOption[];
  assignees: AssigneeOption[];
  pagination: PaginationData;
  canCreate: boolean;
  canReview: boolean;
  canManageFulfillmentCompat: boolean;
  defaultCustomerId?: string;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [createState, setCreateState] = useState<ActionState>(initialActionState);
  const [reviewStates, setReviewStates] = useState<Record<string, ActionState>>({});
  const [compatStates, setCompatStates] = useState<Record<string, ActionState>>({});
  const [pending, startTransition] = useTransition();

  function setReviewState(giftRecordId: string, nextState: ActionState) {
    setReviewStates((current) => ({
      ...current,
      [giftRecordId]: nextState,
    }));
  }

  function setCompatState(giftRecordId: string, nextState: ActionState) {
    setCompatStates((current) => ({
      ...current,
      [giftRecordId]: nextState,
    }));
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await createGiftRecordAction(initialActionState, formData);
      setCreateState(nextState);

      if (nextState.status === "success") {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  async function handleReviewSubmit(
    event: React.FormEvent<HTMLFormElement>,
    giftRecordId: string,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await updateGiftReviewAction(initialActionState, formData);
      setReviewState(giftRecordId, nextState);

      if (nextState.status === "success") {
        router.refresh();
      }
    });
  }

  async function handleCompatSubmit(
    event: React.FormEvent<HTMLFormElement>,
    giftRecordId: string,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await saveGiftFulfillmentCompatAction(initialActionState, formData);
      setCompatState(giftRecordId, nextState);

      if (nextState.status === "success") {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="crm-filter-panel">
        <form
          method="get"
          className="crm-filter-grid xl:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))_auto]"
        >
          <label className="space-y-2">
            <span className="crm-label">客户</span>
            <select name="customerId" defaultValue={filters.customerId} className="crm-select">
              <option value="">全部客户</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.phone})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">审核状态</span>
            <select name="reviewStatus" defaultValue={filters.reviewStatus} className="crm-select">
              <option value="">全部状态</option>
              {giftReviewStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">发货状态</span>
            <select
              name="shippingStatus"
              defaultValue={filters.shippingStatus}
              className="crm-select"
            >
              <option value="">全部状态</option>
              {shippingStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              筛选
            </button>
            <a href="/gifts" className="crm-button crm-button-secondary">
              重置
            </a>
          </div>
        </form>
      </div>

      {canCreate ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">创建礼品记录</h3>
            <p className="text-sm leading-7 text-black/60">
              当前页面继续承接礼品资格、审核与履约兼容处理。`giftRecordId`
              只作为礼品履约兼容链路，不进入 V2 发货中心。
            </p>
          </div>

          <form ref={formRef} onSubmit={handleCreateSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <label className="space-y-2">
                <span className="crm-label">客户</span>
                <select
                  name="customerId"
                  defaultValue={defaultCustomerId ?? ""}
                  required
                  className="crm-select"
                >
                  <option value="">请选择客户</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} ({customer.phone})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">关联直播场次</span>
                <select name="liveSessionId" defaultValue="" className="crm-select">
                  <option value="">不关联直播场次</option>
                  {liveSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title} ({formatDateTime(session.startAt)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">礼品名称</span>
                <input name="giftName" required className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">资格来源</span>
                <select
                  name="qualificationSource"
                  defaultValue="LIVE_SESSION"
                  className="crm-select"
                >
                  {giftQualificationSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">运费</span>
                <input
                  type="number"
                  name="freightAmount"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className="crm-input"
                />
              </label>

              <div />

              <label className="space-y-2">
                <span className="crm-label">收件人</span>
                <input name="receiverName" required className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">收件电话</span>
                <input name="receiverPhone" required className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">收件地址</span>
                <input name="receiverAddress" required className="crm-input" />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="crm-label">备注</span>
              <textarea name="remark" rows={3} className="crm-textarea" />
            </label>

            {createState.message ? (
              <ActionBanner tone={createState.status === "success" ? "success" : "danger"}>
                {createState.message}
              </ActionBanner>
            ) : null}

            <div className="flex justify-end">
              <button type="submit" disabled={pending} className="crm-button crm-button-primary">
                {pending ? "保存中..." : "创建礼品记录"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-black/60">
            <span>
              共 {pagination.totalCount} 条礼品记录，当前第 {pagination.page} /{" "}
              {pagination.totalPages} 页
            </span>
          </div>

          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>客户 / 场次</th>
                  <th>礼品信息</th>
                  <th>审核 / 履约摘要</th>
                  <th>收件信息</th>
                  <th>关联人</th>
                  <th>创建时间</th>
                  <th>审核 / 履约操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-medium text-black/80">{item.customer.name}</div>
                      <div className="text-xs text-black/45">{item.customer.phone}</div>
                      <div className="mt-1 text-xs text-black/45">
                        {item.liveSession ? item.liveSession.title : "未关联直播场次"}
                      </div>
                    </td>
                    <td className="text-black/80">
                      <div className="space-y-2">
                        <div className="font-medium">{item.giftName}</div>
                        <div className="text-xs text-black/45">
                          资格来源：{getGiftQualificationSourceLabel(item.qualificationSource)}
                        </div>
                        <div className="text-xs text-black/45">
                          运费：{formatCurrency(item.freightAmount)}
                        </div>
                        {item.remark ? (
                          <div className="text-xs leading-6 text-black/55">{item.remark}</div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <StatusBadge
                          label={getGiftReviewStatusLabel(item.reviewStatus)}
                          variant={getGiftReviewStatusVariant(item.reviewStatus)}
                        />
                        <StatusBadge
                          label={getShippingStatusLabel(item.shippingStatus)}
                          variant={getShippingStatusVariant(item.shippingStatus)}
                        />
                        {item.shippingTask ? (
                          <>
                            <StatusBadge
                              label={getShippingTaskStatusLabel(item.shippingTask.status)}
                              variant={getShippingTaskStatusVariant(item.shippingTask.status)}
                            />
                            <div className="text-xs text-black/45">
                              发货：{item.shippingTask.assignee?.name || "未指派"}
                            </div>
                            <div className="text-xs text-black/45">
                              物流单号：{item.shippingTask.trackingNumber || "未回填"}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-black/45">未建立礼品履约兼容任务</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>{item.receiverInfo || "未填写"}</div>
                      {item.receiverName || item.receiverPhone || item.receiverAddress ? (
                        <div className="mt-1 text-xs leading-6 text-black/45">
                          {[item.receiverName, item.receiverPhone, item.receiverAddress]
                            .filter(Boolean)
                            .join(" / ")}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div>{item.sales?.name || item.customer.owner?.name || "未指定"}</div>
                      <div className="text-xs text-black/45">
                        客户负责人：{item.customer.owner?.name || "未分配"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                    <td className="min-w-[320px]">
                      <div className="space-y-4">
                        {canReview ? (
                          <form
                            onSubmit={(event) => handleReviewSubmit(event, item.id)}
                            className="space-y-3 rounded-2xl border border-black/8 bg-white/70 p-3"
                          >
                            <div className="text-xs font-semibold tracking-[0.08em] text-black/45">
                              审核
                            </div>
                            <input type="hidden" name="giftRecordId" value={item.id} />
                            <select
                              name="reviewStatus"
                              defaultValue={item.reviewStatus}
                              className="crm-select"
                            >
                              {giftReviewStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>

                            {reviewStates[item.id]?.message ? (
                              <ActionBanner
                                tone={
                                  reviewStates[item.id]?.status === "success"
                                    ? "success"
                                    : "danger"
                                }
                              >
                                {reviewStates[item.id]?.message}
                              </ActionBanner>
                            ) : null}

                            <button
                              type="submit"
                              disabled={pending}
                              className="crm-button crm-button-secondary w-full"
                            >
                              保存审核状态
                            </button>
                          </form>
                        ) : (
                          <div className="text-sm leading-7 text-black/55">
                            当前角色只能查看礼品记录，不能执行审核流转。
                          </div>
                        )}

                        {canManageFulfillmentCompat ? (
                          <form
                            onSubmit={(event) => handleCompatSubmit(event, item.id)}
                            className="space-y-3 rounded-2xl border border-dashed border-black/10 bg-black/[0.02] p-3"
                          >
                            <div className="space-y-1">
                              <div className="text-xs font-semibold tracking-[0.08em] text-black/45">
                                礼品履约兼容
                              </div>
                              <p className="text-xs leading-6 text-black/50">
                                仅承接 giftRecordId 的兼容发货任务，不进入 V2 发货中心。
                              </p>
                            </div>
                            <input type="hidden" name="giftRecordId" value={item.id} />
                            <select
                              name="assigneeId"
                              defaultValue={item.shippingTask?.assignee?.id ?? ""}
                              className="crm-select"
                            >
                              <option value="">未指派发货员</option>
                              {assignees.map((assignee) => (
                                <option key={assignee.id} value={assignee.id}>
                                  {assignee.name} ({assignee.username})
                                </option>
                              ))}
                            </select>
                            <select
                              name="status"
                              defaultValue={item.shippingTask?.status ?? "PENDING"}
                              className="crm-select"
                            >
                              {shippingTaskStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <input
                              name="trackingNumber"
                              defaultValue={item.shippingTask?.trackingNumber ?? ""}
                              placeholder="物流单号"
                              className="crm-input"
                            />
                            <textarea
                              name="remark"
                              rows={2}
                              defaultValue={item.shippingTask?.remark ?? ""}
                              placeholder="兼容履约备注"
                              className="crm-textarea"
                            />

                            {item.reviewStatus !== "APPROVED" && !item.shippingTask ? (
                              <div className="rounded-2xl border border-black/8 bg-white/70 px-3 py-2 text-xs leading-6 text-black/55">
                                礼品审核通过后才能创建履约兼容任务。
                              </div>
                            ) : null}

                            {compatStates[item.id]?.message ? (
                              <ActionBanner
                                tone={
                                  compatStates[item.id]?.status === "success"
                                    ? "success"
                                    : "danger"
                                }
                              >
                                {compatStates[item.id]?.message}
                              </ActionBanner>
                            ) : null}

                            <button
                              type="submit"
                              disabled={pending || (item.reviewStatus !== "APPROVED" && !item.shippingTask)}
                              className="crm-button crm-button-secondary w-full"
                            >
                              保存礼品履约兼容任务
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`本页显示 ${(pagination.page - 1) * pagination.pageSize + 1} - ${Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalCount,
            )} 条礼品记录，共 ${pagination.totalCount} 条`}
            buildHref={(pageNumber) => buildPageHref(filters, pageNumber)}
          />
        </div>
      ) : (
        <EmptyState
          title="暂无礼品记录"
          description="当前筛选条件下没有礼品记录。可先从客户详情页或礼品页创建记录。"
        />
      )}
    </div>
  );
}
