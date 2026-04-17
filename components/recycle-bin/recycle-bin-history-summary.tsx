"use client";

import type { ReactNode } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  type CustomerRecycleArchiveGovernanceAnchors,
  type RecycleArchiveMaskedValue,
  type RecycleArchiveObjectWeight,
  type TradeOrderRecycleArchiveDownstreamAnchors,
} from "@/lib/recycle-bin/archive-payload";
import type {
  RecycleBinHistoryArchiveContract,
  RecycleBinListItem,
} from "@/lib/recycle-bin/queries";

type HistoryField = {
  label: string;
  value: string;
  multiline?: boolean;
};

function getCustomerStatusLabel(value: string | null) {
  switch (value) {
    case "ACTIVE":
      return "活跃";
    case "DORMANT":
      return "沉默";
    case "LOST":
      return "流失";
    case "BLACKLISTED":
      return "黑名单";
    default:
      return value ?? "--";
  }
}

function getCustomerOwnershipModeLabel(value: string | null) {
  switch (value) {
    case "PRIVATE":
      return "私有承接";
    case "PUBLIC":
      return "公海";
    case "LOCKED":
      return "锁定";
    default:
      return value ?? "--";
  }
}

function getTradeStatusLabel(value: string | null) {
  switch (value) {
    case "DRAFT":
      return "草稿";
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已驳回";
    case "CANCELED":
      return "已取消";
    default:
      return value ?? "--";
  }
}

function getReviewStatusLabel(value: string | null) {
  switch (value) {
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已驳回";
    default:
      return value ?? "--";
  }
}

function getObjectWeightLabel(
  weight: RecycleArchiveObjectWeight | null | undefined,
  item: RecycleBinListItem,
) {
  if (weight === "LIGHT") {
    return "light 对象 / 可最终 purge";
  }

  if (weight === "HEAVY") {
    return "heavy 对象 / 仅封存";
  }

  if (item.resolutionActionLabel === "ARCHIVE") {
    return "heavy 对象 / 仅封存";
  }

  if (item.resolutionActionLabel === "PURGE") {
    return "light 对象 / 已最终 PURGE";
  }

  if (item.resolutionActionLabel === "RESTORE") {
    return "已恢复 / 未进入最终处理";
  }

  return "--";
}

function getMaskedValueLabel(value: RecycleArchiveMaskedValue | string | null) {
  if (!value) {
    return "--";
  }

  if (value === "CLEARED") {
    return "已清空";
  }

  if (value === "EMPTY") {
    return "原值为空";
  }

  if (value === "ARCHIVED_ADDRESS") {
    return "已封存地址";
  }

  return value;
}

function formatCurrency(value: string | null) {
  if (!value) {
    return "--";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatCount(value: number) {
  return `${value} 条`;
}

function getHistoryResultVariant(item: RecycleBinListItem) {
  if (item.entryStatusLabel === "ARCHIVED") {
    return "info" as const;
  }

  if (item.entryStatusLabel === "PURGED") {
    return "warning" as const;
  }

  return "success" as const;
}

function HistorySummaryCard({
  eyebrow,
  title,
  badges,
  fields,
  note,
}: Readonly<{
  eyebrow: string;
  title: string;
  badges?: ReactNode;
  fields: HistoryField[];
  note?: string | null;
}>) {
  return (
    <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
            {eyebrow}
          </p>
          <p className="text-sm font-semibold text-black/82">{title}</p>
        </div>
        {badges}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={`${title}-${field.label}`} className="space-y-1">
            <p className="text-[12px] text-black/42">{field.label}</p>
            <p
              className={
                field.multiline
                  ? "text-sm leading-6 text-black/78"
                  : "text-sm font-medium leading-5 text-black/78"
              }
            >
              {field.value}
            </p>
          </div>
        ))}
      </div>

      {note ? <p className="text-[12px] leading-5 text-black/50">{note}</p> : null}
    </div>
  );
}

function RawArchivePayload({
  value,
}: Readonly<{
  value: string;
}>) {
  return (
    <details className="rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] p-4">
      <summary className="cursor-pointer list-none text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
        原始归档载荷
      </summary>
      <pre className="mt-3 overflow-x-auto rounded-[0.85rem] border border-black/7 bg-white/80 p-3 text-xs leading-6 text-black/68">
        {value}
      </pre>
    </details>
  );
}

