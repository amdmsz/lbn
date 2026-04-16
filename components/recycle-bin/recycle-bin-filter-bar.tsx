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
  { value: "today", label: "今天删除" },
  { value: "last_7d", label: "近 7 天" },
  { value: "last_30d", label: "近 30 天" },
];

function getStateOptions(activeTab: RecycleBinTabValue) {
  const options: Array<{
    value: RecycleBinFilterStateValue;
    label: string;
  }> = [
    { value: "all", label: "全部状态" },
    { value: "restorable", label: "可恢复" },
    { value: "restore_blocked", label: "恢复受阻" },
    {
      value: "purge_blocked",
      label: activeTab === "customers" ? "最终处理受限" : "永久删除受阻",
    },
  ];

  return options;
}

export function RecycleBinFilterBar({
  activeTab,
  filters,
  deletedByOptions,
  targetTypeOptions,
  resetHref,
}: Readonly<{
  activeTab: RecycleBinTabValue;
  filters: RecycleBinFilters;
  deletedByOptions: RecycleBinFilterOption[];
  targetTypeOptions: RecycleBinFilterOption[];
  resetHref: string;
}>) {
  const stateOptions = getStateOptions(activeTab);

  return (
    <form method="get" className="crm-filter-panel">
      <input type="hidden" name="tab" value={activeTab} />
      <div className="crm-filter-grid xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
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

        <label className="space-y-1.5">
          <span className="crm-label">当前状态</span>
          <select name="state" defaultValue={filters.state} className="crm-select">
            {stateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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

        <div className="crm-filter-actions xl:justify-end">
          <button type="submit" className="crm-button crm-button-primary">
            应用筛选
          </button>
          <Link href={resetHref} className="crm-button crm-button-secondary">
            重置
          </Link>
        </div>
      </div>
    </form>
  );
}
