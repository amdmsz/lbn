"use client";

import type { WechatAddStatus } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerWechatRecordAction } from "@/app/(dashboard)/customers/[id]/engagement-actions";
import {
  CustomerEmptyState,
  CustomerRecordCard,
  CustomerTabSection,
} from "@/components/customers/customer-record-list";
import {
  initialCustomerEngagementActionState,
  type CustomerEngagementActionState,
} from "@/components/customers/customer-engagement-action-state";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
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
    <div className="space-y-6">
      <CustomerTabSection
        eyebrow="操作区"
        title={canCreate ? "录入微信跟进" : "当前为只读视图"}
        description={
          canCreate
            ? "在这里补充加微状态、微信信息、标签和下一次跟进计划。保存后会进入历史记录，并同步写入客户操作日志。"
            : "当前角色仅支持查看已有微信记录，不提供新增入口。"
        }
      >
        {canCreate ? (
          <form ref={formRef} onSubmit={handleSubmit} className="mt-1 space-y-4">
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
        ) : (
          <div className="rounded-[0.9rem] border border-black/6 bg-white/68 px-4 py-3 text-sm leading-7 text-black/58">
            当前页面保留微信记录回看能力。若需补录微信状态，请由当前承接销售或具备权限的角色操作。
          </div>
        )}
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="历史记录"
        title="微信跟进历史"
        description="集中查看该客户的加微状态、微信信息和后续跟进安排。"
        actions={<StatusBadge label={`${records.length} 条记录`} variant="neutral" />}
      >
        {records.length > 0 ? (
          <div className="space-y-3">
            {records.map((record) => (
              <CustomerRecordCard
                key={record.id}
                title={`${getWechatAddedStatusLabel(record.addedStatus)} · ${
                  record.wechatNickname || record.wechatAccount || "未命名微信"
                }`}
                meta={[
                  `销售：${record.sales.name} (@${record.sales.username})`,
                  `加微时间：${record.addedAt ? formatDateTime(record.addedAt) : "暂无"}`,
                  `微信账号：${record.wechatAccount || "未填写"}`,
                  `微信备注名：${record.wechatRemarkName || "未填写"}`,
                  `标签：${formatWechatTags(record.tags)}`,
                  `下次跟进：${record.nextFollowUpAt ? formatDateTime(record.nextFollowUpAt) : "暂无"}`,
                ]}
                description={record.summary?.trim() || "无总结"}
              />
            ))}
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
