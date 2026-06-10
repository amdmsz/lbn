"use client";

import { useEffect, useRef, useState } from "react";
// useRouter 已不再使用 (router.refresh 移除, 防止列表 reorder 让用户找不到客户).
import { createCustomerCallRecordAction } from "@/app/(dashboard)/customers/[id]/call-actions";
import {
  initialCreateCallRecordActionState,
  type CreateCallRecordActionState,
} from "@/components/customers/customer-call-action-state";
import { ActionBanner } from "@/components/shared/action-banner";
import { notifyToast } from "@/components/shared/toast-provider";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  buildFollowUpQuickResults,
  type FollowUpQuickResultDefinition,
} from "@/lib/calls/follow-up-quick-results";
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

function getFormString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function updateMobileCallRecordFromForm(
  callRecordId: string,
  formData: FormData,
): Promise<CreateCallRecordActionState> {
  const durationSeconds = Number(getFormString(formData, "durationSeconds") || 0);
  const response = await fetch(
    `/api/mobile/calls/${encodeURIComponent(callRecordId)}/end`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
        result: getFormString(formData, "result"),
        remark: getFormString(formData, "remark"),
        nextFollowUpAt: getFormString(formData, "nextFollowUpAt"),
      }),
    },
  );

  if (!response.ok) {
    try {
      const body = (await response.json()) as { message?: unknown };
      return {
        status: "error",
        message:
          typeof body.message === "string" && body.message.trim()
            ? body.message
            : "通话记录保存失败。",
      };
    } catch {
      return {
        status: "error",
        message: "通话记录保存失败。",
      };
    }
  }

  return {
    status: "success",
    message: "通话记录已保存。",
  };
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
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "crm-motion-pill inline-flex h-8.5 items-center rounded-full border px-3 text-[11px] font-medium tracking-[0.01em] transition-[border-color,background-color,color,box-shadow,transform] duration-150",
        active
          ? "border-[rgba(79,125,247,0.14)] bg-[rgba(79,125,247,0.06)] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.52)]"
          : "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)] hover:border-[rgba(79,125,247,0.1)] hover:bg-[var(--color-shell-surface)] hover:text-[var(--foreground)]",
      )}
    >
      {label}
    </button>
  );
}

// 选中态柔和色块: 选中即 2px 主色边; tone 仅微调底色, 与 result 语义一致.
const quickResultSelectedToneClassNames: Record<
  FollowUpQuickResultDefinition["tone"],
  string
> = {
  neutral: "bg-primary/[0.06]",
  success: "bg-[var(--tone-success-soft-bg)]",
  danger: "bg-[var(--tone-danger-soft-bg)]",
};

function FollowUpQuickResultButton({
  definition,
  active,
  onSelect,
}: Readonly<{
  definition: FollowUpQuickResultDefinition;
  active: boolean;
  onSelect: () => void;
}>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "inline-flex min-h-[3.1rem] flex-1 basis-[5.5rem] items-center justify-center rounded-md border px-3 py-2 text-[13px] font-semibold leading-tight transition-colors duration-150",
        active
          ? cn(
              "border-2 border-primary text-foreground shadow-sm",
              quickResultSelectedToneClassNames[definition.tone],
            )
          : "border border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground",
      )}
    >
      {definition.label}
    </button>
  );
}

