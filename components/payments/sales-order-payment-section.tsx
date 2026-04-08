import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  getCollectionTaskStatusLabel,
  getCollectionTaskStatusVariant,
  getCollectionTaskTypeLabel,
  getCollectionTaskTypeVariant,
  getPaymentCollectionChannelLabel,
  getPaymentCollectionChannelVariant,
  getPaymentPlanProgressSummary,
  getPaymentPlanStageLabel,
  getPaymentPlanStageVariant,
  getPaymentPlanStatusLabel,
  getPaymentPlanStatusVariant,
  getPaymentPlanSubjectLabel,
  getPaymentPlanSubjectVariant,
  getPaymentRecordChannelLabel,
  getPaymentRecordStatusLabel,
  getPaymentRecordStatusVariant,
  paymentRecordChannelOptions,
} from "@/lib/payments/metadata";

type PaymentOwnerOption = {
  id: string;
  name: string;
  username: string;
};

type PaymentPlanItem = {
  id: string;
  sourceType: "SALES_ORDER" | "GIFT_RECORD";
  subjectType: "GOODS" | "FREIGHT";
  stageType: "FULL" | "DEPOSIT" | "BALANCE";
  collectionChannel: "PREPAID" | "COD";
  plannedAmount: string;
  submittedAmount: string;
  confirmedAmount: string;
  remainingAmount: string;
  dueAt: Date | null;
  status: "PENDING" | "SUBMITTED" | "PARTIALLY_COLLECTED" | "COLLECTED" | "CANCELED";
  remark: string | null;
  codCollectionRecord: {
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
      remark: string | null;
    } | null;
  } | null;
  paymentRecords: Array<{
    id: string;
    amount: string;
    channel:
      | "ORDER_FORM_DECLARED"
      | "BANK_TRANSFER"
      | "WECHAT_TRANSFER"
      | "ALIPAY_TRANSFER"
      | "COD"
      | "CASH"
      | "OTHER";
    status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
    occurredAt: Date;
    referenceNo: string | null;
    remark: string | null;
    submittedBy: {
      id: string;
      name: string;
      username: string;
    };
    confirmedBy: {
      id: string;
      name: string;
      username: string;
    } | null;
  }>;
  collectionTasks: Array<{
    id: string;
    taskType:
      | "BALANCE_COLLECTION"
      | "COD_COLLECTION"
      | "FREIGHT_COLLECTION"
      | "GENERAL_COLLECTION";
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
    ownerId: string;
    dueAt: Date | null;
    nextFollowUpAt: Date | null;
    lastContactAt: Date | null;
    closedAt: Date | null;
    remark: string | null;
    owner: {
      id: string;
      name: string;
      username: string;
    };
  }>;
};

function toDateInputValue(value: Date | null) {
  if (!value) {
    return "";
  }

  return value.toISOString().slice(0, 10);
}

function getOpenCollectionTask(plan: PaymentPlanItem) {
  return (
    plan.collectionTasks.find(
      (task) => task.status === "PENDING" || task.status === "IN_PROGRESS",
    ) ?? null
  );
}

