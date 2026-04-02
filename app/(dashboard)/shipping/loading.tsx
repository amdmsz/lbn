import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function ShippingLoading() {
  return (
    <LoadingTableState
      title="代发任务"
      description="正在加载代发任务和物流状态。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取代发任务、负责人和物流信息。"
      filterCount={3}
      rowCount={6}
    />
  );
}
