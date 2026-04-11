import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function CustomerPublicPoolSettingsLoading() {
  return (
    <LoadingTableState
      title="公海池团队规则"
      description="正在加载回收规则、保护期和自动分配配置。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取当前团队的公海池规则。"
      filterCount={3}
      rowCount={5}
    />
  );
}
