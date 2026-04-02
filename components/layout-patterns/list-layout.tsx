import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ListLayout({
  filterBar,
  commandBar,
  table,
  pagination,
  className,
}: Readonly<{
  filterBar?: ReactNode;
  commandBar?: ReactNode;
  table: ReactNode;
  pagination?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn("space-y-4", className)}>
      {filterBar ? (
        <div className="crm-card border border-black/7 bg-white/94 p-4 shadow-[0_14px_28px_rgba(18,24,31,0.04)]">
          {filterBar}
        </div>
      ) : null}

      <div className="crm-card overflow-hidden border border-black/7 bg-white/95 shadow-[0_16px_36px_rgba(18,24,31,0.05)]">
        {commandBar ? (
          <div className="border-b border-black/7 bg-[linear-gradient(180deg,rgba(248,249,251,0.9),rgba(255,255,255,0.78))] px-4 py-4 md:px-5">
            {commandBar}
          </div>
        ) : null}
        <div className="min-w-0">{table}</div>
        {pagination ? <div className="border-t border-black/7 px-4 py-4 md:px-5">{pagination}</div> : null}
      </div>
    </div>
  );
}