function buildHistoryResultFields(
  item: RecycleBinListItem,
  objectWeight: RecycleArchiveObjectWeight | null | undefined,
): HistoryField[] {
  return [
    { label: "最终结果状态", value: item.entryStatusLabel },
    { label: "finalAction", value: item.resolutionActionLabel ?? "--" },
    { label: "轻 / 重对象判断", value: getObjectWeightLabel(objectWeight, item) },
    { label: "删除原因", value: item.deleteReasonLabel },
    {
      label: "deletedAt / deletedBy",
      value: `${item.deletedAtLabel} / ${item.deletedByLabel}`,
    },
    {
      label: "resolvedAt / resolvedBy",
      value: `${item.resolvedAtLabel ?? "--"} / ${item.resolvedByLabel ?? "--"}`,
    },
    {
      label: "最终说明",
      value: item.resolutionSummary ?? "当前为历史终态只读记录。",
      multiline: true,
    },
  ];
}

function buildHistorySearchNote(
  historyArchive: RecycleBinHistoryArchiveContract | null,
  targetLabel: string,
) {
  if (historyArchive?.source === "SNAPSHOT_V2") {
    return `${targetLabel} 当前已接入 SNAPSHOT_V2，可稳定复用这些结构化字段做审计检索，不需要先做全文搜索。`;
  }

  if (historyArchive?.source === "LEGACY_FALLBACK") {
    return `${targetLabel} 当前只命中 legacy archive snapshot，请按基础审计字段检索，结构化字段不保证完整。`;
  }

  return `${targetLabel} 当前没有结构化 archive payload，只能依赖 finalAction、处理人、处理时间等基础审计字段。`;
}

function buildCustomerSearchFields(
  item: RecycleBinListItem,
  historyArchive: RecycleBinHistoryArchiveContract | null,
): HistoryField[] {
  const snapshot = historyArchive?.customerSnapshot ?? null;

  if (historyArchive?.source === "SNAPSHOT_V2" && snapshot) {
    return [
      {
        label: "archive source / version",
        value: `${historyArchive.source} / ${snapshot.snapshotVersion}`,
      },
      {
        label: "customerId",
        value: snapshot.customerId,
      },
      {
        label: "owner snapshot",
        value: snapshot.owner?.displayLabel ?? "未分配负责人",
      },
      {
        label: "customerStatus / ownershipMode",
        value: `${getCustomerStatusLabel(snapshot.customerStatus)} / ${getCustomerOwnershipModeLabel(snapshot.ownershipMode)}`,
        multiline: true,
      },
    ];
  }

  return [
    {
      label: "结构化检索入口",
      value:
        historyArchive?.source === "LEGACY_FALLBACK"
          ? "legacy fallback 条目只保留兼容快照，不伪装成完整结构化检索结果。"
          : "当前条目没有可用的 Customer 结构化 archive snapshot。",
      multiline: true,
    },
  ];
}

function buildTradeOrderSearchFields(
  item: RecycleBinListItem,
  historyArchive: RecycleBinHistoryArchiveContract | null,
): HistoryField[] {
  const snapshot = historyArchive?.tradeOrderSnapshot ?? null;

  if (historyArchive?.source === "SNAPSHOT_V2" && snapshot) {
    return [
      {
        label: "archive source / version",
        value: `${historyArchive.source} / ${snapshot.snapshotVersion}`,
      },
      {
        label: "tradeNo",
        value: snapshot.tradeNo ?? item.name,
      },
      {
        label: "customer snapshot",
        value: [
          snapshot.customer?.name ?? item.secondaryLabel,
          snapshot.customer?.phoneMasked ? `电话 ${snapshot.customer.phoneMasked}` : null,
          snapshot.customer?.ownerLabel ? `负责人 ${snapshot.customer.ownerLabel}` : null,
        ]
          .filter(Boolean)
          .join(" / "),
        multiline: true,
      },
      {
        label: "tradeStatus / reviewStatus",
        value: `${getTradeStatusLabel(snapshot.tradeStatus)} / ${getReviewStatusLabel(snapshot.reviewStatus)}`,
        multiline: true,
      },
    ];
  }

  return [
    {
      label: "结构化检索入口",
      value:
        historyArchive?.source === "LEGACY_FALLBACK"
          ? "legacy fallback 条目只保留兼容快照，不伪装成完整结构化检索结果。"
          : "当前条目没有可用的 TradeOrder 结构化 archive snapshot。",
      multiline: true,
    },
  ];
}

