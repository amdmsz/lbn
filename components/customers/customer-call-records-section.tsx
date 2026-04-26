"use client";

import type { CallResult } from "@prisma/client";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import { CustomerMobileDialButton } from "@/components/customers/mobile-call-followup-sheet";
import type { CallTranscriptSegment } from "@/lib/calls/call-ai-diarization";
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
  recording: {
    id: string;
    status: string;
    mimeType: string;
    fileSizeBytes: number | null;
    durationSeconds: number | null;
    uploadedAt: Date | null;
    aiAnalysis: {
      status: string;
      summary: string | null;
      qualityScore: number | null;
      riskFlagsJson: unknown;
      opportunityTagsJson: unknown;
      nextActionSuggestion: string | null;
      transcriptText?: string | null;
      transcriptJson?: unknown;
      transcriptSegments?: CallTranscriptSegment[];
    } | null;
  } | null;
  sales: {
    name: string;
    username: string;
  };
};

export function CustomerCallRecordsSection({
  customerId,
  customerName,
  phone,
  records,
  resultOptions,
  canCreate,
}: Readonly<{
  customerId: string;
  customerName: string;
  phone: string;
  records: CallRecordItem[];
  resultOptions: CallResultOption[];
  canCreate: boolean;
}>) {
  const normalizedPhone = phone.trim();
  const canDialOnMobile =
    canCreate && normalizedPhone.length > 0 && normalizedPhone !== "暂无电话";
  const latestRecord = records[0] ?? null;
  const totalDurationSeconds = records.reduce(
    (total, record) => total + record.durationSeconds,
    0,
  );
  const latestNextFollowUp =
    records.find((record) => record.nextFollowUpAt)?.nextFollowUpAt ?? null;
  const recordingCount = records.filter((record) => record.recording).length;
  const aiReadyCount = records.filter(
    (record) => record.recording?.aiAnalysis?.status === "READY",
  ).length;
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
      label: "录音归档",
      value: recordingCount > 0 ? `${recordingCount} 条录音` : "暂无录音",
      description:
        aiReadyCount > 0
          ? `${aiReadyCount} 条已完成 AI 分析`
          : latestRecord
            ? `最近由 ${latestRecord.sales.name} 记录`
            : "需要形成首个触达结果",
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
            <CustomerDossierPanel className="space-y-4">
              {canDialOnMobile ? (
                <div className="flex flex-col gap-3 rounded-[0.95rem] border border-[rgba(79,125,247,0.16)] bg-[var(--color-shell-surface)] px-3.5 py-3 md:hidden">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--foreground)]">
                      手机外呼
                    </p>
                    <p className="mt-1 truncate text-[12px] tabular-nums text-[var(--color-sidebar-muted)]">
                      {normalizedPhone}
                    </p>
                  </div>
                  <CustomerMobileDialButton
                    customerId={customerId}
                    customerName={customerName}
                    phone={normalizedPhone}
                    triggerSource="detail"
                    label="拨打并录音"
                    className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[rgba(79,125,247,0.22)] bg-[var(--foreground)] px-4 text-[13px] font-semibold text-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[rgba(79,125,247,0.34)] hover:bg-[var(--foreground)]/92"
                  />
                </div>
              ) : null}
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
