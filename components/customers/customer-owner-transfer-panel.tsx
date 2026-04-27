"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { ActionBanner } from "@/components/shared/action-banner";
import { cn } from "@/lib/utils";

export type CustomerOwnerTransferOption = {
  id: string;
  name: string;
  username: string;
  team: {
    id: string;
    name: string;
    code: string;
  } | null;
};

export type TransferCustomerOwnerActionResult = {
  status: "success" | "error";
  message: string;
};

export type TransferCustomerOwnerAction = (
  formData: FormData,
) => Promise<TransferCustomerOwnerActionResult>;

export function CustomerOwnerTransferPanel({
  customerId,
  currentOwnerLabel,
  options,
  action,
  className,
}: Readonly<{
  customerId: string;
  currentOwnerLabel: string;
  options: CustomerOwnerTransferOption[];
  action: TransferCustomerOwnerAction;
  className?: string;
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetOwnerId, setTargetOwnerId] = useState(options[0]?.id ?? "");
  const [notice, setNotice] = useState<TransferCustomerOwnerActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const hasOptions = options.length > 0;

  function openPanel() {
    setNotice(null);
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    setNotice(null);
    setTargetOwnerId(options[0]?.id ?? "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!targetOwnerId) {
      setNotice({
        status: "error",
        message: "请选择新的负责人。",
      });
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await action(formData);
      setNotice(result);

      if (result.status === "success") {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={openPanel}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[rgba(79,125,247,0.18)] bg-[var(--color-panel)] px-3 text-[12px] font-medium text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)] transition hover:border-[rgba(79,125,247,0.28)] hover:bg-[var(--color-shell-hover)]"
        >
          <ArrowRightLeft className="h-3.5 w-3.5 text-[var(--color-primary)]" aria-hidden="true" />
          移交负责人
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] p-3"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[var(--foreground)]">
                移交负责人
              </p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-sidebar-muted)]">
                当前 {currentOwnerLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="text-[11px] font-medium text-[var(--color-sidebar-muted)] hover:text-[var(--foreground)]"
            >
              取消
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <label className="block space-y-1.5">
              <span className="crm-label">新的负责人</span>
              <select
                name="targetOwnerId"
                value={targetOwnerId}
                onChange={(event) => setTargetOwnerId(event.currentTarget.value)}
                disabled={!hasOptions || pending}
                className="crm-select"
              >
                {hasOptions ? null : <option value="">暂无可移交销售</option>}
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} (@{option.username})
                    {option.team ? ` / ${option.team.name}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="crm-label">移交备注</span>
              <textarea
                name="note"
                rows={2}
                maxLength={500}
                placeholder="可填写移交原因，选填"
                disabled={pending}
                className="crm-textarea"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={closePanel}
              disabled={pending}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!hasOptions || pending}
              className="crm-button crm-button-primary gap-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {pending ? "移交中..." : "确认移交"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
