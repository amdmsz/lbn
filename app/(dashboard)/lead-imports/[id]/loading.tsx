export default function LeadImportDetailLoading() {
  return (
    <div className="crm-page">
      <div className="space-y-3">
        <div className="crm-loading-block h-8 w-64" />
        <div className="crm-loading-block h-5 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="crm-loading-block h-32 w-full" />
        ))}
      </div>

      <div className="crm-card p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="crm-loading-block h-4 w-20" />
              <div className="crm-loading-block h-6 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="crm-loading-block h-72 w-full" />
        <div className="crm-loading-block h-72 w-full" />
      </div>
    </div>
  );
}
