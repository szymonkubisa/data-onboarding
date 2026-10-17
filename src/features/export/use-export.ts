"use client";

import { toast } from "sonner";
import { useWorkflowStoreApi } from "@/application/workflow/react";
import {
  selectExportPlan,
  selectQualityReport,
  selectSchema,
} from "@/application/workflow/selectors";
import { buildExportReport } from "@/domain/export/report";
import { serializeCsv } from "@/infrastructure/exporters/csv";
import { downloadFile, exportFileName } from "@/lib/download";

/** Build and download the CSV and the JSON report from the current store state. */
export function useExportDownloads() {
  const store = useWorkflowStoreApi();

  const downloadCsv = () => {
    const state = store.getState();
    const plan = selectExportPlan(state);
    if (!plan || !state.dataset) return;
    const extension = state.exportOptions.delimiter === "\t" ? "tsv" : "csv";
    downloadFile(
      exportFileName(state.dataset.fileName, "clean", extension),
      serializeCsv(plan, state.exportOptions),
      "text/csv;charset=utf-8",
    );
    toast.success(`Downloaded ${plan.counts.included.toLocaleString("en-US")} rows`, {
      description: "Cells that a spreadsheet would run as formulas were escaped.",
    });
  };

  const downloadReport = () => {
    const state = store.getState();
    const plan = selectExportPlan(state);
    const report = selectQualityReport(state);
    if (!plan || !report || !state.dataset || !state.approvedMapping) return;
    const json = buildExportReport({
      dataset: state.dataset,
      schema: selectSchema(state),
      mapping: state.approvedMapping,
      suggestions: state.ai.suggestions,
      report,
      plan,
      generatedAt: new Date().toISOString(),
    });
    downloadFile(
      exportFileName(state.dataset.fileName, "report", "json"),
      `${JSON.stringify(json, null, 2)}\n`,
      "application/json",
    );
    toast.success("Downloaded the import report");
  };

  return { downloadCsv, downloadReport };
}
