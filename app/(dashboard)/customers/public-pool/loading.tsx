import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function CustomerPublicPoolLoading() {
  return (
    <LoadingTableState
      title="公海池"
      description="正在加载公海池工作台与当前客户流转数据。"
      sectionTitle="加载中"
      sectionDescription="请稍候，系统正在读取公海池客户、流转记录和筛选上下文。"
      filterCount={5}
      rowCount={6}
    />
  );
}
