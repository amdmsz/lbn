import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function LeadsLoading() {
  return (
    <LoadingTableState
      title="线索中心"
      description="正在加载线索列表与筛选条件。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取线索数据。"
      filterCount={5}
      rowCount={6}
    />
  );
}
