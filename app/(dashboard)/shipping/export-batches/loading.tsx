import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function ShippingExportBatchesLoading() {
  return (
    <LoadingTableState
      title="报单批次"
      description="正在加载报单批次列表。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取供货商报单批次和关联任务数量。"
      filterCount={0}
      rowCount={5}
    />
  );
}
