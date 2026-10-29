"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useWorkflowStoreApi } from "@/application/workflow/react";
import type { DatasetResult, SourceDataset } from "@/domain/dataset/types";
import { parseFile, precheckFile, type SheetChoice } from "@/infrastructure/parsers/parse-file";

export const SAMPLE_FILE = {
  url: "/samples/customers-messy.csv",
  name: "customers-messy.csv",
} as const;

export type ImportStatus =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | {
      kind: "choose-sheet";
      fileName: string;
      sheets: SheetChoice[];
      pick: (name: string) => DatasetResult;
    }
  | { kind: "confirm-replace"; file: File }
  | { kind: "error"; message: string };

/**
 * Import flow for one file: pre-checks, parsing, sheet choice for workbooks, and a
 * confirmation before replacing a file the person has already worked on.
 */
export function useImportFile() {
  const store = useWorkflowStoreApi();
  const [status, setStatus] = useState<ImportStatus>({ kind: "idle" });

  const commit = (dataset: SourceDataset) => {
    store.getState().actions.loadDataset(dataset);
    setStatus({ kind: "idle" });
    toast.success(
      `Imported ${dataset.rows.length.toLocaleString("en-US")} rows from ${dataset.fileName}`,
    );
  };

  const parse = async (file: File) => {
    const problem = precheckFile(file);
    if (problem) {
      setStatus({ kind: "error", message: problem.message });
      return;
    }
    setStatus({ kind: "parsing", fileName: file.name });
    try {
      const outcome = await parseFile(file);
      if (outcome.kind === "error") setStatus({ kind: "error", message: outcome.error.message });
      else if (outcome.kind === "choose-sheet") setStatus({ ...outcome, kind: "choose-sheet" });
      else commit(outcome.dataset);
    } catch {
      setStatus({ kind: "error", message: "This file could not be read." });
    }
  };

  /** Work that a new file would throw away: anything past the import step. */
  const hasDownstreamWork = () => {
    const state = store.getState();
    return Object.keys(state.decisions).length > 0 || state.approvedMapping !== null;
  };

  const importFile = (file: File) => {
    if (hasDownstreamWork()) setStatus({ kind: "confirm-replace", file });
    else void parse(file);
  };

  const confirmReplace = () => {
    if (status.kind === "confirm-replace") void parse(status.file);
  };

  const pickSheet = (name: string) => {
    if (status.kind !== "choose-sheet") return;
    const result = status.pick(name);
    if (result.ok) commit(result.dataset);
    else setStatus({ kind: "error", message: result.error.message });
  };

  const importSample = async () => {
    try {
      const response = await fetch(SAMPLE_FILE.url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      importFile(new File([blob], SAMPLE_FILE.name, { type: "text/csv" }));
    } catch {
      setStatus({ kind: "error", message: "The sample file could not be loaded." });
    }
  };

  return {
    status,
    importFile,
    importSample,
    confirmReplace,
    pickSheet,
    dismiss: () => setStatus({ kind: "idle" }),
  };
}
