import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function FulfillmentLoading() {
  return (
    <LoadingTableState
      title="订单中心"
      description="正在加载订单中心与当前履约工作面。"
      sectionTitle="加载中"
      sectionDescription="系统正在读取交易单、发货执行或批次记录，以及当前筛选上下文。"
      filterCount={4}
      rowCount={6}
    />
  );
}
