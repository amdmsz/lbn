import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function OrdersLoading() {
  return (
    <LoadingTableState
      title="订单中心"
      description="正在加载订单列表和状态摘要。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取订单、支付和发货数据。"
      filterCount={4}
      rowCount={6}
    />
  );
}
