"use client";

import {
  Ban,
  CircleAlert,
  Download,
  FileJson,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { useWorkflow, useWorkflowActions } from "@/application/workflow/react";
import { selectExportPlan, selectSchema } from "@/application/workflow/selectors";
import type { CsvDelimiter } from "@/domain/export/build-export";
import { needsFormulaEscape } from "@/domain/export/formula";
import { StepFooter } from "@/components/layout/step-footer";
import { StepHeader } from "@/components/layout/step-header";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useExportDownloads } from "../use-export";

const PREVIEW_ROWS = 10;

interface PreviewRow {
  id: string;
  cells: string[];
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-card border bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", tone)} aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("en-US")}</p>
    </div>
  );
}

function ExportedCell({ value }: { value: string }) {
  if (value === "") return <span className="text-muted-foreground/60">—</span>;
  if (!needsFormulaEscape(value)) {
    return (
      <span className="block max-w-56 truncate font-mono text-xs" title={value}>
        {value}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="flex max-w-56 items-center gap-1 font-mono text-xs"
          aria-label={`${value}, escaped as text in the CSV`}
        >
          <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{value}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        A spreadsheet would run this as a formula. It is written as text (prefixed with an
        apostrophe).
      </TooltipContent>
    </Tooltip>
  );
}

function IncludeErrorsControl({ errors }: { errors: number }) {
  const include = useWorkflow((s) => s.exportOptions.includeErrorRows);
  const { setExportOptions } = useWorkflowActions();
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={include}
        disabled={errors === 0 && !include}
        onCheckedChange={(checked) =>
          checked ? setConfirming(true) : setExportOptions({ includeErrorRows: false })
        }
        className="mt-0.5"
      />
      <div>
        <Label htmlFor={id}>Include rows with errors</Label>
        <p className="text-xs text-muted-foreground">
          Off by default. Rows with errors fail the schema contract.
        </p>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export {errors} rows that have errors?</AlertDialogTitle>
            <AlertDialogDescription>
              These rows are missing required values or contain invalid ones. The downstream system
              may reject them. The JSON report will list every unresolved issue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them out</AlertDialogCancel>
            <AlertDialogAction onClick={() => setExportOptions({ includeErrorRows: true })}>
              Include rows with errors
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const DELIMITERS: { value: CsvDelimiter; label: string }[] = [
  { value: ",", label: "Comma (,)" },
  { value: ";", label: "Semicolon (;)" },
  { value: "\t", label: "Tab" },
];

/** Everything on the export step except page chrome. Rendered alone in tests. */
export function ExportWorkspace() {
  const plan = useWorkflow(selectExportPlan);
  const schema = useWorkflow(selectSchema);
  const options = useWorkflow((s) => s.exportOptions);
  const approved = useWorkflow((s) => s.approvedMapping !== null);
  const { setExportOptions } = useWorkflowActions();
  const { downloadCsv, downloadReport } = useExportDownloads();
  const delimiterId = useId();
  const bomId = useId();

  const labels = useMemo(() => new Map(schema.fields.map((f) => [f.key, f.label])), [schema]);
  const columns = useMemo<DataColumn<PreviewRow>[]>(
    () =>
      (plan?.columns ?? []).map((key, index) => ({
        id: key,
        header: () => (
          <span className="flex flex-col">
            <span>{labels.get(key)}</span>
            <span className="font-mono text-[10px] font-normal">{key}</span>
          </span>
        ),
        cell: ({ row }) => <ExportedCell value={row.original.cells[index] ?? ""} />,
      })),
    [plan?.columns, labels],
  );
  const preview = useMemo<PreviewRow[]>(
    () =>
      (plan?.rows.slice(0, PREVIEW_ROWS) ?? []).map((cells, i) => ({
        id: plan?.includedRowIds[i] ?? String(i),
        cells,
      })),
    [plan],
  );

  if (!plan || !approved) return null;
  const { counts } = plan;
  const errorRows = counts.excludedForErrors + counts.includedWithErrors;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat icon={Download} label="Rows to export" value={counts.included} tone="text-primary" />
        <Stat
          icon={TriangleAlert}
          label="Exported with warnings"
          value={counts.includedWithWarnings}
          tone="text-warning"
        />
        <Stat
          icon={CircleAlert}
          label="Left out for errors"
          value={counts.excludedForErrors}
          tone="text-destructive"
        />
        <Stat
          icon={Ban}
          label="Excluded by you"
          value={counts.excludedByUser}
          tone="text-muted-foreground"
        />
      </div>

      {counts.excludedForErrors > 0 && (
        <Alert className="border-warning/30 bg-warning-soft">
          <TriangleAlert className="text-warning" />
          <AlertTitle>
            {counts.excludedForErrors} row{counts.excludedForErrors === 1 ? "" : "s"} with errors
            will be left out
          </AlertTitle>
          <AlertDescription>
            <p>
              Fix them on the{" "}
              <Link
                href="/validate"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Validate
              </Link>{" "}
              step, or include them below. Every left-out row is listed in the JSON report with its
              reason.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {counts.includedWithErrors > 0 && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive-soft">
          <CircleAlert />
          <AlertTitle>{counts.includedWithErrors} rows with errors are included</AlertTitle>
          <AlertDescription>The JSON report lists their unresolved issues.</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="options-title" className="rounded-card border bg-card p-4 sm:p-5">
        <h2 id="options-title" className="text-sm font-medium">
          Options
        </h2>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          <IncludeErrorsControl errors={errorRows} />
          <div className="space-y-1.5">
            <Label htmlFor={delimiterId}>Delimiter</Label>
            <Select
              value={options.delimiter}
              onValueChange={(value) => setExportOptions({ delimiter: value as CsvDelimiter })}
            >
              <SelectTrigger id={delimiterId} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIMITERS.map((d) => (
                  <SelectItem key={d.label} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start gap-3">
            <Switch
              id={bomId}
              checked={options.includeBom}
              onCheckedChange={(checked) => setExportOptions({ includeBom: checked })}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor={bomId}>Excel-friendly encoding</Label>
              <p className="text-xs text-muted-foreground">
                Adds a UTF-8 marker so Excel shows accents like “Łódź” correctly.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="export-preview-title" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="export-preview-title" className="text-sm font-medium">
            Preview
          </h2>
          <p className="text-xs text-muted-foreground">
            First {preview.length} of {counts.included.toLocaleString("en-US")} rows · columns in{" "}
            {schema.label} schema order
          </p>
        </div>
        <DataTable
          caption="Export preview"
          columns={columns}
          data={preview}
          getRowId={(row) => row.id}
          pageSize={PREVIEW_ROWS}
        />
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <Button size="lg" className="px-4" onClick={downloadCsv} disabled={counts.included === 0}>
          <Download data-icon="inline-start" />
          Download CSV
        </Button>
        <Button size="lg" variant="outline" className="px-4" onClick={downloadReport}>
          <FileJson data-icon="inline-start" />
          Download JSON report
        </Button>
        <p className="text-xs text-muted-foreground">Both files are generated in your browser.</p>
      </section>
    </div>
  );
}

export function ExportStep() {
  const router = useRouter();
  const { reset } = useWorkflowActions();
  const { downloadCsv } = useExportDownloads();
  const included = useWorkflow((s) => selectExportPlan(s)?.counts.included ?? 0);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <StepHeader
        title="Export clean data"
        description="Download the cleaned records as CSV and an audit report of every decision and change."
        actions={
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw data-icon="inline-start" />
            Start a new import
          </Button>
        }
      />
      <ExportWorkspace />
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new import?</AlertDialogTitle>
            <AlertDialogDescription>
              The current file, mapping and corrections are cleared. Download anything you need
              first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset();
                router.push("/");
              }}
            >
              Start over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <StepFooter
        back={{ href: "/validate" }}
        next={{
          label: "Download CSV",
          onClick: downloadCsv,
          icon: <Download data-icon="inline-end" />,
          disabledReason: included === 0 ? "There are no rows to export." : null,
        }}
      />
    </>
  );
}
