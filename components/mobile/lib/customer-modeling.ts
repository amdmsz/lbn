/**
 * 移动端客户列表 / 详情数据建模.
 * 从 mobile-app-shell.tsx 抽出 (Phase 1 plan 第 2 个 helper 模块).
 *
 * 收纳原则: 把 mobile API payload 适配成 CustomerListItem,
 * 以及围绕 CustomerListItem 的纯派生字段读取 (商品 / 地址 / 分配信息等).
 *
 * 不在这里的: PhoneHistoryEntry 相关构造 (移到 phone-history.ts),
 * RecentDialCustomer 本地存储 (移到 recent-dial.ts).
 */

import { formatRegion, formatRelativeDateTime } from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import type {
  MobileApiCustomerListItem,
  MobileCustomerDetail,
} from "@/lib/mobile/client-api";

import { parseMobileApiDate, toDate } from "./format";

export function formatMobileDetailCallLabel(record: {
  result: string | null;
  resultCode: string | null;
  latestActionEvent?: { action: string; failureCode?: string | null } | null;
}) {
  if (record.resultCode || record.result) {
    return record.resultCode || record.result || "未填写";
  }

  switch (record.latestActionEvent?.action) {
    case "call.provider_requested":
      return "外呼提交中";
    case "call.provider_accepted":
      return "外呼已提交";
    case "call.provider_ringing":
      return "外呼振铃中";
    case "call.provider_answered":
      return "外呼已接通";
    case "call.provider_ended":
      return "外呼已结束";
    case "call.provider_canceled":
      return "外呼已取消";
    case "call.provider_failed":
      return "外呼失败";
    case "call.recording_imported":
      return "录音已归档";
    case "call.recording_failed":
      return "录音归档失败";
    case "call.native_dispatched":
      return "本机已拨出";
    case "call.native_permission_denied":
      return "本机权限不足";
    case "call.offhook_detected":
      return "本机已接通";
    case "call.idle_detected":
      return "本机已结束";
    case "call.recording_started":
      return "本机录音中";
    case "call.recording_file_ready":
      return "本机录音待上传";
    case "call.recording_unsupported":
      return "本机录音不支持";
    case "call.upload_started":
      return "录音上传中";
    case "call.upload_completed":
      return "录音已上传";
    case "call.upload_failed":
      return "录音上传失败";
    case "call.followup_saved":
      return "已保存跟进";
    default:
      return "未填写";
  }
}

