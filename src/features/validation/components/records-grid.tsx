"use client";

import { Ban, CircleAlert, Copy, TriangleAlert, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkflowActions } from "@/application/workflow/react";
import type { ProcessedRecord } from "@/domain/quality/types";
import type { FieldDefinition } from "@/domain/schema/types";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CellEditor } from "./cell-editor";

function ValueCell({ record, field }: { record: ProcessedRecord; field: FieldDefinition }) {
  const [open, setOpen] = useState(false);
  const value = record.values[field.key] ?? "";
  const issues = record.issues.filter((i) => i.field === field.key);
  const changes = record.applied.filter((t) => t.field === field.key);
  const severity = issues.some((i) => i.severity === "error")
    ? "error"
    : issues.length > 0
      ? "warning"
      : null;
  const edited = changes.some((c) => c.kind === "manual");
  const describe = [
    `${field.label}, row ${record.sourceRowNumber}: ${value || "empty"}`,
    severity === "error" ? "has an error" : severity === "warning" ? "has a warning" : null,
    edited ? "edited" : changes.length > 0 ? "changed automatically" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={describe}
          data-field={field.key}
          className={cn(
            "group flex w-full max-w-60 min-w-28 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left font-mono text-xs transition-colors hover:bg-muted focus-visible:bg-muted",
            record.excluded && "text-muted-foreground line-through",
          )}
        >
          <span
            className={cn(
              "truncate",
              severity && "underline decoration-wavy decoration-1 underline-offset-4",
              severity === "error" && "decoration-destructive",
              severity === "warning" && "decoration-warning",
            )}
          >
            {value === "" ? (
              <span className="text-muted-foreground/60 no-underline">—</span>
            ) : (
              value
            )}
          </span>
          {changes.length > 0 && (
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                edited ? "bg-foreground" : "bg-primary",
              )}
              aria-hidden
            />
          )}
          {severity === "error" && (
            <CircleAlert className="ml-auto size-3.5 shrink-0 text-destructive" aria-hidden />
          )}
          {severity === "warning" && (
            <TriangleAlert className="ml-auto size-3.5 shrink-0 text-warning" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <CellEditor record={record} field={field} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function RowStatus({
  record,
  onShowDuplicates,
}: {
  record: ProcessedRecord;
  onShowDuplicates: () => void;
}) {
  const duplicate = record.issues.find((i) => i.code === "possible-duplicate");
  const rowIssues = record.issues.filter((i) => !i.field && i.code !== "possible-duplicate");
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-8 text-xs text-muted-foreground tabular-nums">
        {record.sourceRowNumber}
      </span>
      {duplicate && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onShowDuplicates}
              className="rounded-sm p-0.5 text-warning hover:bg-muted"
              aria-label={duplicate.message}
            >
              <Copy className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>{duplicate.message}</TooltipContent>
        </Tooltip>
      )}
      {rowIssues.map((issue) => (
        <Tooltip key={issue.id}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="text-destructive" aria-label={issue.message}>
              <CircleAlert className="size-3.5" aria-hidden />
            </span>
          </TooltipTrigger>
          <TooltipContent>{issue.message}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function RecordsGrid({
  records,
  fields,
  resetKey,
  onShowDuplicates,
}: {
  records: ProcessedRecord[];
  fields: readonly FieldDefinition[];
  resetKey: string;
  onShowDuplicates: () => void;
}) {
  const { setExcluded } = useWorkflowActions();

  const columns = useMemo<DataColumn<ProcessedRecord>[]>(() => {
    const toggle = (record: ProcessedRecord) => {
      setExcluded([record.rowId], !record.excluded);
      if (!record.excluded) {
        toast(`Row ${record.sourceRowNumber} excluded from the export`, {
          action: { label: "Undo", onClick: () => setExcluded([record.rowId], false) },
        });
      }
    };
    return [
      {
        id: "row",
        header: "Row",
        cell: ({ row }) => <RowStatus record={row.original} onShowDuplicates={onShowDuplicates} />,
        meta: { cellClassName: "py-1.5" },
      },
      ...fields.map((field): DataColumn<ProcessedRecord> => ({
        id: field.key,
        header: () => (
          <span>
            {field.label}
            {field.required && <span className="text-destructive"> *</span>}
          </span>
        ),
        cell: ({ row }) => <ValueCell record={row.original} field={field} />,
        meta: { cellClassName: "px-2 py-1.5" },
      })),
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const record = row.original;
          return (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => toggle(record)}
              aria-label={`${record.excluded ? "Restore" : "Exclude"} row ${record.sourceRowNumber}`}
            >
              {record.excluded ? <Undo2 /> : <Ban />}
            </Button>
          );
        },
        meta: { cellClassName: "py-1.5 text-right" },
      },
    ];
  }, [fields, onShowDuplicates, setExcluded]);

  return (
    <DataTable
      caption="Validated records"
      columns={columns}
      data={records}
      getRowId={(r) => r.rowId}
      pageSize={25}
      resetKey={resetKey}
      rowClassName={(r) => (r.excluded ? "bg-muted/40" : undefined)}
      empty={
        <EmptyState
          icon={CircleAlert}
          title="No rows match these filters"
          description="Clear a filter to see more rows."
        />
      }
    />
  );
}
