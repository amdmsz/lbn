"use client";

/**
 * Mobile phone-style 头像原语.
 *
 * 从 mobile-app-shell.tsx 抽出 (Phase 2 plan, drawer 依赖共享).
 * 被多个 tab + drawer 复用, 因此独立到 lib/.
 */

import { cn } from "@/lib/utils";

export function PhoneAvatar({
  name,
  size = "md",
  photoUrl = null,
}: Readonly<{
  name: string;
  size?: "sm" | "md" | "lg";
  photoUrl?: string | null;
}>) {
  const sizeClassName = {
    sm: "h-9 w-9",
    md: "h-[58px] w-[58px]",
    lg: "h-[92px] w-[92px]",
  }[size];

  return (
    <span
      className={cn(
        "lbn-phone-avatar inline-flex shrink-0 items-center justify-center rounded-full",
        sizeClassName,
      )}
      aria-label={name}
    >
      {photoUrl ? (
        <span
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${photoUrl})` }}
          aria-hidden
        />
      ) : (
        <>
          <span className="lbn-phone-avatar-head" />
          <span className="lbn-phone-avatar-body" />
        </>
      )}
    </span>
  );
}