function buildCustomerGovernanceFields(
  anchors: CustomerRecycleArchiveGovernanceAnchors | null,
): HistoryField[] {
  if (!anchors) {
    return [
      {
        label: "治理锚点",
        value: "旧归档载荷没有包含结构化治理锚点摘要。",
        multiline: true,
      },
    ];
  }

  return [
    {
      label: "生命周期 / 归属链",
      value: [
        `已审主单 ${formatCount(anchors.approvedTradeOrderCount)}`,
        `关联线索 ${formatCount(anchors.linkedLeadCount)}`,
        `归属事件 ${formatCount(anchors.ownershipEventCount)}`,
      ].join(" / "),
      multiline: true,
    },
    {
      label: "销售跟进链",
      value: [
        `跟进任务 ${formatCount(anchors.followUpTaskCount)}`,
        `通话 ${formatCount(anchors.callRecordCount)}`,
        `微信 ${formatCount(anchors.wechatRecordCount)}`,
        `直播邀约 ${formatCount(anchors.liveInvitationCount)}`,
      ].join(" / "),
      multiline: true,
    },
    {
      label: "交易与资金链",
      value: [
        `legacy 订单 ${formatCount(anchors.legacyOrderCount)}`,
        `子单 ${formatCount(anchors.salesOrderCount)}`,
        `主单 ${formatCount(anchors.tradeOrderCount)}`,
        `礼品 ${formatCount(anchors.giftRecordCount)}`,
        `支付计划 ${formatCount(anchors.paymentPlanCount)}`,
        `支付记录 ${formatCount(anchors.paymentRecordCount)}`,
        `催收任务 ${formatCount(anchors.collectionTaskCount)}`,
      ].join(" / "),
      multiline: true,
    },
    {
      label: "履约与物流链",
      value: [
        `发货任务 ${formatCount(anchors.shippingTaskCount)}`,
        `物流跟进 ${formatCount(anchors.logisticsFollowUpCount)}`,
        `COD 回款 ${formatCount(anchors.codCollectionCount)}`,
      ].join(" / "),
      multiline: true,
    },
    {
      label: "归并与审计链",
      value: [
        `merge 日志 ${formatCount(anchors.mergeLogCount)}`,
        `客户标签 ${formatCount(anchors.customerTagCount)}`,
      ].join(" / "),
      multiline: true,
    },
  ];
}

function buildTradeOrderDownstreamFields(
  anchors: TradeOrderRecycleArchiveDownstreamAnchors | null,
): HistoryField[] {
  if (!anchors) {
    return [
      {
        label: "下游锚点",
        value: "旧归档载荷没有包含结构化下游锚点摘要。",
        multiline: true,
      },
    ];
  }

  return [
    {
      label: "拆单与供应链",
      value: `子单 ${formatCount(anchors.salesOrderCount)}`,
    },
    {
      label: "支付 / 收款链",
      value: [
        `支付计划 ${formatCount(anchors.paymentPlanCount)}`,
        `支付记录 ${formatCount(anchors.paymentRecordCount)}`,
        `催收任务 ${formatCount(anchors.collectionTaskCount)}`,
      ].join(" / "),
      multiline: true,
    },
    {
      label: "履约执行链",
      value: [
        `发货任务 ${formatCount(anchors.shippingTaskCount)}`,
        `导出批次行 ${formatCount(anchors.exportLineCount)}`,
      ].join(" / "),
      multiline: true,
    },
    {
      label: "物流 / COD 链",
      value: [
        `物流跟进 ${formatCount(anchors.logisticsFollowUpCount)}`,
        `COD 回款 ${formatCount(anchors.codCollectionCount)}`,
      ].join(" / "),
      multiline: true,
    },
  ];
}

