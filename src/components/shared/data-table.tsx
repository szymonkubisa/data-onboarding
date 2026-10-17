"use client";

import {
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const tableFeatureSet = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type DataColumn<T extends RowData> = ColumnDef<typeof tableFeatureSet, T, unknown> & {
  meta?: { headerClassName?: string; cellClassName?: string };
};

/**
 * Headless TanStack Table v9 with our markup. Client-side pagination; page position is
 * kept when the data changes (a cell edit recomputes every record), and clamped when
 * a filter makes the current page disappear.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  getRowId,
  pageSize = 25,
  caption,
  empty,
  rowClassName,
  className,
  resetKey,
}: {
  columns: DataColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  pageSize?: number;
  /** Accessible table name. Visually hidden. */
  caption: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  /** Change this (e.g. on filter change) to go back to the first page. */
  resetKey?: string;
}) {
  const [requested, setRequested] = useState<PaginationState>({ pageIndex: 0, pageSize });
  const [resetFor, setResetFor] = useState(resetKey);
  if (resetFor !== resetKey) {
    // Adjusting state during render (not in an effect) avoids a flash of the old page.
    setResetFor(resetKey);
    setRequested((p) => ({ ...p, pageIndex: 0 }));
  }

  // Clamp instead of storing: a filter can shrink the data below the current page.
  const pageCount = Math.max(1, Math.ceil(data.length / requested.pageSize));
  const pagination = { ...requested, pageIndex: Math.min(requested.pageIndex, pageCount - 1) };

  const table = useTable({
    features: tableFeatureSet,
    columns,
    data,
    getRowId: (row) => getRowId(row),
    state: { pagination },
    onPaginationChange: setRequested,
    autoResetPageIndex: false,
  });

  const rows = table.getRowModel().rows;
  const first = data.length === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const last = Math.min(data.length, (pagination.pageIndex + 1) * pagination.pageSize);

  return (
    <div className={cn("overflow-hidden rounded-card border bg-card", className)}>
      {/* Focusable so keyboard users can scroll wide tables (WCAG 2.1.1). */}
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full caption-bottom border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/60">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b">
                {group.headers.map((header) => {
                  const meta = (header.column.columnDef as DataColumn<T>).meta;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        "h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>{empty}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b last:border-b-0 hover:bg-muted/40",
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getAllCells().map((cell) => {
                    const meta = (cell.column.columnDef as DataColumn<T>).meta;
                    return (
                      <td key={cell.id} className={cn("px-3 py-2 align-top", meta?.cellClassName)}>
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data.length > pagination.pageSize && (
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums" aria-live="polite">
            {first.toLocaleString("en-US")}–{last.toLocaleString("en-US")} of{" "}
            {data.length.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-1">
            <span className="mr-2 tabular-nums">
              Page {pagination.pageIndex + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
