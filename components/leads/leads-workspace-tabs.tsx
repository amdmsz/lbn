import Link from "next/link";
import { cn } from "@/lib/utils";

export type LeadsWorkspaceTabValue =
  | "allocation"
  | "imports"
  | "templates";

const tabs: ReadonlyArray<{
  value: LeadsWorkspaceTabValue;
  label: string;
  href: string;
  description: string;
}> = [
  {
    value: "allocation",
    label: "分配中心",
    href: "/leads",
    description: "未分配/已分配回看",
  },
  {
    value: "imports",
    label: "导入批次",
    href: "/lead-imports",
    description: "批次质量与回看",
  },
  {
    value: "templates",
    label: "模板管理",
    href: "/lead-import-templates",
    description: "字段映射与版本",
  },
];

export function LeadsWorkspaceTabs({
  activeValue,
}: Readonly<{
  activeValue: LeadsWorkspaceTabValue;
}>) {
  return (
    <nav
      aria-label="线索工作族"
      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-shell-surface-soft)] p-1"
    >
      {tabs.map((tab) => {
        const active = tab.value === activeValue;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium transition-colors duration-150",
              active
                ? "border border-[var(--tone-info-soft-border)] bg-[var(--tone-info-soft-bg)] text-[var(--color-accent-strong)]"
                : "border border-transparent text-[var(--color-sidebar-muted)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
            )}
            title={tab.description}
          >
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
