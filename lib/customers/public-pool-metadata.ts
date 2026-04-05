import type {
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  CustomerStatus,
  PublicPoolAutoAssignStrategy,
  PublicPoolReason,
  RoleCode,
} from "@prisma/client";
import type { FollowUpEffectLevel } from "@/lib/calls/metadata";

export const CUSTOMER_OWNERSHIP_MODE_VALUES = [
  "PRIVATE",
  "PUBLIC",
  "LOCKED",
] as const satisfies readonly CustomerOwnershipMode[];

export const PUBLIC_POOL_REASON_VALUES = [
  "UNASSIGNED_IMPORT",
  "MANUAL_RELEASE",
  "INACTIVE_RECYCLE",
  "OWNER_LEFT_TEAM",
  "BATCH_REALLOCATION",
  "MERGE_RELEASE",
  "INVALID_FOLLOWUP_RECYCLE",
] as const satisfies readonly PublicPoolReason[];

export const CUSTOMER_OWNERSHIP_EVENT_REASON_VALUES = [
  "UNASSIGNED_IMPORT",
  "MANUAL_RELEASE",
  "INACTIVE_RECYCLE",
  "OWNER_LEFT_TEAM",
  "BATCH_REALLOCATION",
  "MERGE_RELEASE",
  "INVALID_FOLLOWUP_RECYCLE",
  "SALES_CLAIM",
  "SUPERVISOR_ASSIGN",
  "AUTO_ASSIGN",
  "TEAM_TRANSFER",
  "OWNER_RESTORE",
] as const satisfies readonly CustomerOwnershipEventReason[];

export const PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES = [
  "NONE",
  "ROUND_ROBIN",
  "LOAD_BALANCING",
] as const satisfies readonly PublicPoolAutoAssignStrategy[];

export type PublicPoolAutoAssignStrategyValue =
  (typeof PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES)[number];

export const DEFAULT_PUBLIC_POOL_AUTO_ASSIGN_STRATEGY: PublicPoolAutoAssignStrategyValue = "NONE";

export const customerOwnershipModeLabels: Record<CustomerOwnershipMode, string> = {
  PRIVATE: "私有承接",
  PUBLIC: "公海中",
  LOCKED: "锁定中",
};

export const publicPoolReasonLabels: Record<PublicPoolReason, string> = {
  UNASSIGNED_IMPORT: "未分配导入",
  MANUAL_RELEASE: "手动释放",
  INACTIVE_RECYCLE: "失活回收",
  OWNER_LEFT_TEAM: "离岗回收",
  BATCH_REALLOCATION: "批量回收",
  MERGE_RELEASE: "归并释放",
  INVALID_FOLLOWUP_RECYCLE: "无效跟进回收",
};

export const ownershipEventReasonLabels: Record<CustomerOwnershipEventReason, string> = {
  UNASSIGNED_IMPORT: "导入入池",
  MANUAL_RELEASE: "手动释放",
  INACTIVE_RECYCLE: "失活回收",
  OWNER_LEFT_TEAM: "离岗回收",
  BATCH_REALLOCATION: "批量回收",
  MERGE_RELEASE: "归并释放",
  INVALID_FOLLOWUP_RECYCLE: "无效跟进回收",
  SALES_CLAIM: "销售认领",
  SUPERVISOR_ASSIGN: "主管指派",
  AUTO_ASSIGN: "自动分配",
  TEAM_TRANSFER: "团队转移",
  OWNER_RESTORE: "归属恢复",
};

export const customerPublicPoolReasonOptions = PUBLIC_POOL_REASON_VALUES.map((value) => ({
  value,
  label: publicPoolReasonLabels[value],
}));

export const customerOwnershipEventReasonOptions = CUSTOMER_OWNERSHIP_EVENT_REASON_VALUES.map(
  (value) => ({
    value,
    label: ownershipEventReasonLabels[value],
  }),
);

export function getCustomerOwnershipModeLabel(mode: CustomerOwnershipMode) {
  return customerOwnershipModeLabels[mode];
}