function buildArchiveNote(input: {
  targetMissing: boolean;
  blockerSummary: string | null;
  historyArchive: RecycleBinHistoryArchiveContract | null;
  structuredLabel: string;
}) {
  if (input.targetMissing) {
    return "归档时源对象已不存在，这里只保留回收站历史审计。";
  }

  if (input.historyArchive?.source === "LEGACY_FALLBACK") {
    return `当前为 legacy archive snapshot，${input.structuredLabel}按兼容字段展示。`;
  }

  return input.blockerSummary;
}

function CustomerHistorySummary({
  item,
}: Readonly<{
  item: RecycleBinListItem;
}>) {
  const historyArchive = item.historyArchive;
  const archivePayload = historyArchive?.archivePayload ?? null;
  const snapshot = historyArchive?.customerSnapshot ?? null;

  return (
    <>
      <HistorySummaryCard
        eyebrow="历史终态摘要"
        title="Customer 最终处理"
        badges={
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={item.entryStatusLabel} variant="neutral" />
            <StatusBadge
              label={item.resolutionActionLabel ?? item.entryStatusLabel}
              variant={getHistoryResultVariant(item)}
            />
          </div>
        }
        fields={buildHistoryResultFields(item, snapshot?.objectWeight)}
      />

      <HistorySummaryCard
        eyebrow="审计检索线索"
        title="Customer 结构化检索"
        badges={
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={historyArchive?.source ?? "UNAVAILABLE"} variant="neutral" />
          </div>
        }
        fields={buildCustomerSearchFields(item, historyArchive)}
        note={buildHistorySearchNote(historyArchive, "Customer")}
      />

      <HistorySummaryCard
        eyebrow="归档后关键信息"
        title="Customer 归档摘要"
        fields={
          snapshot
            ? [
                { label: "客户 ID", value: snapshot.customerId },
                {
                  label: "owner snapshot",
                  value: snapshot.owner?.displayLabel ?? "未分配负责人",
                },
                {
                  label: "customerStatus",
                  value: getCustomerStatusLabel(snapshot.customerStatus),
                },
                {
                  label: "ownershipMode",
                  value: getCustomerOwnershipModeLabel(snapshot.ownershipMode),
                },
                {
                  label: "archivedAt",
                  value: archivePayload?.archivedAt || item.resolvedAtLabel || "--",
                },
                {
                  label: "snapshotVersion",
                  value: String(snapshot.snapshotVersion),
                },
              ]
            : [
                {
                  label: "归档载荷",
                  value: "当前历史终态没有可解析的 archive payload。",
                  multiline: true,
                },
              ]
        }
        note={buildArchiveNote({
          targetMissing: snapshot?.targetMissing ?? false,
          blockerSummary: archivePayload?.blockerSummary ?? null,
          historyArchive,
          structuredLabel: "Customer 归档摘要",
        })}
      />

      <HistorySummaryCard
        eyebrow="脱敏字段摘要"
        title="Customer 脱敏结果"
        fields={
          snapshot
            ? [
                { label: "nameMasked", value: getMaskedValueLabel(snapshot.nameMasked) },
                {
                  label: "phoneMasked",
                  value: getMaskedValueLabel(snapshot.phoneMasked),
                },
                {
                  label: "wechatIdMasked",
                  value: getMaskedValueLabel(snapshot.wechatIdMasked),
                },
                {
                  label: "addressMasked",
                  value: getMaskedValueLabel(snapshot.addressMasked),
                },
                {
                  label: "remarkMasked",
                  value: getMaskedValueLabel(snapshot.remarkMasked),
                },
              ]
            : [
                {
                  label: "脱敏结果",
                  value: "当前历史终态没有可解析的结构化脱敏快照。",
                  multiline: true,
                },
              ]
        }
      />

      <HistorySummaryCard
        eyebrow="治理锚点摘要"
        title="Customer 治理锚点"
        fields={buildCustomerGovernanceFields(snapshot?.governanceAnchors ?? null)}
        note={
          snapshot?.governanceAnchors
            ? "优先展示服务端 archive executor 写入的结构化治理锚点，不再依赖前端从原始 JSON 推导。"
            : null
        }
      />

      {item.archivePayloadJsonText ? <RawArchivePayload value={item.archivePayloadJsonText} /> : null}
    </>
  );
}

