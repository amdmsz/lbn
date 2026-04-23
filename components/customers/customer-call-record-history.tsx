import type { CallResult } from "@prisma/client";
import {
  CustomerEmptyState,
  formatOptionalDate,
} from "@/components/customers/customer-record-list";
import { CustomerDossierRecordCard } from "@/components/customers/customer-dossier-primitives";
import { formatDurationSeconds } from "@/lib/calls/metadata";
import { formatDateTime } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

type CallRecordHistoryItem = {
  id: string;
  callTime: Date | string;
  durationSeconds: number;
  result: CallResult | null;
  resultCode: string | null;
  resultLabel: string;
  remark: string | null;
  nextFollowUpAt: Date | string | null;
  sales: {
    name: string;
    username: string;
  };
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeOptionalDate(value: Date | string | null) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

export function CustomerCallRecordHistory({
  records,
  emptyTitle = "暂无通话记录",
  emptyDescription = "当前客户还没有通话记录。",
  className,
  cardClassName,
  emptyClassName,
}: Readonly<{
  records: CallRecordHistoryItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  cardClassName?: string;
  emptyClassName?: string;
}>) {
  if (records.length === 0) {
    return (
      <CustomerEmptyState
        title={emptyTitle}
        description={emptyDescription}
        className={emptyClassName}
      />
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {records.map((record) => {
        const nextFollowUpAt = normalizeOptionalDate(record.nextFollowUpAt);
        const meta = [
          `销售 ${record.sales.name} (@${record.sales.username})`,
          `通话时长 ${formatDurationSeconds(record.durationSeconds)}`,
        ];

        if (nextFollowUpAt) {
          meta.push(`计划跟进 ${formatOptionalDate(nextFollowUpAt)}`);
        }

        return (
          <CustomerDossierRecordCard
            key={record.id}
            title={record.resultLabel}
            meta={meta}
            summary={record.remark?.trim() || "无备注"}
            aside={formatDateTime(normalizeDate(record.callTime))}
            className={cardClassName}
          />
        );
      })}
    </div>
  );
}
