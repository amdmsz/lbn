export default function LeadDetailLoading() {
  return (
    <div className="crm-page">
      <div className="space-y-3">
        <div className="crm-loading-block h-8 w-56" />
        <div className="crm-loading-block h-5 w-full max-w-2xl" />
      </div>

      <div className="crm-card p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
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

      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="crm-card p-6">
            <div className="crm-loading-block h-6 w-40" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((__, rowIndex) => (
                <div key={rowIndex} className="crm-loading-block h-24 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
