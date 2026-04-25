import type { CSSProperties, ReactNode } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

type EntityTableColumn<T> = {
  key: string;
  title: string;
  className?: string;
  headerClassName?: string;
  cellStyle?: CSSProperties;
  render: (row: T) => ReactNode;
};

export function EntityTable<T>({
  columns,
  rows,
  getRowKey,
  getRowId,
  getRowClassName,
  emptyTitle = "暂无数据",
  emptyDescription = "当前筛选条件下没有匹配的数据。",
  className,
  dense = false,
  density = "compact",
}: Readonly<{
  columns: EntityTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  getRowId?: (row: T, index: number) => string | undefined;
  getRowClassName?: (row: T, index: number) => string | undefined;
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
    <div
      className={cn(
        "crm-table-shell overflow-x-auto overflow-y-hidden rounded-[1.2rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-md)]",
        className,
      )}
    >
      <table
        className={cn(
          "crm-table min-w-full",
          density === "compact"
            ? "[&_th]:px-3.5 [&_th]:py-3 [&_td]:px-3.5 [&_td]:py-3"
            : "[&_th]:px-4 [&_td]:px-4",
        )}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]",
                  column.headerClassName,
                )}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row, index)}
              id={getRowId?.(row, index)}
              className={getRowClassName?.(row, index)}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={column.cellStyle}
                  className={cn(
                    "align-top text-[13px] leading-5 text-[var(--foreground)]",
                    dense ? "py-3" : "",
                    column.className,
                  )}
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
