"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerCallRecordAction } from "@/app/(dashboard)/customers/[id]/call-actions";
import {
  initialCreateCallRecordActionState,
  type CreateCallRecordActionState,
} from "@/components/customers/customer-call-action-state";
import { ActionBanner } from "@/components/shared/action-banner";
import { callResultOptions } from "@/lib/calls/metadata";
import { cn } from "@/lib/utils";

function getDefaultDateTimeLocalValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CustomerCallRecordForm({
  customerId,
  submitLabel = "保存通话记录",
  pendingLabel = "保存中...",
  className,
  onSuccess,
  variant = "full",
  defaultDurationSeconds = 0,
  remarkAutoFocus = false,
}: Readonly<{
  customerId: string;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  onSuccess?: () => void;
  variant?: "full" | "quick-note";
  defaultDurationSeconds?: number;
  remarkAutoFocus?: boolean;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<CreateCallRecordActionState>(
    initialCreateCallRecordActionState,
  );
  const [pending, startTransition] = useTransition();
  const [callTimeDefault] = useState(getDefaultDateTimeLocalValue);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await createCustomerCallRecordAction(
        initialCreateCallRecordActionState,
        formData,
      );

      setState(nextState);

      if (nextState.status === "success") {
        formRef.current?.reset();
        onSuccess?.();
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <input type="hidden" name="customerId" value={customerId} />

      {variant === "quick-note" ? (
        <>
          <input type="hidden" name="callTime" value={callTimeDefault} />
          <input
            type="hidden"
            name="durationSeconds"
            value={String(defaultDurationSeconds)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="crm-label">通话结果</span>
              <select name="result" defaultValue="" required className="crm-select">
                <option value="" disabled>
                  请选择通话结果
                </option>
                {callResultOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="crm-label">下次跟进时间</span>
              <input type="datetime-local" name="nextFollowUpAt" className="crm-input" />
            </label>
          </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="crm-label">通话时间</span>
            <input
              type="datetime-local"
              name="callTime"
              defaultValue={callTimeDefault}
              required
              className="crm-input"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">通话时长（秒）</span>
            <input
              type="number"
              name="durationSeconds"
              min={0}
              max={86400}
              defaultValue={defaultDurationSeconds}
              required
              className="crm-input"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">通话结果</span>
            <select name="result" defaultValue="" required className="crm-select">
              <option value="" disabled>
                请选择通话结果
              </option>
              {callResultOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">下次跟进时间</span>
            <input type="datetime-local" name="nextFollowUpAt" className="crm-input" />
          </label>
        </div>
      )}

      <label className="block space-y-2">
        <span className="crm-label">备注</span>
        <textarea
          name="remark"
          rows={4}
          maxLength={1000}
          autoFocus={remarkAutoFocus}
          placeholder="记录本次沟通内容、客户反馈和后续动作"
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
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
