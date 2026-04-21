"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  createOwnedCustomerAction,
  type CreateOwnedCustomerActionResult,
} from "@/app/(dashboard)/customers/actions";
import { cn } from "@/lib/utils";

function FieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) {
    return null;
  }

  return <p className="text-xs leading-5 text-[var(--color-danger)]">{message}</p>;
}

export function CustomerCreateEntry() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CreateOwnedCustomerActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function resetDialog() {
    setResult(null);
    formRef.current?.reset();
  }

  function openDialog() {
    resetDialog();
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    resetDialog();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextResult = await createOwnedCustomerAction(formData);
      setResult(nextResult);

      if (nextResult.status !== "success" || !nextResult.customerId) {
        return;
      }

      closeDialog();
      router.push(`/customers/${nextResult.customerId}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="crm-button crm-button-primary min-h-0 px-3.5 py-2 text-sm"
      >
        新增客户
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="手动新增客户"
            className="crm-card w-full max-w-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-black/6 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-black/84">手动新增客户</h3>
                  <p className="text-sm leading-6 text-black/58">
                    只给当前销售创建私有客户，不新建 Lead，不改公海池 / 回收站 / 订单主链。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
                >
                  关闭
                </button>
              </div>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              {result?.message ? (
                <div
                  className={cn(
                    "rounded-[0.9rem] border px-4 py-3 text-[13px] leading-6",
                    result.status === "success"
                      ? "border-[var(--color-accent)]/18 bg-[var(--color-accent)]/5 text-black/72"
                      : "border-[rgba(141,59,51,0.16)] bg-[rgba(255,247,246,0.92)] text-[var(--color-danger)]",
                  )}
                >
                  {result.message}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-black/78">客户姓名</span>
                  <input
                    name="name"
                    required
                    placeholder="例如：张三"
                    className="crm-input h-11 w-full"
                  />
                  <FieldError message={result?.fieldErrors.name} />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-black/78">手机号</span>
                  <input
                    name="phone"
                    required
                    inputMode="numeric"
                    placeholder="11 位手机号"
                    className="crm-input h-11 w-full"
                  />
                  <FieldError message={result?.fieldErrors.phone} />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-black/78">省份</span>
                  <input name="province" placeholder="选填" className="crm-input h-11 w-full" />
                  <FieldError message={result?.fieldErrors.province} />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-black/78">城市</span>
                  <input name="city" placeholder="选填" className="crm-input h-11 w-full" />
                  <FieldError message={result?.fieldErrors.city} />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-black/78">区县</span>
                  <input name="district" placeholder="选填" className="crm-input h-11 w-full" />
                  <FieldError message={result?.fieldErrors.district} />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-black/78">详细地址</span>
                  <input name="address" placeholder="选填" className="crm-input h-11 w-full" />
                  <FieldError message={result?.fieldErrors.address} />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-black/78">备注</span>
                <textarea
                  name="remark"
                  rows={4}
                  placeholder="选填，例如订单来源或当前沟通背景。"
                  className="crm-input min-h-[112px] w-full resize-y py-3"
                />
                <FieldError message={result?.fieldErrors.remark} />
              </label>

              <div className="rounded-[0.9rem] border border-black/7 bg-[rgba(247,248,250,0.76)] px-4 py-3 text-[13px] leading-6 text-black/56">
                创建后会直接写入客户审计日志，并按当前销售 owner 进入客户中心。
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="crm-button crm-button-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {pending ? "创建中..." : "创建并进入客户详情"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
