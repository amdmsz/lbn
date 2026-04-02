"use client";

import type {
  AttendanceStatus,
  InvitationMethod,
  InvitationStatus,
  LiveSessionStatus,
} from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertCustomerLiveInvitationAction } from "@/app/(dashboard)/customers/[id]/engagement-actions";
import {
  initialCustomerEngagementActionState,
  type CustomerEngagementActionState,
} from "@/components/customers/customer-engagement-action-state";
import {
  CustomerEmptyState,
  CustomerRecordCard,
  CustomerTabSection,
} from "@/components/customers/customer-record-list";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  booleanChoiceOptions,
  getAttendanceStatusLabel,
  getInvitationMethodLabel,
  getInvitationStatusLabel,
  getLiveSessionStatusLabel,
  invitationMethodOptions,
} from "@/lib/live-sessions/metadata";
import { formatDateTime } from "@/lib/customers/metadata";

type LiveSessionOption = {
  id: string;
  title: string;
  hostName: string;
  startAt: Date;
  status: LiveSessionStatus;
};

type LiveInvitationItem = {
  id: string;
  invitationStatus: InvitationStatus;
  invitedAt: Date | null;
  invitationMethod: InvitationMethod;
  attendanceStatus: AttendanceStatus;
  watchDurationMinutes: number | null;
  giftQualified: boolean;
  remark: string | null;
  sales: {
    name: string;
    username: string;
  };
  liveSession: {
    id: string;
    title: string;
    hostName: string;
    startAt: Date;
    status: LiveSessionStatus;
    roomId: string | null;
    roomLink: string | null;
    targetProduct: string | null;
  };
};

function getDefaultDateTimeLocalValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CustomerLiveRecordsSection({
  customerId,
  records,
  liveSessions,
  canManage,
}: Readonly<{
  customerId: string;
  records: LiveInvitationItem[];
  liveSessions: LiveSessionOption[];
  canManage: boolean;
}>) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [createState, setCreateState] = useState<CustomerEngagementActionState>(
    initialCustomerEngagementActionState,
  );
  const [updateStates, setUpdateStates] = useState<
    Record<string, CustomerEngagementActionState>
  >({});
  const [pendingCreate, startCreateTransition] = useTransition();
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);
  const [invitedAtDefault] = useState(getDefaultDateTimeLocalValue);

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startCreateTransition(async () => {
      const nextState = await upsertCustomerLiveInvitationAction(
        initialCustomerEngagementActionState,
        formData,
      );

      setCreateState(nextState);

      if (nextState.status === "success") {
        createFormRef.current?.reset();
        router.refresh();
      }
    });
  }

  async function handleUpdateSubmit(
    event: React.FormEvent<HTMLFormElement>,
    recordId: string,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setPendingUpdateId(recordId);
    const nextState = await upsertCustomerLiveInvitationAction(
      initialCustomerEngagementActionState,
      formData,
    );
    setPendingUpdateId(null);
    setUpdateStates((current) => ({
      ...current,
      [recordId]: nextState,
    }));

    if (nextState.status === "success") {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <CustomerTabSection
        eyebrow="操作区"
        title={canManage ? "录入或更新直播邀约" : "当前为只读视图"}
        description={
          canManage
            ? "在这里选择直播场次并记录邀约、到场、观看时长和礼品达标情况。若同一客户同一场次已有记录，更新现有记录即可。"
            : "当前角色仅支持查看已有直播互动记录，不提供新增或更新入口。"
        }
        actions={
          <StatusBadge label={`可选场次 ${liveSessions.length}`} variant="info" />
        }
      >
        {canManage ? (
          <form ref={createFormRef} onSubmit={handleCreateSubmit} className="mt-1 space-y-4">
            <input type="hidden" name="customerId" value={customerId} />

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="crm-label">直播场次</span>
                <select
                  name="liveSessionId"
                  defaultValue=""
                  required
                  className="crm-select"
                >
                  <option value="" disabled>
                    请选择直播场次
                  </option>
                  {liveSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title} · {formatDateTime(session.startAt)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">是否已邀约</span>
                <select name="invited" defaultValue="true" className="crm-select">
                  {booleanChoiceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">邀约时间</span>
                <input
                  type="datetime-local"
                  name="invitedAt"
                  defaultValue={invitedAtDefault}
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">邀约方式</span>
                <select
                  name="invitationMethod"
                  defaultValue="WECHAT"
                  className="crm-select"
                >
                  {invitationMethodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">是否到场</span>
                <select name="attended" defaultValue="false" className="crm-select">
                  {booleanChoiceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="crm-label">观看时长（分钟）</span>
                <input
                  type="number"
                  name="watchDurationMinutes"
                  min={0}
                  max={24 * 60}
                  defaultValue={0}
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">是否礼品达标</span>
                <select name="giftQualified" defaultValue="false" className="crm-select">
                  {booleanChoiceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="crm-label">备注</span>
              <textarea
                name="remark"
                rows={4}
                maxLength={1000}
                placeholder="记录邀约话术、客户反馈或观看情况"
                className="crm-textarea"
              />
            </label>

            {createState.message ? (
              <ActionBanner tone={createState.status === "success" ? "success" : "danger"}>
                {createState.message}
              </ActionBanner>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pendingCreate || liveSessions.length === 0}
                className="crm-button crm-button-primary"
              >
                {pendingCreate ? "保存中..." : "保存直播记录"}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-[0.9rem] border border-black/6 bg-white/68 px-4 py-3 text-sm leading-7 text-black/58">
            当前页面保留直播记录回看能力。若需新增或更新直播邀约，请由当前承接销售或具备权限的角色操作。
          </div>
        )}
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="历史记录"
        title="直播互动历史"
        description="集中查看该客户的直播邀约、到场、观看时长和礼品达标情况。"
        actions={<StatusBadge label={`${records.length} 条记录`} variant="neutral" />}
      >
        {records.length > 0 ? (
          <div className="space-y-4">
            {records.map((record) => (
              <div key={record.id} className="space-y-3">
                <CustomerRecordCard
                  title={record.liveSession.title}
                  meta={[
                    `主播：${record.liveSession.hostName}`,
                    `开播时间：${formatDateTime(record.liveSession.startAt)}`,
                    `场次状态：${getLiveSessionStatusLabel(record.liveSession.status)}`,
                    `销售：${record.sales.name} (@${record.sales.username})`,
                    `邀约状态：${getInvitationStatusLabel(record.invitationStatus)}`,
                    `邀约方式：${getInvitationMethodLabel(record.invitationMethod)}`,
                    `到场状态：${getAttendanceStatusLabel(record.attendanceStatus)}`,
                    `观看时长：${record.watchDurationMinutes ?? 0} 分钟`,
                    `礼品达标：${record.giftQualified ? "是" : "否"}`,
                  ]}
                  description={record.remark?.trim() || "无备注"}
                />

                {canManage ? (
                  <form
                    onSubmit={(event) => handleUpdateSubmit(event, record.id)}
                    className="crm-subtle-panel"
                  >
                    <input type="hidden" name="customerId" value={customerId} />
                    <input type="hidden" name="liveSessionId" value={record.liveSession.id} />

                    <div className="grid gap-4 lg:grid-cols-3">
                      <label className="space-y-2">
                        <span className="crm-label">是否已邀约</span>
                        <select
                          name="invited"
                          defaultValue={
                            record.invitationStatus === "PENDING" ? "false" : "true"
                          }
                          className="crm-select"
                        >
                          {booleanChoiceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">邀约时间</span>
                        <input
                          type="datetime-local"
                          name="invitedAt"
                          defaultValue={
                            record.invitedAt
                              ? new Date(
                                  record.invitedAt.getTime() -
                                    record.invitedAt.getTimezoneOffset() * 60_000,
                                )
                                  .toISOString()
                                  .slice(0, 16)
                              : ""
                          }
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">邀约方式</span>
                        <select
                          name="invitationMethod"
                          defaultValue={record.invitationMethod}
                          className="crm-select"
                        >
                          {invitationMethodOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">是否到场</span>
                        <select
                          name="attended"
                          defaultValue={
                            record.attendanceStatus === "ATTENDED" ? "true" : "false"
                          }
                          className="crm-select"
                        >
                          {booleanChoiceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">观看时长（分钟）</span>
                        <input
                          type="number"
                          name="watchDurationMinutes"
                          min={0}
                          max={24 * 60}
                          defaultValue={record.watchDurationMinutes ?? 0}
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">是否礼品达标</span>
                        <select
                          name="giftQualified"
                          defaultValue={record.giftQualified ? "true" : "false"}
                          className="crm-select"
                        >
                          {booleanChoiceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="mt-4 block space-y-2">
                      <span className="crm-label">备注</span>
                      <textarea
                        name="remark"
                        rows={3}
                        maxLength={1000}
                        defaultValue={record.remark ?? ""}
                        className="crm-textarea"
                      />
                    </label>

                    {updateStates[record.id]?.message ? (
                      <ActionBanner
                        tone={updateStates[record.id]?.status === "success" ? "success" : "danger"}
                        className="mt-4"
                      >
                        {updateStates[record.id]?.message}
                      </ActionBanner>
                    ) : null}

                    <div className="mt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={pendingUpdateId === record.id}
                        className="crm-button crm-button-secondary"
                      >
                        {pendingUpdateId === record.id ? "保存中..." : "更新该场记录"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <CustomerEmptyState
            title="暂无直播记录"
            description="当前客户还没有直播邀约或观看记录。"
          />
        )}
      </CustomerTabSection>
    </div>
  );
}
