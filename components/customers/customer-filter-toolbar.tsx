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
  customerWorkStatusOptions,
  type CustomerWorkStatusKey,
} from "@/lib/customers/metadata";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type CustomerFilters = CustomerCenterData["filters"];
type QueueCounts = CustomerCenterData["queueCounts"];
type ProductOption = CustomerCenterData["productOptions"][number];
type TagOption = CustomerCenterData["tagOptions"][number];
type TeamOption = CustomerCenterData["teamOverview"][number];
type SalesOption = CustomerCenterData["salesBoard"][number];
type FilterPanelKey = "time" | "product" | "tag" | null;
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
  importedFrom: string;
  importedTo: string;
  assignedFrom: string;
  assignedTo: string;
}) {
  const summaryParts = [
    input.importedFrom || input.importedTo
      ? `导入 ${formatRangeLabel(input.importedFrom, input.importedTo)}`
      : "",
    input.assignedFrom || input.assignedTo
      ? `分配 ${formatRangeLabel(input.assignedFrom, input.assignedTo)}`
      : "",
  ].filter(Boolean);

  return summaryParts.join(" · ");
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
        "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-[14px] border px-3 text-[13px] transition-[border-color,background-color,color,box-shadow] duration-150",
        active || open
          ? "border-black/12 bg-white text-black/84 shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
          : "border-black/8 bg-[rgba(248,250,252,0.84)] text-black/64 hover:border-black/12 hover:bg-white hover:text-black/82",
      )}
    >
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        {icon}
        <span className="truncate font-medium">{label}</span>
        {value ? (
          <span className="hidden truncate text-[12px] text-black/48 lg:inline">
            {value}
          </span>
        ) : null}
      </span>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-black/38 transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
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
        "absolute top-full z-30 mt-2 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur-[12px] ring-1 ring-black/[0.02]",
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
        "flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[13px] border px-3 py-2.5 text-left text-[13px] transition-[border-color,background-color,box-shadow] duration-150",
        selected
          ? "border-black/12 bg-[var(--color-accent)]/6 shadow-[0_6px_14px_rgba(15,23,42,0.04)]"
          : "border-transparent hover:border-black/8 hover:bg-[rgba(248,250,252,0.9)]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-black/82">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-black/46">{subtitle}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {typeof trailing !== "undefined" ? (
          <span className="text-xs text-black/42">{trailing}</span>
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
        <p className="text-[13px] font-semibold text-black/84">{title}</p>
        <p className="text-xs leading-5 text-black/46">{description}</p>
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
            className="rounded-full border border-black/8 bg-[rgba(248,250,252,0.82)] px-3 py-1.5 text-[12px] text-black/62 transition hover:border-black/12 hover:bg-white hover:text-black/82"
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
          className="h-10 rounded-[12px] border border-black/8 bg-[rgba(248,250,252,0.82)] px-3 text-[13px] text-black/78 outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/5"
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
          className="h-10 rounded-[12px] border border-black/8 bg-[rgba(248,250,252,0.82)] px-3 text-[13px] text-black/78 outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/5"
        />
      </div>

      <button
        type="button"
        onClick={onClear}
        className="text-xs text-black/46 transition hover:text-black/70"
      >
        清空 {title}
      </button>
    </div>
  );
}