export function createMobileApiCustomerListItem(
  item: MobileApiCustomerListItem,
  fallback?: CustomerListItem,
) {
  const latestCall = item.latestCall
    ? [
        {
          id: item.latestCall.id,
          callTime: new Date(item.latestCall.callTime),
          durationSeconds: item.latestCall.durationSeconds,
          callSource: item.latestCall.callSource,
          result: item.latestCall.result as CustomerListItem["callRecords"][number]["result"],
          resultCode: item.latestCall.resultCode,
          resultLabel: formatMobileDetailCallLabel(item.latestCall),
          remark: fallback?.callRecords.find((record) => record.id === item.latestCall?.id)
            ?.remark ?? null,
          nextFollowUpAt: parseMobileApiDate(item.latestCall.nextFollowUpAt),
          sales: fallback?.owner
            ? {
                name: fallback.owner.name,
                username: fallback.owner.username,
              }
            : {
                name: item.owner?.name ?? "",
                username: item.owner?.username ?? "",
              },
        },
      ]
    : (fallback?.callRecords ?? []);

  return {
    id: item.id,
    name: item.name,
    phone: item.phone || item.phoneMasked,
    province: item.region || fallback?.province || null,
    city: fallback?.city ?? null,
    district: fallback?.district ?? null,
    address: fallback?.address ?? null,
    status: item.status as CustomerListItem["status"],
    // Wave 7-B: 移动端 API 暂未透传 grade, 用 fallback. null 表示 "暂不显示分级 chip".
    grade: fallback?.grade ?? null,
    // Wave 11: 移动端 API 暂未透传 callCount / isWechatAdded, 用 fallback 兜底.
    // callCount 缺省 0 (不显 "已拨 X/5"), isWechatAdded 缺省 false.
    callCount: fallback?.callCount ?? 0,
    isWechatAdded: fallback?.isWechatAdded ?? false,
    ownershipMode: item.ownershipMode as CustomerListItem["ownershipMode"],
    createdAt: new Date(item.createdAt),
    avatarUrl: item.avatarUrl ?? fallback?.avatarUrl ?? null,
    assignedAt: parseMobileApiDate(item.assignedAt) ?? fallback?.assignedAt ?? null,
    latestImportAt: fallback?.latestImportAt ?? null,
    latestFollowUpAt: parseMobileApiDate(item.lastFollowUpAt),
    lastEffectiveFollowUpAt: parseMobileApiDate(item.lastFollowUpAt),
    latestTradeAt: parseMobileApiDate(item.latestOrder?.createdAt),
    lifetimeTradeAmount:
      fallback?.lifetimeTradeAmount ?? item.latestOrder?.finalAmount ?? "0",
    approvedTradeOrderCount:
      fallback?.approvedTradeOrderCount ??
      (item.latestOrder?.tradeStatus === "APPROVED" ? 1 : 0),
    executionClass: item.level,
    newImported: fallback?.newImported ?? false,
    pendingFirstCall: fallback?.pendingFirstCall ?? !item.latestCall,
    latestInterestedProduct: fallback?.latestInterestedProduct ?? null,
    latestPurchasedProduct:
      fallback?.latestPurchasedProduct ?? item.latestOrder?.tradeNo ?? null,
    remark: fallback?.remark ?? null,
    workingStatuses:
      fallback?.workingStatuses ??
      (item.latestFollowUpTask ? (["pending_follow_up"] as CustomerListItem["workingStatuses"]) : []),
    recycleGuard: fallback?.recycleGuard ?? (null as unknown as CustomerListItem["recycleGuard"]),
    recycleFinalizePreview: fallback?.recycleFinalizePreview ?? null,
    owner:
      item.owner ??
      fallback?.owner ??
      null,
    leads: fallback?.leads ?? [],
    callRecords: latestCall,
    _count: fallback?._count ?? {
      leads: 0,
      callRecords: latestCall.length,
    },
    customerTags: fallback?.customerTags ?? [],
  } satisfies CustomerListItem;
}

export function mergeMobileApiCustomerItems(
  current: readonly MobileApiCustomerListItem[],
  next: readonly MobileApiCustomerListItem[],
) {
  const itemsById = new Map<string, MobileApiCustomerListItem>();

  for (const item of current) {
    itemsById.set(item.id, item);
  }

  for (const item of next) {
    itemsById.set(item.id, item);
  }

  return Array.from(itemsById.values());
}

export function getCustomerPrimaryProduct(item: CustomerListItem) {
  return (
    item.latestInterestedProduct?.trim() ||
    item.leads.find((lead) => lead.interestedProduct?.trim())?.interestedProduct?.trim() ||
    item.latestPurchasedProduct?.trim() ||
    ""
  );
}

export function getCustomerDialProductSignal(item: CustomerListItem) {
  const interestedProduct =
    item.latestInterestedProduct?.trim() ||
    item.leads.find((lead) => lead.interestedProduct?.trim())?.interestedProduct?.trim() ||
    "";

  if (interestedProduct) {
    return {
      label: "意向商品",
      value: interestedProduct,
    };
  }

  const purchasedProduct = item.latestPurchasedProduct?.trim() || "";

  if (purchasedProduct) {
    return {
      label: "已购商品",
      value: purchasedProduct,
    };
  }

  return null;
}

export function getCustomerAssignmentLabel(
  item: CustomerListItem,
  detail?: MobileCustomerDetail | null,
) {
  const assignedAt = toDate(detail?.assignedAt ?? item.assignedAt);

  return assignedAt ? formatRelativeDateTime(assignedAt) : "未分配";
}

export function getPhoneLocationLabel(item: CustomerListItem) {
  return formatRegion(item.province, item.city, item.district) || "未知";
}

export function getContactAddressLabel(item: CustomerListItem) {
  return (
    [item.province, item.city, item.district, item.address]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" / ") || "未填写"
  );
}

export function getCustomerDetailAddressLabel(
  item: CustomerListItem,
  detail: MobileCustomerDetail | null,
) {
  return (
    [
      detail?.profile.province ?? item.province,
      detail?.profile.city ?? item.city,
      detail?.profile.district ?? item.district,
      detail?.profile.address ?? item.address,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" / ") || "未填写地址"
  );
}
