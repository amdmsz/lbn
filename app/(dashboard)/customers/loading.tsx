import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function CustomerRowSkeleton({ index }: Readonly<{ index: number }>) {
  return (
    <article className="grid grid-cols-12 items-center gap-4 border-b border-border bg-card px-5 py-6 last:border-b-0 xl:px-6">
      <div className="col-span-12 flex min-w-0 items-center gap-3 lg:col-span-4">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock
            className={cn(
              "h-4",
              index % 3 === 0 ? "w-28" : index % 3 === 1 ? "w-36" : "w-24",
            )}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="h-3 w-44 max-w-full" />
          </div>
        </div>
      </div>

      <div className="col-span-12 min-w-0 space-y-2 lg:col-span-4">
        <SkeletonBlock className="h-4 w-56 max-w-full" />
        <SkeletonBlock className="h-3 w-40" />
        <div className="flex flex-wrap gap-1.5">
          <SkeletonBlock className="h-6 w-20 rounded-full" />
          <SkeletonBlock className="h-6 w-24 rounded-full" />
          <SkeletonBlock className="h-6 w-28 rounded-full" />
        </div>
      </div>

      <div className="col-span-12 min-w-0 space-y-2 lg:col-span-3">
        <SkeletonBlock className="h-3.5 w-full" />
        <SkeletonBlock className="h-3.5 w-4/5" />
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>

      <div className="col-span-12 flex items-center justify-end gap-1.5 lg:col-span-1">
        <SkeletonBlock className="h-9 w-9 rounded-full" />
        <SkeletonBlock className="h-9 w-9 rounded-full" />
      </div>
    </article>
  );
}

export default function CustomersLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-9 w-28 rounded-full" />
            <SkeletonBlock className="h-9 w-32 rounded-full" />
          </div>
          <SkeletonBlock className="h-4 w-24" />
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm md:p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-3 w-48" />
          </div>
          <SkeletonBlock className="h-8 w-20 rounded-full" />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {Array.from({ length: 6 }).map((_, index) => (
            <CustomerRowSkeleton key={index} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
