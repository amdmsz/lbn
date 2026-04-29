"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
type TimePresetKey = "today" | "last7" | "last30" | "thisMonth";

function getDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function getTodayRange() {
  const value = getDateInputValue(new Date());
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
  }
}

function formatDateText(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}`;
}

function formatRangeLabel(from: string, to: string) {
  if (from && to) return `${formatDateText(from)} - ${formatDateText(to)}`;
  if (from) return `${formatDateText(from)} 起`;
  if (to) return `至 ${formatDateText(to)}`;
  return "";
}

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

function formatDatePickerValue(value: string) {
  const date = parseDateInputValue(value);

  if (!date) {
    return "选择日期";
  }

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}/${String(date.getDate()).padStart(2, "0")}`;
}

function buildCalendarDates(viewMonth: Date) {
  const monthStart = getMonthStart(viewMonth);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function isSameCalendarMonth(date: Date, month: Date) {
  return (
    date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth()
  );
}

function sortByCountDesc<T extends { count: number; label?: string; name?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    const leftLabel = left.label ?? left.name ?? "";
    const rightLabel = right.label ?? right.name ?? "";
    return leftLabel.localeCompare(rightLabel, "zh-CN");
  });
}

const filterInputClassName =
  "h-10 w-full rounded-xl border border-border/60 bg-background text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary";

const filterScrollAreaClassName =
  "space-y-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

