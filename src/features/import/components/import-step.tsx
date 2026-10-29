"use client";

import { CircleAlert, Copy, FileWarning, Globe, Sparkles, Users } from "lucide-react";
import { useWorkflow } from "@/application/workflow/react";
import { StepFooter } from "@/components/layout/step-footer";
import { StepHeader } from "@/components/layout/step-header";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useImportFile } from "../use-import-file";
import { Dropzone } from "./dropzone";
import { FileOverview } from "./file-overview";
import { SheetPicker } from "./sheet-picker";

const SAMPLE_TRAITS = [
  { icon: Copy, text: "Duplicate and empty headers" },
  { icon: Globe, text: "“UK”, “GBR”, “Deutschland”, “U.S.A.”" },
  { icon: FileWarning, text: "Broken emails, URLs without https://" },
  { icon: Users, text: "Likely duplicates, one formula injection" },
];

function SampleCard({ onSample, disabled }: { onSample: () => void; disabled: boolean }) {
  return (
    <section
      aria-labelledby="sample-title"
      className="flex flex-col justify-between gap-5 rounded-card border bg-card p-5 sm:p-6"
    >
      <div>
        <h2 id="sample-title" className="text-base font-medium">
          No file at hand?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Load a deliberately messy export of 184 customers and walk through the whole flow.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {SAMPLE_TRAITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2 text-muted-foreground">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </div>
      <Button
        size="lg"
        variant="outline"
        onClick={onSample}
        disabled={disabled}
        className="border-primary/40 px-4"
      >
        <Sparkles data-icon="inline-start" className="text-primary" />
        Try with sample data
      </Button>
    </section>
  );
}

function ParsingSkeleton({ fileName }: { fileName: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Reading {fileName}…</span>
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}

/** Everything on the import step except the page chrome. Rendered alone in tests. */
export function ImportWorkspace() {
  const dataset = useWorkflow((s) => s.dataset);
  const importer = useImportFile();
  const { status } = importer;

  return (
    <div className="space-y-6">
      {status.kind === "error" && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive-soft">
          <CircleAlert />
          <AlertTitle>That file could not be imported</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      {status.kind === "parsing" ? (
        <ParsingSkeleton fileName={status.fileName} />
      ) : status.kind === "choose-sheet" ? (
        <SheetPicker
          fileName={status.fileName}
          sheets={status.sheets}
          onPick={importer.pickSheet}
          onCancel={importer.dismiss}
        />
      ) : dataset ? (
        <FileOverview dataset={dataset} onReplace={importer.importFile} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Dropzone onFile={importer.importFile} />
          </div>
          <SampleCard onSample={() => void importer.importSample()} disabled={false} />
        </div>
      )}

      <AlertDialog
        open={status.kind === "confirm-replace"}
        onOpenChange={(open) => !open && importer.dismiss()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current file?</AlertDialogTitle>
            <AlertDialogDescription>
              Your mapping, corrections and excluded rows belong to the current file and will be
              discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current file</AlertDialogCancel>
            <AlertDialogAction onClick={importer.confirmReplace}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ImportStep() {
  const dataset = useWorkflow((s) => s.dataset);
  return (
    <>
      <StepHeader
        title="Import customer data"
        description="Start from a CSV or Excel export. The file is read in your browser; only column names and statistics are ever sent to the AI."
      />
      <ImportWorkspace />
      <StepFooter
        next={{
          label: "Continue to mapping",
          href: "/map",
          disabledReason: dataset ? null : "Import a file first.",
        }}
        status={
          dataset
            ? `${dataset.rows.length.toLocaleString("en-US")} rows · ${dataset.columns.length} columns`
            : undefined
        }
      />
    </>
  );
}
