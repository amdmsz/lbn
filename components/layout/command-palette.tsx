"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Command, CornerDownLeft, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { NavigationGroup, NavigationItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function flattenNavigationItems(groups: NavigationGroup[]) {
  const seen = new Set<string>();
  const items: NavigationItem[] = [];

  for (const group of groups) {
    for (const section of group.sections) {
      for (const item of section.items) {
        if (seen.has(item.href)) {
          continue;
        }

        seen.add(item.href);
        items.push(item);
      }
    }
  }

  return items;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function getCustomerSearchHref(query: string) {
  const params = new URLSearchParams();
  params.set("search", query);
  return `/customers?${params.toString()}`;
}

export function CommandPalette({
  groups,
  className,
}: Readonly<{
  groups: NavigationGroup[];
  className?: string;
}>) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const navigationItems = useMemo(() => flattenNavigationItems(groups), [groups]);
  const normalizedQuery = normalizeSearchText(query);
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return navigationItems.slice(0, 7);
    }

    return navigationItems
      .filter((item) => {
        const haystack = `${item.title} ${item.description} ${item.href}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 7);
  }, [navigationItems, normalizedQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(timer);
  }, [open]);

  function closePalette() {
    setOpen(false);
    setQuery("");
  }

  function navigateTo(href: string) {
    closePalette();
    router.push(href);
  }

  function submitCustomerSearch() {
    const nextQuery = query.trim();
    if (!nextQuery) {
      const firstItem = filteredItems[0];
      if (firstItem) {
        navigateTo(firstItem.href);
      }
      return;
    }

    navigateTo(getCustomerSearchHref(nextQuery));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "crm-motion-pill flex h-10 w-full min-w-0 items-center gap-2 rounded-full border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface)] px-3 text-left text-[12px] text-[var(--color-sidebar-muted)] shadow-[var(--color-shell-shadow-xs)] transition-[border-color,background-color,box-shadow]",
          "hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] hover:shadow-[var(--color-shell-shadow-sm)]",
          className,
        )}
        aria-label="打开命令搜索"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">搜索客户或跳转模块</span>
        <span className="hidden shrink-0 items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-sidebar-muted)] xl:inline-flex">
          <Command className="h-3 w-3" />
          K
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] px-3 py-16 sm:px-6">
          <button
            type="button"
            aria-label="关闭命令搜索"
            onClick={closePalette}
            className="absolute inset-0 bg-[rgba(15,23,42,0.22)] backdrop-blur-[6px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="命令搜索"
            className="crm-animate-pop relative mx-auto w-full max-w-2xl overflow-hidden rounded-[1.2rem] border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface-strong)] shadow-[var(--color-shell-shadow-lg)] backdrop-blur-[20px]"
          >
            <div className="flex items-center gap-3 border-b border-[var(--color-border-soft)] px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-[var(--color-sidebar-muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitCustomerSearch();
                  }
                }}
                placeholder="输入客户、手机号、模块或业务入口"
                className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--color-sidebar-muted)] focus:ring-0"
              />
              <button
                type="button"
                aria-label="关闭"
                onClick={closePalette}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-sidebar-muted)] transition hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[min(31rem,calc(100vh-11rem))] overflow-y-auto p-2">
              {query.trim() ? (
                <button
                  type="button"
                  onClick={submitCustomerSearch}
                  className="group flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-3 text-left transition hover:bg-[var(--color-shell-hover)]"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
                    <Search className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                      在客户中心搜索「{query.trim()}」
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--color-sidebar-muted)]">
                      按客户、手机号、商品信号和备注筛选
                    </span>
                  </span>
                  <CornerDownLeft className="h-4 w-4 text-[var(--color-sidebar-muted)] transition group-hover:text-[var(--foreground)]" />
                </button>
              ) : null}

              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                {query.trim() ? "匹配模块" : "常用入口"}
              </div>

              <div className="space-y-1">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => navigateTo(item.href)}
                      className="group flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-3 text-left transition hover:bg-[var(--color-shell-hover)]"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)] transition group-hover:border-[var(--color-accent-soft)] group-hover:text-[var(--color-accent-strong)]">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--color-sidebar-muted)]">
                          {item.description}
                        </span>
                      </span>
                      <span className="hidden rounded-full border border-[var(--color-border-soft)] px-2 py-0.5 text-[10px] text-[var(--color-sidebar-muted)] sm:inline">
                        {item.href}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[0.95rem] px-3 py-6 text-center text-sm text-[var(--color-sidebar-muted)]">
                    没有匹配的模块入口
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
