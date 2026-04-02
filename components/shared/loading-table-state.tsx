import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";

export function LoadingTableState({
  title,
  description,
  sectionTitle,
  sectionDescription,
  filterCount = 3,
  rowCount = 6,
}: Readonly<{
  title: string;
  description: string;
  sectionTitle: string;
  sectionDescription: string;
  filterCount?: number;
  rowCount?: number;
}>) {
  return (
    <div className="crm-page">
      <PageHeader title={title} description={description} />

      <DataTableWrapper title={sectionTitle} description={sectionDescription}>
        <div className="space-y-4">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.max(filterCount, 1)}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: filterCount }).map((_, index) => (
              <div key={index} className="crm-loading-block h-10" />
            ))}
          </div>

          <div className="crm-table-shell">
            {Array.from({ length: rowCount }).map((_, index) => (
              <div
                key={index}
                className="crm-loading-block h-12 rounded-none border-b border-black/6 last:border-b-0"
              />
            ))}
          </div>
        </div>
      </DataTableWrapper>
    </div>
  );
}
