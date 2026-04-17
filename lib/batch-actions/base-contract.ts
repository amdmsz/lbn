export type BatchActionSelectionMode = "manual" | "filtered";

export type BatchActionSelection = {
  mode: BatchActionSelectionMode;
  label: string;
  count: number;
};

export type BatchActionLimit = {
  maxCount: number;
};

export type BatchActionLimitExceeded = {
  maxCount: number;
  actualCount: number;
};

export type BatchActionBlockedReasonSummary = {
  code: string;
  label: string;
  count: number;
  description?: string;
  group?: string;
  suggestedAction?: string;
};

export type BatchActionErrorCode =
  | "validation_error"
  | "forbidden"
  | "empty_selection"
  | "filtered_empty"
  | "stale_selection"
  | "limit_exceeded"
  | "invalid_view"
  | "unknown";

export type BatchActionError = {
  code: BatchActionErrorCode;
  message: string;
};

export type BatchActionSummary = {
  totalCount: number;
  successCount: number;
  skippedCount: number;
  blockedCount: number;
};

export type BatchActionResult<
  TBlockedReason extends BatchActionBlockedReasonSummary = BatchActionBlockedReasonSummary,
> = {
  status: "success" | "error";
  message: string;
  error: BatchActionError | null;
  selection: BatchActionSelection | null;
  limit: BatchActionLimit | null;
  limitExceeded: BatchActionLimitExceeded | null;
  summary: BatchActionSummary;
  skippedLabel: string;
  blockedReasonSummary: TBlockedReason[];
};

export type BatchActionNoticeState<
  TBlockedReason extends BatchActionBlockedReasonSummary = BatchActionBlockedReasonSummary,
> =
  | {
      status: "idle";
      message: string;
      error: null;
      selection: null;
      limit: null;
      limitExceeded: null;
      summary: BatchActionSummary;
      skippedLabel: string;
      blockedReasonSummary: [];
    }
  | BatchActionResult<TBlockedReason>;

export function getBatchSelectionLabel(mode: BatchActionSelectionMode) {
  return mode === "filtered" ? "当前筛选结果" : "当前页手选";
}

export function buildBatchSelection(
  mode: BatchActionSelectionMode,
  count: number,
): BatchActionSelection {
  return {
    mode,
    label: getBatchSelectionLabel(mode),
    count,
  };
}

export function buildBatchActionLimit(maxCount: number): BatchActionLimit {
  return {
    maxCount,
  };
}

export function buildBatchActionSummary(
  input: Partial<BatchActionSummary> = {},
): BatchActionSummary {
  return {
    totalCount: input.totalCount ?? 0,
    successCount: input.successCount ?? 0,
    skippedCount: input.skippedCount ?? 0,
    blockedCount: input.blockedCount ?? 0,
  };
}

export function buildBatchActionError(
  code: BatchActionErrorCode,
  message: string,
): BatchActionError {
  return {
    code,
    message,
  };
}

export function createInitialBatchActionNoticeState(
  skippedLabel: string,
): BatchActionNoticeState {
  return {
    status: "idle",
    message: "",
    error: null,
    selection: null,
    limit: null,
    limitExceeded: null,
    summary: buildBatchActionSummary(),
    skippedLabel,
    blockedReasonSummary: [],
  };
}