export function SalesOrderPaymentSection({
  orderId,
  paymentPlans,
  paymentOwnerOptions,
  canSubmitPaymentRecord,
  canConfirmPaymentRecord,
  canManageCollectionTasks,
  submitPaymentRecordAction,
  reviewPaymentRecordAction,
  upsertCollectionTaskAction,
  updateCollectionTaskAction,
}: Readonly<{
  orderId: string;
  paymentPlans: PaymentPlanItem[];
  paymentOwnerOptions: PaymentOwnerOption[];
  canSubmitPaymentRecord: boolean;
  canConfirmPaymentRecord: boolean;
  canManageCollectionTasks: boolean;
  submitPaymentRecordAction: (formData: FormData) => Promise<void>;
  reviewPaymentRecordAction: (formData: FormData) => Promise<void>;
  upsertCollectionTaskAction: (formData: FormData) => Promise<void>;
  updateCollectionTaskAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <section className="crm-section-card">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-black/85">收款与催收</h3>
        <p className="text-sm leading-7 text-black/60">
          PaymentPlan 负责应收计划，PaymentRecord 负责收款记录，CollectionTask 负责后续催收与跟进动作。订单页上的
          depositAmount、collectedAmount、paidAmount、remainingAmount、codAmount 只是 payment layer 的同步摘要，不是唯一真相。
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {paymentPlans.length > 0 ? (
          paymentPlans.map((plan) => {
            const openTask = getOpenCollectionTask(plan);

            return (
              <div key={plan.id} className="rounded-3xl border border-black/8 bg-white/80 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={getPaymentPlanSubjectLabel(plan.subjectType)}
                    variant={getPaymentPlanSubjectVariant(plan.subjectType)}
                  />
                  <StatusBadge
                    label={getPaymentPlanStageLabel(plan.stageType)}
                    variant={getPaymentPlanStageVariant(plan.stageType)}
                  />
                  <StatusBadge
                    label={getPaymentCollectionChannelLabel(plan.collectionChannel)}
                    variant={getPaymentCollectionChannelVariant(plan.collectionChannel)}
                  />
                  <StatusBadge
                    label={getPaymentPlanStatusLabel(plan.status)}
                    variant={getPaymentPlanStatusVariant(plan.status)}
                  />
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div className="crm-subtle-panel">
                    <p className="crm-detail-label">计划摘要</p>
                    <div className="mt-3 space-y-2 text-sm text-black/70">
                      <div>{getPaymentPlanProgressSummary(plan)}</div>
                      <div>到期时间：{plan.dueAt ? formatDateTime(plan.dueAt) : "未设置"}</div>
                      <div>备注：{plan.remark || "无"}</div>
                    </div>
                  </div>

                  <div className="crm-subtle-panel">
                    <p className="crm-detail-label">收款记录</p>
                    <div className="mt-3 space-y-3">
                      {plan.paymentRecords.length > 0 ? (
                        plan.paymentRecords.map((record) => (
                          <div
                            key={record.id}
                            className="rounded-2xl border border-black/8 bg-white/70 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge
                                label={getPaymentRecordStatusLabel(record.status)}
                                variant={getPaymentRecordStatusVariant(record.status)}
                              />
                              <span className="text-xs text-black/45">
                                {getPaymentRecordChannelLabel(record.channel)}
                              </span>
                            </div>

                            <div className="mt-2 space-y-1 text-sm text-black/65">
                              <div>金额：{formatCurrency(record.amount)}</div>
                              <div>发生时间：{formatDateTime(record.occurredAt)}</div>
                              <div>
                                提交人：{record.submittedBy.name || record.submittedBy.username}
                              </div>
                              <div>
                                确认人：
                                {record.confirmedBy
                                  ? record.confirmedBy.name || record.confirmedBy.username
                                  : "待确认"}
                              </div>
                              <div>流水号：{record.referenceNo || "无"}</div>
                              <div>备注：{record.remark || "无"}</div>
                            </div>

                            {canConfirmPaymentRecord && record.status === "SUBMITTED" ? (
                              <form action={reviewPaymentRecordAction} className="mt-3 space-y-2">
                                <input type="hidden" name="paymentRecordId" value={record.id} />
                                <input type="hidden" name="redirectTo" value={`/orders/${orderId}`} />
                                <select name="status" defaultValue="CONFIRMED" className="crm-select">
                                  <option value="CONFIRMED">确认通过</option>
                                  <option value="REJECTED">驳回</option>
                                </select>
                                <textarea
                                  name="remark"
                                  rows={2}
                                  placeholder="填写审核备注"
                                  className="crm-textarea"
                                />
                                <button type="submit" className="crm-button crm-button-secondary w-full">
                                  保存审核结果
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                          当前还没有收款记录。
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="crm-subtle-panel">
                    <p className="crm-detail-label">催收任务</p>
                    <div className="mt-3 space-y-3">
                      {openTask ? (
                        <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge
                              label={getCollectionTaskTypeLabel(openTask.taskType)}
                              variant={getCollectionTaskTypeVariant(openTask.taskType)}
                            />
                            <StatusBadge
                              label={getCollectionTaskStatusLabel(openTask.status)}
                              variant={getCollectionTaskStatusVariant(openTask.status)}
                            />
                          </div>

                          <div className="mt-2 space-y-1 text-sm text-black/65">
                            <div>负责人：{openTask.owner.name || openTask.owner.username}</div>
                            <div>
                              到期时间：{openTask.dueAt ? formatDateTime(openTask.dueAt) : "未设置"}
                            </div>
                            <div>
                              下次跟进：
                              {openTask.nextFollowUpAt
                                ? formatDateTime(openTask.nextFollowUpAt)
                                : "未设置"}
                            </div>
                            <div>
                              最近联系：
                              {openTask.lastContactAt
                                ? formatDateTime(openTask.lastContactAt)
                                : "未设置"}
                            </div>
                            <div>备注：{openTask.remark || "无"}</div>
                          </div>

                          {canManageCollectionTasks ? (
                            <form action={updateCollectionTaskAction} className="mt-3 space-y-2">
                              <input type="hidden" name="collectionTaskId" value={openTask.id} />
                              <input type="hidden" name="redirectTo" value={`/orders/${orderId}`} />
                              <select
                                name="ownerId"
                                defaultValue={openTask.ownerId}
                                className="crm-select"
                              >
                                {paymentOwnerOptions.map((owner) => (
                                  <option key={owner.id} value={owner.id}>
                                    {owner.name || owner.username}
                                  </option>
                                ))}
                              </select>
                              <select name="status" defaultValue={openTask.status} className="crm-select">
                                <option value="PENDING">待处理</option>
                                <option value="IN_PROGRESS">跟进中</option>
                                <option value="COMPLETED">已完成</option>
                                <option value="CANCELED">已取消</option>
                              </select>
                              <input
                                type="date"
                                name="nextFollowUpAt"
                                defaultValue={toDateInputValue(openTask.nextFollowUpAt)}
                                className="crm-input"
                              />
                              <input
                                type="date"
                                name="lastContactAt"
                                defaultValue={toDateInputValue(openTask.lastContactAt)}
                                className="crm-input"
                              />
                              <textarea
                                name="remark"
                                rows={2}
                                defaultValue={openTask.remark || ""}
                                placeholder="填写催收备注"
                                className="crm-textarea"
                              />
                              <button type="submit" className="crm-button crm-button-secondary w-full">
                                保存催收任务
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : canManageCollectionTasks &&
                        plan.status !== "COLLECTED" &&
                        plan.status !== "CANCELED" ? (
                        <form
                          action={upsertCollectionTaskAction}
                          className="space-y-2 rounded-2xl border border-dashed border-black/10 bg-white/55 p-4"
                        >
                          <input type="hidden" name="paymentPlanId" value={plan.id} />
                          <input type="hidden" name="redirectTo" value={`/orders/${orderId}`} />
                          <select name="ownerId" className="crm-select">
                            {paymentOwnerOptions.map((owner) => (
                              <option key={owner.id} value={owner.id}>
                                {owner.name || owner.username}
                              </option>
                            ))}
                          </select>
                          <input type="date" name="dueAt" className="crm-input" />
                          <input type="date" name="nextFollowUpAt" className="crm-input" />
                          <textarea
                            name="remark"
                            rows={2}
                            placeholder="填写催收备注"
                            className="crm-textarea"
                          />
                          <button type="submit" className="crm-button crm-button-secondary w-full">
                            创建催收任务
                          </button>
                        </form>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                          当前没有打开中的催收任务。
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {canSubmitPaymentRecord &&
                plan.collectionChannel !== "COD" &&
                plan.status !== "COLLECTED" &&
                plan.status !== "CANCELED" ? (
                  <form
                    action={submitPaymentRecordAction}
                    className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <input type="hidden" name="paymentPlanId" value={plan.id} />
                    <input type="hidden" name="redirectTo" value={`/orders/${orderId}`} />

                    <label className="space-y-2">
                      <span className="crm-label">收款金额</span>
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={plan.remainingAmount}
                        className="crm-input"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="crm-label">收款渠道</span>
                      <select
                        name="channel"
                        defaultValue="BANK_TRANSFER"
                        className="crm-select"
                      >
                        {paymentRecordChannelOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="space-y-2">
                        <span className="crm-label">收款日期</span>
                        <input type="date" name="occurredAt" className="crm-input" />
                      </label>
                      <label className="space-y-2">
                        <span className="crm-label">流水号</span>
                        <input name="referenceNo" className="crm-input" />
                      </label>
                    </div>

                    <div className="flex items-end">
                      <button type="submit" className="crm-button crm-button-primary w-full">
                        提交收款记录
                      </button>
                    </div>

                    <div className="xl:col-span-4">
                      <label className="block space-y-2">
                        <span className="crm-label">备注</span>
                        <textarea name="remark" rows={2} className="crm-textarea" />
                      </label>
                    </div>
                  </form>
                ) : plan.collectionChannel === "COD" ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
                    COD 回款请在订单中心登记，系统会自动联动 PaymentPlan、PaymentRecord 与催收任务。
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm leading-7 text-black/55">
            当前还没有应收计划。订单创建或驳回后重新提交时，系统会根据 `paymentScheme` 自动生成 PaymentPlan。
          </div>
        )}
      </div>
    </section>
  );
}
