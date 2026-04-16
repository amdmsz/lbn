"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  CUSTOMER_RECYCLE_REASON_OPTIONS,
  type CustomerRecycleReasonCode,
} from "@/lib/customers/recycle";
import type {
  RecycleFinalizePreview,
  RecycleMoveGuard,
} from "@/lib/recycle-bin/types";

type CustomerRecycleActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
  guard?: RecycleMoveGuard;
  finalizePreview?: RecycleFinalizePreview | null;
};

type CustomerRecycleEntryProps = {
  customerId: string;
  customerName: string;
  phone: string;
  statusLabel: string;
  ownershipLabel: string;
  ownerLabel: string;
  lastEffectiveFollowUpAt: Date | null;
  approvedTradeOrderCount: number;
  linkedLeadCount: number;
  initialGuard: RecycleMoveGuard;
  initialFinalizePreview: RecycleFinalizePreview | null;
  moveToRecycleBinAction: (formData: FormData) => Promise<CustomerRecycleActionResult>;
};

type BlockerGroup = {
  key: string;
  title: string;
  description: string;
  items: Array<{
    name: string;
    description: string;
    suggestedAction?: string;
  }>;
};

type BlockerLike = {
  group?: string;
  name: string;
  description: string;
  suggestedAction?: string;
};

const customerBlockerGroupMeta = [
  {
    key: "customer_lifecycle",
    title: "客户生命周期",
    description:
      "Customer recycle 只承接误建轻客户，不替代 DORMANT / LOST / BLACKLISTED。",
  },
  {
    key: "ownership_lifecycle",
    title: "公海与归属链",
    description:
      "如果客户已经进入 ownership lifecycle，应继续走 public-pool / claim / release / recycle 治理。",
  },
  {
    key: "sales_engagement",
    title: "销售跟进痕迹",
    description:
      "一旦已经形成有效跟进、通话、微信或直播邀请，就不再属于误建轻客户。",
  },
  {
    key: "transaction_chain",
    title: "订单与资金链",
    description:
      "进入订单、支付、催收链后，客户必须继续保留交易真相与审计上下文。",
  },
  {
    key: "fulfillment_chain",
    title: "履约与物流链",
    description:
      "进入发货、物流或 COD 履约链后，不应再按误建客户删除。",
  },
  {
    key: "import_audit",
    title: "归并与导入审计",
    description:
      "涉及 merge、import、标签等审计链时，可以先回收，但最终处理会转为封存而不是硬删。",
  },
  {
    key: "object_state",
    title: "对象状态",
    description: "先确认原始客户记录仍存在，再决定是否继续治理或恢复。",
  },
  {
    key: "other",
    title: "其他阻断",
    description: "保留服务端返回的原始阻断项，不在前端额外重写业务规则。",
  },
] as const;

function buildBlockerGroups(blockers: BlockerLike[]) {
  const groups = new Map<string, BlockerGroup>();

  for (const meta of customerBlockerGroupMeta) {
    groups.set(meta.key, {
      key: meta.key,
      title: meta.title,
      description: meta.description,
      items: [],
    });
  }

  for (const blocker of blockers) {
    const key = blocker.group ?? "other";
    const group = groups.get(key) ?? groups.get("other");

    if (!group) {
      continue;
    }

    group.items.push({
      name: blocker.name,
      description: blocker.description,
      suggestedAction: blocker.suggestedAction,
    });
  }

  return [...groups.values()].filter((group) => group.items.length > 0);
}

function getFinalizePreviewLabel(preview: RecycleFinalizePreview | null) {
  if (!preview) {
    return "3 天后待重算";
  }

  return preview.finalAction === "PURGE" ? "3 天后可 PURGE" : "3 天后仅 ARCHIVE";
}

function getFinalizePreviewVariant(preview: RecycleFinalizePreview | null) {
  if (!preview) {
    return "neutral" as const;
  }

  return preview.finalAction === "PURGE" ? "warning" : "info" as const;
}

function getFinalizePreviewHint(preview: RecycleFinalizePreview | null) {
  if (!preview) {
    return "当前还没有拿到最终处理预览，请刷新后重试。";
  }

  if (preview.finalAction === "PURGE") {
    return preview.canEarlyPurge
      ? "move 只代表进入 3 天冷静期；冷静期内仅 ADMIN 可在回收站提前永久删除。"
      : "move 只代表进入 3 天冷静期；最终仍以到期时的最新服务端真相为准。";
  }

  return "即使先移入回收站，3 天后也只会封存/脱敏归档，不会伪装成 PURGED。";
}

