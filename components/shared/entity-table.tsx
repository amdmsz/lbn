import type { ReactNode } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

type EntityTableColumn<T> = {
  key: string;
  title: string;
  className?: string;
  headerClassName?: string;
  render: (row: T) => ReactNode;
};

export function EntityTable<T>({
  columns,
  rows,
  getRowKey,
  emptyTitle = "暂无数据",
  emptyDescription = "当前筛选条件下没有匹配的数据。",
  className,
  dense = false,
  density = "compact",
}: Readonly<{
  columns: EntityTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  dense?: boolean;
  density?: "default" | "compact";
}>) {
  if (rows.length === 0) {
    return (
      <EmptyState
        className={className}
        title={emptyTitle}
        description={emptyDescription}
        density={density}
      />
    );
  }

  return (
    <div className={cn("crm-table-shell", density === "compact" ? "rounded-[0.95rem]" : "", className)}>
      <table className={cn("crm-table", density === "compact" ? "[&_th]:py-3 [&_td]:py-3" : "")}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.headerClassName}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(dense ? "py-3" : "", column.className)}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
