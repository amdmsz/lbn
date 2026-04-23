"use client";

import { CalendarRange, Check, ChevronDown, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { FiltersPanel } from "@/components/shared/filters-panel";
import {
  customerExecutionClassOptions,
  type CustomerExecutionClass,
} from "@/lib/customers/metadata";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type CustomerFilters = CustomerCenterData["filters"];
type ProductOption = CustomerCenterData["productOptions"][number];
type TagOption = CustomerCenterData["tagOptions"][number];
type TeamOption = CustomerCenterData["teamOverview"][number];
type SalesOption = CustomerCenterData["salesBoard"][number];
type FilterPanelKey = "time" | "executionClass" | "product" | "tag" | null;
type TimePresetKey = "today" | "last7" | "last30" | "thisMonth";

function getDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function getTodayRange() {
  const today = new Date();
  const value = getDateInputValue(today);
  return { from: value, to: value };
}

function getRelativeRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  return {
    from: getDateInputValue(start),
    to: getDateInputValue(end),
  };
}

function getThisMonthRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: getDateInputValue(start),
    to: getDateInputValue(today),
  };
}

function getPresetRange(preset: TimePresetKey) {
  switch (preset) {
    case "today":
      return getTodayRange();
    case "last7":
      return getRelativeRange(7);
    case "last30":
      return getRelativeRange(30);
    case "thisMonth":
      return getThisMonthRange();
    default:
      return { from: "", to: "" };
  }
}

function formatDateText(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${month}/${day}`;
}

function formatRangeLabel(from: string, to: string) {
  if (from && to) {
    return `${formatDateText(from)} - ${formatDateText(to)}`;
  }
  if (from) {
    return `${formatDateText(from)} 起`;
  }
  if (to) {
    return `至 ${formatDateText(to)}`;
  }
  return "";
}

function buildTimeFilterSummary(input: {
  assignedFrom: string;
  assignedTo: string;
}) {
  return formatRangeLabel(input.assignedFrom, input.assignedTo);
}

function sortByCountDesc<T extends { count: number; label?: string; name?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    const leftLabel = left.label ?? left.name ?? "";
    const rightLabel = right.label ?? right.name ?? "";
    return leftLabel.localeCompare(rightLabel, "zh-CN");
  });
}

const panelActionButtonClassName =
  "crm-button crm-button-secondary inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium motion-safe:hover:-translate-y-[1px]";

const panelInlineInputClassName =
  "crm-input h-9 rounded-[11px] border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 text-[13px] shadow-none outline-none transition focus:ring-0";

const panelPresetButtonClassName =
  "rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-1.5 text-[12px] text-[var(--crm-badge-neutral-text)] transition-[border-color,background-color,color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] hover:shadow-[var(--color-shell-shadow-sm)]";

function FilterButton({
  label,
  value,
  icon,
  active,
  open,
  onClick,
}: Readonly<{
  label: string;
  value?: string;
  icon?: ReactNode;
  active?: boolean;
  open?: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-[12px] border px-3 text-[13px] transition-[border-color,background-color,color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px]",
        active || open
          ? "border-[var(--color-accent-soft)] bg-[var(--color-shell-hover)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
          : "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--crm-badge-neutral-text)] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
      )}
    >
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        {icon}
        <span className="truncate font-medium">{label}</span>
        {value ? (
          <span className="hidden truncate text-[12px] text-[var(--color-sidebar-muted)] lg:inline">
            {value}
          </span>
        ) : null}
      </span>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-[var(--color-sidebar-muted)] transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
  );
}

function InlineSelectControl({
  label,
  value,
  placeholder,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  placeholder: string;
  options: Array<{
    value: string;
    label: string;
  }>;
  onChange: (nextValue: string) => void;
}>) {
  return (
    <label className="group flex h-9 min-w-0 items-center gap-2 rounded-[12px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 transition-[border-color,background-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-sm)] focus-within:border-[var(--color-accent-soft)] focus-within:bg-[var(--color-shell-hover)] focus-within:shadow-[var(--color-shell-shadow-sm)]">
      <span className="shrink-0 text-[12px] font-medium text-[var(--color-sidebar-muted)]">
        {label}
      </span>
      <div className="relative min-w-0 flex-1">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="crm-select h-full w-full appearance-none border-0 bg-transparent px-0 pr-4 text-[13px] text-[var(--foreground)] shadow-none outline-none focus:ring-0"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={`${label}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-sidebar-muted)]" />
      </div>
    </label>
  );
}

