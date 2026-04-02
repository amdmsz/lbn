import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function ProductsLoading() {
  return (
    <LoadingTableState
      title="商品中心"
      description="正在加载商品和 SKU 摘要。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取商品列表、供货商和 SKU 数据。"
      filterCount={1}
      rowCount={6}
    />
  );
}
