import {
  buildBatchActionError,
  buildBatchActionLimit,
  buildBatchActionSummary,
  buildBatchSelection,
  createInitialBatchActionNoticeState,
  getBatchSelectionLabel,
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
import type { CustomerRecycleBlockedReasonSummary } from "@/lib/customers/recycle-blocker-explanation";

export type CustomerBatchSelectionMode = BatchActionSelectionMode;
export type CustomerBatchSelection = BatchActionSelection;
export type CustomerBatchLimit = BatchActionLimit;
export type CustomerBatchLimitExceeded = BatchActionLimitExceeded;
export type CustomerBatchBlockedReasonSummary = CustomerRecycleBlockedReasonSummary;
export type CustomerBatchActionErrorCode = BatchActionErrorCode;
export type CustomerBatchActionError = BatchActionError;
export type CustomerBatchActionSummary = BatchActionSummary;
export type CustomerBatchActionResult =
  BatchActionResult<CustomerBatchBlockedReasonSummary>;
export type CustomerBatchActionNoticeState =
  BatchActionNoticeState<CustomerBatchBlockedReasonSummary>;

export function createInitialCustomerBatchActionNoticeState(
  skippedLabel: string,
): CustomerBatchActionNoticeState {
  return createInitialBatchActionNoticeState(
    skippedLabel,
  ) as CustomerBatchActionNoticeState;
}

export {
  buildBatchActionError as buildCustomerBatchActionError,
  buildBatchActionLimit as buildCustomerBatchActionLimit,
  buildBatchActionSummary as buildCustomerBatchActionSummary,
  buildBatchSelection as buildCustomerBatchSelection,
  getBatchSelectionLabel as getCustomerBatchSelectionLabel,
};
