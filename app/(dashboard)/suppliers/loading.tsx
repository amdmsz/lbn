import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function SuppliersLoading() {
  return (
    <LoadingTableState
      title="供货商中心"
      description="正在加载供货商主数据。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取供货商列表和关联摘要。"
      filterCount={0}
      rowCount={6}
    />
  );
}
