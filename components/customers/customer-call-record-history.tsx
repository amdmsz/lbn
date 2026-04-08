import type { CallResult } from "@prisma/client";
import {
  CustomerEmptyState,
  CustomerRecordCard,
  formatOptionalDate,
} from "@/components/customers/customer-record-list";
import { formatDurationSeconds } from "@/lib/calls/metadata";
import { formatDateTime } from "@/lib/customers/metadata";

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
}: Readonly<{
  records: CallRecordHistoryItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}>) {
  if (records.length === 0) {
    return <CustomerEmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <CustomerRecordCard
          key={record.id}
          title={`${record.resultLabel} · ${formatDateTime(normalizeDate(record.callTime))}`}
          meta={[
            `销售：${record.sales.name} (@${record.sales.username})`,
            `通话时长：${formatDurationSeconds(record.durationSeconds)}`,
            `下次跟进：${formatOptionalDate(normalizeOptionalDate(record.nextFollowUpAt))}`,
            `结果 code：${record.resultCode ?? record.result ?? "未记录"}`,
          ]}
          description={record.remark?.trim() || "无备注"}
        />
      ))}
    </div>
  );
}
