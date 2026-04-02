import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function FinanceLoading() {
  return (
    <LoadingTableState
      title="财务预览"
      description="正在聚合收款、对账与异常数据。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取 payment layer、fulfillment layer 和 finance 预览口径。"
      filterCount={5}
      rowCount={6}
    />
  );
}
