import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({
  header,
  summary,
  toolbar,
  stickyBar,
  sidebar,
  sidebarPosition = "right",
  layoutClassName,
  sidebarClassName,
  contentClassName,
  className,
  children,
}: Readonly<{
  header?: ReactNode;
  summary?: ReactNode;
  toolbar?: ReactNode;
  stickyBar?: ReactNode;
  sidebar?: ReactNode;
  sidebarPosition?: "left" | "right";
  layoutClassName?: string;
  sidebarClassName?: string;
  contentClassName?: string;
  className?: string;
  children: ReactNode;
}>) {
  const hasSidebar = Boolean(sidebar);

  return (
    <div className={cn("crm-page", className)}>
      {header}
      {summary}
      {toolbar}
      {stickyBar}
      <div
        className={cn(
          hasSidebar
            ? "grid gap-4 xl:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] 2xl:grid-cols-[minmax(0,1fr)_360px]"
            : "space-y-4",
          hasSidebar ? layoutClassName : null,
        )}
      >
        {hasSidebar && sidebarPosition === "left" ? (
          <aside
            className={cn(
              "space-y-4 xl:self-start 2xl:sticky 2xl:top-[var(--crm-sticky-top)]",
              sidebarClassName,
            )}
          >
            {sidebar}
          </aside>
        ) : null}
        <div className={cn("min-w-0 space-y-4 md:space-y-5", contentClassName)}>{children}</div>
        {hasSidebar && sidebarPosition === "right" ? (
          <aside
            className={cn(
              "space-y-4 xl:self-start 2xl:sticky 2xl:top-[var(--crm-sticky-top)]",
              sidebarClassName,
            )}
          >
            {sidebar}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
