import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function LiveSessionsLoading() {
  return (
    <LoadingTableState
      title="直播场次"
      description="正在加载直播场次与邀约概览数据。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取直播场次数据。"
      filterCount={3}
      rowCount={6}
    />
  );
}
