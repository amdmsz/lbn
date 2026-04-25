"use client";

import type { LiveSessionStatus } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createLiveSessionAction,
  moveLiveSessionToRecycleBinAction,
  updateLiveSessionLifecycleAction,
} from "@/app/(dashboard)/live-sessions/actions";
import { LiveSessionActionDialog } from "@/components/live-sessions/live-session-action-dialog";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  getLiveSessionStatusLabel,
  getLiveSessionStatusVariant,
} from "@/lib/live-sessions/metadata";
import {
  getLiveSessionPrimaryLifecycleAction,
  type LiveSessionRecycleGuard,
  type LiveSessionRecycleReasonCode,
} from "@/lib/live-sessions/recycle-guards";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
};

type LiveSessionItem = {
  id: string;
  title: string;
  hostName: string;
  startAt: Date;
  roomId: string | null;
  targetProduct: string | null;
  remark: string | null;
  status: LiveSessionStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    name: string;
    username: string;
  } | null;
  engagementResultCount: number;
  recycleGuard: LiveSessionRecycleGuard;
  _count: {
    invitations: number;
    giftRecords: number;
  };
};

type DialogState =
  | {
      mode: "cancel" | "archive" | "recycle";
      item: LiveSessionItem;
    }
  | null;

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

function getDefaultDateTimeLocalValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function LiveSessionsSection({
  items,
  canManage,
}: Readonly<{
  items: LiveSessionItem[];
  canManage: boolean;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [notice, setNotice] = useState<ActionState>(initialActionState);
  const [createPending, startCreateTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [startAtDefault] = useState(getDefaultDateTimeLocalValue);
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [recycleReason, setRecycleReason] =
    useState<LiveSessionRecycleReasonCode>("mistaken_creation");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startCreateTransition(async () => {
      const nextState = await createLiveSessionAction(initialActionState, formData);
      setNotice(nextState);

      if (nextState.status === "success") {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  function openLifecycleDialog(item: LiveSessionItem, mode: "cancel" | "archive") {
    setDialogState({ mode, item });
  }

  function openRecycleDialog(item: LiveSessionItem) {
    setRecycleReason("mistaken_creation");
    setDialogState({ mode: "recycle", item });
  }

  function closeDialog() {
    setDialogState(null);
    setRecycleReason("mistaken_creation");
  }

  function handleDialogConfirm() {
    if (!dialogState) {
      return;
    }

    if (dialogState.mode === "recycle" && dialogState.item.recycleGuard.canMoveToRecycleBin) {
      const formData = new FormData();
      formData.set("id", dialogState.item.id);
      formData.set("reasonCode", recycleReason);

      startActionTransition(async () => {
        const nextState = await moveLiveSessionToRecycleBinAction(formData);
        setNotice(nextState);
        closeDialog();

        if (
          nextState.recycleStatus === "created" ||
          nextState.recycleStatus === "already_in_recycle_bin" ||
          nextState.recycleStatus === "blocked"
        ) {
          router.refresh();
        }
      });

      return;
    }

    const intent =
      dialogState.mode === "recycle"
        ? dialogState.item.recycleGuard.fallbackAction
        : dialogState.mode;

    if (intent === "none") {
      return;
    }

    const formData = new FormData();
    formData.set("id", dialogState.item.id);
    formData.set("intent", intent);

    startActionTransition(async () => {
      const nextState = await updateLiveSessionLifecycleAction(formData);
      setNotice(nextState);

      if (nextState.status === "success") {
        closeDialog();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="crm-section-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="手动场次" variant="info" />
              <StatusBadge label="邀约回到客户详情记录" variant="success" />
            </div>
            <h3 className="text-lg font-semibold text-black/85">
              创建直播场次
            </h3>
            <p className="max-w-3xl text-sm leading-7 text-black/60">
              这里只维护直播主题、开播时间和目标产品。员工邀约客户后，回到客户详情页的“直播记录”选择该场次并保存邀约结果。
            </p>
          </div>
          <Link href="/customers" className="crm-button crm-button-secondary whitespace-nowrap">
            去客户中心记录邀约
          </Link>
        </div>

        {canManage ? (
          <form ref={formRef} onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="space-y-2 lg:col-span-1">
                <span className="crm-label">直播主题</span>
                <input name="title" required maxLength={120} className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">开播时间</span>
                <input
                  type="datetime-local"
                  name="startAt"
                  required
                  defaultValue={startAtDefault}
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">目标产品</span>
                <input name="targetProduct" maxLength={120} className="crm-input" />
              </label>
            </div>

            {notice.message ? (
              <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
                {notice.message}
              </ActionBanner>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createPending}
                className="crm-button crm-button-primary"
              >
                {createPending ? "保存中..." : "创建直播场次"}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm leading-7 text-black/55">
            当前角色可以查看场次并在客户详情中记录邀约，但不能维护全局场次。
          </p>
        )}
      </section>

      {items.length > 0 ? (
        <div className="crm-table-shell">
          <table className="crm-table">
            <thead>
              <tr>
                <th>直播主题</th>
                <th>开播时间</th>
                <th>目标产品</th>
                <th>状态</th>
                <th>邀约记录</th>
                <th>创建信息</th>
                {canManage ? <th>动作</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const lifecycleAction = getLiveSessionPrimaryLifecycleAction(item.status);

                return (
                  <tr key={item.id}>
                    <td className="text-black/80">
                      <div className="space-y-1">
                        <div className="font-medium">{item.title}</div>
                        {item.remark ? (
                          <p className="max-w-md text-sm leading-6 text-black/55">
                            {item.remark}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(item.startAt)}</td>
                    <td>{item.targetProduct || "未填写"}</td>
                    <td>
                      <StatusBadge
                        label={getLiveSessionStatusLabel(item.status)}
                        variant={getLiveSessionStatusVariant(item.status)}
                      />
                    </td>
                    <td>
                      <div>{item._count.invitations} 条邀约记录</div>
                      <div className="text-xs text-black/45">
                        有结果 {item.engagementResultCount} · 礼品 {item._count.giftRecords}
                      </div>
                    </td>
                    <td>
                      {item.createdBy ? (
                        <div>
                          <div>{item.createdBy.name}</div>
                          <div className="text-xs text-black/45">@{item.createdBy.username}</div>
                        </div>
                      ) : (
                        "系统"
                      )}
                      <div className="mt-1 text-xs text-black/45">
                        创建于 {formatDateTime(item.createdAt)}
                      </div>
                    </td>
                    {canManage ? (
                      <td className="align-top">
                        <div className="flex min-w-[9rem] flex-col items-start gap-2">
                          {lifecycleAction ? (
                            <button
                              type="button"
                              onClick={() => openLifecycleDialog(item, lifecycleAction.intent)}
                              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                            >
                              {lifecycleAction.label}
                            </button>
                          ) : (
                            <span className="text-xs leading-5 text-black/45">
                              {item.status === "CANCELED"
                                ? "当前场次已取消"
                                : "当前场次已归档"}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openRecycleDialog(item)}
                            className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                          >
                            {item.recycleGuard.canMoveToRecycleBin
                              ? "移入回收站"
                              : "查看引用关系"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="暂无直播场次"
          description="先创建直播主题、开播时间和目标产品；员工再到客户详情页记录已邀约客户。"
        />
      )}

      <LiveSessionActionDialog
        open={dialogState !== null}
        mode={dialogState?.mode ?? "cancel"}
        item={
          dialogState
            ? {
                title: dialogState.item.title,
                hostName: dialogState.item.hostName,
                roomId: dialogState.item.roomId,
                startAt: dialogState.item.startAt,
                updatedAt: dialogState.item.updatedAt,
                blockerSummary: dialogState.item.recycleGuard.blockerSummary,
              }
            : null
        }
        guard={
          dialogState && dialogState.mode === "recycle"
            ? dialogState.item.recycleGuard
            : null
        }
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeDialog}
        onConfirm={handleDialogConfirm}
        pending={actionPending}
      />
    </div>
  );
}
