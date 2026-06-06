import {
  CustomerEmptyState,
  CustomerTabSection,
  formatOwnerLabel,
} from "@/components/customers/customer-record-list";
import {
  CustomerDossierLedgerRow,
  QuietSectionMeta,
} from "@/components/customers/customer-dossier-primitives";
import { formatDateTime } from "@/lib/customers/metadata";
import type { getCustomerDetailLogsData } from "@/lib/customers/queries";

export type CustomerLogsData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailLogsData>>
>;

export function CustomerLogsTab({
  data,
}: Readonly<{
  data: CustomerLogsData;
}>) {
  return (
    <CustomerTabSection
      eyebrow="审计记录"
      title="经营审计时间线"
      description="保留客户从接入到成交的关键业务动作。"
      actions={<QuietSectionMeta>最近 {data.length} 条</QuietSectionMeta>}
    >
      {data.length > 0 ? (
        <div className="space-y-2.5">
          {data.map((record) => (
            <CustomerDossierLedgerRow
              key={record.id}
              title={`${record.module} / ${record.action}`}
              subtitle={record.description?.trim() || "暂无说明"}
              meta={[`操作人 ${formatOwnerLabel(record.actor)}`]}
              statusItems={[
                {
                  label: "模块",
                  value: record.module,
                  tone: "neutral",
                },
                {
                  label: "动作",
                  value: record.action,
                  tone: "info",
                },
              ]}
              aside={formatDateTime(record.createdAt)}
            />
          ))}
        </div>
      ) : (
        <CustomerEmptyState
          title="暂无操作日志"
          description="暂无日志记录。"
        />
      )}
    </CustomerTabSection>
  );
}
