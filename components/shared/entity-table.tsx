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
  variant = "table",
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
  variant?: "table" | "list";
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
        "crm-table-shell overflow-x-auto overflow-y-hidden rounded-2xl border border-border/60 bg-card shadow-sm",
        variant === "list" &&
          "rounded-2xl border-border/50 bg-card shadow-sm",
        className,
      )}
    >
      <table
        className={cn(
          "crm-table min-w-full [&_tbody]:bg-transparent [&_td]:border-b [&_td]:border-border/40 [&_thead]:bg-transparent [&_th]:border-b [&_th]:border-border/40 [&_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/30",
          variant === "list" && "crm-table-list",
          density === "compact"
            ? "[&_th]:px-3.5 [&_th]:py-3 [&_td]:px-3.5 [&_td]:py-4"
            : "[&_th]:px-4 [&_th]:py-3.5 [&_td]:px-4 [&_td]:py-4",
          variant === "list" && "[&_td]:py-5",
        )}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
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
                    "align-top text-[13px] leading-5 text-foreground",
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
