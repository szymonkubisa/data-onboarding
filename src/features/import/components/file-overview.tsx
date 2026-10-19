"use client";

import { FileSpreadsheet, FileText, RefreshCw, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { useWorkflow, useWorkflowActions } from "@/application/workflow/react";
import type { SourceDataset, SourceRow } from "@/domain/dataset/types";
import { isSchemaId, listSchemas } from "@/domain/schema/registry";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilePicker } from "./dropzone";

const PREVIEW_ROWS = 20;

export function CellValue({ value }: { value: string }) {
  if (value.trim() === "") return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="block max-w-56 truncate font-mono text-xs" title={value}>
      {value}
    </span>
  );
}

function PreviewTable({ dataset }: { dataset: SourceDataset }) {
  const columns = useMemo<DataColumn<SourceRow>[]>(
    () => [
      {
        id: "__row",
        header: "#",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.original.sourceRowNumber}
          </span>
        ),
        meta: { cellClassName: "w-10" },
      },
      ...dataset.columns.map((column): DataColumn<SourceRow> => ({
        id: column.id,
        header: () => <span className="font-mono">{column.name}</span>,
        cell: ({ row }) => <CellValue value={row.original.values[column.id] ?? ""} />,
      })),
    ],
    [dataset],
  );
  const data = useMemo(() => dataset.rows.slice(0, PREVIEW_ROWS), [dataset]);

  return (
    <DataTable
      caption={`First ${data.length} rows of ${dataset.fileName}`}
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      pageSize={PREVIEW_ROWS}
    />
  );
}

export function FileOverview({
  dataset,
  onReplace,
}: {
  dataset: SourceDataset;
  onReplace: (file: File) => void;
}) {
  const schemaId = useWorkflow((s) => s.schemaId);
  const { setSchema } = useWorkflowActions();
  const picker = useFilePicker(onReplace);
  const Icon = dataset.fileType === "xlsx" ? FileSpreadsheet : FileText;

  return (
    <div className="space-y-6">
      <section aria-label="File" className="rounded-card border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-medium">{dataset.fileName}</p>
            <p className="text-sm text-muted-foreground">
              {dataset.fileType.toUpperCase()}
              {dataset.sheetName ? ` · sheet “${dataset.sheetName}”` : ""} ·{" "}
              <span className="tabular-nums">{dataset.rows.length.toLocaleString("en-US")}</span>{" "}
              rows · <span className="tabular-nums">{dataset.columns.length}</span> columns
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="schema-select" className="text-sm text-muted-foreground">
                Import as
              </Label>
              <Select
                value={schemaId}
                onValueChange={(value) => isSchemaId(value) && setSchema(value)}
              >
                <SelectTrigger id="schema-select" className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {listSchemas().map((schema) => (
                    <SelectItem key={schema.id} value={schema.id}>
                      {schema.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={picker.open}>
              <RefreshCw data-icon="inline-start" />
              Replace file
            </Button>
            {picker.input}
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Columns
          </h2>
          <ul className="flex flex-wrap gap-1.5" aria-label="Columns in the file">
            {dataset.columns.map((column) => (
              <li
                key={column.id}
                className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs"
                title={
                  column.originalName !== column.name
                    ? `Original header: “${column.originalName}”`
                    : undefined
                }
              >
                {column.name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {dataset.warnings.length > 0 && (
        <Alert className="border-warning/30 bg-warning-soft">
          <TriangleAlert className="text-warning" />
          <AlertTitle>Adjusted while reading the file</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {dataset.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="preview-title" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="preview-title" className="text-sm font-medium">
            Preview
          </h2>
          <p className="text-xs text-muted-foreground">
            First {Math.min(PREVIEW_ROWS, dataset.rows.length)} of{" "}
            {dataset.rows.length.toLocaleString("en-US")} rows, raw values
          </p>
        </div>
        <PreviewTable dataset={dataset} />
      </section>
    </div>
  );
}
