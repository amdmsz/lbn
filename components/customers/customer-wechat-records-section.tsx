"use client";

import type { WechatAddStatus } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerWechatRecordAction } from "@/app/(dashboard)/customers/[id]/engagement-actions";
import {
  CustomerDossierMeta,
  CustomerDossierNotice,
  CustomerDossierPanel,
  CustomerDossierLedgerRow,
  CustomerDossierSignalRail,
  type CustomerDossierStatusItem,
  type CustomerDossierStatusTone,
  type CustomerDossierSignalItem,
} from "@/components/customers/customer-dossier-primitives";
import {
  CustomerEmptyState,
  CustomerTabSection,
} from "@/components/customers/customer-record-list";
import {
  initialCustomerEngagementActionState,
  type CustomerEngagementActionState,
} from "@/components/customers/customer-engagement-action-state";
import { ActionBanner } from "@/components/shared/action-banner";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  formatWechatTags,
  getWechatAddedStatusLabel,
  wechatAddedStatusOptions,
} from "@/lib/wechat/metadata";

type WechatRecordItem = {
  id: string;
  addedStatus: WechatAddStatus;
  addedAt: Date | null;
  wechatAccount: string | null;
  wechatNickname: string | null;
  wechatRemarkName: string | null;
  tags: unknown;
  summary: string | null;
  nextFollowUpAt: Date | null;
  sales: {
    name: string;
    username: string;
  };
};

function getDefaultDateTimeLocalValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getWechatStatusTone(status: WechatAddStatus): CustomerDossierStatusTone {
  switch (status) {
    case "ADDED":
      return "success";
    case "REJECTED":
    case "BLOCKED":
      return "danger";
    case "PENDING":
      return "warning";
    default:
      return "neutral";
  }
}

function getWechatPrimaryName(record: WechatRecordItem) {
  return (
    record.wechatNickname ||
    record.wechatRemarkName ||
    record.wechatAccount ||
    "未命名微信"
  );
}

