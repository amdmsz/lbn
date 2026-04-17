import { ActionBanner } from "@/components/shared/action-banner";
import type {
  BatchActionBlockedReasonSummary,
  BatchActionNoticeState,
  BatchActionSummary,
} from "@/lib/batch-actions/base-contract";

function shouldRenderBatchSummary(summary: BatchActionSummary) {
  return (
    summary.totalCount > 0 &&
    (summary.successCount > 0 ||
      summary.skippedCount > 0 ||
      summary.blockedCount > 0)
  );
}

function buildBatchSummaryText(
  summary: BatchActionSummary,
  input: {
    successLabel: string;
    skippedLabel: string;
    countUnitLabel: string;
  },
) {
  return `${input.successLabel} ${summary.successCount}${input.countUnitLabel}，${input.skippedLabel} ${summary.skippedCount}${input.countUnitLabel}，被阻断 ${summary.blockedCount}${input.countUnitLabel}。`;
}

function buildBlockedReasonSummaryText(
  blockedReasonSummary: BatchActionBlockedReasonSummary[],
  countUnitLabel: string,
) {
  return blockedReasonSummary
    .map((item) => `${item.label} ${item.count}${countUnitLabel}`)
    .join("；");
}

function buildBatchSelectionText(selectionLabel: string, count: number, entityCountLabel: string) {
  return `本次范围：${selectionLabel} ${count}${entityCountLabel}。`;
}

function buildBatchLimitText(input: {
  selectionLabel: string;
  actualCount: number;
  maxCount: number;
  entityCountLabel: string;
  countUnitLabel: string;
}) {
  return `${input.selectionLabel}共 ${input.actualCount}${input.entityCountLabel}，超过单次 ${input.maxCount}${input.countUnitLabel} 上限，请先缩小筛选范围后再执行。`;
}

export function BatchActionNoticeBanner<
  TBlockedReason extends BatchActionBlockedReasonSummary = BatchActionBlockedReasonSummary,
>({
  state,
  successLabel,
  entityCountLabel,
  countUnitLabel,
  className,
}: Readonly<{
  state: BatchActionNoticeState<TBlockedReason>;
  successLabel: string;
  entityCountLabel: string;
  countUnitLabel: string;
  className?: string;
}>) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <ActionBanner
      tone={state.status === "success" ? "success" : "danger"}
      className={className}
    >
      <div className="space-y-1.5">
        <p>{state.message}</p>
        {state.selection ? (
          <p>
            {buildBatchSelectionText(
              state.selection.label,
              state.selection.count,
              entityCountLabel,
            )}
          </p>
        ) : null}
        {state.limitExceeded ? (
          <p>
            {buildBatchLimitText({
              selectionLabel: state.selection?.label ?? "当前筛选结果",
              actualCount: state.limitExceeded.actualCount,
              maxCount: state.limitExceeded.maxCount,
              entityCountLabel,
              countUnitLabel,
            })}
          </p>
        ) : null}
        {shouldRenderBatchSummary(state.summary) ? (
          <p>
            {buildBatchSummaryText(state.summary, {
              successLabel,
              skippedLabel: state.skippedLabel,
              countUnitLabel,
            })}
          </p>
        ) : null}
        {state.blockedReasonSummary.length > 0 ? (
          <p>
            阻断原因：
            {buildBlockedReasonSummaryText(state.blockedReasonSummary, countUnitLabel)}
          </p>
        ) : null}
      </div>
    </ActionBanner>
  );
}
