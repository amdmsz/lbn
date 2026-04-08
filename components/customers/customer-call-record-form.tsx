"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerCallRecordAction } from "@/app/(dashboard)/customers/[id]/call-actions";
import {
  initialCreateCallRecordActionState,
  type CreateCallRecordActionState,
} from "@/components/customers/customer-call-action-state";
import { ActionBanner } from "@/components/shared/action-banner";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  filterMobileCallResultOptions,
  getSuggestedMobileCallResultCode,
  inferConnectedStateFromResultCode,
  inferWechatStateFromResultCode,
  type MobileCallConnectedState,
  type MobileCallWechatState,
} from "@/lib/calls/mobile-call-followup";
import { cn } from "@/lib/utils";

function getDefaultDateTimeLocalValue(input?: Date | string | null) {
  const date =
    input instanceof Date
      ? input
      : input
        ? new Date(input)
        : new Date();
  const normalized = Number.isNaN(date.getTime()) ? new Date() : date;
  const local = new Date(
    normalized.getTime() - normalized.getTimezoneOffset() * 60_000,
  );
  return local.toISOString().slice(0, 16);
}

function HelperChoiceButton({
  label,
  active,
  onClick,
}: Readonly<{
  label: string;
  active: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-3.5 text-[12px] font-medium transition-colors",
        active
          ? "border-[rgba(154,97,51,0.2)] bg-[rgba(154,97,51,0.09)] text-[rgba(84,55,31,0.96)]"
          : "border-black/8 bg-white/92 text-black/60",
      )}
    >
      {label}
    </button>
  );
}

export function CustomerCallRecordForm({
  customerId,
  resultOptions,
  submitLabel = "保存通话记录",
  pendingLabel = "保存中...",
  className,
  onSuccess,
  variant = "full",
  defaultDurationSeconds = 0,
  defaultCallTime = null,
  remarkAutoFocus = false,
  onCancel,
  onLater,
}: Readonly<{
  customerId: string;
  resultOptions: CallResultOption[];
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  onSuccess?: () => void;
  variant?: "full" | "quick-note" | "mobile-followup";
  defaultDurationSeconds?: number;
  defaultCallTime?: Date | string | null;
  remarkAutoFocus?: boolean;
  onCancel?: () => void;
  onLater?: () => void;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<CreateCallRecordActionState>(
    initialCreateCallRecordActionState,
  );
  const [pending, startTransition] = useTransition();
  const [callTimeDefault] = useState(() =>
    getDefaultDateTimeLocalValue(defaultCallTime),
  );
  const [connectedState, setConnectedState] = useState<MobileCallConnectedState>(
    "UNKNOWN",
  );
  const [wechatState, setWechatState] = useState<MobileCallWechatState>("NONE");
  const [selectedResult, setSelectedResult] = useState("");
  const mobileResultOptions =
    variant === "mobile-followup"
      ? filterMobileCallResultOptions(resultOptions, connectedState, wechatState)
      : resultOptions;

  function syncMobileResult(
    nextConnectedState: MobileCallConnectedState,
    nextWechatState: MobileCallWechatState,
    currentResultCode?: string,
  ) {
    const nextResultCode = getSuggestedMobileCallResultCode(
      resultOptions,
      nextConnectedState,
      nextWechatState,
      currentResultCode,
    );

    setConnectedState(nextConnectedState);
    setWechatState(nextWechatState);
    setSelectedResult(nextResultCode ?? "");
  }

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
        setConnectedState("UNKNOWN");
        setWechatState("NONE");
        setSelectedResult("");
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
                {resultOptions.map((option) => (
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
      ) : variant === "mobile-followup" ? (
        <>
          <input type="hidden" name="callTime" value={callTimeDefault} />
          <input
            type="hidden"
            name="durationSeconds"
            value={String(defaultDurationSeconds)}
          />

          <div className="space-y-4">
            <div className="rounded-[18px] border border-black/7 bg-[rgba(247,248,250,0.74)] px-4 py-3 text-[12px] leading-5 text-black/54">
              拨号时间按发起拨打时刻记录，通话时长默认记为 0 秒。本页只做回页补记，不伪造真实接通或挂机状态。
            </div>

            <div className="space-y-2.5">
              <span className="crm-label">是否接通</span>
              <div className="flex flex-wrap gap-2">
                <HelperChoiceButton
                  label="未标记"
                  active={connectedState === "UNKNOWN"}
                  onClick={() =>
                    syncMobileResult("UNKNOWN", wechatState, selectedResult || undefined)
                  }
                />
                <HelperChoiceButton
                  label="未接通"
                  active={connectedState === "NOT_CONNECTED"}
                  onClick={() => syncMobileResult("NOT_CONNECTED", "NONE", selectedResult)}
                />
                <HelperChoiceButton
                  label="已接通"
                  active={connectedState === "CONNECTED"}
                  onClick={() =>
                    syncMobileResult("CONNECTED", wechatState, selectedResult || undefined)
                  }
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="crm-label">是否加微</span>
              <div className="flex flex-wrap gap-2">
                <HelperChoiceButton
                  label="未提及"
                  active={wechatState === "NONE"}
                  onClick={() =>
                    syncMobileResult(connectedState, "NONE", selectedResult || undefined)
                  }
                />
                <HelperChoiceButton
                  label="待通过"
                  active={wechatState === "PENDING"}
                  onClick={() => syncMobileResult("CONNECTED", "PENDING", selectedResult)}
                />
                <HelperChoiceButton
                  label="已加微"
                  active={wechatState === "ADDED"}
                  onClick={() => syncMobileResult("CONNECTED", "ADDED", selectedResult)}
                />
                <HelperChoiceButton
                  label="拒绝加微"
                  active={wechatState === "REFUSED"}
                  onClick={() => syncMobileResult("CONNECTED", "REFUSED", selectedResult)}
                />
              </div>
            </div>

            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="crm-label">通话结果</span>
                <select
                  name="result"
                  value={selectedResult}
                  onChange={(event) => {
                    const nextResult = event.target.value;

                    setSelectedResult(nextResult);
                    setConnectedState(inferConnectedStateFromResultCode(nextResult));
                    setWechatState(inferWechatStateFromResultCode(nextResult));
                  }}
                  required
                  className="crm-select"
                >
                  <option value="" disabled>
                    请选择通话结果
                  </option>
                  {mobileResultOptions.map((option) => (
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
              {resultOptions.map((option) => (
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

      <div
        className={cn(
          "flex justify-end",
          variant === "mobile-followup" && (onCancel || onLater)
            ? "flex-col gap-2"
            : "",
        )}
      >
        {variant === "mobile-followup" && (onCancel || onLater) ? (
          <div className="flex flex-wrap items-center gap-2">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="crm-button crm-button-secondary min-h-0 px-3.5 py-2 text-sm"
              >
                取消
              </button>
            ) : null}
            {onLater ? (
              <button
                type="button"
                onClick={onLater}
                className="crm-button crm-button-secondary min-h-0 px-3.5 py-2 text-sm"
              >
                稍后补记
              </button>
            ) : null}
          </div>
        ) : null}

        <button type="submit" disabled={pending} className="crm-button crm-button-primary">
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
