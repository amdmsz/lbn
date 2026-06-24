"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
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
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  advancedCustomerQueueOptions,
  customerExecutionClassOptions,
  customerPageSizeOptions,
  getCustomerQueueLabel,
  isPrimaryCustomerQueue,
  OPEN_CUSTOMER_ADVANCED_FILTER_EVENT,
  type CustomerPageSize,
  type CustomerQueueKey,
} from "@/lib/customers/metadata";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import {
  CUSTOMER_GRADE_DESCRIPTION,
  CUSTOMER_GRADE_LABEL,
  CUSTOMER_GRADE_VALUES,
} from "@/lib/customers/grade";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";
import type { CustomerGrade } from "@prisma/client";

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

const baseFieldClassName =
  "h-9 rounded-lg border border-border bg-background text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary";

function FilterChip({
  label,
  onClear,
}: Readonly<{
  label: string;
  onClear: () => void;
}>) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 pl-2 pr-1 text-[11px] font-medium text-muted-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground"
        aria-label={`移除筛选 ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
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
        "flex min-h-9 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150",
        selected
          ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
          : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground",
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
            "inline-flex h-4 w-4 items-center justify-center rounded-full",
            selected ? "bg-primary text-primary-foreground" : "text-transparent",
          )}
        >
          <Check className="h-3 w-3" />
        </span>
      </span>
    </button>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseDateInputValue(value), [value]);
  const [open, setOpen] = useState(false);
  // 弹层用 portal 渲染到 body, 脱离高级筛选面板的 overflow 裁剪 — 否则日历会被
  // overflow-y-auto 容器裁切, 并把面板撑出一条横向滚动条.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [viewMonth, setViewMonth] = useState(() =>
    getMonthStart(selectedDate ?? new Date()),
  );
  const today = useMemo(() => new Date(), []);
  const todayValue = getDateInputValue(today);
  const calendarDates = useMemo(
    () => buildCalendarDates(viewMonth),
    [viewMonth],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const popupWidth = 288; // w-72
    const popupHeight = 360;
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - popupWidth - margin),
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < popupHeight + margin && rect.top > popupHeight + margin
        ? rect.top - margin - popupHeight
        : rect.bottom + margin;
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    updatePosition();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleReflow() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    // capture: true — 面板内部滚动容器的滚动也能捕获到, 让弹层跟随触发器.
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [open, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open && selectedDate) {
            setViewMonth(getMonthStart(selectedDate));
          }
          setOpen((current) => !current);
        }}
        className={cn(
          baseFieldClassName,
          "flex w-full items-center justify-between gap-2 px-3 text-left",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="min-w-0 truncate text-sm">
          <span className="mr-1 text-[11px] text-muted-foreground">{label}</span>
          {formatDatePickerValue(value)}
        </span>
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popupRef}
              style={{ position: "fixed", top: coords.top, left: coords.left }}
              className="crm-animate-pop z-[60] w-72 rounded-lg border border-border bg-card p-3 text-foreground shadow-md"
            >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((current) => shiftMonth(current, -1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
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
                    "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium outline-none",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : currentMonth
                        ? "text-foreground hover:bg-primary/10 hover:text-primary"
                        : "text-muted-foreground/35 hover:bg-primary/10 hover:text-primary",
                    isToday && !selected && "ring-1 ring-primary/30 text-primary",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-xs font-medium text-primary hover:text-primary/80"
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
              className="text-xs font-medium text-primary hover:text-primary/80"
            >
              今天
            </button>
          </div>
            </div>,
            document.body,
          )
        : null}
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
    <section className="space-y-2.5 rounded-xl border border-border/60 bg-background/60 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
        <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function InlineNativeSelect({
  ariaLabel,
  value,
  placeholder,
  options,
  onChange,
  pending,
  className,
}: Readonly<{
  ariaLabel: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (nextValue: string) => void;
  pending?: boolean;
  className?: string;
}>) {
  return (
    <span className="relative inline-block">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          baseFieldClassName,
          "appearance-none px-3 pr-7 font-medium",
          pending && "opacity-70",
          className,
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

export function CustomerFilterToolbar({
  filters,
  exportHref,
  productOptions,
  tagOptions,
  teamOptions = [],
  salesOptions = [],
  queueCounts,
}: Readonly<{
  filters: CustomerFilters;
  exportHref?: string | null;
  productOptions: ProductOption[];
  tagOptions: TagOption[];
  teamOptions?: TeamOption[];
  salesOptions?: SalesOption[];
  /**
   * 队列计数 (stats aggregate 派生) — 高级筛选「工作队列」chip 上显示;
   * 缺省时 chip 只显示队列名, 不显示数字.
   */
  queueCounts?: Partial<Record<CustomerQueueKey, number>>;
}>) {
  const pathname = usePathname() || "/customers";
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [searchDraftSource, setSearchDraftSource] = useState(filters.search);
  const [productKeywordDraft, setProductKeywordDraft] = useState(filters.productKeyword);
  const [tagSearchDraft, setTagSearchDraft] = useState("");

  // 当 URL 上 filters.search 被外部改写 (清空 / 链接跳转) 时, 立刻同步草稿,
  // 不放进 useEffect 以免触发 lint 告警 + cascading render.
  if (filters.search !== searchDraftSource) {
    setSearchDraftSource(filters.search);
    setSearchDraft(filters.search);
  }

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

  // 队列 tab 旁「更多队列」入口 — tabs 与 toolbar 是隔着 server 组件的同级
  // client 组件, 通过 window 自定义事件打开高级筛选面板 (内含「工作队列」组).
  useEffect(() => {
    function handleOpenAdvanced() {
      setOpen(true);
    }

    window.addEventListener(OPEN_CUSTOMER_ADVANCED_FILTER_EVENT, handleOpenAdvanced);
    return () => {
      window.removeEventListener(
        OPEN_CUSTOMER_ADVANCED_FILTER_EVENT,
        handleOpenAdvanced,
      );
    };
  }, []);

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

  const showTeamFilter = teamOptions.length > 0;
  const showSalesFilter = salesOptions.length > 0;
  // pageSize 是 "每页显示" 偏好, 不是数据过滤维度, 不算进 advanced active count.
  // 旧实现 `filters.pageSize !== 20` 在 default pageSize 改成 10 后会一直为 true,
  // 导致红色徽标显示 "1" 但用户找不到对应的高亮 chip — 误导.
  //
  // 首屏 4 个主队列 (待拨打 / 已加微 / 待邀约 / 全部) 走 tab, 不算高级筛选;
  // 只有「工作队列」组里的下沉队列生效时才计数 + 出 chip.
  const advancedQueueActive = !isPrimaryCustomerQueue(filters.queue);
  const advancedActiveCount = [
    advancedQueueActive,
    Boolean(filters.assignedFrom || filters.assignedTo),
    filters.executionClasses.length > 0,
    filters.grades.length > 0,
    filters.productKeys.length > 0 || Boolean(filters.productKeyword),
    filters.tagIds.length > 0,
  ].filter(Boolean).length;

  function isTimePresetSelected(preset: TimePresetKey) {
    const range = getPresetRange(preset);
    return filters.assignedFrom === range.from && filters.assignedTo === range.to;
  }

  const advancedChips = [
    advancedQueueActive
      ? {
          key: "queue",
          label: `队列 ${getCustomerQueueLabel(filters.queue)}`,
          onClear: () => applyFilters({ queue: "all" }),
        }
      : null,
    timeFilterSummary
      ? {
          key: "time",
          label: `时间 ${timeFilterSummary}`,
          onClear: () => applyFilters({ assignedFrom: "", assignedTo: "" }),
        }
      : null,
    // executionClasses 已无 UI 入口 (与 grade 合并), 但老链接 / 收藏的 URL 还可能
    // 带这个参数 — 保留 chip 让用户能看见并清掉.
    selectedExecutionClass
      ? {
          key: "execution-class",
          label: selectedExecutionClass.longLabel,
          onClear: () => applyFilters({ executionClasses: [] }),
        }
      : null,
    filters.grades.length > 0
      ? {
          key: "grades",
          label: `分类 ${filters.grades.join("/")}`,
          onClear: () => applyFilters({ grades: [] }),
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
  ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>;

  function clearAllFilters() {
    setSearchDraft("");
    setProductKeywordDraft("");
    setTagSearchDraft("");
    applyFilters({
      // 主队列 tab 选择不属于高级筛选, 清空不动它; 「工作队列」下沉队列
      // 生效时一并清回「全部」, 避免清空后还留着一个看不见的队列收窄.
      queue: advancedQueueActive ? "all" : filters.queue,
      executionClasses: [],
      grades: [],
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

  function commitSearch() {
    const next = searchDraft.trim();
    if (next === filters.search) return;
    applyFilters({ search: next });
  }

  const hasActiveAny =
    advancedChips.length > 0 ||
    Boolean(filters.search) ||
    Boolean(filters.teamId) ||
    Boolean(filters.salesId);

  return (
    <div ref={rootRef} aria-busy={pending} className="relative">
      <div
        className={cn(
          "rounded-lg border border-border bg-card px-3 py-2 transition-opacity duration-200 ease-out",
          pending && "opacity-80",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-64">
            {pending ? (
              <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-primary" />
            ) : (
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            )}
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onBlur={commitSearch}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSearch();
                }
              }}
              placeholder="搜索客户姓名 / 手机号"
              aria-label="搜索客户"
              className={cn(baseFieldClassName, "w-full pl-8 pr-3", pending && "opacity-70")}
            />
          </div>

          {showTeamFilter ? (
            <InlineNativeSelect
              ariaLabel="按团队筛选"
              value={filters.teamId}
              placeholder="全部团队"
              options={teamOptions.map((team) => ({ value: team.id, label: team.name }))}
              onChange={(nextValue) => applyFilters({ teamId: nextValue, salesId: "" })}
              pending={pending}
              className="min-w-[8rem]"
            />
          ) : null}

          {showSalesFilter ? (
            <InlineNativeSelect
              ariaLabel="按员工筛选"
              value={filters.salesId}
              placeholder="全部员工"
              options={salesOptions.map((sales) => ({ value: sales.id, label: sales.name }))}
              onChange={(nextValue) => applyFilters({ salesId: nextValue })}
              pending={pending}
              className="min-w-[8rem]"
            />
          ) : null}

          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-[background-color,color,border-color,box-shadow] duration-200 ease-out hover:shadow-[0_4px_12px_hsl(var(--primary)/0.15)]",
              open || advancedActiveCount > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SlidersHorizontal className="h-3.5 w-3.5" />
            )}
            高级筛选
            {advancedActiveCount > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground">
                {advancedActiveCount}
              </span>
            ) : null}
          </button>

          {exportHref ? (
            <a
              href={exportHref}
              aria-label="导出客户"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          ) : null}

          {hasActiveAny ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex h-9 items-center rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              清空
            </button>
          ) : null}
        </div>

        {advancedChips.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            {advancedChips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onClear={chip.onClear} />
            ))}
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="crm-animate-pop absolute right-0 top-full z-40 mt-2 w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">高级筛选</span>
              {advancedActiveCount > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {advancedActiveCount} 项生效
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭高级筛选"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-4">
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {/* Wave 12 收敛: 首屏队列 tab 只留 4 个主队列, 其余队列入口下沉到
              这里. 单选 chip — 点选即切 queue URL 参数, 再点一次回「全部」. */}
            <FilterSection title="工作队列">
              <div className="flex flex-wrap gap-1.5">
                {advancedCustomerQueueOptions.map((option) => {
                  const selected = filters.queue === option.value;
                  const count = queueCounts?.[option.value];

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      title={option.description}
                      onClick={() =>
                        applyFilters({ queue: selected ? "all" : option.value })
                      }
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
                        selected
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {option.label}
                      {typeof count === "number" ? (
                        <span
                          className={cn(
                            "tabular-nums",
                            selected
                              ? "text-primary/70"
                              : "text-muted-foreground/70",
                          )}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground/70">
                单选生效，再点一次回到「全部」；待拨打 / 已加微 / 待邀约在列表上方 tab。
              </p>
            </FilterSection>

            <FilterSection title="分配时间">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["today", "今天"],
                    ["last7", "近 7 天"],
                    ["last30", "近 30 天"],
                    ["thisMonth", "本月"],
                  ] as Array<[TimePresetKey, string]>
                ).map(([preset, label]) => {
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
                        "h-7 rounded-full border px-2.5 text-xs font-medium",
                        selected
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
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

            {/* 客户分类 = grade (A/B/C/D/E/F, 落库多选). 原 executionClass 的
              "客户分类"区块与 grade 的"客户分级"区块重复建设, 已合并为这一个 —
              E 拒加并入 grade, executionClasses URL 参数仅保留兼容, 不再有 UI 入口. */}
            <FilterSection title="客户分类">
              <div className="grid grid-cols-2 gap-1.5">
                {CUSTOMER_GRADE_VALUES.map((grade) => (
                  <OptionRow
                    key={grade}
                    title={CUSTOMER_GRADE_LABEL[grade]}
                    subtitle={CUSTOMER_GRADE_DESCRIPTION[grade]}
                    selected={filters.grades.includes(grade)}
                    onClick={() => {
                      const nextGrades = filters.grades.includes(grade)
                        ? filters.grades.filter((item) => item !== grade)
                        : [...filters.grades, grade];
                      applyFilters({ grades: nextGrades as CustomerGrade[] });
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground/70">
                可多选；分类由系统按订单 / 加微 / 邀约 / 通话结果自动判定。
              </p>
            </FilterSection>

            <FilterSection title="商品">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
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
                  className={cn(baseFieldClassName, "w-full pl-8 pr-3")}
                />
              </div>
              <div className="max-h-60 space-y-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground/70">
                    暂无匹配商品
                  </p>
                )}
              </div>
            </FilterSection>

            <FilterSection title="标签">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={tagSearchDraft}
                  onChange={(event) => setTagSearchDraft(event.target.value)}
                  placeholder="筛选标签"
                  className={cn(baseFieldClassName, "w-full pl-8 pr-3")}
                />
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground/70">
                    暂无匹配标签
                  </p>
                )}
              </div>
            </FilterSection>
          </div>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>每页</span>
              <InlineNativeSelect
                ariaLabel="选择每页客户数量"
                value={String(filters.pageSize)}
                placeholder="20"
                options={customerPageSizeOptions.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
                onChange={(nextValue) => {
                  if (!nextValue) return;
                  applyFilters({ pageSize: Number(nextValue) as CustomerPageSize });
                }}
                pending={pending}
                className="h-8 w-[5rem] text-xs"
              />
              <span>条</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                清空全部
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