export function CustomerFilterToolbar({
  filters,
  queueCounts,
  productOptions,
  tagOptions,
  matchedCount,
  teamOptions = [],
  salesOptions = [],
}: Readonly<{
  filters: CustomerFilters;
  queueCounts: QueueCounts;
  productOptions: ProductOption[];
  tagOptions: TagOption[];
  matchedCount: number;
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
    Boolean(filters.importedFrom || filters.importedTo),
    Boolean(filters.assignedFrom || filters.assignedTo),
    filters.statuses.length > 0,
    filters.productKeys.length > 0 || Boolean(filters.productKeyword),
    filters.tagIds.length > 0,
    Boolean(filters.teamId),
    Boolean(filters.salesId),
  ].filter(Boolean).length;

  const timeFilterSummary = useMemo(
    () =>
      buildTimeFilterSummary({
        importedFrom: filters.importedFrom,
        importedTo: filters.importedTo,
        assignedFrom: filters.assignedFrom,
        assignedTo: filters.assignedTo,
      }),
    [filters.assignedFrom, filters.assignedTo, filters.importedFrom, filters.importedTo],
  );

  const scopeHint = useMemo(() => {
    const teamLabel = teamOptions.find((item) => item.id === filters.teamId)?.name;
    const salesLabel = salesOptions.find((item) => item.id === filters.salesId)?.name;

    if (salesLabel) {
      return teamLabel ? `${teamLabel} / ${salesLabel}` : salesLabel;
    }
    if (teamLabel) {
      return teamLabel;
    }
    return "当前可见范围";
  }, [filters.salesId, filters.teamId, salesOptions, teamOptions]);

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

  const searchPending = pending && searchDraft.trim() !== filters.search;

  const todayRange = useMemo(() => getTodayRange(), []);
  const quickFilters = [
    {
      key: "today",
      label: "今日新增",
      active:
        filters.importedFrom === todayRange.from && filters.importedTo === todayRange.to,
      onClick: () =>
        applyFilters({
          importedFrom: todayRange.from,
          importedTo: todayRange.to,
          statuses: [],
          queue: "all",
        }),
    },
    {
      key: "pending_first_call",
      label: "待首呼",
      active:
        filters.statuses.length === 1 && filters.statuses[0] === "pending_first_call",
      onClick: () =>
        applyFilters({
          statuses: ["pending_first_call"],
          queue: "pending_first_call",
        }),
    },
    {
      key: "pending_follow_up",
      label: "待回访",
      active:
        filters.statuses.length === 1 && filters.statuses[0] === "pending_follow_up",
      onClick: () =>
        applyFilters({
          statuses: ["pending_follow_up"],
          queue: "pending_follow_up",
        }),
    },
    {
      key: "pending_invitation",
      label: "待邀约",
      active:
        filters.statuses.length === 1 && filters.statuses[0] === "pending_invitation",
      onClick: () =>
        applyFilters({
          statuses: ["pending_invitation"],
          queue: "pending_invitation",
        }),
    },
    {
      key: "pending_deal",
      label: "待成交",
      active: filters.statuses.length === 1 && filters.statuses[0] === "pending_deal",
      onClick: () =>
        applyFilters({
          statuses: ["pending_deal"],
          queue: "pending_deal",
        }),
    },
  ] as const;

  return (
    <div ref={rootRef} aria-busy={pending}>
      <FiltersPanel
        eyebrow="工作台筛选"
        title="筛选与范围"
        description="搜索优先，次级条件放进轻量弹层里；团队与销售范围保持在同一工具条内。"
        className={cn(
          "rounded-[1.1rem] border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,246,242,0.92))] shadow-[0_12px_24px_rgba(15,23,42,0.04)]",
          pending && "opacity-90",
        )}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-full border border-black/8 bg-white/86 px-3 text-[12px] font-medium text-black/58">
              范围 {scopeHint}
            </span>
            <span className="inline-flex h-8 items-center rounded-full border border-black/8 bg-white/86 px-3 text-[12px] font-medium text-black/58">
              命中 {matchedCount}
            </span>
            <span className="inline-flex h-8 items-center rounded-full border border-black/8 bg-white/86 px-3 text-[12px] font-medium text-black/58">
              已筛 {activeFilterCount}
            </span>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-2.5 xl:grid-cols-[minmax(320px,1.6fr)_repeat(4,minmax(0,1fr))]">
            <div className="xl:col-span-1">
              <form
                role="search"
                aria-busy={searchPending}
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch(searchDraft);
                }}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-[16px] border border-black/8 bg-white px-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] duration-150",
                  searchPending && "border-black/12 shadow-[0_12px_24px_rgba(15,23,42,0.06)]",
                )}
              >
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 text-black/36" />
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
                    className="h-10 w-full border-0 bg-transparent pl-8 pr-7 text-[13px] text-black/84 outline-none transition placeholder:text-black/34 focus:ring-0 sm:text-sm"
                  />
                  {searchDraft ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchDraft("");
                        submitSearch("");
                      }}
                      className="absolute right-0 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-black/34 transition hover:bg-black/[0.05] hover:text-black/58"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {searchPending ? (
                    <span className="hidden text-[11px] font-medium text-black/48 sm:inline">
                      搜索中
                    </span>
                  ) : null}
                  <button
                    type="submit"
                    className={cn(
                      "inline-flex h-8 items-center rounded-[11px] border px-3 text-[12px] font-medium transition-[border-color,background-color,color] duration-150",
                      searchPending
                        ? "border-black/10 bg-[rgba(248,250,252,0.92)] text-black/56"
                        : "border-black/12 bg-[rgba(15,23,42,0.04)] text-black/74 hover:border-black/16 hover:bg-white hover:text-black/86",
                    )}
                  >
                    搜索
                  </button>
                </div>
              </form>
            </div>

            <div className="relative">
              <FilterButton
                label="时间"
                icon={<CalendarRange className="h-3.5 w-3.5 shrink-0 text-black/44" />}
                value={timeFilterSummary}
                active={Boolean(
                  filters.importedFrom ||
                    filters.importedTo ||
                    filters.assignedFrom ||
                    filters.assignedTo,
                )}
                open={openPanel === "time"}
                onClick={() => setOpenPanel((current) => (current === "time" ? null : "time"))}
              />
              <FilterPanel open={openPanel === "time"} widthClassName="w-[20rem]">
                <div className="space-y-4">
                  <TimeFilterSection
                    title="导入时间"
                    description="保留现有导入时间筛选，继续服务导入承接与首呼检查。"
                    from={filters.importedFrom}
                    to={filters.importedTo}
                    onApplyPreset={(preset) => {
                      const range = getPresetRange(preset);
                      applyFilters({
                        importedFrom: range.from,
                        importedTo: range.to,
                      });
                    }}
                    onChange={(nextValue) =>
                      applyFilters({
                        importedFrom: nextValue.from,
                        importedTo: nextValue.to,
                      })
                    }
                    onClear={() => applyFilters({ importedFrom: "", importedTo: "" })}
                  />

                  <div className="border-t border-black/6 pt-4">
                    <TimeFilterSection
                      title="分配时间"
                      description="按客户承接给当前负责人的时间筛选，不再混用客户创建时间。"
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
                  </div>

                  <div className="flex items-center justify-end border-t border-black/6 pt-3">
                    <button
                      type="button"
                      onClick={() => setOpenPanel(null)}
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/8 bg-[rgba(248,250,252,0.9)] px-3 text-[12px] font-medium text-black/72 transition hover:border-black/12 hover:bg-white hover:text-black/84"
                    >
                      完成
                    </button>
                  </div>
                </div>
              </FilterPanel>
            </div>

            <label className="space-y-1.5">
              <span className="sr-only">状态筛选</span>
              <select
                value={filters.statuses[0] ?? ""}
                onChange={(event) => {
                  const value = event.target.value as CustomerWorkStatusKey | "";
                  applyFilters(
                    value
                      ? { statuses: [value], queue: value }
                      : { statuses: [], queue: "all" },
                  );
                }}
                className="h-10 w-full rounded-[14px] border border-black/8 bg-[rgba(248,250,252,0.84)] px-3 text-[13px] text-black/78 outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/5"
              >
                <option value="">全部状态</option>
                {customerWorkStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({queueCounts[option.value]})
                  </option>
                ))}
              </select>
            </label>

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
                  <p className="text-[13px] font-semibold text-black/84">商品筛选</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/34" />
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
                      className="h-10 w-full rounded-[12px] border border-black/8 bg-[rgba(248,250,252,0.82)] pl-8 pr-3 text-[13px] text-black/78 outline-none transition placeholder:text-black/34 focus:border-black/14 focus:ring-2 focus:ring-black/5"
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
                      <p className="px-1 text-xs leading-5 text-black/40">暂无匹配项</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-black/6 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setProductKeywordDraft("");
                        applyFilters({ productKeys: [], productKeyword: "" });
                      }}
                      className="text-xs text-black/46 transition hover:text-black/70"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenPanel(null)}
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/8 bg-[rgba(248,250,252,0.9)] px-3 text-[12px] font-medium text-black/72 transition hover:border-black/12 hover:bg-white hover:text-black/84"
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
                  <p className="text-[13px] font-semibold text-black/84">标签筛选</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/34" />
                    <input
                      value={tagSearchDraft}
                      onChange={(event) => setTagSearchDraft(event.target.value)}
                      placeholder="搜索标签"
                      className="h-10 w-full rounded-[12px] border border-black/8 bg-[rgba(248,250,252,0.82)] pl-8 pr-3 text-[13px] text-black/78 outline-none transition placeholder:text-black/34 focus:border-black/14 focus:ring-2 focus:ring-black/5"
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
                      <p className="px-1 text-xs leading-5 text-black/40">暂无匹配项</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-black/6 pt-3">
                    <button
                      type="button"
                      onClick={() => applyFilters({ tagIds: [] })}
                      className="text-xs text-black/46 transition hover:text-black/70"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenPanel(null)}
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/8 bg-[rgba(248,250,252,0.9)] px-3 text-[12px] font-medium text-black/72 transition hover:border-black/12 hover:bg-white hover:text-black/84"
                    >
                      完成
                    </button>
                  </div>
                </div>
              </FilterPanel>
            </div>
          </div>

          {(showTeamFilter || showSalesFilter) ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/38">
                管理范围
              </span>
              {showTeamFilter ? (
                <select
                  value={filters.teamId}
                  onChange={(event) =>
                    applyFilters({ teamId: event.target.value, salesId: "" })
                  }
                  className="h-9 rounded-[12px] border border-black/8 bg-white/90 px-3 text-[13px] text-black/76 outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/5 sm:min-w-[10rem]"
                >
                  <option value="">全部团队</option>
                  {teamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {showSalesFilter ? (
                <select
                  value={filters.salesId}
                  onChange={(event) => applyFilters({ salesId: event.target.value })}
                  className="h-9 rounded-[12px] border border-black/8 bg-white/90 px-3 text-[13px] text-black/76 outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/5 sm:min-w-[10rem]"
                >
                  <option value="">全部销售</option>
                  {salesOptions.map((sales) => (
                    <option key={sales.id} value={sales.id}>
                      {sales.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {quickFilters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-colors",
                  item.active
                    ? "border-black/12 bg-white text-black/84 shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
                    : "border-black/8 bg-[rgba(255,255,255,0.74)] text-black/56 hover:border-black/12 hover:bg-white hover:text-black/82",
                )}
              >
                {item.label}
              </button>
            ))}

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  applyFilters({
                    queue: "all",
                    statuses: [],
                    search: "",
                    productKeys: [],
                    productKeyword: "",
                    tagIds: [],
                    importedFrom: "",
                    importedTo: "",
                    assignedFrom: "",
                    assignedTo: "",
                    teamId: "",
                    salesId: "",
                  })
                }
                className="inline-flex h-8 items-center rounded-full border border-black/8 bg-transparent px-3 text-[12px] text-black/48 transition hover:border-black/12 hover:bg-white hover:text-black/72"
              >
                清空筛选
              </button>
            ) : null}
          </div>
        </div>
      </FiltersPanel>
    </div>
  );
}
