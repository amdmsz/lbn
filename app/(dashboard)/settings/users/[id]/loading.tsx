import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function SettingsUserDetailLoading() {
  return (
    <LoadingTableState
      title="账号详情"
      description="正在加载账号详情与审计记录。"
      sectionTitle="详情加载中"
      sectionDescription="请稍候，系统正在读取账号档案、团队归属和 OperationLog。"
      filterCount={3}
      rowCount={6}
    />
  );
}
