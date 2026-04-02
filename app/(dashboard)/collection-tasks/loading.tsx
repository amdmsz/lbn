import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function CollectionTasksLoading() {
  return (
    <LoadingTableState
      title="催收任务中心"
      description="正在加载催收与收款跟进任务。"
      sectionTitle="催收任务工作台"
      sectionDescription="请稍候，系统正在读取催收任务、负责人、到期时间和关联计划。"
      filterCount={6}
      rowCount={6}
    />
  );
}
