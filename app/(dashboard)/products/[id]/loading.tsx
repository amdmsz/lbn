import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { PageContextLink } from "@/components/shared/page-context-link";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";

export default function ProductDetailLoading() {
  return (
    <WorkbenchLayout
      header={
        <div className="mb-4">
          <PageHeader
            context={
              <PageContextLink href="/products" label="返回商品中心" trail={["商品中心"]} />
            }
            eyebrow="商品主数据档案"
            title="商品详情"
            description="正在准备商品摘要与 SKU 工作区，请稍候。"
          />
        </div>
      }
      summary={
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="crm-loading-block h-[5.75rem] rounded-[1rem] border border-black/8"
            />
          ))}
        </div>
      }
    >
      <SectionCard
        density="compact"
        title="加载商品概览"
        description="系统正在读取商品主数据与供应商挂接。"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,320px)]">
          <div className="space-y-3">
            <div className="crm-loading-block h-24 rounded-[0.95rem]" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="crm-loading-block h-20 rounded-[0.95rem]" />
              <div className="crm-loading-block h-20 rounded-[0.95rem]" />
            </div>
          </div>
          <div className="crm-loading-block h-[13rem] rounded-[0.95rem]" />
        </div>
      </SectionCard>

      <SectionCard
        density="compact"
        title="加载 SKU 工作区"
        description="系统正在同步规格、默认单价和引用摘要。"
        contentClassName="p-0"
      >
        <div className="divide-y divide-black/6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 px-4 py-3.5 md:px-5">
              <div className="crm-loading-block h-4 w-40 rounded-full" />
              <div className="crm-loading-block h-4 w-56 rounded-full" />
              <div className="crm-loading-block h-4 w-full rounded-full" />
            </div>
          ))}
        </div>
      </SectionCard>
    </WorkbenchLayout>
  );
}