function FilterPanel({
  open,
  align = "left",
  widthClassName,
  children,
}: Readonly<{
  open: boolean;
  align?: "left" | "right";
  widthClassName?: string;
  children: ReactNode;
}>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "crm-animate-pop absolute top-full z-30 mt-2 rounded-[16px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-strong)] p-3 shadow-[var(--color-shell-shadow-lg)] backdrop-blur-[18px]",
        "max-w-[calc(100vw-1.5rem)]",
        align === "right" ? "right-0" : "left-0",
        widthClassName ?? "w-[min(18rem,calc(100vw-1.5rem))]",
      )}
    >
      {children}
    </div>
  );
}

function OptionRow({
  title,
  subtitle,
  trailing,
  selected,
  onClick,
}: Readonly<{
  title: string;
  subtitle?: string;
  trailing?: string | number;
  selected: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[40px] w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-left text-[13px] transition-[border-color,background-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px]",
        selected
          ? "border-[var(--color-accent-soft)] bg-[var(--color-accent)]/8 shadow-[var(--color-shell-shadow-sm)]"
          : "border-transparent hover:border-[var(--color-border-soft)] hover:bg-[var(--color-shell-surface-soft)]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-[var(--foreground)]">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-[var(--color-sidebar-muted)]">{subtitle}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {typeof trailing !== "undefined" ? (
          <span className="text-xs text-[var(--color-sidebar-muted)]">{trailing}</span>
        ) : null}
        <span
          className={cn(
            "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border",
            selected
              ? "border-[var(--color-accent)]/18 bg-[var(--color-accent)]/8 text-[var(--color-accent)]"
              : "border-transparent text-transparent",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}

function TimeFilterSection({
  title,
  description,
  from,
  to,
  onApplyPreset,
  onChange,
  onClear,
}: Readonly<{
  title: string;
  description: string;
  from: string;
  to: string;
  onApplyPreset: (preset: TimePresetKey) => void;
  onChange: (nextValue: { from: string; to: string }) => void;
  onClear: () => void;
}>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-[var(--foreground)]">{title}</p>
        <p className="text-xs leading-5 text-[var(--color-sidebar-muted)]">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["today", "今天"],
          ["last7", "近 7 天"],
          ["last30", "近 30 天"],
          ["thisMonth", "本月"],
        ] as Array<[TimePresetKey, string]>).map(([preset, label]) => (
          <button
            key={`${title}-${preset}`}
            type="button"
            onClick={() => onApplyPreset(preset)}
            className={panelPresetButtonClassName}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        <input
          type="date"
          value={from}
          onChange={(event) =>
            onChange({
              from: event.target.value,
              to,
            })
          }
          className={panelInlineInputClassName}
        />
        <input
          type="date"
          value={to}
          onChange={(event) =>
            onChange({
              from,
              to: event.target.value,
            })
          }
          className={panelInlineInputClassName}
        />
      </div>

      <button
        type="button"
        onClick={onClear}
        className="text-xs text-[var(--color-sidebar-muted)] transition hover:text-[var(--foreground)]"
      >
        清空 {title}
      </button>
    </div>
  );
}

