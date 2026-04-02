import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ActionBar({
  title,
  description,
  children,
  className,
  eyebrow = "快捷操作",
}: Readonly<{
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
}>) {
  return (
    <section className={cn("crm-subtle-panel space-y-3.5", className)}>
      {title || description ? (
        <div className="crm-section-heading">
          {title ? <p className="crm-eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="crm-section-title">{title}</h2> : null}
          {description ? <p className="crm-section-copy">{description}</p> : null}
        </div>
      ) : null}
      <div className="crm-toolbar-cluster">{children}</div>
    </section>
  );
}
