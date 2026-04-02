import type { ReactNode } from "react";
import { PageShell } from "@/components/shared/page-shell";

export function WorkbenchLayout({
  header,
  summary,
  toolbar,
  stickyBar,
  sidebar,
  sidebarPosition,
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
  sidebarClassName?: string;
  contentClassName?: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <PageShell
      header={header}
      summary={summary}
      toolbar={toolbar}
      stickyBar={stickyBar}
      sidebar={sidebar}
      sidebarPosition={sidebarPosition}
      sidebarClassName={sidebarClassName}
      contentClassName={contentClassName}
      className={className}
    >
      {children}
    </PageShell>
  );
}
