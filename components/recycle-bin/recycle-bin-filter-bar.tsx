import Link from "next/link";
import type {
  RecycleBinDeletedRangeValue,
  RecycleBinFilterOption,
  RecycleBinFilterStateValue,
  RecycleBinFilters,
  RecycleBinTabValue,
} from "@/lib/recycle-bin/queries";

const deletedRangeOptions: Array<{
  value: RecycleBinDeletedRangeValue;
  label: string;
}> = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "last_7d", label: "近 7 天" },
  { value: "last_30d", label: "近 30 天" },
];

function getStateOptions(activeTab: RecycleBinTabValue) {
  const isFinalizeTab = activeTab === "customers" || activeTab === "trade-orders";

  const options: Array<{
    value: RecycleBinFilterStateValue;
    label: string;
  }> = [
    { value: "all", label: "全部状态" },
    { value: "restorable", label: "可恢复" },
    { value: "restore_blocked", label: "恢复受阻" },
    {
      value: "purge_blocked",
      label: isFinalizeTab ? "最终处理受阻" : "清理受阻",
    },
  ];

  return options;
}

export function RecycleBinFilterBar({
  activeTab,
  filters,
  deletedByOptions,
  resolvedByOptions,
  targetTypeOptions,
  finalActionOptions,
  historyArchiveSourceOptions,
  resetHref,
  exportHref,
}: Readonly<{
  activeTab: RecycleBinTabValue;
  filters: RecycleBinFilters;
  deletedByOptions: RecycleBinFilterOption[];
  resolvedByOptions: RecycleBinFilterOption[];
  targetTypeOptions: RecycleBinFilterOption[];
  finalActionOptions: RecycleBinFilterOption[];
  historyArchiveSourceOptions: RecycleBinFilterOption[];
  resetHref: string;
  exportHref?: string | null;
}>) {
  const stateOptions = getStateOptions(activeTab);
  const showStateFilter = filters.entryStatus === "active";
  const showHistoryAuditFilters = filters.entryStatus !== "active";

  return (
    <form method="get" className="crm-filter-panel">
      <input type="hidden" name="tab" value={activeTab} />
      <input type="hidden" name="entryStatus" value={filters.entryStatus} />
      <div
        className={`crm-filter-grid ${
          showStateFilter
            ? "xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
            : "xl:grid-cols-[repeat(4,minmax(0,1fr))] 2xl:grid-cols-[repeat(7,minmax(0,1fr))_auto]"
        }`}
      >
        <label className="space-y-1.5">
          <span className="crm-label">对象类型</span>
          <select name="targetType" defaultValue={filters.targetType} className="crm-select">
            <option value="all">全部对象</option>
            {targetTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}（{option.count}）
              </option>
            ))}
          </select>
        </label>

        {showStateFilter ? (
          <label className="space-y-1.5">
            <span className="crm-label">治理判断</span>
            <select name="state" defaultValue={filters.state} className="crm-select">
              {stateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="space-y-1.5">
          <span className="crm-label">删除人</span>
          <select name="deletedById" defaultValue={filters.deletedById} className="crm-select">
            <option value="">全部删除人</option>
            {deletedByOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}（{option.count}）
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="crm-label">删除时间</span>
          <select name="deletedRange" defaultValue={filters.deletedRange} className="crm-select">
            {deletedRangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {showHistoryAuditFilters ? (
          <label className="space-y-1.5">
            <span className="crm-label">处理人</span>
            <select name="resolvedById" defaultValue={filters.resolvedById} className="crm-select">
              <option value="">全部处理人</option>
              {resolvedByOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}（{option.count}）
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showHistoryAuditFilters ? (
          <label className="space-y-1.5">
            <span className="crm-label">处理时间</span>
            <select
              name="resolvedRange"
              defaultValue={filters.resolvedRange}
              className="crm-select"
            >
              {deletedRangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showHistoryAuditFilters ? (
          <label className="space-y-1.5">
            <span className="crm-label">finalAction</span>
            <select name="finalAction" defaultValue={filters.finalAction} className="crm-select">
              <option value="all">全部 finalAction</option>
              {finalActionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}（{option.count}）
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showHistoryAuditFilters ? (
          <label className="space-y-1.5">
            <span className="crm-label">Archive Source</span>
            <select
              name="historyArchiveSource"
              defaultValue={filters.historyArchiveSource}
              className="crm-select"
            >
              <option value="all">全部来源</option>
              {historyArchiveSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}（{option.count}）
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="crm-filter-actions xl:justify-end">
          <button type="submit" className="crm-button crm-button-primary">
            应用筛选
          </button>
          <Link href={resetHref} className="crm-button crm-button-secondary">
            重置
          </Link>
          {exportHref ? (
            <Link href={exportHref} className="crm-button crm-button-secondary">
              导出明细
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}
