export type ManagedUserDeletionHistoryCode =
  | "call_records"
  | "call_recordings"
  | "outbound_call_sessions"
  | "call_quality_reviews"
  | "follow_up_tasks"
  | "wechat_records"
  | "live_invitations"
  | "lead_assignments_to"
  | "lead_assignments_by"
  | "payment_records_submitted"
  | "collection_tasks"
  | "logistics_follow_up_tasks"
  | "lead_import_batches"
  | "recycle_bin_entries_deleted"
  | "lead_import_batch_rollbacks"
  | "imported_customer_deletion_requests";

export type ManagedUserDeletionCleanupCode =
  | "permission_grants"
  | "outbound_call_seat_binding"
  | "mobile_devices"
  | "product_saved_views";

export type ManagedUserDeletionHistoryItem = {
  code: ManagedUserDeletionHistoryCode;
  label: string;
  count: number;
  description: string;
};

export type ManagedUserDeletionCleanupItem = {
  code: ManagedUserDeletionCleanupCode;
  label: string;
  count: number;
  description: string;
};

export type ManagedUserDeletionCountSnapshot = {
  ownedCustomerCount: number;
  permissionGrantCount: number;
  outboundCallSeatBindingCount: number;
  mobileDeviceCount: number;
  productSavedViewCount: number;
  callRecordCount: number;
  callRecordingCount: number;
  outboundCallSessionCount: number;
  callQualityReviewCount: number;
  followUpTaskCount: number;
  wechatRecordCount: number;
  liveInvitationCount: number;
  leadAssignmentToCount: number;
  leadAssignmentByCount: number;
  paymentRecordSubmittedCount: number;
  collectionTaskCount: number;
  logisticsFollowUpTaskCount: number;
  leadImportBatchCount: number;
  recycleBinEntryDeletedCount: number;
  leadImportBatchRollbackCount: number;
  importedCustomerDeletionRequestCount: number;
};

export type ManagedUserDeletionImpact = {
  transferableCustomerCount: number;
  cleanupConfigCount: number;
  cleanupItems: ManagedUserDeletionCleanupItem[];
  historyItems: ManagedUserDeletionHistoryItem[];
  historySummary: string;
  canHardDelete: boolean;
};

const historyDefinitions = [
  {
    code: "call_records",
    label: "通话记录",
    countKey: "callRecordCount",
    description: "会随账号一起删除的通话历史。",
  },
  {
    code: "call_recordings",
    label: "通话录音",
    countKey: "callRecordingCount",
    description: "会随账号一起删除的录音历史。",
  },
  {
    code: "outbound_call_sessions",
    label: "外呼会话",
    countKey: "outboundCallSessionCount",
    description: "会随账号一起删除的外呼会话历史。",
  },
  {
    code: "call_quality_reviews",
    label: "质检复核",
    countKey: "callQualityReviewCount",
    description: "会随账号一起删除的质检复核记录。",
  },
  {
    code: "follow_up_tasks",
    label: "跟进任务",
    countKey: "followUpTaskCount",
    description: "会随账号一起删除的跟进任务。",
  },
  {
    code: "wechat_records",
    label: "微信记录",
    countKey: "wechatRecordCount",
    description: "会随账号一起删除的微信跟进记录。",
  },
  {
    code: "live_invitations",
    label: "直播邀约",
    countKey: "liveInvitationCount",
    description: "会随账号一起删除的直播邀约历史。",
  },
  {
    code: "lead_assignments_to",
    label: "线索接收记录",
    countKey: "leadAssignmentToCount",
    description: "会随账号一起删除的线索接收审计。",
  },
  {
    code: "lead_assignments_by",
    label: "线索分配操作",
    countKey: "leadAssignmentByCount",
    description: "会随账号一起删除的线索分配审计。",
  },
  {
    code: "payment_records_submitted",
    label: "收款提交",
    countKey: "paymentRecordSubmittedCount",
    description: "会随账号一起删除的收款提交记录。",
  },
  {
    code: "collection_tasks",
    label: "催收任务",
    countKey: "collectionTaskCount",
    description: "会随账号一起删除的催收任务。",
  },
  {
    code: "logistics_follow_up_tasks",
    label: "物流跟进",
    countKey: "logisticsFollowUpTaskCount",
    description: "会随账号一起删除的物流跟进任务。",
  },
  {
    code: "lead_import_batches",
    label: "导入批次",
    countKey: "leadImportBatchCount",
    description: "会随账号一起删除的导入批次。",
  },
  {
    code: "recycle_bin_entries_deleted",
    label: "回收站删除记录",
    countKey: "recycleBinEntryDeletedCount",
    description: "会随账号一起删除的回收站删除审计。",
  },
  {
    code: "lead_import_batch_rollbacks",
    label: "导入回滚",
    countKey: "leadImportBatchRollbackCount",
    description: "会随账号一起删除的导入回滚记录。",
  },
  {
    code: "imported_customer_deletion_requests",
    label: "导入客户删除申请",
    countKey: "importedCustomerDeletionRequestCount",
    description: "会随账号一起删除的导入客户删除申请。",
  },
] as const satisfies ReadonlyArray<{
  code: ManagedUserDeletionHistoryCode;
  label: string;
  countKey: keyof ManagedUserDeletionCountSnapshot;
  description: string;
}>;

