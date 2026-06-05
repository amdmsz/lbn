"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";

type ForceHardDeleteCustomerActionResult = {
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
};

export type ForceHardDeleteCustomerAction = (input: {
  customerId: string;
  confirmation: string;
  reason: string;
}) => Promise<ForceHardDeleteCustomerActionResult>;

type CustomerForceDeletePanelProps = {
  customerId: string;
  customerName: string;
  phone: string;
  ownerLabel: string;
  businessRecordCount: number;
  action: ForceHardDeleteCustomerAction;
};

export function CustomerForceDeletePanel({
  customerId,
  customerName,
  phone,
  ownerLabel,
  businessRecordCount,
  action,
}: Readonly<CustomerForceDeletePanelProps>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<ForceHardDeleteCustomerActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmationMatched = useMemo(() => {
    const trimmed = confirmation.trim();
    return trimmed === customerName || trimmed === phone;
  }, [confirmation, customerName, phone]);

  function resetForm() {
    setConfirmation("");
    setReason("");
  }

  function handleSubmit() {
    if (!confirmationMatched || !reason.trim()) {
      setNotice({
        status: "error",
        message: "请填写原因，并输入客户姓名或手机号完成确认。",
        redirectTo: null,
      });
      return;
    }

    startTransition(async () => {
      const result = await action({
        customerId,
        confirmation,
        reason,
      });
      setNotice(result);

      if (result.redirectTo) {
        resetForm();
        router.replace(result.redirectTo);
        return;
      }

      if (result.status === "success") {
        resetForm();
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-destructive/20 bg-card p-4 shadow-sm">
      {notice ? (
        <div className="mb-3">
          <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
            {notice.message}
          </ActionBanner>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Force Delete
            </p>
            <StatusBadge label="主管以上" variant="danger" />
          </div>
          <h2 className="text-base font-semibold text-foreground">永久删除客户</h2>
          <p className="text-[12px] leading-5 text-muted-foreground">
            直接删除客户和关联业务记录，不进入回收站。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen((value) => !value);
          }}
          className="crm-button crm-button-secondary min-h-0 px-3.5 py-2 text-sm text-[var(--color-danger)] hover:border-[var(--tone-danger-soft-border-strong)] hover:bg-[var(--tone-danger-soft-bg)]"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {open ? "收起" : "硬删除"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 text-[12px] leading-5 text-muted-foreground">
        <div className="flex justify-between gap-3">
          <span>客户</span>
          <span className="text-right font-medium text-foreground">{customerName}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>手机号</span>
          <span className="text-right font-medium text-foreground">{phone}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>负责人</span>
          <span className="text-right font-medium text-foreground">{ownerLabel}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>关联记录</span>
          <span className="text-right font-medium text-foreground">
            {businessRecordCount} 项
          </span>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-3 border-t border-border/40 pt-3">
          <ActionBanner tone="danger">
            删除后无法从系统恢复；只能依赖数据库备份恢复。
          </ActionBanner>
          <label className="block space-y-1.5">
            <span className="crm-label">确认内容</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              className="crm-input"
              placeholder={`输入 ${customerName} 或 ${phone}`}
              disabled={pending}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="crm-label">删除原因</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              rows={3}
              maxLength={500}
              className="crm-textarea"
              placeholder="填写本次强制硬删除原因"
              disabled={pending}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNotice(null);
                resetForm();
              }}
              disabled={pending}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending || !confirmationMatched || !reason.trim()}
              className="inline-flex min-h-0 items-center justify-center gap-2 rounded-lg bg-destructive px-3.5 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-colors duration-150 hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pending ? "删除中..." : "确认永久删除"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