export function CustomerCallRecordForm({
  customerId,
  resultOptions,
  submitLabel = "保存通话记录",
  pendingLabel = "保存中...",
  className,
  submitButtonClassName,
  onSuccess,
  variant = "full",
  defaultDurationSeconds = 0,
  defaultCallTime = null,
  defaultResult = "",
  mobileCallRecordId = null,
  remarkAutoFocus = false,
  onCancel,
  onLater,
}: Readonly<{
  customerId: string;
  resultOptions: CallResultOption[];
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  submitButtonClassName?: string;
  onSuccess?: () => void;
  variant?: "full" | "quick-note" | "mobile-followup" | "follow-up";
  defaultDurationSeconds?: number;
  defaultCallTime?: Date | string | null;
  defaultResult?: string;
  mobileCallRecordId?: string | null;
  remarkAutoFocus?: boolean;
  onCancel?: () => void;
  onLater?: () => void;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const remarkRef = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<CreateCallRecordActionState>(
    initialCreateCallRecordActionState,
  );
  // 注意: 这里**不**用 useTransition. React 19 + Next 16 的 useTransition
  // 会等 server action 的 revalidateTag 触发的 RSC 重新渲染完成才结束,
  // customer list 5826 客户 + SQL aggregate SSR ~300-500ms, 用户看到的
  // "保存中..." 会一直显示直到整个客户列表 refetch 完. 改成本地 useState
  // 在 fetch 一返回就归零, RSC 重渲染后台进行, UI 立即反馈"已保存".
  const [pending, setPending] = useState(false);
  const [callTimeDefault] = useState(() =>
    getDefaultDateTimeLocalValue(defaultCallTime),
  );
  const [connectedState, setConnectedState] = useState<MobileCallConnectedState>(
    "UNKNOWN",
  );
  const [wechatState, setWechatState] = useState<MobileCallWechatState>("NONE");
  const resolvedDefaultResult = resultOptions.some(
    (option) => option.value === defaultResult,
  )
    ? defaultResult
    : "";
  const [selectedResult, setSelectedResult] = useState(resolvedDefaultResult);
  const mobileResultOptions =
    variant === "mobile-followup"
      ? filterMobileCallResultOptions(resultOptions, connectedState, wechatState)
      : resultOptions;
  const followUpQuickResults =
    variant === "follow-up" ? buildFollowUpQuickResults(resultOptions) : [];

  useEffect(() => {
    setSelectedResult(resolvedDefaultResult);
    setConnectedState(inferConnectedStateFromResultCode(resolvedDefaultResult));
    setWechatState(inferWechatStateFromResultCode(resolvedDefaultResult));
  }, [resolvedDefaultResult]);

  useEffect(() => {
    if (!remarkAutoFocus) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      remarkRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [remarkAutoFocus]);

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

    // in-flight 保护: 提交按钮在 pending=true 时已被 disabled,
    // 但浏览器在 input 上按 Enter 仍可能触发 form submit, 加 guard
    // 防止双提交并发后两个 server action 的 success 回调互相覆盖
    // form state / selectedResult.
    if (pending) return;

    // follow-up 变体没有原生 <select required>, 结果靠大按钮选. 没选就拦下,
    // 给一句行内提示, 不发请求 (后端也会校验, 但前端先挡省一次往返).
    if (variant === "follow-up" && !selectedResult) {
      setState({ status: "error", message: "请先点选本次结果。" });
      return;
    }

    const formData = new FormData(event.currentTarget);

    setPending(true);
    void (async () => {
      try {
        const nextState = mobileCallRecordId
          ? await updateMobileCallRecordFromForm(mobileCallRecordId, formData)
          : await createCustomerCallRecordAction(
              initialCreateCallRecordActionState,
              formData,
            );

        setState(nextState);

        if (nextState.status === "success") {
          formRef.current?.reset();
          setConnectedState(inferConnectedStateFromResultCode(resolvedDefaultResult));
          setWechatState(inferWechatStateFromResultCode(resolvedDefaultResult));
          setSelectedResult(resolvedDefaultResult);
          notifyToast({
            title: "跟进已保存",
            description: nextState.message,
            tone: "success",
          });
          onSuccess?.();
          // 不再调 router.refresh — 用户反馈"打完一个电话备注完, 列表就变了,
          // 就找不到那个了". 因为 list 按 updatedAt desc 排序, 保存通话会
          // touch customer.updatedAt, 客户被排到第 1 页, 用户当前页找不到.
          // server action 内部 revalidateTag 已让 cache 失效, 用户下次翻页/
          // 筛选/搜索时自动同步, 列表保持当前位置稳定不跳.
        }
      } catch (error) {
        // server action 一般会自己 try/catch 包成 error result, 但 fetch
        // 网络中断 / auth() / revalidateTag 等运行时异常仍可能穿透到这里.
        // 没 catch 时 finally 把 pending 归零, 但用户看不到任何错误反馈,
        // 误以为保存成功 — 必须显式 setState + 弹 toast.
        const message =
          error instanceof Error ? error.message : "保存失败, 请稍后重试。";
        setState({ status: "error", message });
        notifyToast({
          title: "保存失败",
          description: message,
          tone: "danger",
        });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={cn("space-y-3.5", className)}>
      <input type="hidden" name="customerId" value={customerId} />

      {variant === "follow-up" ? (
        <>
          <input type="hidden" name="callTime" value={callTimeDefault} />
          <input
            type="hidden"
            name="durationSeconds"
            value={String(defaultDurationSeconds)}
          />
          {/* 选中的 result code 随 form 提交; 大按钮只更新这个值. */}
          <input type="hidden" name="result" value={selectedResult} />

          <div className="space-y-2">
            <span className="crm-label">本次结果</span>
            <div className="flex flex-wrap gap-2">
              {followUpQuickResults.map((definition) => (
                <FollowUpQuickResultButton
                  key={definition.code}
                  definition={definition}
                  active={selectedResult === definition.code}
                  onSelect={() => setSelectedResult(definition.code)}
                />
              ))}
            </div>
          </div>
        </>
      ) : variant === "quick-note" ? (
        <>
          <input type="hidden" name="callTime" value={callTimeDefault} />
          <input
            type="hidden"
            name="durationSeconds"
            value={String(defaultDurationSeconds)}
          />

          <label className="block space-y-1.5">
            <span className="crm-label">通话结果</span>
            <select
              name="result"
              value={selectedResult}
              onChange={(event) => setSelectedResult(event.target.value)}
              required
              className="crm-select"
            >
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
            <div className="rounded-[16px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-2.5 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
              按发起拨打时间记录。这里只补记结果与备注。
            </div>

            <div className="space-y-2.5">
              <span className="crm-label">接通状态</span>
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
              <span className="crm-label">加微状态</span>
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
            <select
              name="result"
              value={selectedResult}
              onChange={(event) => setSelectedResult(event.target.value)}
              required
              className="crm-select"
            >
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
        <span className="crm-label">
          {variant === "follow-up" ? "备注（选填）" : "备注"}
        </span>
        <textarea
          ref={remarkRef}
          name="remark"
          rows={variant === "follow-up" ? 3 : 4}
          maxLength={1000}
          autoFocus={remarkAutoFocus}
          placeholder={
            variant === "follow-up"
              ? "可补一句沟通内容或下一步（选填）"
              : "记录本次沟通内容、客户反馈和后续动作"
          }
          className="crm-textarea"
        />
      </label>

      {state.message && state.status !== "success" ? (
        <ActionBanner tone="danger">
          {state.message}
        </ActionBanner>
      ) : null}

      <div
        className={cn(
          "flex justify-end",
          variant === "mobile-followup" && (onCancel || onLater)
            ? "flex-wrap items-center justify-between gap-2"
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
                className="crm-button crm-button-ghost min-h-0 px-3.5 py-2 text-sm"
              >
                稍后补记
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={
            submitButtonClassName ?? "crm-button crm-button-primary"
          }
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
