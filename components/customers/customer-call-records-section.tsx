"use client";

import type { CallResult } from "@prisma/client";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import { CustomerTabSection } from "@/components/customers/customer-record-list";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CallResultOption } from "@/lib/calls/metadata";

type CallRecordItem = {
  id: string;
  callTime: Date;
  durationSeconds: number;
  result: CallResult | null;
  resultCode: string | null;
  resultLabel: string;
  remark: string | null;
  nextFollowUpAt: Date | null;
  sales: {
    name: string;
    username: string;
  };
};

export function CustomerCallRecordsSection({
  customerId,
  records,
  resultOptions,
  canCreate,
}: Readonly<{
  customerId: string;
  records: CallRecordItem[];
  resultOptions: CallResultOption[];
  canCreate: boolean;
}>) {
  return (
    <div className="space-y-6">
      <CustomerTabSection
        eyebrow="操作区"
        title={canCreate ? "录入本次通话" : "当前为只读视图"}
        description={
          canCreate
            ? "在这里补充本次通话结果、备注和下次跟进时间。保存后会进入历史记录，并按通话结果配置决定是否联动微信记录。"
            : "当前角色仅支持查看已有通话记录，不提供新增入口。"
        }
      >
        {canCreate ? (
          <CustomerCallRecordForm
            customerId={customerId}
            resultOptions={resultOptions}
            className="mt-1"
          />
        ) : (
          <div className="rounded-[0.9rem] border border-black/6 bg-white/68 px-4 py-3 text-sm leading-7 text-black/58">
            当前页面保留通话记录回看能力。若需新增通话，请由当前承接销售或具备权限的角色操作。
          </div>
        )}
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="历史记录"
        title="通话历史"
        description="集中查看该客户的历史通话、通话结果和下次跟进安排。"
        actions={<StatusBadge label={`${records.length} 条记录`} variant="neutral" />}
      >
        <CustomerCallRecordHistory
          records={records}
          emptyDescription="当前客户还没有通话记录。新增后会立刻显示在这里。"
        />
      </CustomerTabSection>
    </div>
  );
}