export type TeamPublicPoolSettingValues = {
  autoRecycleEnabled: boolean;
  ownerExitRecycleEnabled: boolean;
  autoAssignEnabled: boolean;
  autoAssignStrategy: PublicPoolAutoAssignStrategyValue;
  autoAssignBatchSize: number;
  maxActiveCustomersPerSales: number | null;
  roundRobinCursorUserId: string | null;
  defaultInactiveDays: number;
  respectClaimLock: boolean;
  strongEffectProtectionDays: number;
  mediumEffectProtectionDays: number;
  weakEffectResetsClock: boolean;
  negativeRequiresSupervisorReview: boolean;
  salesCanClaim: boolean;
  salesCanRelease: boolean;
  batchRecycleEnabled: boolean;
  batchAssignEnabled: boolean;
};

export const defaultTeamPublicPoolSettingValues: TeamPublicPoolSettingValues = {
  autoRecycleEnabled: true,
  ownerExitRecycleEnabled: true,
  autoAssignEnabled: false,
  autoAssignStrategy: DEFAULT_PUBLIC_POOL_AUTO_ASSIGN_STRATEGY,
  autoAssignBatchSize: 20,
  maxActiveCustomersPerSales: null,
  roundRobinCursorUserId: null,
  defaultInactiveDays: 14,
  respectClaimLock: true,
  strongEffectProtectionDays: 7,
  mediumEffectProtectionDays: 3,
  weakEffectResetsClock: false,
  negativeRequiresSupervisorReview: true,
  salesCanClaim: true,
  salesCanRelease: false,
  batchRecycleEnabled: true,
  batchAssignEnabled: true,
};

export const publicPoolEffectLevelLabels: Record<FollowUpEffectLevel, string> = {
  STRONG: "强有效",
  MEDIUM: "中有效",
  WEAK: "弱动作",
  NEGATIVE: "负向动作",
};

export const PUBLIC_POOL_AUTO_ASSIGN_STRATEGY_LABELS: Record<
  PublicPoolAutoAssignStrategyValue,
  string
> = {
  NONE: "不启用自动分配",
  ROUND_ROBIN: "Round robin 轮转",
  LOAD_BALANCING: "Load balancing 低负载优先",
};

export function isPublicPoolAutoAssignStrategyValue(
  value: string,
): value is PublicPoolAutoAssignStrategyValue {
  return PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES.includes(
    value as PublicPoolAutoAssignStrategyValue,
  );
}

export const publicPoolAutoAssignStrategyValues = PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES;
export const publicPoolAutoAssignStrategyLabels = PUBLIC_POOL_AUTO_ASSIGN_STRATEGY_LABELS;
export const publicPoolAutoAssignStrategyOptions = PUBLIC_POOL_AUTO_ASSIGN_STRATEGIES.map(
  (value) => ({
    value,
    label: PUBLIC_POOL_AUTO_ASSIGN_STRATEGY_LABELS[value],
  }),
);

export const customerPublicPoolSettingFieldLabels = {
  autoRecycleEnabled: "启用自动回收",
  ownerExitRecycleEnabled: "启用离职回收",
  autoAssignEnabled: "启用自动分配",
  autoAssignStrategy: "自动分配策略",
  autoAssignBatchSize: "自动分配 batch size",
  maxActiveCustomersPerSales: "单人最大承接客户",
  roundRobinCursorUserId: "Round robin 当前游标",
  defaultInactiveDays: "默认 inactivity days",
  respectClaimLock: "自动回收尊重 claim lock",
  strongEffectProtectionDays: "STRONG 保护期天数",
  mediumEffectProtectionDays: "MEDIUM 保护期天数",
  weakEffectResetsClock: "WEAK 也重置回收时钟",
  negativeRequiresSupervisorReview: "NEGATIVE 需要主管关注",
  salesCanClaim: "SALES 可认领团队公海",
  salesCanRelease: "SALES 可主动释放客户",
  batchRecycleEnabled: "允许批量回收",
  batchAssignEnabled: "允许批量指派",
} satisfies Record<keyof TeamPublicPoolSettingValues, string>;

export const customerPublicPoolRecycleConfig = {
  inactiveRecycleBatchSize: 50,
  previewSampleSize: 5,
  ignoreClaimLockForOwnerExitRecycle: true,
  excludedCustomerStatuses: ["LOST", "BLACKLISTED"] as const satisfies CustomerStatus[],
  ownerExitInvalidRoleCodes: ["OPS", "SHIPPER"] as const satisfies RoleCode[],
  protectedManualOwnerRoleCodes: ["ADMIN", "SUPERVISOR"] as const satisfies RoleCode[],
};
