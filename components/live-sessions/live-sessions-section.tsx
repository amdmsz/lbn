"use client";

import type { LiveSessionStatus } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLiveSessionAction } from "@/app/(dashboard)/live-sessions/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  getLiveSessionStatusLabel,
  getLiveSessionStatusVariant,
} from "@/lib/live-sessions/metadata";

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
  createdBy: {
    name: string;
    username: string;
  } | null;
  _count: {
    invitations: number;
    giftRecords: number;
  };
};

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
  const [state, setState] = useState<ActionState>(initialActionState);
  const [pending, startTransition] = useTransition();
  const [startAtDefault] = useState(getDefaultDateTimeLocalValue);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await createLiveSessionAction(initialActionState, formData);
      setState(nextState);

      if (nextState.status === "success") {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <section className="crm-section-card">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-black/85">创建直播场次</h3>
            <p className="text-sm leading-7 text-black/60">
              由主管、管理员或运营维护直播场次基础信息。保存后会写入 OperationLog，
              客户详情页可直接基于这些场次登记邀约与观看记录。
            </p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="crm-label">直播主题</span>
                <input name="title" required maxLength={120} className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">主播名称</span>
                <input name="hostName" required maxLength={100} className="crm-input" />
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
                <span className="crm-label">房间 ID</span>
                <input name="roomId" maxLength={100} className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">直播链接</span>
                <input
                  name="roomLink"
                  maxLength={500}
                  placeholder="https://"
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">目标产品</span>
                <input name="targetProduct" maxLength={120} className="crm-input" />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="crm-label">备注</span>
              <textarea
                name="remark"
                rows={4}
                maxLength={1000}
                placeholder="记录直播脚本、主推卖点或其他补充说明"
                className="crm-textarea"
              />
            </label>

            {state.message ? (
              <ActionBanner tone={state.status === "success" ? "success" : "danger"}>
                {state.message}
              </ActionBanner>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pending}
                className="crm-button crm-button-primary"
              >
                {pending ? "保存中..." : "创建直播场次"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="crm-section-card">
          <h3 className="text-lg font-semibold text-black/85">直播场次</h3>
          <p className="mt-2 text-sm leading-7 text-black/60">
            当前角色可以查看直播场次，但不提供场次维护入口。
          </p>
        </section>
      )}

      {items.length > 0 ? (
        <div className="crm-table-shell">
          <table className="crm-table">
            <thead>
              <tr>
                <th>直播主题</th>
                <th>主播</th>
                <th>开播时间</th>
                <th>状态</th>
                <th>房间信息</th>
                <th>目标产品</th>
                <th>邀约 / 礼品</th>
                <th>创建人</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
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
                    <div>{item.roomId || "未填写房间 ID"}</div>
                    {item.roomLink ? (
                      <a
                        href={item.roomLink}
                        target="_blank"
                        rel="noreferrer"
                        className="crm-text-link text-xs"
                      >
                        打开直播链接
                      </a>
                    ) : (
                      <div className="text-xs text-black/45">未填写链接</div>
                    )}
                  </td>
                  <td>{item.targetProduct || "未填写"}</td>
                  <td>
                    <div>{item._count.invitations} 条邀约记录</div>
                    <div className="text-xs text-black/45">
                      {item._count.giftRecords} 条礼品记录
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
                      "系统"
                    )}
                    <div className="mt-1 text-xs text-black/45">
                      创建于 {formatDateTime(item.createdAt)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="暂无直播场次"
          description="先创建一场直播，客户详情页里的直播邀约记录才能选择具体场次。"
        />
      )}
    </div>
  );
}
