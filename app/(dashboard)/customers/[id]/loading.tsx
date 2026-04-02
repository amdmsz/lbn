export default function CustomerDetailLoading() {
  return (
    <div className="crm-page">
      <div className="crm-card overflow-hidden">
        <div className="space-y-4 bg-[linear-gradient(135deg,rgba(155,93,47,0.08),rgba(54,95,135,0.02))] px-6 py-6 md:px-7 md:py-7">
          <div className="crm-loading-block h-4 w-32" />
          <div className="crm-loading-block h-10 w-64" />
          <div className="crm-loading-block h-5 w-full max-w-3xl" />
        </div>
        <div className="crm-summary-metrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="crm-summary-metric space-y-3">
              <div className="crm-loading-block h-4 w-20" />
              <div className="crm-loading-block h-8 w-28" />
              <div className="crm-loading-block h-4 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="crm-subtle-panel space-y-4">
        <div className="crm-toolbar-cluster">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="crm-loading-block h-9 w-28" />
          ))}
        </div>
        <div className="space-y-2">
          <div className="crm-loading-block h-4 w-36" />
          <div className="crm-loading-block h-4 w-48" />
        </div>
      </div>

      <div className="crm-subtle-panel space-y-4">
        <div className="space-y-2">
          <div className="crm-loading-block h-4 w-24" />
          <div className="crm-loading-block h-5 w-full max-w-xl" />
        </div>
        <div className="crm-toolbar-cluster">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="crm-loading-block h-11 w-32" />
          ))}
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="crm-loading-block h-4 w-20" />
              <div className="crm-loading-block h-6 w-full" />
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-2">
          <div className="crm-loading-block h-4 w-16" />
          <div className="crm-loading-block h-20 w-full" />
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="crm-loading-block h-12 w-full rounded-[1rem]" />
        <div className="mt-4 space-y-2">
          <div className="crm-loading-block h-4 w-20" />
          <div className="crm-loading-block h-5 w-full max-w-2xl" />
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="crm-loading-block h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
