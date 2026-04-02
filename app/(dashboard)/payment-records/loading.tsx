import { LoadingTableState } from "@/components/shared/loading-table-state";

export default function PaymentRecordsLoading() {
  return (
    <LoadingTableState
      title="收款记录中心"
      description="正在加载已提交和已确认的收款记录。"
      sectionTitle="收款记录工作台"
      sectionDescription="请稍候，系统正在读取收款记录、关联计划和审核入口。"
      filterCount={6}
      rowCount={6}
    />
  );
}
