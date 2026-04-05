import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function ProductDetailLoading() {
  return (
    <LoadingTableState
      title="商品详情"
      description="正在加载商品与 SKU 详情。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取商品、SKU 和供货商数据。"
      filterCount={0}
      rowCount={5}
    />
  );
}
