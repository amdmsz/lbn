import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function DashboardLoading() {
  return (
    <LoadingTableState
      title="仪表盘"
      description="正在加载核心指标、转化看板和排行摘要。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在聚合线索、跟进、直播、礼品和发货数据。"
      filterCount={5}
      rowCount={6}
    />
  );
}
