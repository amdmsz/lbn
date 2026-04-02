import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function GiftsLoading() {
  return (
    <LoadingTableState
      title="礼品记录"
      description="正在加载礼品资格、审核和发货数据。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取礼品列表与审核状态。"
      filterCount={3}
      rowCount={6}
    />
  );
}
