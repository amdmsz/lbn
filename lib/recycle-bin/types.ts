import type {
  OperationModule,
  OperationTargetType,
  RecycleDeleteReasonCode,
  RecycleDomain,
  RecycleTargetType,
  RoleCode,
} from "@prisma/client";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";

export type RecycleReasonInputCode =
  | "mistaken_creation"
  | "test_data"
  | "duplicate"
  | "no_longer_needed"
  | "other";

export type RecycleLifecycleActor = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

export type RecycleGuardBlocker = {
  code?: string;
  group?: string;
  suggestedAction?: string;
  name: string;
  count: number;
  blocksMoveToRecycleBin: boolean;
  blocksPermanentDelete: boolean;
  description: string;
};

export type RecycleMoveGuard = {
  canMoveToRecycleBin: boolean;
  fallbackAction?: string;
  fallbackActionLabel: string;
  blockerSummary: string;
  blockers: RecycleGuardBlocker[];
  futureRestoreBlockers: string[];
};

export type RecycleTargetSnapshot = {
  targetType: RecycleTargetType;
  targetId: string;
  domain: RecycleDomain;
  titleSnapshot: string;
  secondarySnapshot: string | null;
  originalStatusSnapshot: string | null;
  restoreRouteSnapshot: string;
  operationModule: OperationModule;
  operationTargetType: OperationTargetType;
  operationAction: string;
  operationDescription: string;
  guard: RecycleMoveGuard;
  blockerSnapshotJson: unknown;
};

export type MoveToRecycleBinInput = {
  targetType: RecycleTargetType;
  targetId: string;
  reasonCode: RecycleReasonInputCode;
  reasonText?: string;
};

export type RecycleRestoreBlocker = {
  code?: string;
  group?: string;
  suggestedAction?: string;
  name: string;
  description: string;
};

export type RecycleRestoreGuard = {
  canRestore: boolean;
  blockerSummary: string;
  blockers: RecycleRestoreBlocker[];
  restoreRouteSnapshot: string;
};

export type MoveToRecycleBinResult =
  | {
      status: "created";
      message: string;
      entryId: string;
      guard: RecycleMoveGuard;
    }
  | {
      status: "already_in_recycle_bin";
      message: string;
      entryId: string;
      guard: RecycleMoveGuard;
    }
  | {
      status: "blocked";
      message: string;
      guard: RecycleMoveGuard;
    };

export type RestoreFromRecycleBinInput = {
  entryId: string;
};

export type RestoreFromRecycleBinResult =
  | {
      status: "restored";
      message: string;
      entryId: string;
      targetType: RecycleTargetType;
      targetId: string;
      restoreRouteSnapshot: string;
      guard: RecycleRestoreGuard;
    }
  | {
      status: "blocked";
      message: string;
      entryId: string;
      targetType: RecycleTargetType;
      targetId: string;
      restoreRouteSnapshot: string;
      guard: RecycleRestoreGuard;
    };

export type RecyclePurgeBlocker = {
  code?: string;
  group?: string;
  suggestedAction?: string;
  name: string;
  description: string;
};

export type RecyclePurgeGuard = {
  canPurge: boolean;
  blockerSummary: string;
  blockers: RecyclePurgeBlocker[];
};

export type PurgeFromRecycleBinInput = {
  entryId: string;
};

export type PurgeFromRecycleBinResult =
  | {
      status: "purged";
      message: string;
      entryId: string;
      targetType: RecycleTargetType;
      targetId: string;
      guard: RecyclePurgeGuard;
    }
  | {
      status: "blocked";
      message: string;
      entryId: string;
      targetType: RecycleTargetType;
      targetId: string;
      guard: RecyclePurgeGuard;
    };

export const RECYCLE_REASON_CODE_MAP: Record<
  RecycleReasonInputCode,
  RecycleDeleteReasonCode
> = {
  mistaken_creation: "MISTAKEN_CREATION",
  test_data: "TEST_DATA",
  duplicate: "DUPLICATE",
  no_longer_needed: "NO_LONGER_NEEDED",
  other: "OTHER",
};
