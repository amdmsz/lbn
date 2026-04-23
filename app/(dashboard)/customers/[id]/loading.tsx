import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";

export default function CustomerDetailLoading() {
  return (
    <WorkbenchLayout
      className="!gap-0"
      layoutClassName="xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]"
      header={
        <section className="overflow-hidden rounded-[1.2rem] border border-[rgba(25,40,72,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,247,255,0.9))] px-4 py-3.5 shadow-[0_14px_28px_rgba(18,24,31,0.05)] md:px-5 md:py-4 xl:px-6 xl:py-5">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-2">
                <div className="crm-loading-block h-4 w-28" />
                <div className="crm-loading-block h-10 w-48" />
                <div className="crm-loading-block h-4 w-full max-w-3xl" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="crm-loading-block h-7 w-24 rounded-full" />
                ))}
              </div>
            </div>

            <div className="grid w-full gap-2.5 2xl:max-w-[18rem] 2xl:min-w-[16.25rem]">
              <div className="rounded-[0.95rem] border border-[rgba(25,40,72,0.08)] bg-[rgba(255,255,255,0.9)] px-4 py-3 shadow-[0_8px_18px_rgba(18,24,31,0.03)]">
                <div className="crm-loading-block h-3 w-20" />
                <div className="mt-2 crm-loading-block h-8 w-28" />
                <div className="mt-2 crm-loading-block h-4 w-full" />
              </div>
              <div className="rounded-[1rem] border border-[rgba(25,40,72,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(245,249,255,0.84))] px-4 py-3.5 shadow-[0_10px_22px_rgba(18,24,31,0.04)]">
                <div className="crm-loading-block h-3 w-24" />
                <div className="mt-2 crm-loading-block h-5 w-36" />
                <div className="mt-2 crm-loading-block h-4 w-full" />
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <div className="crm-loading-block h-9 w-28 rounded-[0.85rem]" />
                  <div className="crm-loading-block h-9 w-24 rounded-[0.85rem]" />
                </div>
              </div>
            </div>
          </div>
        </section>
      }
      summary={
        <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[1rem] border border-[rgba(25,40,72,0.08)] bg-[rgba(255,255,255,0.94)] px-3.5 py-3 shadow-[0_8px_18px_rgba(18,24,31,0.03)] md:px-4 md:py-3.5"
            >
              <div className="crm-loading-block h-3 w-16" />
              <div className="mt-2 crm-loading-block h-7 w-24" />
              <div className="mt-2 crm-loading-block h-4 w-full" />
            </div>
          ))}
        </div>
      }
      sidebarPosition="left"
      sidebar={
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <section
              key={index}
              className="rounded-[1rem] border border-[rgba(25,40,72,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(245,249,255,0.86))] px-4 py-4 shadow-[0_10px_22px_rgba(18,24,31,0.04)]"
            >
              <div className="crm-loading-block h-3 w-16" />
              <div className="mt-2 crm-loading-block h-5 w-28" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="crm-loading-block h-4 w-full" />
                ))}
              </div>
            </section>
          ))}
        </div>
      }
    >
      <section
        id="customer-main"
        className="rounded-[1.05rem] border border-[rgba(25,40,72,0.08)] bg-[rgba(255,255,255,0.9)] px-4 py-3.5 shadow-[0_10px_22px_rgba(18,24,31,0.04)] md:px-5 md:py-4"
      >
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <div className="crm-loading-block h-3 w-16" />
            <div className="crm-loading-block h-5 w-40" />
            <div className="crm-loading-block h-4 w-full max-w-xl" />
          </div>
          <div className="space-y-1.5">
            <div className="crm-loading-block h-4 w-40" />
            <div className="crm-loading-block h-4 w-32" />
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="crm-loading-block h-8 w-24 rounded-[0.75rem]" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="crm-loading-block h-8 w-20 rounded-[0.75rem]" />
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[1rem] border border-[rgba(25,40,72,0.08)] bg-[linear-gradient(180deg,rgba(247,250,255,0.88),rgba(255,255,255,0.94))] px-4 py-3.5"
            >
              <div className="crm-loading-block h-4 w-28" />
              <div className="mt-2 crm-loading-block h-4 w-full" />
              <div className="mt-3 flex flex-wrap gap-3">
                {Array.from({ length: 3 }).map((__, metaIndex) => (
                  <div key={metaIndex} className="crm-loading-block h-3 w-24" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </WorkbenchLayout>
  );
}
