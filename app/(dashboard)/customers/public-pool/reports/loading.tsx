import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function CustomerPublicPoolReportsLoading() {
  return (
    <LoadingTableState
      title="公海池运营报表"
      description="正在加载公海池趋势、分布和团队表现数据。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在汇总当前窗口下的公海池运营数据。"
      filterCount={3}
      rowCount={6}
    />
  );
}
