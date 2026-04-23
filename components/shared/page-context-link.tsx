import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageContextLink({
  href,
  label,
  trail,
  className,
}: Readonly<{
  href: string;
  label: string;
  trail?: string[];
  className?: string;
}>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>
      <Link
        href={href}
        className="crm-button crm-button-secondary inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>{label}</span>
      </Link>
      {trail?.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-sidebar-muted)]">
          {trail.map((item, index) => (
            <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5">
              {index > 0 ? <span className="text-[var(--color-border)]">/</span> : null}
              <span>{item}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