const cleanupDefinitions = [
  {
    code: "permission_grants",
    label: "额外权限 grant",
    countKey: "permissionGrantCount",
    description: "删除账号前会清理该账号持有的额外权限授权。",
  },
  {
    code: "outbound_call_seat_binding",
    label: "坐席绑定",
    countKey: "outboundCallSeatBindingCount",
    description: "删除账号前会清理该账号的外呼坐席绑定。",
  },
  {
    code: "mobile_devices",
    label: "移动设备绑定",
    countKey: "mobileDeviceCount",
    description: "删除账号前会清理该账号的移动端设备绑定。",
  },
  {
    code: "product_saved_views",
    label: "个人 saved views",
    countKey: "productSavedViewCount",
    description: "删除账号前会清理该账号的个人商品视图。",
  },
] as const satisfies ReadonlyArray<{
  code: ManagedUserDeletionCleanupCode;
  label: string;
  countKey: keyof ManagedUserDeletionCountSnapshot;
  description: string;
}>;

function buildHistorySummary(historyItems: ManagedUserDeletionHistoryItem[]) {
  if (historyItems.length === 0) {
    return "当前没有需要一并删除的历史记录。";
  }

  const firstItems = historyItems
    .slice(0, 4)
    .map((item) => `${item.label} ${item.count} 条`)
    .join("、");
  const restCount = historyItems.length - 4;

  return `将一并删除 ${historyItems.length} 类历史记录：${firstItems}${restCount > 0 ? ` 等 ${restCount} 类` : ""}。`;
}

export function buildManagedUserDeletionImpact(
  counts: ManagedUserDeletionCountSnapshot,
): ManagedUserDeletionImpact {
  const cleanupItems = cleanupDefinitions
    .map((definition) => ({
      code: definition.code,
      label: definition.label,
      count: counts[definition.countKey],
      description: definition.description,
    }))
    .filter((item) => item.count > 0);
  const historyItems = historyDefinitions
    .map((definition) => ({
      code: definition.code,
      label: definition.label,
      count: counts[definition.countKey],
      description: definition.description,
    }))
    .filter((item) => item.count > 0);

  return {
    transferableCustomerCount: counts.ownedCustomerCount,
    cleanupConfigCount: cleanupItems.reduce((sum, item) => sum + item.count, 0),
    cleanupItems,
    historyItems,
    historySummary: buildHistorySummary(historyItems),
    canHardDelete: true,
  };
}
