"use client";

import type { CallResult } from "@prisma/client";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import {
  CustomerDossierMeta,
  CustomerDossierNotice,
  CustomerDossierPanel,
  CustomerDossierSignalRail,
  type CustomerDossierSignalItem,
} from "@/components/customers/customer-dossier-primitives";
import { CustomerTabSection } from "@/components/customers/customer-record-list";
import { formatDurationSeconds } from "@/lib/calls/metadata";
import { formatDateTime } from "@/lib/customers/metadata";
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
  const latestRecord = records[0] ?? null;
  const totalDurationSeconds = records.reduce(
    (total, record) => total + record.durationSeconds,
    0,
  );
  const latestNextFollowUp =
    records.find((record) => record.nextFollowUpAt)?.nextFollowUpAt ?? null;
  const signals: CustomerDossierSignalItem[] = [
    {
      label: "最近通话",
      value: latestRecord ? formatDateTime(latestRecord.callTime) : "暂无记录",
      description: latestRecord ? latestRecord.resultLabel : "还没有通话记录",
    },
    {
      label: "累计时长",
      value: records.length > 0 ? formatDurationSeconds(totalDurationSeconds) : "0 秒",
      description: `${records.length} 次通话`,
    },
    {
      label: "下次跟进",
      value: latestNextFollowUp ? formatDateTime(latestNextFollowUp) : "暂无安排",
      description: latestNextFollowUp ? "已形成后续推进计划" : "尚未设置下次跟进",
    },
    {
      label: "当前推进",
      value: latestRecord ? latestRecord.resultLabel : "待首呼",
      description: latestRecord ? `由 ${latestRecord.sales.name} 记录` : "需要形成首个触达结果",
    },
  ];

  return (
    <div className="space-y-5">
      <CustomerTabSection
        eyebrow="通话画像"
        title={canCreate ? "本次通话补记" : "通话记录总览"}
        description={
          canCreate
            ? "先看当前推进，再补记本次结果。"
            : "当前角色仅支持查看已有通话记录。"
        }
      >
        <div className="space-y-4">
          <CustomerDossierSignalRail items={signals} />
          {canCreate ? (
            <CustomerDossierPanel>
              <CustomerCallRecordForm
                customerId={customerId}
                resultOptions={resultOptions}
                className="mt-0"
              />
            </CustomerDossierPanel>
          ) : (
            <CustomerDossierNotice>
              仅查看记录。新增通话请由当前承接销售处理。
            </CustomerDossierNotice>
          )}
        </div>
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="通话轨迹"
        title="通话历史"
        description="按时间回看接通、结果与后续跟进安排。"
        actions={<CustomerDossierMeta>{records.length} 条记录</CustomerDossierMeta>}
      >
        <CustomerCallRecordHistory
          records={records}
          emptyDescription="当前客户还没有通话记录。新增后会立刻显示在这里。"
        />
      </CustomerTabSection>
    </div>
  );
}
