import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { PageHeader } from "@/components/shared/page-header";

export default function RecycleBinLoading() {
  return (
    <WorkbenchLayout
      header={
        <div className="mb-4">
          <PageHeader
            eyebrow="回收站治理工作台"
            title="回收站"
            description="正在准备回收站条目、恢复状态与最终处理摘要，请稍候。"
          />
        </div>
      }
      summary={
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="crm-loading-block h-[5.75rem] rounded-[1rem] border border-black/8"
            />
          ))}
        </div>
      }
      toolbar={<div className="crm-loading-block h-12 rounded-[1rem] border border-black/8" />}
    >
      <section className="overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.86)] shadow-[0_10px_22px_rgba(18,24,31,0.04)]">
        <div className="border-b border-black/8 bg-[rgba(247,248,250,0.66)] px-4 py-3 md:px-5">
          <div className="crm-loading-block h-5 w-48 rounded-full" />
          <div className="mt-2 crm-loading-block h-4 w-72 rounded-full" />
        </div>
        <div className="p-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="crm-loading-block h-14 rounded-none border-b border-black/6 last:border-b-0"
            />
          ))}
        </div>
      </section>
    </WorkbenchLayout>
  );
}
