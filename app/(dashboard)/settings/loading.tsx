import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function SettingsLoading() {
  return (
    <LoadingTableState
      title="主数据中心"
      description="正在加载标签、分类与字典主数据。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取主数据配置。"
      filterCount={4}
      rowCount={6}
    />
  );
}
