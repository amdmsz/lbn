import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function SettingsUsersLoading() {
  return (
    <LoadingTableState
      title="账号管理"
      description="正在加载账号、团队和直属主管信息。"
      sectionTitle="账号列表加载中"
      sectionDescription="请稍候，系统正在读取当前角色可见的账号目录。"
      filterCount={4}
      rowCount={8}
    />
  );
}