function TradeOrderHistorySummary({
  item,
}: Readonly<{
  item: RecycleBinListItem;
}>) {
  const historyArchive = item.historyArchive;
  const archivePayload = historyArchive?.archivePayload ?? null;
  const snapshot = historyArchive?.tradeOrderSnapshot ?? null;

  return (
    <>
      <HistorySummaryCard
        eyebrow="历史终态摘要"
        title="TradeOrder 最终处理"
        badges={
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={item.entryStatusLabel} variant="neutral" />
            <StatusBadge
              label={item.resolutionActionLabel ?? item.entryStatusLabel}
              variant={getHistoryResultVariant(item)}
            />
          </div>
        }
        fields={buildHistoryResultFields(item, snapshot?.objectWeight)}
      />

      <HistorySummaryCard
        eyebrow="审计检索线索"
        title="TradeOrder 结构化检索"
        badges={
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={historyArchive?.source ?? "UNAVAILABLE"} variant="neutral" />
          </div>
        }
        fields={buildTradeOrderSearchFields(item, historyArchive)}
        note={buildHistorySearchNote(historyArchive, "TradeOrder")}
      />

      <HistorySummaryCard
        eyebrow="订单关键信息"
        title="TradeOrder 归档摘要"
        fields={
          snapshot
            ? [
                { label: "订单号", value: snapshot.tradeNo ?? item.name },
                {
                  label: "客户快照",
                  value: [
                    snapshot.customer?.name ?? item.secondaryLabel,
                    snapshot.customer?.phoneMasked
                      ? `电话 ${snapshot.customer.phoneMasked}`
                      : null,
                    snapshot.customer?.ownerLabel
                      ? `负责人 ${snapshot.customer.ownerLabel}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" / "),
                  multiline: true,
                },
                {
                  label: "tradeStatus",
                  value: getTradeStatusLabel(snapshot.tradeStatus),
                },
                {
                  label: "reviewStatus",
                  value: getReviewStatusLabel(snapshot.reviewStatus),
                },
                {
                  label: "finalAmount",
                  value: formatCurrency(snapshot.finalAmount),
                },
                {
                  label: "archivedAt",
                  value: archivePayload?.archivedAt || item.resolvedAtLabel || "--",
                },
              ]
            : [
                {
                  label: "归档载荷",
                  value: "当前历史终态没有可解析的 archive payload。",
                  multiline: true,
                },
              ]
        }
        note={buildArchiveNote({
          targetMissing: snapshot?.targetMissing ?? false,
          blockerSummary: archivePayload?.blockerSummary ?? null,
          historyArchive,
          structuredLabel: "TradeOrder 归档摘要",
        })}
      />

      <HistorySummaryCard
        eyebrow="收货信息脱敏"
        title="TradeOrder 收货快照处理"
        fields={
          snapshot
            ? [
                {
                  label: "receiverNameMasked",
                  value: getMaskedValueLabel(snapshot.receiverNameMasked),
                },
                {
                  label: "receiverPhoneMasked",
                  value: getMaskedValueLabel(snapshot.receiverPhoneMasked),
                },
                {
                  label: "receiverAddressMasked",
                  value: getMaskedValueLabel(snapshot.receiverAddressMasked),
                },
              ]
            : [
                {
                  label: "收货信息脱敏",
                  value: "当前历史终态没有可解析的结构化收货脱敏快照。",
                  multiline: true,
                },
              ]
        }
      />

      <HistorySummaryCard
        eyebrow="下游锚点摘要"
        title="TradeOrder 治理锚点"
        fields={buildTradeOrderDownstreamFields(snapshot?.downstreamAnchors ?? null)}
        note={
          snapshot?.downstreamAnchors
            ? "优先展示服务端 archive executor 写入的结构化下游锚点，不再依赖前端从 blocker 名称推导。"
            : null
        }
      />

      {item.archivePayloadJsonText ? <RawArchivePayload value={item.archivePayloadJsonText} /> : null}
    </>
  );
}

export function RecycleBinHistorySummary({
  item,
}: Readonly<{
  item: RecycleBinListItem;
}>) {
  if (item.targetType === "CUSTOMER") {
    return <CustomerHistorySummary item={item} />;
  }

  if (item.targetType === "TRADE_ORDER") {
    return <TradeOrderHistorySummary item={item} />;
  }

  return null;
}
