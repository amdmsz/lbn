import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function ReportsLoading() {
  return (
    <LoadingTableState
      title="基础报表"
      description="正在加载基础报表、转化指标和员工排行。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在聚合近 30 天的执行与转化数据。"
      filterCount={4}
      rowCount={8}
    />
  );
}
