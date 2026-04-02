import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function SalesOrderDetailLoading() {
  return (
    <LoadingTableState
      title="订单详情"
      description="正在加载销售订单主档、审核信息与发货摘要。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取订单快照、审核状态和操作日志。"
      filterCount={0}
      rowCount={5}
    />
  );
}
