import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function LeadImportTemplatesLoading() {
  return (
    <LoadingTableState
      title="导入模板"
      description="正在加载导入模板与映射配置。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取模板数据。"
      filterCount={3}
      rowCount={4}
    />
  );
}
