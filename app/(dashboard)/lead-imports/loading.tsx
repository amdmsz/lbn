import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function LeadImportsLoading() {
  return (
    <LoadingTableState
      title="线索导入中心"
      description="正在加载导入批次、模板和导入配置。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取导入中心数据。"
      filterCount={3}
      rowCount={5}
    />
  );
}
