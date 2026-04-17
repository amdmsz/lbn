import {
  buildBatchActionError,
  buildBatchActionLimit,
  buildBatchActionSummary,
  buildBatchSelection,
  createInitialBatchActionNoticeState,
  getBatchSelectionLabel,
  type BatchActionBlockedReasonSummary,
  type BatchActionError,
  type BatchActionErrorCode,
  type BatchActionLimit,
  type BatchActionLimitExceeded,
  type BatchActionNoticeState,
  type BatchActionResult,
  type BatchActionSelection,
  type BatchActionSelectionMode,
  type BatchActionSummary,
} from "@/lib/batch-actions/base-contract";

export type LeadBatchSelectionMode = BatchActionSelectionMode;
export type LeadBatchSelection = BatchActionSelection;
export type LeadBatchLimit = BatchActionLimit;
export type LeadBatchLimitExceeded = BatchActionLimitExceeded;
export type LeadBatchBlockedReasonSummary = BatchActionBlockedReasonSummary;
export type LeadBatchActionErrorCode = BatchActionErrorCode;
export type LeadBatchActionError = BatchActionError;
export type LeadBatchActionSummary = BatchActionSummary;
export type LeadBatchActionResult = BatchActionResult<LeadBatchBlockedReasonSummary>;
export type LeadBatchActionNoticeState =
  BatchActionNoticeState<LeadBatchBlockedReasonSummary>;

export {
  buildBatchActionError as buildLeadBatchActionError,
  buildBatchActionLimit as buildLeadBatchActionLimit,
  buildBatchActionSummary as buildLeadBatchActionSummary,
  buildBatchSelection as buildLeadBatchSelection,
  createInitialBatchActionNoticeState as createInitialLeadBatchActionNoticeState,
  getBatchSelectionLabel as getLeadBatchSelectionLabel,
};
