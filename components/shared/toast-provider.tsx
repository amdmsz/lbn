"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "danger" | "info";

export type ToastPayload = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = Required<Omit<ToastPayload, "description">> & {
  id: number;
  description?: string;
};

const toastEventName = "crm:toast";
let toastSequence = 0;

const toneClassNames: Record<
  ToastTone,
  { icon: string; dot: string; ring: string }
> = {
  success: {
    icon: "text-emerald-600",
    dot: "bg-emerald-500",
    ring: "border-emerald-500/20",
  },
  danger: {
    icon: "text-destructive",
    dot: "bg-destructive",
    ring: "border-destructive/20",
  },
  info: {
    icon: "text-primary",
    dot: "bg-primary",
    ring: "border-primary/20",
  },
};

function getToastIcon(tone: ToastTone) {
  if (tone === "success") return CheckCircle2;
  if (tone === "danger") return AlertCircle;
  return Info;
}

export function notifyToast(payload: ToastPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ToastPayload>(toastEventName, {
      detail: payload,
    }),
  );
}

export function ToastProvider() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function handleToast(event: Event) {
      const payload = (event as CustomEvent<ToastPayload>).detail;

      if (!payload?.title) {
        return;
      }

      const id = ++toastSequence;
      const nextItem: ToastItem = {
        id,
        title: payload.title,
        description: payload.description,
        tone: payload.tone ?? "info",
        durationMs: payload.durationMs ?? 4200,
      };

      setItems((current) => [nextItem, ...current].slice(0, 4));

      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, nextItem.durationMs);
    }

    window.addEventListener(toastEventName, handleToast);

    return () => {
      window.removeEventListener(toastEventName, handleToast);
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-28 right-6 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {items.map((item) => {
        const Icon = getToastIcon(item.tone);
        const tone = toneClassNames[item.tone];

        return (
          <div
            key={item.id}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-background/90 p-4 text-foreground shadow-2xl backdrop-blur-xl",
              "transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
              "border-border/60",
              tone.ring,
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-4 h-8 w-1 rounded-r-full",
                tone.dot,
              )}
            />
            <div className="flex items-start gap-3 pl-1">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                <Icon className={cn("h-4 w-4", tone.icon)} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-5 text-foreground">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() =>
                  setItems((current) =>
                    current.filter((toast) => toast.id !== item.id),
                  )
                }
                aria-label="关闭通知"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
