import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function CustomersLoading() {
  return (
    <LoadingTableState
      title="客户中心"
      description="正在加载客户列表与详情摘要。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取客户数据。"
      filterCount={5}
      rowCount={6}
    />
  );
}
