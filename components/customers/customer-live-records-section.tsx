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
  CustomerDossierLedgerRow,
  CustomerDossierMeta,
  CustomerDossierNotice,
  CustomerDossierPanel,
  CustomerDossierSignalRail,
  type CustomerDossierStatusItem,
  type CustomerDossierStatusTone,
  type CustomerDossierSignalItem,
} from "@/components/customers/customer-dossier-primitives";
import {
  initialCustomerEngagementActionState,
  type CustomerEngagementActionState,
} from "@/components/customers/customer-engagement-action-state";
import {
  CustomerEmptyState,
  CustomerTabSection,
} from "@/components/customers/customer-record-list";
import { ActionBanner } from "@/components/shared/action-banner";
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

function getInvitationTone(status: InvitationStatus): CustomerDossierStatusTone {
  switch (status) {
    case "ACCEPTED":
      return "success";
    case "INVITED":
      return "info";
    case "REJECTED":
      return "danger";
    default:
      return "warning";
  }
}

function getAttendanceTone(status: AttendanceStatus): CustomerDossierStatusTone {
  switch (status) {
    case "ATTENDED":
      return "success";
    case "LEFT_EARLY":
      return "warning";
    default:
      return "neutral";
  }
}

function getLiveSessionTone(status: LiveSessionStatus): CustomerDossierStatusTone {
  switch (status) {
    case "LIVE":
      return "warning";
    case "ENDED":
      return "success";
    case "CANCELED":
      return "danger";
    case "SCHEDULED":
      return "info";
    default:
      return "neutral";
  }
}

function formatDateTimeLocalInput(value: Date | null) {
  if (!value) {
    return "";
  }

  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
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
  const latestRecord = records[0] ?? null;
  const attendedCount = records.filter(
    (record) => record.attendanceStatus === "ATTENDED",
  ).length;
  const giftQualifiedCount = records.filter((record) => record.giftQualified).length;
  const signals: CustomerDossierSignalItem[] = [
    {
      label: "最近场次",
      value: latestRecord ? latestRecord.liveSession.title : "暂无场次",
      description: latestRecord
        ? formatDateTime(latestRecord.liveSession.startAt)
        : "还没有直播邀约记录",
    },
    {
      label: "到场情况",
      value: `${attendedCount} 场到场`,
      description: `${records.length} 条直播记录`,
    },
    {
      label: "礼品达标",
      value: `${giftQualifiedCount} 条`,
      description: latestRecord
        ? `最近状态 ${getInvitationStatusLabel(latestRecord.invitationStatus)}`
        : "暂无达标记录",
    },
    {
      label: "可选场次",
      value: `${liveSessions.length} 场`,
      description: liveSessions[0]
        ? `最近场次 ${formatDateTime(liveSessions[0].startAt)}`
        : "当前没有可选直播场次",
    },
  ];

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
    <div className="space-y-5">
      <CustomerTabSection
        eyebrow="直播画像"
        title={canManage ? "直播邀约与到场补记" : "直播经营总览"}
        description={
          canManage
            ? "先看直播状态，再补记邀约与到场。"
            : "当前角色仅支持查看已有直播互动记录。"
        }
        actions={
          <CustomerDossierMeta>可选场次 {liveSessions.length} 场</CustomerDossierMeta>
        }
      >
        <div className="space-y-4">
          <CustomerDossierSignalRail items={signals} />
          {canManage ? (
            <CustomerDossierPanel>
              <form ref={createFormRef} onSubmit={handleCreateSubmit} className="space-y-4">
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
            </CustomerDossierPanel>
          ) : (
            <CustomerDossierNotice>
              仅查看记录。更新直播邀约请由当前承接销售处理。
            </CustomerDossierNotice>
          )}
        </div>
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="直播轨迹"
        title="直播互动历史"
        description="回看邀约、到场、观看时长与礼品达标。"
        actions={<CustomerDossierMeta>{records.length} 条记录</CustomerDossierMeta>}
      >
        {records.length > 0 ? (
          <div className="space-y-2.5">
            {records.map((record) => {
              const statusItems: CustomerDossierStatusItem[] = [
                {
                  label: "邀约",
                  value: getInvitationStatusLabel(record.invitationStatus),
                  tone: getInvitationTone(record.invitationStatus),
                },
                {
                  label: "到场",
                  value: getAttendanceStatusLabel(record.attendanceStatus),
                  tone: getAttendanceTone(record.attendanceStatus),
                },
                {
                  label: "观看",
                  value: `${record.watchDurationMinutes ?? 0} 分钟`,
                  tone:
                    (record.watchDurationMinutes ?? 0) > 0 ? "info" : "neutral",
                },
                {
                  label: "礼品",
                  value: record.giftQualified ? "已达标" : "未达标",
                  tone: record.giftQualified ? "success" : "neutral",
                },
                {
                  label: "场次",
                  value: getLiveSessionStatusLabel(record.liveSession.status),
                  tone: getLiveSessionTone(record.liveSession.status),
                },
                {
                  label: "方式",
                  value: getInvitationMethodLabel(record.invitationMethod),
                  tone: "neutral",
                },
              ];
              const editDetail = canManage ? (
                <details className="rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2.5">
                  <summary className="cursor-pointer list-none text-[12px] font-medium text-[var(--foreground)]">
                    更新该场记录
                  </summary>
                  <CustomerDossierPanel className="mt-3 border-none bg-transparent p-0 shadow-none">
                    <form
                      onSubmit={(event) => handleUpdateSubmit(event, record.id)}
                      className="space-y-4"
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
                            defaultValue={formatDateTimeLocalInput(record.invitedAt)}
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

                      <label className="block space-y-2">
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
                        >
                          {updateStates[record.id]?.message}
                        </ActionBanner>
                      ) : null}

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={pendingUpdateId === record.id}
                          className="crm-button crm-button-secondary"
                        >
                          {pendingUpdateId === record.id ? "保存中..." : "保存更新"}
                        </button>
                      </div>
                    </form>
                  </CustomerDossierPanel>
                </details>
              ) : null;

              return (
                <CustomerDossierLedgerRow
                  key={record.id}
                  title={record.liveSession.title}
                  subtitle={record.remark?.trim() || "无备注"}
                  meta={[
                    `主播 ${record.liveSession.hostName}`,
                    `开播 ${formatDateTime(record.liveSession.startAt)}`,
                    `销售 ${record.sales.name} (@${record.sales.username})`,
                    `邀约时间 ${record.invitedAt ? formatDateTime(record.invitedAt) : "暂无"}`,
                    record.liveSession.roomId
                      ? `直播间 ${record.liveSession.roomId}`
                      : "直播间 未填写",
                  ]}
                  statusItems={statusItems}
                  aside={record.liveSession.targetProduct || "未绑定产品"}
                  href={record.liveSession.roomLink ?? undefined}
                  hrefLabel={record.liveSession.roomLink ? "打开直播间" : undefined}
                  detail={editDetail}
                />
              );
            })}
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
