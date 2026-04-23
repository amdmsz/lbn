"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateCustomerRemarkAction } from "@/app/(dashboard)/customers/actions";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "dirty" | "saved" | "error";

export function InlineCustomerRemarkField({
  customerId,
  initialValue,
  placeholder = "补充本次客户备注",
  className,
}: Readonly<{
  customerId: string;
  initialValue?: string | null;
  placeholder?: string;
  className?: string;
}>) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const committedValueRef = useRef(initialValue?.trim() ?? "");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  function scheduleReset() {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setSaveState("idle");
      setMessage(null);
    }, 1800);
  }

  function commitRemark(nextValue: string) {
    const normalizedValue = nextValue.trim();

    if (normalizedValue === committedValueRef.current) {
      setValue(normalizedValue);
      setSaveState("idle");
      setMessage(null);
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("customerId", customerId);
      formData.set("remark", nextValue);

      const result = await updateCustomerRemarkAction(formData);

      if (result.status === "success") {
        committedValueRef.current = normalizedValue;
        setValue(normalizedValue);
        setSaveState("saved");
        setMessage(result.message);
        scheduleReset();
        return;
      }

      setSaveState("error");
      setMessage(result.message);
    });
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <textarea
        value={value}
        rows={2}
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value);
          setSaveState("dirty");
          setMessage(null);
        }}
        onBlur={(event) => commitRemark(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            commitRemark(value);
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "min-h-[66px] w-full resize-none rounded-[0.95rem] border bg-white/92 px-3 py-2.5 text-[13px] leading-5 text-[var(--foreground)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-sidebar-muted)]",
          pending
            ? "border-[rgba(47,107,255,0.16)] shadow-[0_0_0_4px_rgba(47,107,255,0.08)]"
            : saveState === "error"
              ? "border-[rgba(209,91,118,0.18)] shadow-[0_0_0_4px_rgba(209,91,118,0.08)]"
            : "border-[rgba(25,40,72,0.08)] focus:border-[rgba(47,107,255,0.22)] focus:shadow-[0_0_0_4px_rgba(47,107,255,0.08)]",
        )}
      />
      {pending || message || saveState === "dirty" ? (
        <div
          className={cn(
            "flex items-center gap-3 text-[11px] leading-4 text-[var(--color-sidebar-muted)]",
            pending || message ? "justify-between" : "justify-end",
          )}
        >
          {pending || message ? (
            <span
              className={cn(
                pending && "text-[var(--color-accent)]",
                saveState === "saved" && "text-[var(--color-success)]",
                saveState === "error" && "text-[var(--color-danger)]",
              )}
            >
              {pending ? "保存中..." : message}
            </span>
          ) : null}
          {saveState === "dirty" ? (
            <span className="shrink-0">Ctrl/Cmd + Enter 保存</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
