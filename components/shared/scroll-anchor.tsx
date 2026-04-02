"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { consumeSmartScrollTarget, isElementInViewport } from "@/lib/smart-scroll";
import { cn } from "@/lib/utils";

export function ScrollAnchor({
  anchorId,
  className,
  children,
}: Readonly<{
  anchorId: string;
  className?: string;
  children: ReactNode;
}>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!consumeSmartScrollTarget(anchorId)) {
      return;
    }

    window.requestAnimationFrame(() => {
      const element = ref.current;

      if (!element || isElementInViewport(element)) {
        return;
      }

      element.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    });
  }, [anchorId, pathname, searchParams]);

  return (
    <div
      id={anchorId}
      ref={ref}
      className={cn("scroll-mt-6 md:scroll-mt-8", className)}
    >
      {children}
    </div>
  );
}