export function CustomerFilterToolbar({
  filters,
  productOptions,
  tagOptions,
  teamOptions = [],
  salesOptions = [],
}: Readonly<{
  filters: CustomerFilters;
  productOptions: ProductOption[];
  tagOptions: TagOption[];
  teamOptions?: TeamOption[];
  salesOptions?: SalesOption[];
}>) {
  const pathname = usePathname() || "/customers";
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const queuedSearchRef = useRef<string | null>(null);
  const latestSearchIntentRef = useRef(filters.search);
  const [pending, startTransition] = useTransition();
  const [openPanel, setOpenPanel] = useState<FilterPanelKey>(null);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [searchComposing, setSearchComposing] = useState(false);
  const [productKeywordDraft, setProductKeywordDraft] = useState(filters.productKeyword);
  const [tagSearchDraft, setTagSearchDraft] = useState("");

  const applyFilters = useCallback(
    (overrides: Partial<CustomerFilters>) => {
      const nextFilters: CustomerFilters = {
        ...filters,
        ...overrides,
        page: typeof overrides.page === "number" ? overrides.page : 1,
      };

      startTransition(() => {
        router.replace(buildCustomersHref(nextFilters, {}, pathname), { scroll: false });
      });
    },
    [filters, pathname, router, startTransition],
  );

  useEffect(() => {
    const serverSearch = filters.search;
    const hasQueuedSearch =
      queuedSearchRef.current !== null && queuedSearchRef.current !== serverSearch;
    const hasNewerSearchIntent = latestSearchIntentRef.current !== serverSearch;

    if (searchComposing || hasQueuedSearch || (pending && hasNewerSearchIntent)) {
      return;
    }

    latestSearchIntentRef.current = serverSearch;

    const syncTimer = window.setTimeout(() => {
      setSearchDraft(serverSearch);
    }, 0);

    return () => {
      window.clearTimeout(syncTimer);
    };
  }, [filters.search, pending, searchComposing]);

  const submitSearch = useCallback(
    (rawValue: string) => {
      const nextSearch = rawValue.trim();
      latestSearchIntentRef.current = nextSearch;

      if (pending) {
        queuedSearchRef.current = nextSearch;
        return;
      }

      queuedSearchRef.current = null;

      if (nextSearch === filters.search) {
        return;
      }

      applyFilters({ search: nextSearch });
    },
    [applyFilters, filters.search, pending],
  );

  useEffect(() => {
    if (searchComposing) {
      return undefined;
    }

    const nextSearch = searchDraft.trim();
    if (nextSearch === latestSearchIntentRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      submitSearch(searchDraft);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchComposing, searchDraft, submitSearch]);

  useEffect(() => {
    if (pending) {
      return;
    }

    const queuedSearch = queuedSearchRef.current;
    if (queuedSearch === null) {
      return;
    }

    queuedSearchRef.current = null;

    if (queuedSearch === filters.search) {
      return;
    }

    applyFilters({ search: queuedSearch });
  }, [applyFilters, filters.search, pending]);

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPanel(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPanel(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  const showTeamFilter = teamOptions.length > 0;
  const showSalesFilter = salesOptions.length > 0;
  const inlineControlCount = 4 + (showTeamFilter ? 1 : 0) + (showSalesFilter ? 1 : 0);
  const wideGridClassName =
    inlineControlCount >= 6
      ? "xl:grid-cols-[minmax(320px,1.65fr)_repeat(6,minmax(0,0.92fr))]"
      : inlineControlCount === 5
        ? "xl:grid-cols-[minmax(320px,1.7fr)_repeat(5,minmax(0,1fr))]"
        : "xl:grid-cols-[minmax(320px,1.75fr)_repeat(4,minmax(0,1fr))]";

  const visibleProductOptions = useMemo(
    () =>
      sortByCountDesc(
        productOptions.filter((item) => {
          const keyword = productKeywordDraft.trim().toLowerCase();
          if (!keyword) return true;
          return item.label.toLowerCase().includes(keyword);
        }),
      ),
    [productKeywordDraft, productOptions],
  );

  const visibleTagOptions = useMemo(
    () =>
      sortByCountDesc(
        tagOptions.filter((item) => {
          const keyword = tagSearchDraft.trim().toLowerCase();
          if (!keyword) return true;
          return (
            item.name.toLowerCase().includes(keyword) ||
            item.label.toLowerCase().includes(keyword) ||
            item.code.toLowerCase().includes(keyword)
          );
        }),
      ),
    [tagOptions, tagSearchDraft],
  );

  const activeFilterCount = [
    Boolean(filters.search),
    Boolean(filters.assignedFrom || filters.assignedTo),
    filters.executionClasses.length > 0,
    filters.productKeys.length > 0 || Boolean(filters.productKeyword),
    filters.tagIds.length > 0,
    Boolean(filters.teamId),
    Boolean(filters.salesId),
  ].filter(Boolean).length;

  const timeFilterSummary = useMemo(
    () =>
      buildTimeFilterSummary({
        assignedFrom: filters.assignedFrom,
        assignedTo: filters.assignedTo,
      }),
    [filters.assignedFrom, filters.assignedTo],
  );

  const activeTagLabels = useMemo(
    () =>
      tagOptions
        .filter((item) => filters.tagIds.includes(item.id))
        .slice(0, 2)
        .map((item) => item.name),
    [filters.tagIds, tagOptions],
  );

  const activeProductLabels = useMemo(
    () =>
      productOptions
        .filter((item) => filters.productKeys.includes(item.key))
        .slice(0, 2)
        .map((item) => item.label),
    [filters.productKeys, productOptions],
  );

  const selectedExecutionClass = useMemo(
    () =>
      customerExecutionClassOptions.find(
        (option) => option.value === (filters.executionClasses[0] ?? null),
      ) ?? null,
    [filters.executionClasses],
  );

  const searchPending = pending && searchDraft.trim() !== filters.search;

  return (
    <div ref={rootRef} aria-busy={pending} className="relative overflow-visible">
      <FiltersPanel
        title="客户筛选"
        headerMode="hidden"
        className={cn(
          "rounded-[0.95rem] border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)]",
          pending && "opacity-90",
        )}
      >
        <div className="space-y-2.5">
          <div className={cn("grid gap-2", wideGridClassName)}>
            <div className="xl:col-span-1">
              <form
                role="search"
                aria-busy={searchPending}
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch(searchDraft);
                }}
                className={cn(
                  "flex min-h-9 items-center gap-2 rounded-[13px] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px]",
                  searchPending && "border-[var(--color-accent-soft)] shadow-[var(--color-shell-shadow-md)]",
                )}
              >
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-sidebar-muted)]" />
                  <input
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    onCompositionStart={() => setSearchComposing(true)}
                    onCompositionEnd={(event) => {
                      const nextValue = event.currentTarget.value;
                      setSearchComposing(false);
                      setSearchDraft(nextValue);
                      submitSearch(nextValue);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitSearch(searchDraft);
                      }
                    }}
                    placeholder="搜索客户 / 手机号 / 商品 / 备注"
                    className="h-9 w-full border-0 bg-transparent pl-8 pr-7 text-[13px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--color-sidebar-muted)] focus:ring-0 sm:text-sm"
                  />
                  {searchDraft ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchDraft("");
                        submitSearch("");
                      }}
                      className="absolute right-0 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-sidebar-muted)] transition hover:bg-[var(--color-shell-active)] hover:text-[var(--foreground)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {searchPending ? (
                    <span className="hidden text-[11px] font-medium text-[var(--color-sidebar-muted)] sm:inline">
                      搜索中
                    </span>
                  ) : null}
                  <button
                    type="submit"
                    className={cn(
                      "inline-flex h-8 items-center rounded-[10px] border px-3 text-[12px] font-medium transition-[border-color,background-color,color] duration-150",
                      searchPending
                        ? "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)]"
                        : "border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--crm-badge-neutral-text)] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
                    )}
                  >
                    搜索
                  </button>
                </div>
              </form>
            </div>

            <div className="relative">
              <FilterButton
                label="分配时间"
                icon={<CalendarRange className="h-3.5 w-3.5 shrink-0 text-[var(--color-sidebar-muted)]" />}
                value={timeFilterSummary}
                active={Boolean(filters.assignedFrom || filters.assignedTo)}
                open={openPanel === "time"}
                onClick={() => setOpenPanel((current) => (current === "time" ? null : "time"))}
              />
              <FilterPanel open={openPanel === "time"} widthClassName="w-[18rem]">
                <div className="space-y-4">
                  <TimeFilterSection
                    title="分配时间"
                    description="统一按分配时间查看当前客户池。"
                    from={filters.assignedFrom}
                    to={filters.assignedTo}
                    onApplyPreset={(preset) => {
                      const range = getPresetRange(preset);
                      applyFilters({
                        assignedFrom: range.from,
                        assignedTo: range.to,
                      });
                    }}
                    onChange={(nextValue) =>
                      applyFilters({
                        assignedFrom: nextValue.from,
                        assignedTo: nextValue.to,
                      })
                    }
                    onClear={() => applyFilters({ assignedFrom: "", assignedTo: "" })}
                  />

                  <div className="flex items-center justify-end border-t border-[var(--color-border-soft)] pt-3">
                    <button
                      type="button"
                      onClick={() => setOpenPanel(null)}
                      className={panelActionButtonClassName}
                    >
                      完成
                    </button>
                  </div>
                </div>
              </FilterPanel>
            </div>

            <div className="relative">
              <FilterButton
                label="客户分类"
                value={selectedExecutionClass?.longLabel}
                active={filters.executionClasses.length > 0}
                open={openPanel === "executionClass"}
                onClick={() =>
                  setOpenPanel((current) =>
                    current === "executionClass" ? null : "executionClass",
                  )
                }
              />
              <FilterPanel open={openPanel === "executionClass"} widthClassName="w-[18rem]">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-[13px] font-semibold text-[var(--foreground)]">客户分类</p>
                    <p className="text-xs leading-5 text-[var(--color-sidebar-muted)]">
                      统一以 ABCDE 作为当前客户经营分类。
                    </p>
                  </div>

                  <div className="space-y-1">
                    {customerExecutionClassOptions.map((option) => (
                      <OptionRow
                        key={option.value}
                        title={option.longLabel}
                        subtitle={option.description}
                        selected={filters.executionClasses.includes(option.value)}
                        onClick={() => {
                          applyFilters({ executionClasses: [option.value as CustomerExecutionClass] });
                          setOpenPanel(null);
                        }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        applyFilters({ executionClasses: [] });
                        setOpenPanel(null);
                      }}
                      className="text-xs text-[var(--color-sidebar-muted)] transition hover:text-[var(--foreground)]"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenPanel(null)}
                      className={panelActionButtonClassName}
                    >
                      完成
                    </button>
                  </div>
                </div>
              </FilterPanel>
            </div>

            <div className="relative">
              <FilterButton
                label="商品"
                value={
                  activeProductLabels.length > 0
                    ? activeProductLabels.join(" / ")
                    : filters.productKeyword || ""
                }
                active={Boolean(filters.productKeys.length || filters.productKeyword)}
                open={openPanel === "product"}
                onClick={() =>
                  setOpenPanel((current) => (current === "product" ? null : "product"))
                }
              />
              <FilterPanel
                open={openPanel === "product"}
                align="right"
                widthClassName="w-[21rem]"
              >
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">商品筛选</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-sidebar-muted)]" />
                    <input
                      value={productKeywordDraft}
                      onChange={(event) => setProductKeywordDraft(event.target.value)}
                      onBlur={() => applyFilters({ productKeyword: productKeywordDraft.trim() })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyFilters({ productKeyword: productKeywordDraft.trim() });
                        }
                      }}
                      placeholder="搜索商品"
                      className={`${panelInlineInputClassName} pl-8 pr-3 placeholder:text-[var(--color-sidebar-muted)]`}
                    />
                  </div>

                  <div className="max-h-[20rem] space-y-1 overflow-y-auto pr-1">
                    {visibleProductOptions.length > 0 ? (
                      visibleProductOptions.slice(0, 10).map((option) => (
                        <OptionRow
                          key={option.key}
                          title={option.label}
                          subtitle={option.source === "purchased" ? "已购商品" : "导入意向"}
                          trailing={option.count}
                          selected={filters.productKeys.includes(option.key)}
                          onClick={() => {
                            const nextKeys = filters.productKeys.includes(option.key)
                              ? filters.productKeys.filter((item) => item !== option.key)
                              : [...filters.productKeys, option.key];
                            applyFilters({ productKeys: nextKeys });
                          }}
                        />
                      ))
                    ) : (
                      <p className="px-1 text-xs leading-5 text-[var(--color-sidebar-muted)]">暂无匹配项</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setProductKeywordDraft("");
                        applyFilters({ productKeys: [], productKeyword: "" });
                      }}
                      className="text-xs text-[var(--color-sidebar-muted)] transition hover:text-[var(--foreground)]"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenPanel(null)}
                      className={panelActionButtonClassName}
                    >
                      完成
                    </button>
                  </div>
                </div>
              </FilterPanel>
            </div>

            <div className="relative">
              <FilterButton
                label="标签"
                value={activeTagLabels.length > 0 ? activeTagLabels.join(" / ") : ""}
                active={filters.tagIds.length > 0}
                open={openPanel === "tag"}
                onClick={() => setOpenPanel((current) => (current === "tag" ? null : "tag"))}
              />
              <FilterPanel
                open={openPanel === "tag"}
                align="right"
                widthClassName="w-[21rem]"
              >
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">标签筛选</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-sidebar-muted)]" />
                    <input
                      value={tagSearchDraft}
                      onChange={(event) => setTagSearchDraft(event.target.value)}
                      placeholder="搜索标签"
                      className={`${panelInlineInputClassName} pl-8 pr-3 placeholder:text-[var(--color-sidebar-muted)]`}
                    />
                  </div>

                  <div className="max-h-[20rem] space-y-1 overflow-y-auto pr-1">
                    {visibleTagOptions.length > 0 ? (
                      visibleTagOptions.slice(0, 10).map((tag) => (
                        <OptionRow
                          key={tag.id}
                          title={tag.name}
                          subtitle={tag.label}
                          trailing={tag.count}
                          selected={filters.tagIds.includes(tag.id)}
                          onClick={() => {
                            const nextTagIds = filters.tagIds.includes(tag.id)
                              ? filters.tagIds.filter((item) => item !== tag.id)
                              : [...filters.tagIds, tag.id];
                            applyFilters({ tagIds: nextTagIds });
                          }}
                        />
                      ))
                    ) : (
                      <p className="px-1 text-xs leading-5 text-[var(--color-sidebar-muted)]">暂无匹配项</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-3">
                    <button
                      type="button"
                      onClick={() => applyFilters({ tagIds: [] })}
                      className="text-xs text-[var(--color-sidebar-muted)] transition hover:text-[var(--foreground)]"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenPanel(null)}
                      className={panelActionButtonClassName}
                    >
                      完成
                    </button>
                  </div>
                </div>
              </FilterPanel>
            </div>

            {showTeamFilter ? (
              <InlineSelectControl
                label="团队"
                value={filters.teamId}
                placeholder="全部团队"
                options={teamOptions.map((team) => ({
                  value: team.id,
                  label: team.name,
                }))}
                onChange={(nextValue) => applyFilters({ teamId: nextValue, salesId: "" })}
              />
            ) : null}

            {showSalesFilter ? (
              <InlineSelectControl
                label="员工"
                value={filters.salesId}
                placeholder="全部员工"
                options={salesOptions.map((sales) => ({
                  value: sales.id,
                  label: sales.name,
                }))}
                onChange={(nextValue) => applyFilters({ salesId: nextValue })}
              />
            ) : null}
          </div>

          {activeFilterCount > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border-soft)] pt-2">
              <p className="text-[12px] text-[var(--color-sidebar-muted)]">
                当前已启用 {activeFilterCount} 项筛选
              </p>
              <button
                type="button"
                onClick={() =>
                  applyFilters({
                    executionClasses: [],
                    search: "",
                    productKeys: [],
                    productKeyword: "",
                    tagIds: [],
                    assignedFrom: "",
                    assignedTo: "",
                    teamId: "",
                    salesId: "",
                  })
                }
                className="inline-flex h-8 items-center self-start rounded-full border border-[var(--color-border-soft)] bg-transparent px-3 text-[12px] text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color,transform] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] sm:self-auto"
              >
                清空筛选
              </button>
            </div>
          ) : null}
        </div>
      </FiltersPanel>
    </div>
  );
}
