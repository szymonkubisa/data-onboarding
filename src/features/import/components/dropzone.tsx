"use client";

import { ShieldCheck, Upload } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { formatBytes, LIMITS } from "@/domain/dataset/limits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ACCEPT =
  ".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Hidden file input plus a function to open it. Shared by the dropzone and "Replace file". */
export function useFilePicker(onFile: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const input = (
    <>
      <label htmlFor={id} className="sr-only">
        Choose a CSV or Excel file
      </label>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </>
  );
  return { input, open: () => inputRef.current?.click() };
}

export function Dropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const picker = useFilePicker(onFile);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      data-dragging={dragging || undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed border-input bg-card px-6 py-12 text-center transition-colors sm:py-16",
        dragging && "border-primary bg-primary-soft/60",
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
        <Upload className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-medium">Drop a CSV or Excel file here</h2>
        <p className="text-sm text-muted-foreground">
          .csv or .xlsx · up to {formatBytes(LIMITS.maxFileBytes)} ·{" "}
          {LIMITS.maxRows.toLocaleString("en-US")} rows · {LIMITS.maxColumns} columns
        </p>
      </div>
      <Button size="lg" onClick={picker.open} disabled={disabled} className="px-4">
        <Upload data-icon="inline-start" />
        Choose file
      </Button>
      {picker.input}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-primary" aria-hidden />
        Parsed in your browser. The file is never uploaded.
      </p>
    </div>
  );
}
