import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function SettingsTeamsLoading() {
  return (
    <LoadingTableState
      title="团队管理"
      description="正在加载团队结构和团队主管信息。"
      sectionTitle="团队列表加载中"
      sectionDescription="请稍候，系统正在读取团队、成员和主管归属。"
      filterCount={2}
      rowCount={5}
    />
  );
}