function getFallbackSuggestion() {
  return "建议改走 public-pool / DORMANT / LOST / BLACKLISTED / merge / 订单支付履约治理。";
}

export function CustomerRecycleEntry({
  customerId,
  customerName,
  phone,
  statusLabel,
  ownershipLabel,
  ownerLabel,
  lastEffectiveFollowUpAt,
  approvedTradeOrderCount,
  linkedLeadCount,
  initialGuard,
  initialFinalizePreview,
  moveToRecycleBinAction,
}: Readonly<CustomerRecycleEntryProps>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<CustomerRecycleActionResult | null>(null);
  const [reason, setReason] = useState<CustomerRecycleReasonCode>("mistaken_creation");
  const [guard, setGuard] = useState(initialGuard);
  const [finalizePreview, setFinalizePreview] =
    useState<RecycleFinalizePreview | null>(initialFinalizePreview);
  const [pending, startTransition] = useTransition();

  const moveBlockerGroups = useMemo(
    () => buildBlockerGroups(guard.blockers),
    [guard.blockers],
  );
  const finalizeBlockerGroups = useMemo(
    () => buildBlockerGroups(finalizePreview?.blockers ?? []),
    [finalizePreview],
  );

  function openDialog() {
    setNotice(null);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setReason("mistaken_creation");
  }

  function handleConfirm() {
    if (!guard.canMoveToRecycleBin) {
      return;
    }

    const formData = new FormData();
    formData.set("id", customerId);
    formData.set("reasonCode", reason);

    startTransition(async () => {
      const result = await moveToRecycleBinAction(formData);

      if (
        result.recycleStatus === "created" ||
        result.recycleStatus === "already_in_recycle_bin"
      ) {
        closeDialog();
        router.refresh();
        return;
      }

      if (result.recycleStatus === "blocked") {
        if (result.guard) {
          setGuard(result.guard);
        }

        if (result.finalizePreview !== undefined) {
          setFinalizePreview(result.finalizePreview ?? null);
        }
      }

      setNotice(result);
    });
  }

  return (
    <div className="mt-4 space-y-3 border-t border-black/6 pt-3.5">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
            Customer Recycle
          </p>
          <p className="text-[13px] leading-6 text-black/56">
            只承接误建轻客户；不替代 public-pool、DORMANT、LOST、BLACKLISTED、merge
            或订单支付履约治理。
          </p>
        </div>
        <button
          type="button"
          onClick={openDialog}
          className="crm-button crm-button-secondary min-h-0 px-3.5 py-2 text-sm"
        >
          {guard.canMoveToRecycleBin ? "移入回收站" : "查看回收判断"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge
          label={guard.canMoveToRecycleBin ? "当前可回收" : "当前不可回收"}
          variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
        />
        <StatusBadge
          label={getFinalizePreviewLabel(finalizePreview)}
          variant={getFinalizePreviewVariant(finalizePreview)}
        />
        <StatusBadge label={`已审核成交单 ${approvedTradeOrderCount} 笔`} variant="neutral" />
        <StatusBadge label={`关联线索 ${linkedLeadCount} 条`} variant="neutral" />
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/34 px-4 py-8">
          <div className="w-full max-w-3xl overflow-hidden rounded-[1.1rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={guard.canMoveToRecycleBin ? "可移入回收站" : "move 已被阻断"}
                    variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
                  />
                  <StatusBadge
                    label={getFinalizePreviewLabel(finalizePreview)}
                    variant={getFinalizePreviewVariant(finalizePreview)}
                  />
                  <StatusBadge label="Customer" variant="neutral" />
                </div>
                <div>
                  <h3 className="text-[1.02rem] font-semibold text-black/86">
                    移入回收站
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-black/58">
                    这里不重写规则，只展示 customer-adapter
                    返回的最新 move guard 与 finalize preview。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="crm-button crm-button-ghost min-h-0 px-2.5 py-2 text-sm"
              >
                关闭
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {notice ? (
                <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
                  {notice.message}
                </ActionBanner>
              ) : null}

              <div className="grid gap-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.78)] p-4 sm:grid-cols-2">
                <SummaryRow label="客户" value={customerName} />
                <SummaryRow label="手机号" value={phone} />
                <SummaryRow label="客户状态" value={statusLabel} />
                <SummaryRow label="归属模式" value={ownershipLabel} />
                <SummaryRow label="负责人" value={ownerLabel} />
                <SummaryRow
                  label="最近有效跟进"
                  value={lastEffectiveFollowUpAt ? formatDateTime(lastEffectiveFollowUpAt) : "暂无"}
                />
                <SummaryRow label="已审核成交单" value={`${approvedTradeOrderCount} 笔`} />
                <SummaryRow label="关联线索" value={`${linkedLeadCount} 条`} />
              </div>

              <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    当前 move guard
                  </p>
                  <StatusBadge
                    label={guard.canMoveToRecycleBin ? "当前可 move" : "当前不可 move"}
                    variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
                  />
                </div>
                <p className="text-[13px] leading-5 text-black/58">
                  {guard.canMoveToRecycleBin
                    ? "当前仍满足“误建轻客户”进入回收站语义，可以先进入 3 天冷静期。"
                    : guard.blockerSummary}
                </p>
                {!guard.canMoveToRecycleBin && moveBlockerGroups.length > 0 ? (
                  <div className="grid gap-3 pt-1">
                    {moveBlockerGroups.map((group) => (
                      <BlockerGroupCard key={`move-${group.key}`} group={group} />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    3 天后最终处理预览
                  </p>
                  <StatusBadge
                    label={getFinalizePreviewLabel(finalizePreview)}
                    variant={getFinalizePreviewVariant(finalizePreview)}
                  />
                </div>
                <p className="text-[13px] leading-5 text-black/58">
                  {finalizePreview?.blockerSummary ??
                    "当前还没有拿到最终处理预览，请刷新后重试。"}
                </p>
                <p className="text-[12px] leading-5 text-black/48">
                  {getFinalizePreviewHint(finalizePreview)}
                </p>
                {finalizeBlockerGroups.length > 0 ? (
                  <div className="grid gap-3 pt-1">
                    {finalizeBlockerGroups.map((group) => (
                      <BlockerGroupCard key={`finalize-${group.key}`} group={group} />
                    ))}
                  </div>
                ) : null}
              </div>

              {guard.canMoveToRecycleBin ? (
                <>
                  <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                        回收原因
                      </p>
                      <p className="mt-1 text-[13px] leading-5 text-black/54">
                        这里只记录为什么当前客户被判定为误建轻客户，不在组件里扩展额外规则。
                      </p>
                    </div>
                    <select
                      value={reason}
                      onChange={(event) =>
                        setReason(event.target.value as CustomerRecycleReasonCode)
                      }
                      className="crm-select"
                    >
                      {CUSTOMER_RECYCLE_REASON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-[0.95rem] border border-[rgba(155,106,29,0.18)] bg-[rgba(255,248,238,0.86)] px-4 py-3 text-[13px] leading-6 text-[rgba(92,61,30,0.92)]">
                    确认后只会进入 3 天冷静期。move 不等于将来一定能 purge，最终以到期时最新服务端真相重算。
                  </div>
                </>
              ) : (
                <ActionBanner tone="danger">
                  {guard.blockerSummary} {getFallbackSuggestion()}
                </ActionBanner>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-[13px] leading-5 text-black/56">
                {guard.canMoveToRecycleBin
                  ? "详情页成功后只会 router.refresh()，随后自然进入 notFound / 安全缺省语义。"
                  : `${guard.blockerSummary} ${getFallbackSuggestion()}`}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="crm-button crm-button-secondary"
                >
                  关闭
                </button>
                {guard.canMoveToRecycleBin ? (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={pending}
                    className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {pending ? "处理中..." : "移入回收站"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-black/42">{label}</p>
      <p className="text-sm font-medium leading-5 text-black/78">{value}</p>
    </div>
  );
}

function BlockerGroupCard({
  group,
}: Readonly<{
  group: BlockerGroup;
}>) {
  return (
    <div className="rounded-[0.9rem] border border-black/8 bg-[rgba(249,250,252,0.78)] p-3.5">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-black/82">{group.title}</p>
        <p className="text-[13px] leading-5 text-black/54">{group.description}</p>
      </div>

      <div className="mt-3 space-y-2">
        {group.items.map((item) => (
          <div
            key={`${group.key}-${item.name}`}
            className="rounded-[0.8rem] border border-black/8 bg-white/86 px-3 py-2.5"
          >
            <p className="text-sm font-medium text-black/82">{item.name}</p>
            <p className="mt-1 text-[13px] leading-5 text-black/56">
              {item.description}
            </p>
            {item.suggestedAction ? (
              <p className="mt-1 text-[12px] leading-5 text-black/48">
                建议动作：{item.suggestedAction}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
