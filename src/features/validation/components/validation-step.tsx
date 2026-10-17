"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkflow, useWorkflowActions } from "@/application/workflow/react";
import { selectQualityReport, selectSchema } from "@/application/workflow/selectors";
import { pendingFixIds } from "@/domain/quality/pipeline";
import type { IssueCode } from "@/domain/quality/types";
import { StepFooter } from "@/components/layout/step-footer";
import { StepHeader } from "@/components/layout/step-header";
import { DEFAULT_FILTERS, filterRecords, statusCounts, type RecordFilters } from "../filter";
import { DuplicatesSheet } from "./duplicates-sheet";
import { KpiStrip } from "./kpi-strip";
import { RecordsGrid } from "./records-grid";
import { ValidationToolbar } from "./toolbar";

export function ValidationStep() {
  const report = useWorkflow(selectQualityReport);
  const schema = useWorkflow(selectSchema);
  const mapping = useWorkflow((s) => s.approvedMapping);
  const { acceptFixes } = useWorkflowActions();
  const [filters, setFilters] = useState<RecordFilters>(DEFAULT_FILTERS);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const showDuplicates = useCallback(() => setDuplicatesOpen(true), []);

  // Only fields that are fed by a column; unmapped fields would be empty columns.
  const fields = useMemo(
    () => schema.fields.filter((f) => mapping?.fieldToColumn[f.key] !== undefined),
    [schema, mapping],
  );
  const records = useMemo(
    () => (report ? filterRecords(report.records, filters) : []),
    [report, filters],
  );
  const counts = useMemo(() => (report ? statusCounts(report) : null), [report]);
  const codes = useMemo(
    () => (report ? (Object.keys(report.summary.issuesByCode) as IssueCode[]).sort() : []),
    [report],
  );

  if (!report || !counts) return null;

  const applyFixes = () => {
    const ids = pendingFixIds(report);
    acceptFixes(ids);
    toast.success(`Applied ${ids.length} suggested fix${ids.length === 1 ? "" : "es"}`);
  };

  const { summary } = report;
  const resetKey = `${filters.status}|${filters.field}|${filters.code}|${filters.query}`;

  return (
    <>
      <StepHeader
        title="Review and fix values"
        description={
          <>
            Safe changes (whitespace, email domains, country spelling) are already applied and
            marked with a dot. Click a cell to see why it was flagged, apply a suggested fix, or
            edit it. The original file is never modified.
          </>
        }
      />
      <div className="space-y-4">
        <KpiStrip
          counts={counts}
          active={filters.status}
          onSelect={(status) => setFilters((f) => ({ ...f, status }))}
        />
        <ValidationToolbar
          filters={filters}
          onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          fields={fields}
          codes={codes}
          pendingFixes={summary.pendingFixes}
          onApplyFixes={applyFixes}
          duplicateGroups={report.duplicateGroups.length}
          onShowDuplicates={showDuplicates}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Showing {records.length.toLocaleString("en-US")} of{" "}
          {report.records.length.toLocaleString("en-US")} rows
        </p>
        <RecordsGrid
          records={records}
          fields={fields}
          resetKey={resetKey}
          onShowDuplicates={showDuplicates}
        />
      </div>
      <DuplicatesSheet report={report} open={duplicatesOpen} onOpenChange={setDuplicatesOpen} />
      <StepFooter
        back={{ href: "/map" }}
        status={
          <>
            <span className="text-destructive tabular-nums">{summary.errors} with errors</span> ·{" "}
            <span className="tabular-nums">{summary.warnings} with warnings</span> ·{" "}
            <span className="tabular-nums">{summary.excluded} excluded</span>
          </>
        }
        next={{ label: "Continue to export", href: "/export" }}
      />
    </>
  );
}
