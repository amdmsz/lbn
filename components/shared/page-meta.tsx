import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageMeta({
  primary,
  secondary,
  className,
}: Readonly<{
  primary?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}>) {
  if (!primary && !secondary) {
    return null;
  }

  return (
    <div className={cn("crm-page-meta", className)}>
      {primary ? (
        <div className="crm-page-meta-main">
          <div className="crm-toolbar-cluster">{primary}</div>
        </div>
      ) : (
        <div className="crm-page-meta-main" />
      )}
      {secondary ? (
        <div className="crm-page-meta-side text-sm leading-6 text-black/54 lg:text-right">
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
