"use client";

import type { LiveSessionStatus } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLiveSessionAction,
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
};

type LiveSessionItem = {
  id: string;
  title: string;
  hostName: string;
  startAt: Date;
  roomId: string | null;
  roomLink: string | null;
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
    <div className="space-y-6">
      {canManage ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="\u573a\u6b21\u7ef4\u62a4" variant="info" />
              <StatusBadge label="\u53d6\u6d88 / \u5f52\u6863 / \u5220\u9664\u9884\u68c0" variant="neutral" />
            </div>
            <h3 className="text-lg font-semibold text-black/85">
              {"\u521b\u5efa\u76f4\u64ad\u573a\u6b21"}
            </h3>
            <p className="text-sm leading-7 text-black/60">
              {
                "\u5148\u628a\u573a\u6b21\u4f5c\u4e3a\u8fd0\u8425\u4e0a\u4e0b\u6587\u5efa\u597d\uff0c\u540e\u7eed\u518d\u7531\u5ba2\u6237\u8be6\u60c5\u9875\u57fa\u4e8e\u8fd9\u4e9b\u573a\u6b21\u5904\u7406\u9080\u7ea6\u3001\u89c2\u770b\u548c\u793c\u54c1\u8d44\u683c\u3002"
              }
            </p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="crm-label">{"\u76f4\u64ad\u4e3b\u9898"}</span>
                <input name="title" required maxLength={120} className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">{"\u4e3b\u64ad\u540d\u79f0"}</span>
                <input name="hostName" required maxLength={100} className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">{"\u5f00\u64ad\u65f6\u95f4"}</span>
                <input
                  type="datetime-local"
                  name="startAt"
                  required
                  defaultValue={startAtDefault}
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">{"\u623f\u95f4 ID"}</span>
                <input name="roomId" maxLength={100} className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">{"\u76f4\u64ad\u94fe\u63a5"}</span>
                <input
                  name="roomLink"
                  maxLength={500}
                  placeholder="https://"
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">{"\u76ee\u6807\u4ea7\u54c1"}</span>
                <input name="targetProduct" maxLength={120} className="crm-input" />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="crm-label">{"\u5907\u6ce8"}</span>
              <textarea
                name="remark"
                rows={4}
                maxLength={1000}
                placeholder="\u8bb0\u5f55\u4e3b\u63a8\u5356\u70b9\u3001\u8fd0\u8425\u811a\u672c\u6216\u5176\u4ed6\u8865\u5145\u8bf4\u660e"
                className="crm-textarea"
              />
            </label>

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
                {createPending
                  ? "\u4fdd\u5b58\u4e2d..."
                  : "\u521b\u5efa\u76f4\u64ad\u573a\u6b21"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="crm-section-card">
          <h3 className="text-lg font-semibold text-black/85">
            {"\u76f4\u64ad\u573a\u6b21"}
          </h3>
          <p className="mt-2 text-sm leading-7 text-black/60">
            {
              "\u5f53\u524d\u89d2\u8272\u53ef\u4ee5\u67e5\u770b\u573a\u6b21\u4e0a\u4e0b\u6587\uff0c\u4f46\u4e0d\u63d0\u4f9b\u5168\u5c40\u573a\u6b21\u7ef4\u62a4\u5165\u53e3\u3002"
            }
          </p>
        </section>
      )}

      {items.length > 0 ? (
        <div className="crm-table-shell">
          <table className="crm-table">
            <thead>
              <tr>
                <th>{"\u76f4\u64ad\u4e3b\u9898"}</th>
                <th>{"\u4e3b\u64ad"}</th>
                <th>{"\u5f00\u64ad\u65f6\u95f4"}</th>
                <th>{"\u72b6\u6001"}</th>
                <th>{"\u623f\u95f4\u4fe1\u606f"}</th>
                <th>{"\u76ee\u6807\u4ea7\u54c1"}</th>
                <th>{"\u9080\u7ea6 / \u793c\u54c1"}</th>
                <th>{"\u521b\u5efa\u4eba"}</th>
                {canManage ? <th>{"\u52a8\u4f5c"}</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const lifecycleAction = getLiveSessionPrimaryLifecycleAction(item.status);

                return (
                  <tr key={item.id}>
                    <td className="text-black/80">
                      <div className="space-y-2">
                        <div className="font-medium">{item.title}</div>
                        {item.remark ? (
                          <p className="max-w-md text-sm leading-6 text-black/55">
                            {item.remark}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td>{item.hostName}</td>
                    <td className="whitespace-nowrap">{formatDateTime(item.startAt)}</td>
                    <td>
                      <StatusBadge
                        label={getLiveSessionStatusLabel(item.status)}
                        variant={getLiveSessionStatusVariant(item.status)}
                      />
                    </td>
                    <td>
                      <div>{item.roomId || "\u672a\u586b\u5199\u623f\u95f4 ID"}</div>
                      {item.roomLink ? (
                        <a
                          href={item.roomLink}
                          target="_blank"
                          rel="noreferrer"
                          className="crm-text-link text-xs"
                        >
                          {"\u6253\u5f00\u76f4\u64ad\u94fe\u63a5"}
                        </a>
                      ) : (
                        <div className="text-xs text-black/45">
                          {"\u672a\u586b\u5199\u94fe\u63a5"}
                        </div>
                      )}
                    </td>
                    <td>{item.targetProduct || "\u672a\u586b\u5199"}</td>
                    <td>
                      <div>{item._count.invitations} {"\u6761\u9080\u7ea6\u8bb0\u5f55"}</div>
                      <div className="text-xs text-black/45">
                        {item._count.giftRecords} {"\u6761\u793c\u54c1\u8bb0\u5f55"}
                        {" \u00b7 "}
                        {"\u7ed3\u679c "}
                        {item.engagementResultCount}
                      </div>
                    </td>
                    <td>
                      {item.createdBy ? (
                        <div>
                          <div>{item.createdBy.name}</div>
                          <div className="text-xs text-black/45">
                            @{item.createdBy.username}
                          </div>
                        </div>
                      ) : (
                        "\u7cfb\u7edf"
                      )}
                      <div className="mt-1 text-xs text-black/45">
                        {"\u521b\u5efa\u4e8e "} {formatDateTime(item.createdAt)}
                      </div>
                    </td>
                    {canManage ? (
                      <td className="align-top">
                        <div className="flex min-w-[9rem] flex-col items-start gap-2">
                          {lifecycleAction ? (
                            <button
                              type="button"
                              onClick={() =>
                                openLifecycleDialog(item, lifecycleAction.intent)
                              }
                              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                            >
                              {lifecycleAction.label}
                            </button>
                          ) : (
                            <span className="text-xs leading-5 text-black/45">
                              {item.status === "CANCELED"
                                ? "\u5f53\u524d\u573a\u6b21\u5df2\u53d6\u6d88"
                                : "\u5f53\u524d\u573a\u6b21\u4fdd\u7559\u4e3a\u5386\u53f2\u573a\u6b21"}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openRecycleDialog(item)}
                            className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                          >
                            {item.recycleGuard.canMoveToRecycleBin
                              ? "\u79fb\u5165\u56de\u6536\u7ad9"
                              : "\u67e5\u770b\u5f15\u7528\u5173\u7cfb"}
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
          title="\u6682\u65e0\u76f4\u64ad\u573a\u6b21"
          description="\u5148\u521b\u5efa\u4e00\u573a\u76f4\u64ad\uff0c\u5ba2\u6237\u8be6\u60c5\u9875\u91cc\u7684\u76f4\u64ad\u9080\u7ea6\u8bb0\u5f55\u624d\u80fd\u9009\u62e9\u5177\u4f53\u573a\u6b21\u3002"
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