export function CustomerWechatRecordsSection({
  customerId,
  records,
  canCreate,
}: Readonly<{
  customerId: string;
  records: WechatRecordItem[];
  canCreate: boolean;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<CustomerEngagementActionState>(
    initialCustomerEngagementActionState,
  );
  const [pending, startTransition] = useTransition();
  const [addedAtDefault] = useState(getDefaultDateTimeLocalValue);
  const latestRecord = records[0] ?? null;
  const addedCount = records.filter((record) => record.addedStatus === "ADDED").length;
  const latestTaggedRecord = records.find(
    (record) => formatWechatTags(record.tags) !== "无标签",
  );
  const signals: CustomerDossierSignalItem[] = [
    {
      label: "最近状态",
      value: latestRecord ? getWechatAddedStatusLabel(latestRecord.addedStatus) : "暂无记录",
      description: latestRecord?.addedAt ? formatDateTime(latestRecord.addedAt) : "尚未形成微信记录",
    },
    {
      label: "已加微",
      value: `${addedCount} 条`,
      description: `${records.length} 条微信经营记录`,
    },
    {
      label: "最近账号",
      value:
        latestRecord?.wechatNickname ||
        latestRecord?.wechatAccount ||
        latestRecord?.wechatRemarkName ||
        "暂无沉淀",
      description: latestRecord?.wechatAccount || "等待沉淀账号信息",
    },
    {
      label: "标签沉淀",
      value: latestTaggedRecord ? formatWechatTags(latestTaggedRecord.tags) : "暂无标签",
      description: latestRecord?.nextFollowUpAt
        ? `下次跟进 ${formatDateTime(latestRecord.nextFollowUpAt)}`
        : "暂无下次跟进",
    },
  ];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await createCustomerWechatRecordAction(
        initialCustomerEngagementActionState,
        formData,
      );

      setState(nextState);

      if (nextState.status === "success") {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <CustomerTabSection
        eyebrow="微信画像"
        title={canCreate ? "本次微信沉淀" : "微信经营总览"}
        description={
          canCreate
            ? "先看当前沉淀，再补记状态与账号。"
            : "当前角色仅支持查看已有微信记录。"
        }
      >
        <div className="space-y-4">
          <CustomerDossierSignalRail items={signals} />
          {canCreate ? (
            <CustomerDossierPanel>
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                <input type="hidden" name="customerId" value={customerId} />

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">加微状态</span>
                    <select
                      name="addedStatus"
                      defaultValue=""
                      required
                      className="crm-select"
                    >
                      <option value="" disabled>
                        请选择加微状态
                      </option>
                      {wechatAddedStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">加微时间</span>
                    <input
                      type="datetime-local"
                      name="addedAt"
                      defaultValue={addedAtDefault}
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">微信账号</span>
                    <input
                      name="wechatAccount"
                      maxLength={100}
                      className="crm-input"
                      placeholder="例如 wxid_xxx"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">微信昵称</span>
                    <input name="wechatNickname" maxLength={100} className="crm-input" />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">微信备注名</span>
                    <input name="wechatRemarkName" maxLength={100} className="crm-input" />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">标签</span>
                    <input
                      name="tags"
                      maxLength={300}
                      placeholder="用英文逗号分隔，例如 高意向, 婚宴, 企业团购"
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2 lg:col-span-2">
                    <span className="crm-label">下次跟进时间</span>
                    <input type="datetime-local" name="nextFollowUpAt" className="crm-input" />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="crm-label">跟进总结</span>
                  <textarea
                    name="summary"
                    rows={4}
                    maxLength={1000}
                    placeholder="记录客户微信沟通情况、已发送资料和下一步计划"
                    className="crm-textarea"
                  />
                </label>

                {state.message ? (
                  <ActionBanner tone={state.status === "success" ? "success" : "danger"}>
                    {state.message}
                  </ActionBanner>
                ) : null}

                <div className="flex justify-end">
                  <button type="submit" disabled={pending} className="crm-button crm-button-primary">
                    {pending ? "保存中..." : "保存微信记录"}
                  </button>
                </div>
              </form>
            </CustomerDossierPanel>
          ) : (
            <CustomerDossierNotice>
              仅查看记录。补录微信状态请由当前承接销售处理。
            </CustomerDossierNotice>
          )}
        </div>
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="微信轨迹"
        title="微信跟进历史"
        description="按账号、加微状态、标签和下一步安排快速回看。"
        actions={<CustomerDossierMeta>{records.length} 条记录</CustomerDossierMeta>}
      >
        {records.length > 0 ? (
          <div className="space-y-2.5">
            {records.map((record) => {
              const tagSummary = formatWechatTags(record.tags);
              const statusItems: CustomerDossierStatusItem[] = [
                {
                  label: "状态",
                  value: getWechatAddedStatusLabel(record.addedStatus),
                  tone: getWechatStatusTone(record.addedStatus),
                },
                {
                  label: "账号",
                  value: record.wechatAccount || "未填写",
                  tone: record.wechatAccount ? "info" : "neutral",
                },
                {
                  label: "标签",
                  value: tagSummary,
                  tone: tagSummary !== "无标签" ? "info" : "neutral",
                },
                {
                  label: "下次跟进",
                  value: record.nextFollowUpAt
                    ? formatDateTime(record.nextFollowUpAt)
                    : "暂无",
                  tone: record.nextFollowUpAt ? "warning" : "neutral",
                },
              ];

              return (
                <CustomerDossierLedgerRow
                  key={record.id}
                  title={`${getWechatAddedStatusLabel(record.addedStatus)} · ${getWechatPrimaryName(record)}`}
                  subtitle={record.summary?.trim() || "无总结"}
                  meta={[
                    `销售 ${record.sales.name} (@${record.sales.username})`,
                    `加微时间 ${record.addedAt ? formatDateTime(record.addedAt) : "暂无"}`,
                    `备注名 ${record.wechatRemarkName || "未填写"}`,
                  ]}
                  statusItems={statusItems}
                  aside={record.wechatAccount || record.wechatRemarkName || "未填写账号"}
                />
              );
            })}
          </div>
        ) : (
          <CustomerEmptyState
            title="暂无微信记录"
            description="当前客户还没有微信跟进记录。新增后会显示在这里。"
          />
        )}
      </CustomerTabSection>
    </div>
  );
}
