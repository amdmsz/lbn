import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function ShippingReturnsLoading() {
  return (
    <LoadingTableState
      title="退货物流跟踪台"
      description="正在加载发货人侧的退货物流和回仓任务。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取退货工单、运单和入库状态。"
      filterCount={3}
      rowCount={6}
    />
  );
}
