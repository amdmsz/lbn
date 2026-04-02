import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DetailLayout({
  sidebar,
  main,
  className,
}: Readonly<{
  sidebar: ReactNode;
  main: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="space-y-4 xl:sticky xl:top-5 xl:self-start">{sidebar}</div>
      <div className="min-w-0 space-y-5">{main}</div>
    </div>
  );
}
