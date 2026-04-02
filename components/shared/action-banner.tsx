import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BannerTone = "success" | "danger";

export function ActionBanner({
  tone,
  children,
  className,
  density = "compact",
}: Readonly<{
  tone: BannerTone;
  children: ReactNode;
  className?: string;
  density?: "default" | "compact";
}>) {
  return (
    <div
      className={cn(
        "crm-banner",
        density === "compact" ? "text-[13px]" : "",
        tone === "success" ? "crm-banner-success" : "crm-banner-danger",
        className,
      )}
    >
      {children}
    </div>
  );
}
