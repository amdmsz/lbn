"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sheet({
  open,
  onClose,
  title,
  description,
  ariaLabel,
  children,
  className,
  contentClassName,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Required client-only portal guard for Next.js hydration.
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <button
        type="button"
        aria-label="关闭抽屉"
        onClick={onClose}
        className="crm-sheet-backdrop fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "crm-sheet-panel fixed inset-y-0 right-0 z-[10000] flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col overflow-hidden border-l border-border bg-background text-foreground shadow-2xl outline-none",
          className,
        )}
      >
        {title || description ? (
          <div className="flex items-start justify-between gap-4 border-b border-border bg-muted/45 px-5 py-4 sm:px-6">
            <div className="min-w-0 space-y-1">
              {title ? (
                <h2
                  id={titleId}
                  className="text-base font-semibold text-foreground"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p
                  id={descriptionId}
                  className="text-sm leading-6 text-muted-foreground"
                >
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            contentClassName,
          )}
        >
          {children}
        </div>
      </section>
    </div>,
    document.body,
  );
}
