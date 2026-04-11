import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function ProductsLoading() {
  return (
    <LoadingTableState
      title="商品中心"
      description="正在准备商品主数据工作台，请稍候。"
      sectionTitle="同步商品列表"
      sectionDescription="系统正在读取商品、供应商和 SKU 摘要，并恢复当前工作台筛选条件。"
      filterCount={3}
      rowCount={7}
    />
  );
}