function FilterChip({
  label,
  onClear,
}: Readonly<{
  label: string;
  onClear?: () => void;
}>) {
  return (
    <span className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-xs font-medium text-muted-foreground">
      <span className="truncate">{label}</span>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition hover:bg-muted hover:text-foreground"
          aria-label={`移除筛选 ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
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
        "flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
        selected
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/60 bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        {subtitle ? (
          <span
            className={cn(
              "mt-0.5 block text-xs",
              selected ? "text-primary/70" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {typeof trailing !== "undefined" ? (
          <span className="text-xs text-muted-foreground/70">{trailing}</span>
        ) : null}
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full border",
            selected
              ? "border-primary/30 bg-card text-primary"
              : "border-transparent text-transparent",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </span>
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
  options: Array<{ value: string; label: string }>;
  onChange: (nextValue: string) => void;
}>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(filterInputClassName, "appearance-none px-3 pr-8 font-medium")}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={`${label}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}

function ThemedDatePicker({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
}>) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseDateInputValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    getMonthStart(selectedDate ?? new Date()),
  );
  const today = useMemo(() => new Date(), []);
  const todayValue = getDateInputValue(today);
  const calendarDates = useMemo(
    () => buildCalendarDates(viewMonth),
    [viewMonth],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open && selectedDate) {
            setViewMonth(getMonthStart(selectedDate));
          }

          setOpen((current) => !current);
        }}
        className={cn(
          filterInputClassName,
          "flex h-12 items-center justify-between gap-3 px-3 text-left",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
          <span className="block truncate text-sm font-medium">
            {formatDatePickerValue(value)}
          </span>
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="crm-animate-pop absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-card p-3 text-foreground shadow-[0_18px_46px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((current) => shiftMonth(current, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              aria-label="上个月"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-foreground">
              {formatMonthLabel(viewMonth)}
            </p>
            <button
              type="button"
              onClick={() => setViewMonth((current) => shiftMonth(current, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              aria-label="下个月"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
            {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => (
              <span key={weekday} className="py-1">
                {weekday}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDates.map((date) => {
              const dateValue = getDateInputValue(date);
              const selected = value === dateValue;
              const currentMonth = isSameCalendarMonth(date, viewMonth);
              const isToday = dateValue === todayValue;

              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => {
                    onChange(dateValue);
                    setOpen(false);
                  }}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium outline-none transition",
                    selected
                      ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
                      : currentMonth
                        ? "text-foreground hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary"
                        : "text-muted-foreground/35 hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary",
                    isToday &&
                      !selected &&
                      "ring-1 ring-primary/30 text-primary",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-xs font-medium text-primary transition hover:text-primary/80"
            >
              清除
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(todayValue);
                setViewMonth(getMonthStart(today));
                setOpen(false);
              }}
              className="text-xs font-medium text-primary transition hover:text-primary/80"
            >
              今天
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterSection({
  title,
  children,
}: Readonly<{
  title: string;
  children: ReactNode;
}>) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
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
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
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
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const visibleProductOptions = useMemo(
    () =>
      sortByCountDesc(
        productOptions.filter((item) => {
          const keyword = productKeywordDraft.trim().toLowerCase();
          if (!keyword) return true;
          return item.label.toLowerCase().includes(keyword);
        }),
      ).slice(0, 10),
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
      ).slice(0, 10),
    [tagOptions, tagSearchDraft],
  );

  const selectedExecutionClass = useMemo(
    () =>
      customerExecutionClassOptions.find(
        (option) => option.value === (filters.executionClasses[0] ?? null),
      ) ?? null,
    [filters.executionClasses],
  );

  const timeFilterSummary = useMemo(
    () => formatRangeLabel(filters.assignedFrom, filters.assignedTo),
    [filters.assignedFrom, filters.assignedTo],
  );

  const activeProductLabels = useMemo(
    () =>
      productOptions
        .filter((item) => filters.productKeys.includes(item.key))
        .slice(0, 2)
        .map((item) => item.label),
    [filters.productKeys, productOptions],
  );

  const activeTagLabels = useMemo(
    () =>
      tagOptions
        .filter((item) => filters.tagIds.includes(item.id))
        .slice(0, 2)
        .map((item) => item.name),
    [filters.tagIds, tagOptions],
  );

  const selectedTeam = teamOptions.find((team) => team.id === filters.teamId) ?? null;
  const selectedSales = salesOptions.find((sales) => sales.id === filters.salesId) ?? null;
  const showTeamFilter = teamOptions.length > 0;
  const showSalesFilter = salesOptions.length > 0;
  const activeFilterCount = [
    Boolean(filters.search),
    Boolean(filters.assignedFrom || filters.assignedTo),
    filters.executionClasses.length > 0,
    filters.productKeys.length > 0 || Boolean(filters.productKeyword),
    filters.tagIds.length > 0,
    Boolean(filters.teamId),
    Boolean(filters.salesId),
  ].filter(Boolean).length;

  function isTimePresetSelected(preset: TimePresetKey) {
    const range = getPresetRange(preset);
    return filters.assignedFrom === range.from && filters.assignedTo === range.to;
  }

  const activeChips = [
    filters.search
      ? {
          key: "search",
          label: `搜索 ${filters.search}`,
          onClear: () => applyFilters({ search: "" }),
        }
      : null,
    timeFilterSummary
      ? {
          key: "time",
          label: `时间 ${timeFilterSummary}`,
          onClear: () => applyFilters({ assignedFrom: "", assignedTo: "" }),
        }
      : null,
    selectedExecutionClass
      ? {
          key: "execution-class",
          label: selectedExecutionClass.longLabel,
          onClear: () => applyFilters({ executionClasses: [] }),
        }
      : null,
    filters.productKeys.length > 0 || filters.productKeyword
      ? {
          key: "product",
          label:
            activeProductLabels.length > 0
              ? `商品 ${activeProductLabels.join(" / ")}`
              : `商品 ${filters.productKeyword}`,
          onClear: () => {
            setProductKeywordDraft("");
            applyFilters({ productKeys: [], productKeyword: "" });
          },
        }
      : null,
    filters.tagIds.length > 0
      ? {
          key: "tags",
          label:
            activeTagLabels.length > 0
              ? `标签 ${activeTagLabels.join(" / ")}`
              : `标签 ${filters.tagIds.length} 个`,
          onClear: () => applyFilters({ tagIds: [] }),
        }
      : null,
    selectedTeam
      ? {
          key: "team",
          label: `团队 ${selectedTeam.name}`,
          onClear: () => applyFilters({ teamId: "", salesId: "" }),
        }
      : null,
    selectedSales
      ? {
          key: "sales",
          label: `员工 ${selectedSales.name}`,
          onClear: () => applyFilters({ salesId: "" }),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>;

  function clearAllFilters() {
    setProductKeywordDraft("");
    setTagSearchDraft("");
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
    });
  }

  return (
    <div ref={rootRef} aria-busy={pending} className="relative">
      <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {activeChips.length > 0 ? (
              activeChips.map((chip) => (
                <FilterChip key={chip.key} label={chip.label} onClear={chip.onClear} />
              ))
            ) : (
              <FilterChip label="全部客户" />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex h-9 items-center rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                清空
              </button>
            ) : null}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold shadow-sm transition",
                open || activeFilterCount > 0
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/60 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              筛选
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="crm-animate-pop absolute right-0 top-full z-40 mt-2 w-[min(54rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 text-foreground shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
          <div className="grid gap-5 lg:grid-cols-2">
            <FilterSection title="分配时间">
              <div className="flex flex-wrap gap-2">
                {([
                  ["today", "今天"],
                  ["last7", "近 7 天"],
                  ["last30", "近 30 天"],
                  ["thisMonth", "本月"],
                ] as Array<[TimePresetKey, string]>).map(([preset, label]) => {
                  const selected = isTimePresetSelected(preset);

                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const range = getPresetRange(preset);
                        applyFilters({ assignedFrom: range.from, assignedTo: range.to });
                      }}
                      className={cn(
                        "h-8 rounded-full border px-3 text-xs font-medium transition",
                        selected
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/60 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ThemedDatePicker
                  label="开始"
                  value={filters.assignedFrom}
                  onChange={(nextValue) => applyFilters({ assignedFrom: nextValue })}
                />
                <ThemedDatePicker
                  label="结束"
                  value={filters.assignedTo}
                  onChange={(nextValue) => applyFilters({ assignedTo: nextValue })}
                />
              </div>
            </FilterSection>

            <FilterSection title="客户分类">
              <div className="grid gap-1">
                {customerExecutionClassOptions.map((option) => (
                  <OptionRow
                    key={option.value}
                    title={option.longLabel}
                    subtitle={option.description}
                    selected={filters.executionClasses.includes(option.value)}
                    onClick={() => {
                      applyFilters({
                        executionClasses: [option.value as CustomerExecutionClass],
                      });
                    }}
                  />
                ))}
              </div>
            </FilterSection>

            <FilterSection title="商品">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                  placeholder="筛选商品信号"
                  className={cn(filterInputClassName, "pl-9 pr-3")}
                />
              </div>
              <div className={cn(filterScrollAreaClassName, "max-h-72")}>
                {visibleProductOptions.length > 0 ? (
                  visibleProductOptions.map((option) => (
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
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">
                    暂无匹配商品
                  </p>
                )}
              </div>
            </FilterSection>

            <FilterSection title="标签 / 归属">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={tagSearchDraft}
                  onChange={(event) => setTagSearchDraft(event.target.value)}
                  placeholder="筛选标签"
                  className={cn(filterInputClassName, "pl-9 pr-3")}
                />
              </div>
              <div className={cn(filterScrollAreaClassName, "max-h-44")}>
                {visibleTagOptions.length > 0 ? (
                  visibleTagOptions.map((tag) => (
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
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">
                    暂无匹配标签
                  </p>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
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
            </FilterSection>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-4">
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              清空全部筛选
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90"
            >
              完成
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
