"use client";

import { CalendarRange, Check, ChevronDown, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  customerWorkStatusOptions,
  getCustomerWorkStatusLabel,
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
type FilterPanelKey =
  | "time"
  | "status"
  | "product"
  | "tag"
  | "team"
  | "sales"
  | null;
type TimePresetKey = "today" | "last7" | "last30" | "thisMonth" | "custom";

const primaryStatusOrder: CustomerWorkStatusKey[] = [
  "new_imported",
  "pending_first_call",
  "pending_wechat",
  "pending_follow_up",
  "pending_invitation",
  "pending_deal",
];

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

function buildStatusTriggerLabel(filters: CustomerFilters) {
  if (filters.statuses.length === 0) {
    return "";
  }

  if (filters.statuses.length === 1) {
    return getCustomerWorkStatusLabel(filters.statuses[0]);
  }

  return `已选 ${filters.statuses.length} 项`;
}

function buildProductTriggerLabel(
  filters: CustomerFilters,
  productOptions: ProductOption[],
) {
  const selectedCount = filters.productKeys.length + (filters.productKeyword ? 1 : 0);

  if (selectedCount === 0) {
    return "";
  }

  if (filters.productKeyword && filters.productKeys.length === 0) {
    return filters.productKeyword;
  }

  if (!filters.productKeyword && filters.productKeys.length === 1) {
    return productOptions.find((item) => item.key === filters.productKeys[0])?.label ?? "1 项";
  }

  return `已选 ${selectedCount} 项`;
}

function buildTagTriggerLabel(
  filters: CustomerFilters,
  tagOptions: TagOption[],
) {
  if (filters.tagIds.length === 0) {
    return "";
  }

  if (filters.tagIds.length === 1) {
    return tagOptions.find((item) => item.id === filters.tagIds[0])?.name ?? "1 项";
  }

  return `已选 ${filters.tagIds.length} 项`;
}

function buildTeamTriggerLabel(filters: CustomerFilters, teamOptions: TeamOption[]) {
  if (!filters.teamId) {
    return "";
  }

  return teamOptions.find((team) => team.id === filters.teamId)?.name ?? "";
}

function buildSalesTriggerLabel(filters: CustomerFilters, salesOptions: SalesOption[]) {
  if (!filters.salesId) {
    return "";
  }

  return salesOptions.find((sales) => sales.id === filters.salesId)?.name ?? "";
}

function buildScopeHint(filters: CustomerFilters, teamOptions: TeamOption[], salesOptions: SalesOption[]) {
  const teamLabel = buildTeamTriggerLabel(filters, teamOptions);
  const salesLabel = buildSalesTriggerLabel(filters, salesOptions);

  if (salesLabel) {
    return teamLabel ? `${teamLabel} / ${salesLabel}` : salesLabel;
  }

  if (teamLabel) {
    return teamLabel;
  }

  return "当前可见范围";
}

function getDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function getTodayRange() {
  const today = new Date();
  const value = getDateInputValue(today);

  return {
    from: value,
    to: value,
  };
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

function getTimePresetRange(preset: TimePresetKey) {
  switch (preset) {
    case "today":
      return getTodayRange();
    case "last7":
      return getRelativeRange(7);
    case "last30":
      return getRelativeRange(30);
    case "thisMonth":
      return getThisMonthRange();
    case "custom":
    default:
      return { from: "", to: "" };
  }
}

function getTimePresetLabel(preset: TimePresetKey) {
  switch (preset) {
    case "today":
      return "今天";
    case "last7":
      return "近7天";
    case "last30":
      return "近30天";
    case "thisMonth":
      return "本月";
    case "custom":
      return "自定义";
    default:
      return "";
  }
}

function isSameRange(
  from: string,
  to: string,
  target: {
    from: string;
    to: string;
  },
) {
  return from === target.from && to === target.to;
}

function getActiveTimePreset(from: string, to: string): TimePresetKey | null {
  if (!from && !to) {
    return null;
  }

  if (isSameRange(from, to, getTodayRange())) {
    return "today";
  }

  if (isSameRange(from, to, getRelativeRange(7))) {
    return "last7";
  }

  if (isSameRange(from, to, getRelativeRange(30))) {
    return "last30";
  }

  if (isSameRange(from, to, getThisMonthRange())) {
    return "thisMonth";
  }

  return "custom";
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

function FilterTrigger({
  label,
  value,
  icon,
  open,
  active,
  className,
  onClick,
}: Readonly<{
  label: string;
  value?: string;
  icon?: "calendar";
  open: boolean;
  active: boolean;
  className?: string;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={value ? `${label}：${value}` : label}
      className={cn(
        "inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-[13px] border px-2.5 text-[12px] transition-[border-color,background-color,color,box-shadow] duration-150 sm:h-[42px] sm:rounded-[14px] sm:px-3 sm:text-[13px]",
        active || open
          ? "border-[rgba(15,23,42,0.12)] bg-white text-black/82 shadow-[0_6px_16px_rgba(15,23,42,0.05)]"
          : "border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.88)] text-black/62 hover:border-[rgba(15,23,42,0.12)] hover:text-black/78",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden md:justify-start">
        {icon === "calendar" ? <CalendarRange className="h-3.5 w-3.5 shrink-0 text-black/48" /> : null}
        <span className="truncate whitespace-nowrap font-medium text-black/62">{label}</span>
        {value ? (
          <span className="hidden min-w-0 truncate text-[12px] font-medium text-black/78 min-[1120px]:block">
            {value}
          </span>
        ) : null}
      </span>
      <ChevronDown
        className={cn(
          "hidden h-3.5 w-3.5 shrink-0 text-black/42 transition-transform md:block",
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
        "absolute top-full z-30 mt-1.5 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.97)] p-2.5 shadow-[0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur-[12px] sm:mt-2 sm:p-3",
        "max-w-[calc(100vw-1.5rem)]",
        align === "right" ? "right-0" : "left-0",
        widthClassName ?? "w-[min(18rem,calc(100vw-1.5rem))]",
      )}
    >
      {children}
    </div>
  );
}

const filterOptionSelector = '[data-filter-option="true"]';
const panelActionButtonClassName =
  "inline-flex h-8 items-center rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.88)] px-3 text-[12px] font-medium text-black/72 transition hover:border-[rgba(15,23,42,0.12)] hover:bg-white hover:text-black/84";

function focusFilterOption(container: ParentNode | null, index: number) {
  if (!container) {
    return;
  }

  const options = Array.from(
    container.querySelectorAll<HTMLElement>(filterOptionSelector),
  ).filter((option) => !option.hasAttribute("disabled"));

  if (options.length === 0) {
    return;
  }

  const safeIndex = Math.min(Math.max(index, 0), options.length - 1);
  options[safeIndex]?.focus();
}

function focusFirstFilterOption(container: HTMLElement | null) {
  focusFilterOption(container, 0);
}

function handleOptionListNavigation(event: ReactKeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(filterOptionSelector),
  ).filter((option) => !option.hasAttribute("disabled"));

  if (options.length === 0) {
    return;
  }

  const target = event.target as Node;
  const currentIndex = options.findIndex((option) => option === target || option.contains(target));

  event.preventDefault();

  switch (event.key) {
    case "Home":
      options[0]?.focus();
      return;
    case "End":
      options[options.length - 1]?.focus();
      return;
    case "ArrowUp":
      options[Math.max(currentIndex - 1, 0)]?.focus();
      return;
    case "ArrowDown":
      options[Math.min(currentIndex + 1, options.length - 1)]?.focus();
      return;
    default:
      return;
  }
}

function OptionRow({
  title,
  subtitle,
  trailing,
  selected,
  onClick,
  leading,
}: Readonly<{
  title: string;
  subtitle?: string;
  trailing?: string | number;
  selected: boolean;
  onClick: () => void;
  leading?: ReactNode;
}>) {
  return (
    <button
      type="button"
      data-filter-option="true"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[13px] border px-3 py-2.5 text-left text-[13px] outline-none transition-[border-color,background-color,box-shadow,color] duration-150 focus-visible:border-[rgba(15,23,42,0.12)] focus-visible:ring-2 focus-visible:ring-black/6 focus-visible:ring-offset-1",
        selected
          ? "border-[var(--color-accent)]/18 bg-[var(--color-accent)]/6 shadow-[0_6px_14px_rgba(15,23,42,0.04)]"
          : "border-transparent bg-transparent hover:border-[rgba(15,23,42,0.08)] hover:bg-[rgba(248,250,252,0.9)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.04)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {leading ? <div>{leading}</div> : null}
        <div className="min-w-0">
          <p className={cn("truncate font-medium transition-colors", selected ? "text-black/88" : "text-black/82")}>
            {title}
          </p>
          {subtitle ? <p className="mt-0.5 text-xs leading-5 text-black/46">{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {typeof trailing !== "undefined" ? (
          <span className={cn("text-xs transition-colors", selected ? "text-black/56" : "text-black/42")}>
            {trailing}
          </span>
        ) : null}
        <span
          className={cn(
            "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-[border-color,background-color,color,opacity] duration-150",
            selected
              ? "border-[var(--color-accent)]/18 bg-[var(--color-accent)]/8 text-[var(--color-accent)]"
              : "border-transparent text-black/0 opacity-0 group-hover:border-[rgba(15,23,42,0.08)] group-hover:text-black/30 group-hover:opacity-100",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
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
  const productOptionListRef = useRef<HTMLDivElement>(null);
  const tagOptionListRef = useRef<HTMLDivElement>(null);
  const latestFiltersRef = useRef(filters);
  const [pending, startTransition] = useTransition();
  const [draftFilters, setDraftFilters] = useState(filters);
  const [openPanel, setOpenPanel] = useState<FilterPanelKey>(null);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [importedFromDraft, setImportedFromDraft] = useState(filters.importedFrom);
  const [importedToDraft, setImportedToDraft] = useState(filters.importedTo);
  const [productKeywordDraft, setProductKeywordDraft] = useState(filters.productKeyword);
  const [tagSearchDraft, setTagSearchDraft] = useState("");
  const [productExpanded, setProductExpanded] = useState({
    purchased: false,
    interested: false,
  });
  const [tagExpanded, setTagExpanded] = useState(false);
  const [customTimeOpen, setCustomTimeOpen] = useState(
    getActiveTimePreset(filters.importedFrom, filters.importedTo) === "custom",
  );

  const applyFilters = useCallback((overrides: Partial<CustomerFilters>) => {
    const nextFilters: CustomerFilters = {
      ...latestFiltersRef.current,
      ...overrides,
      page: typeof overrides.page === "number" ? overrides.page : 1,
    };

    latestFiltersRef.current = nextFilters;
    setDraftFilters(nextFilters);

    startTransition(() => {
      router.replace(buildCustomersHref(nextFilters, {}, pathname), { scroll: false });
    });
  }, [pathname, router, startTransition]);

  useEffect(() => {
    latestFiltersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    if (!openPanel) {
      return;
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

  useEffect(() => {
    if (searchDraft.trim() === latestFiltersRef.current.search) {
      return;
    }

    const timer = window.setTimeout(() => {
      applyFilters({
        search: searchDraft.trim(),
      });
    }, 320);

    return () => window.clearTimeout(timer);
  }, [applyFilters, searchDraft]);

  function togglePanel(panel: Exclude<FilterPanelKey, null>) {
    setOpenPanel((current) => {
      const nextPanel = current === panel ? null : panel;

      if (current === "tag" && nextPanel !== "tag") {
        setTagSearchDraft("");
      }

      if (current === "product" && nextPanel !== "product") {
        setProductExpanded({
          purchased: false,
          interested: false,
        });
      }

      if (nextPanel === "time") {
        setCustomTimeOpen(getActiveTimePreset(importedFromDraft, importedToDraft) === "custom");
      }

      return nextPanel;
    });
  }

  function toggleArrayValue(key: "productKeys" | "tagIds", value: string) {
    const values = latestFiltersRef.current[key];
    const nextValues = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

    applyFilters({
      [key]: nextValues,
    } as Partial<CustomerFilters>);
  }

  function getStatusCount(status: string) {
    if (status === "all") {
      return queueCounts.all;
    }

    return queueCounts[status as keyof QueueCounts] ?? 0;
  }

  function getVisibleOptions<T>(
    options: T[],
    expanded: boolean,
    limit: number,
    keywordActive = false,
  ) {
    if (expanded || keywordActive) {
      return options;
    }

    return options.slice(0, limit);
  }

  function selectStatus(value: CustomerWorkStatusKey | null) {
    applyFilters(
      value
        ? {
            statuses: [value],
            queue: value,
          }
        : {
            statuses: [],
            queue: "all",
          },
    );
  }

  function applyTimeRange(from: string, to: string) {
    setImportedFromDraft(from);
    setImportedToDraft(to);
    applyFilters({
      importedFrom: from,
      importedTo: to,
    });
  }

  function commitProductKeyword() {
    const nextKeyword = productKeywordDraft.trim();

    if (nextKeyword === latestFiltersRef.current.productKeyword) {
      return;
    }

    applyFilters({
      productKeyword: nextKeyword,
    });
  }

  const productKeyword = productKeywordDraft.trim();
  const timePresets: TimePresetKey[] = ["today", "last7", "last30", "thisMonth", "custom"];
  const activeTimePreset = getActiveTimePreset(importedFromDraft, importedToDraft);
  const orderedStatusOptions = useMemo(
    () =>
      primaryStatusOrder
        .map((value) => customerWorkStatusOptions.find((option) => option.value === value))
        .filter((option): option is (typeof customerWorkStatusOptions)[number] => Boolean(option)),
    [],
  );
  const purchasedOptions = useMemo(
    () =>
      sortByCountDesc(
        productOptions.filter(
          (item) =>
            item.source === "purchased" &&
            (!productKeyword ||
              item.label.toLowerCase().includes(productKeyword.toLowerCase())),
        ),
      ),
    [productKeyword, productOptions],
  );
  const interestedOptions = useMemo(
    () =>
      sortByCountDesc(
        productOptions.filter(
          (item) =>
            item.source === "interested" &&
            (!productKeyword ||
              item.label.toLowerCase().includes(productKeyword.toLowerCase())),
        ),
      ),
    [productKeyword, productOptions],
  );
  const showTeamFilter = teamOptions.length > 0;
  const showSalesFilter = salesOptions.length > 0;
  const visibleTagOptions = useMemo(
    () =>
      sortByCountDesc(
        tagOptions.filter((item) => {
          if (!tagSearchDraft.trim()) {
            return true;
          }

          const keyword = tagSearchDraft.trim().toLowerCase();
          return (
            item.name.toLowerCase().includes(keyword) ||
            item.label.toLowerCase().includes(keyword) ||
            item.code.toLowerCase().includes(keyword)
          );
        }),
      ),
    [tagOptions, tagSearchDraft],
  );

  return (
    <section
      ref={rootRef}
      aria-busy={pending}
      className={cn(
        "rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.92)] px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-3 sm:py-2.5",
        pending && "opacity-90",
      )}
    >
      <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-[minmax(320px,1.75fr)_repeat(4,minmax(0,0.82fr))] xl:gap-[10px]">
        <div className="relative min-w-0 xl:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/36" />
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="搜索客户/手机号/产品/备注"
            className="h-10 w-full rounded-[14px] border border-[rgba(15,23,42,0.08)] bg-white pl-9 pr-9 text-[13px] text-black/82 outline-none transition placeholder:text-black/34 focus:border-[rgba(15,23,42,0.14)] focus:ring-2 focus:ring-black/5 sm:h-[42px] sm:text-sm xl:min-w-[320px]"
          />
          {searchDraft ? (
            <button
              type="button"
              onClick={() => {
                setSearchDraft("");
                applyFilters({
                  search: "",
                });
              }}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-black/34 transition hover:bg-black/[0.05] hover:text-black/58"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-2 sm:gap-[10px] xl:col-span-4">
          <div className="relative">
            <FilterTrigger
              label="时间"
              value={formatRangeLabel(draftFilters.importedFrom, draftFilters.importedTo)}
              icon="calendar"
              open={openPanel === "time"}
              active={Boolean(draftFilters.importedFrom || draftFilters.importedTo)}
              className="w-full px-2.5 sm:px-3"
              onClick={() => togglePanel("time")}
            />
            <FilterPanel open={openPanel === "time"} widthClassName="w-[19rem]">
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-black/84">时间筛选</p>

              <div className="flex flex-wrap gap-2">
                {timePresets.map((preset) => {
                  const active = preset === activeTimePreset || (preset === "custom" && customTimeOpen);

                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        if (preset === "custom") {
                          setCustomTimeOpen(true);
                          return;
                        }

                        setCustomTimeOpen(false);
                        const range = getTimePresetRange(preset);
                        applyTimeRange(range.from, range.to);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                        active
                          ? "border-[var(--color-accent)]/20 bg-[var(--color-accent)]/8 text-[var(--color-accent-strong)]"
                          : "border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.82)] text-black/58 hover:border-[rgba(15,23,42,0.12)] hover:text-black/76",
                      )}
                    >
                      {getTimePresetLabel(preset)}
                    </button>
                  );
                })}
              </div>

              {customTimeOpen ? (
                <div className="grid gap-2">
                  <input
                    type="date"
                    value={importedFromDraft}
                    onChange={(event) => {
                      const nextFrom = event.target.value;
                      setImportedFromDraft(nextFrom);
                      applyFilters({
                        importedFrom: nextFrom,
                        importedTo: importedToDraft,
                      });
                    }}
                    className="h-9 rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.84)] px-3 text-[13px] text-black/78 outline-none transition focus:border-[rgba(15,23,42,0.14)] focus:ring-2 focus:ring-black/5"
                  />
                  <input
                    type="date"
                    value={importedToDraft}
                    onChange={(event) => {
                      const nextTo = event.target.value;
                      setImportedToDraft(nextTo);
                      applyFilters({
                        importedFrom: importedFromDraft,
                        importedTo: nextTo,
                      });
                    }}
                    className="h-9 rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.84)] px-3 text-[13px] text-black/78 outline-none transition focus:border-[rgba(15,23,42,0.14)] focus:ring-2 focus:ring-black/5"
                  />
                </div>
              ) : null}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTimeOpen(false);
                      applyTimeRange("", "");
                    }}
                    className="text-xs text-black/46 transition hover:text-black/70"
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
            <FilterTrigger
              label="状态"
              value={buildStatusTriggerLabel(draftFilters)}
              open={openPanel === "status"}
              active={draftFilters.statuses.length > 0}
              className="w-full px-2.5 sm:px-3"
              onClick={() => togglePanel("status")}
            />
            <FilterPanel open={openPanel === "status"} widthClassName="w-[16.5rem]">
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-black/84">状态筛选</p>

                <div className="space-y-1" onKeyDown={handleOptionListNavigation}>
                  <OptionRow
                    title="全部"
                    trailing={getStatusCount("all")}
                    selected={draftFilters.statuses.length === 0}
                    onClick={() => selectStatus(null)}
                  />
                  {orderedStatusOptions.map((option) => (
                    <OptionRow
                      key={option.value}
                      title={option.label}
                      trailing={getStatusCount(option.value)}
                      selected={draftFilters.statuses.includes(option.value)}
                      onClick={() => selectStatus(option.value)}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-black/6 pt-3">
                  <button
                    type="button"
                    onClick={() => selectStatus(null)}
                    className="text-xs text-black/46 transition hover:text-black/70"
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
            <FilterTrigger
              label="产品"
              value={buildProductTriggerLabel(draftFilters, productOptions)}
              open={openPanel === "product"}
              active={Boolean(draftFilters.productKeyword || draftFilters.productKeys.length > 0)}
              className="w-full px-2.5 sm:px-3"
              onClick={() => togglePanel("product")}
            />
            <FilterPanel
              open={openPanel === "product"}
              align="right"
              widthClassName="w-[min(21rem,calc(100vw-1.5rem))]"
            >
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-black/84">产品筛选</p>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/34" />
                  <input
                    value={productKeywordDraft}
                    onChange={(event) => setProductKeywordDraft(event.target.value)}
                    onBlur={commitProductKeyword}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        focusFirstFilterOption(productOptionListRef.current);
                        return;
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitProductKeyword();
                      }
                    }}
                    placeholder="搜索产品"
                    className="h-9 w-full rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.84)] pl-8 pr-3 text-[13px] text-black/78 outline-none transition placeholder:text-black/34 focus:border-[rgba(15,23,42,0.14)] focus:ring-2 focus:ring-black/5"
                  />
                </div>

                <div
                  ref={productOptionListRef}
                  className="max-h-[20rem] space-y-3 overflow-y-auto pr-1"
                  onKeyDown={handleOptionListNavigation}
                >
                  <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/38">
                      已购产品
                    </p>
                    {!productKeyword && purchasedOptions.length > 5 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setProductExpanded((current) => ({
                            ...current,
                            purchased: !current.purchased,
                          }))
                        }
                        className="text-[12px] font-medium text-black/46 transition hover:text-black/72"
                      >
                        {productExpanded.purchased ? "收起" : `查看更多 +${purchasedOptions.length - 5}`}
                      </button>
                    ) : null}
                  </div>
                  {purchasedOptions.length > 0 ? (
                    getVisibleOptions(purchasedOptions, productExpanded.purchased, 5, Boolean(productKeyword)).map((option) => (
                      <OptionRow
                        key={option.key}
                        title={option.label}
                        trailing={option.count}
                        selected={draftFilters.productKeys.includes(option.key)}
                        onClick={() => toggleArrayValue("productKeys", option.key)}
                      />
                    ))
                  ) : (
                    <p className="px-1 text-xs leading-5 text-black/40">暂无匹配项</p>
                  )}
                  </div>

                  <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/38">
                      导入产品
                    </p>
                    {!productKeyword && interestedOptions.length > 5 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setProductExpanded((current) => ({
                            ...current,
                            interested: !current.interested,
                          }))
                        }
                        className="text-[12px] font-medium text-black/46 transition hover:text-black/72"
                      >
                        {productExpanded.interested ? "收起" : `查看更多 +${interestedOptions.length - 5}`}
                      </button>
                    ) : null}
                  </div>
                  {interestedOptions.length > 0 ? (
                    getVisibleOptions(interestedOptions, productExpanded.interested, 5, Boolean(productKeyword)).map((option) => (
                      <OptionRow
                        key={option.key}
                        title={option.label}
                        trailing={option.count}
                        selected={draftFilters.productKeys.includes(option.key)}
                        onClick={() => toggleArrayValue("productKeys", option.key)}
                      />
                    ))
                  ) : (
                    <p className="px-1 text-xs leading-5 text-black/40">暂无匹配项</p>
                  )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-black/6 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProductKeywordDraft("");
                      applyFilters({
                        productKeys: [],
                        productKeyword: "",
                      });
                    }}
                    className="text-xs text-black/46 transition hover:text-black/70"
                  >
                    清空
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      commitProductKeyword();
                      setOpenPanel(null);
                    }}
                    className={panelActionButtonClassName}
                  >
                    完成
                  </button>
                </div>
              </div>
            </FilterPanel>
          </div>

          <div className="relative">
            <FilterTrigger
              label="标签"
              value={buildTagTriggerLabel(draftFilters, tagOptions)}
              open={openPanel === "tag"}
              active={draftFilters.tagIds.length > 0}
              className="w-full px-2.5 sm:px-3"
              onClick={() => togglePanel("tag")}
            />
            <FilterPanel
              open={openPanel === "tag"}
              align="right"
              widthClassName="w-[min(21rem,calc(100vw-1.5rem))]"
            >
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-black/84">标签筛选</p>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/34" />
                  <input
                    value={tagSearchDraft}
                    onChange={(event) => setTagSearchDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        focusFirstFilterOption(tagOptionListRef.current);
                      }
                    }}
                    placeholder="搜索标签"
                    className="h-9 w-full rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.84)] pl-8 pr-3 text-[13px] text-black/78 outline-none transition placeholder:text-black/34 focus:border-[rgba(15,23,42,0.14)] focus:ring-2 focus:ring-black/5"
                  />
                </div>

                <div
                  ref={tagOptionListRef}
                  className="max-h-[20rem] space-y-1 overflow-y-auto pr-1"
                  onKeyDown={handleOptionListNavigation}
                >
                  {visibleTagOptions.length > 0 ? (
                    getVisibleOptions(visibleTagOptions, tagExpanded, 8, Boolean(tagSearchDraft.trim())).map((tag) => (
                      <OptionRow
                        key={tag.id}
                        title={tag.name}
                        trailing={tag.count}
                        selected={draftFilters.tagIds.includes(tag.id)}
                        leading={
                          <span
                            className="inline-flex h-2.5 w-2.5 rounded-full border border-black/10 shadow-[0_0_0_3px_rgba(255,255,255,0.74)]"
                            style={tag.color ? { backgroundColor: tag.color } : undefined}
                          />
                        }
                        onClick={() => toggleArrayValue("tagIds", tag.id)}
                      />
                    ))
                  ) : (
                    <p className="px-1 text-xs leading-5 text-black/40">暂无匹配项</p>
                  )}
                </div>

                {!tagSearchDraft.trim() && visibleTagOptions.length > 8 ? (
                  <div className="flex justify-end px-1">
                    <button
                      type="button"
                      onClick={() => setTagExpanded((current) => !current)}
                      className="text-[12px] font-medium text-black/46 transition hover:text-black/72"
                    >
                      {tagExpanded ? "收起" : `查看更多 +${visibleTagOptions.length - 8}`}
                    </button>
                  </div>
                ) : null}

                <div className="flex items-center justify-between border-t border-black/6 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      applyFilters({
                        tagIds: [],
                      })
                    }
                    className="text-xs text-black/46 transition hover:text-black/70"
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
        </div>
      </div>

      {(showTeamFilter || showSalesFilter) ? (
        <div className="mt-[10px] flex flex-col gap-2.5 border-t border-black/6 pt-[10px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-black/40">管理范围</p>
            <p className="truncate text-xs leading-5 text-black/42">
              {buildScopeHint(draftFilters, teamOptions, salesOptions)} · 命中 {matchedCount}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showTeamFilter ? (
              <div className="relative">
                <FilterTrigger
                  label="团队"
                  value={buildTeamTriggerLabel(draftFilters, teamOptions)}
                  open={openPanel === "team"}
                  active={Boolean(draftFilters.teamId)}
                  className="min-w-[110px] px-2.5 sm:min-w-[120px] sm:px-3"
                  onClick={() => togglePanel("team")}
                />
                <FilterPanel
                  open={openPanel === "team"}
                  widthClassName="w-[min(16.5rem,calc(100vw-1.5rem))]"
                >
                  <div className="space-y-3">
                    <p className="text-[13px] font-semibold text-black/84">团队筛选</p>

                    <div className="space-y-1" onKeyDown={handleOptionListNavigation}>
                      <OptionRow
                        title="全部团队"
                        selected={!draftFilters.teamId}
                        onClick={() =>
                          applyFilters({
                            teamId: "",
                            salesId: "",
                          })
                        }
                      />
                      {teamOptions.map((team) => (
                        <OptionRow
                          key={team.id}
                          title={team.name}
                          trailing={team.customerCount}
                          selected={draftFilters.teamId === team.id}
                          onClick={() =>
                            applyFilters({
                              teamId: team.id,
                              salesId: "",
                            })
                          }
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between border-t border-black/6 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          applyFilters({
                            teamId: "",
                            salesId: "",
                          })
                        }
                        className="text-xs text-black/46 transition hover:text-black/70"
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
            ) : null}

            {showSalesFilter ? (
              <div className="relative">
                <FilterTrigger
                  label="销售"
                  value={buildSalesTriggerLabel(draftFilters, salesOptions)}
                  open={openPanel === "sales"}
                  active={Boolean(draftFilters.salesId)}
                  className="min-w-[110px] px-2.5 sm:min-w-[120px] sm:px-3"
                  onClick={() => togglePanel("sales")}
                />
                <FilterPanel
                  open={openPanel === "sales"}
                  align="right"
                  widthClassName="w-[min(16.5rem,calc(100vw-1.5rem))]"
                >
                  <div className="space-y-3">
                    <p className="text-[13px] font-semibold text-black/84">销售筛选</p>

                    <div className="space-y-1" onKeyDown={handleOptionListNavigation}>
                      <OptionRow
                        title="全部销售"
                        selected={!draftFilters.salesId}
                        onClick={() =>
                          applyFilters({
                            salesId: "",
                          })
                        }
                      />
                      {salesOptions.map((sales) => (
                        <OptionRow
                          key={sales.id}
                          title={sales.name}
                          trailing={sales.customerCount}
                          selected={draftFilters.salesId === sales.id}
                          onClick={() =>
                            applyFilters({
                              salesId: sales.id,
                              teamId: sales.teamId ?? draftFilters.teamId,
                            })
                          }
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between border-t border-black/6 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          applyFilters({
                            salesId: "",
                          })
                        }
                        className="text-xs text-black/46 transition hover:text-black/70"
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
            ) : null}
          </div>
        </div>
      ) : null}

    </section>
  );
}
