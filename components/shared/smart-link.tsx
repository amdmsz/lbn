"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { scheduleSmartScroll } from "@/lib/smart-scroll";

type SmartLinkProps = ComponentProps<typeof Link> & {
  scrollTargetId?: string;
};

export function SmartLink({
  scrollTargetId,
  onClick,
  scroll,
  ...props
}: Readonly<SmartLinkProps>) {
  return (
    <Link
      {...props}
      scroll={scroll ?? !scrollTargetId}
      onClick={(event) => {
        if (scrollTargetId) {
          scheduleSmartScroll(scrollTargetId);
        }

        onClick?.(event);
      }}
    />
  );
}
