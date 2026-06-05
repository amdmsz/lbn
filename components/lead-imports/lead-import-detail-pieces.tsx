import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  formatCustomerContinuationSummary,
  formatSummaryValue,
  getOwnerOutcomeLabel,
  getRollbackActionSummary,
  getRollbackExecutionMeta,
  getRowCustomerSnapshot,
  type DuplicateReplacementSalesOption,
  type LeadImportDetailRow,
} from "@/lib/lead-imports/detail-format";
import {
  getLeadImportRowStatusLabel,
  getLeadImportRowStatusVariant,
} from "@/lib/lead-imports/metadata";

export function DuplicateReplacementControls({
  rowId,
  defaultReason,
  eligibilityReason,
  eligible,
  salesOptions,
  action,
  variant = "compact",
}: Readonly<{
  rowId: string;
  defaultReason: string;
  eligibilityReason: string;
  eligible: boolean;
  salesOptions: DuplicateReplacementSalesOption[];
  action: (formData: FormData) => Promise<void>;
  variant?: "compact" | "full";
}>) {
  const disabled = !eligible || salesOptions.length === 0;

  return (
    <form
      action={action}
      className={
        variant === "full"
          ? "mt-3 space-y-3 border-t border-[var(--color-border-soft)] pt-3"
          : "mt-2 space-y-2"
      }
    >
      <input type="hidden" name="rowId" value={rowId} />
      {variant === "full" ? (
        <textarea
          name="reason"
          required
          rows={2}
          defaultValue={defaultReason}
          className="crm-input min-h-[4.5rem] w-full resize-y text-sm"
          disabled={disabled}
        />
      ) : (
        <input type="hidden" name="reason" value={defaultReason} />
      )}

      <div
        className={
          variant === "full"
            ? "grid gap-2 md:grid-cols-3"
            : "grid min-w-[16rem] gap-2"
        }
      >
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            重新分配
          </span>
          <select
            name="targetOwnerId"
            required
            disabled={disabled}
            className="crm-select min-h-[2.25rem] text-xs"
            defaultValue=""
          >
            <option value="">选择业务员</option>
            {salesOptions.map((sales) => (
              <option key={sales.id} value={sales.id}>
                {sales.label} / {sales.teamLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            历史处理
          </span>
          <select
            name="historyPolicy"
            disabled={disabled}
            className="crm-select min-h-[2.25rem] text-xs"
            defaultValue="ARCHIVE"
          >
            <option value="ARCHIVE">保留历史快照</option>
            <option value="DISCARD">不保留历史</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            历史可见
          </span>
          <select
            name="historyVisibility"
            disabled={disabled}
            className="crm-select min-h-[2.25rem] text-xs"
            defaultValue="SUPERVISOR_ONLY"
          >
            <option value="SUPERVISOR_ONLY">仅主管以上</option>
            <option value="ALL_ROLES">新负责人可见</option>
          </select>
        </label>
      </div>

      {salesOptions.length === 0 ? (
        <p className="text-xs leading-5 text-[var(--color-warning)]">
          当前没有可分配的业务员，请先检查团队与账号状态。
        </p>
      ) : null}
      {!eligible ? (
        <p className="text-xs leading-5 text-[var(--color-warning)]">
          {eligibilityReason}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="submit"
          disabled={disabled}
          className={
            variant === "full"
              ? "crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
              : "crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-55"
          }
          title={eligible ? "剔除老客户并创建已分配的新线索" : "当前重复客户不满足未加微信/未成交条件或存在业务阻断"}
        >
          作为新线索并分配
        </button>
      </div>
    </form>
  );
}

export function CustomerContinuationRowsTable({
  rows,
}: Readonly<{
  rows: LeadImportDetailRow[];
}>) {
  return (
    <div className="crm-table-shell">
      <table className="crm-table">
        <thead>
          <tr>
            <th>撤销预检</th>
            <th>执行结果</th>
            <th>行号</th>
            <th>导入状态</th>
            <th>客户</th>
            <th>负责人结果</th>
            <th>标签结果</th>
            <th>迁移摘要</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const continuation = row.customerContinuation;
            const customer = getRowCustomerSnapshot(row);
            const rollbackAction = getRollbackActionSummary(row);
            const executionMeta = row.rollback.execution
              ? getRollbackExecutionMeta(row.rollback.execution.outcome)
              : null;

            return (
              <tr key={row.id}>
                <td>
                  {row.rollback.preview ? (
                    <div className="space-y-1.5">
                      <StatusBadge
                        label={row.rollback.preview.stateLabel}
                        variant={row.rollback.preview.stateVariant}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {row.rollback.preview.reason}
                      </p>
                      {rollbackAction ? (
                        <p className="text-xs leading-5 text-muted-foreground/70">{rollbackAction}</p>
                      ) : null}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {row.rollback.execution && executionMeta ? (
                    <div className="space-y-1.5">
                      <StatusBadge
                        label={executionMeta.label}
                        variant={executionMeta.variant}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {row.rollback.execution.note}
                      </p>
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{row.rowNumber}</td>
                <td>
                  <StatusBadge
                    label={getLeadImportRowStatusLabel(row.status)}
                    variant={getLeadImportRowStatusVariant(row.status)}
                  />
                </td>
                <td>
                  <div className="space-y-1">
                    {customer.href ? (
                      <Link href={customer.href} className="crm-text-link">
                        {customer.name}
                      </Link>
                    ) : (
                      <p>{customer.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground/70">{customer.phone}</p>
                    {customer.helper ? (
                      <p className="text-xs text-[var(--color-warning)]">{customer.helper}</p>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="space-y-1 text-sm text-foreground/85">
                    <p>{getOwnerOutcomeLabel(continuation?.result.ownerOutcome ?? "-")}</p>
                    <p className="text-xs text-muted-foreground/70">
                      {formatSummaryValue(continuation?.mappedCustomer.ownerUsername)}
                    </p>
                  </div>
                </td>
                <td>
                  <div className="space-y-1 text-sm text-foreground/85">
                    <p>{continuation?.mappedCustomer.tags.join(" / ") || "无标签"}</p>
                    <p className="text-xs text-[var(--color-warning)]">
                      {continuation?.mappedCustomer.unresolvedTags.join(" / ") || "无 warning"}
                    </p>
                  </div>
                </td>
                <td className="max-w-[26rem]">
                  {continuation
                    ? formatCustomerContinuationSummary(continuation.mappedCustomer.summary) ||
                      "-"
                    : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
