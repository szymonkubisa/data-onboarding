import type { SourceDataset } from "../dataset/types";
import type { ApprovedMapping, MappingSuggestion } from "../mapping/types";
import type { QualityReport, TransformCode } from "../quality/types";
import type { TargetSchema } from "../schema/types";
import type { ExportPlan } from "./build-export";

export interface ExportReportInput {
  dataset: SourceDataset;
  schema: TargetSchema;
  mapping: ApprovedMapping;
  suggestions: readonly MappingSuggestion[];
  report: QualityReport;
  plan: ExportPlan;
  /** Passed in so the function stays pure and testable. */
  generatedAt: string;
}

/**
 * The audit trail of an import: what was mapped and by whom, every value that changed,
 * every issue left unresolved, every row left out and why.
 */
export function buildExportReport(input: ExportReportInput) {
  const { dataset, schema, mapping, suggestions, report, plan, generatedAt } = input;
  const columnName = new Map(dataset.columns.map((c) => [c.id, c.name]));
  const suggestionByColumn = new Map(suggestions.map((s) => [s.sourceColumnId, s]));
  const rowNumber = new Map(report.records.map((r) => [r.rowId, r.sourceRowNumber]));

  const changes = report.records.flatMap((record) =>
    record.applied.map((t) => ({
      rowId: record.rowId,
      sourceRowNumber: record.sourceRowNumber,
      field: t.field,
      kind: t.kind,
      code: t.code,
      from: t.from,
      to: t.to,
    })),
  );
  const counts: Partial<Record<TransformCode, number>> = {};
  for (const change of changes) counts[change.code] = (counts[change.code] ?? 0) + 1;

  const included = new Set(plan.includedRowIds);
  const unresolvedIssues = report.records
    .filter((r) => included.has(r.rowId))
    .flatMap((r) =>
      r.issues.map((issue) => ({
        rowId: r.rowId,
        sourceRowNumber: r.sourceRowNumber,
        field: issue.field ?? null,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
      })),
    );

  return {
    generatedAt,
    source: {
      fileName: dataset.fileName,
      fileType: dataset.fileType,
      sheetName: dataset.sheetName ?? null,
      rows: dataset.rows.length,
      columns: dataset.columns.length,
      importWarnings: dataset.warnings.map((w) => w.message),
    },
    schema: { id: schema.id, label: schema.label },
    mapping: mapping.decisions.map((decision) => {
      const suggestion = suggestionByColumn.get(decision.sourceColumnId);
      return {
        sourceColumn: columnName.get(decision.sourceColumnId) ?? decision.sourceColumnId,
        sourceColumnId: decision.sourceColumnId,
        targetField: decision.status === "ignored" ? null : decision.targetField,
        decision: decision.status,
        suggestion: suggestion
          ? {
              targetField: suggestion.targetField,
              origin: suggestion.origin,
              confidence: suggestion.confidence,
              reasoning: suggestion.reasoning,
            }
          : null,
      };
    }),
    transformations: { counts, changes },
    unresolvedIssues,
    duplicateGroups: report.duplicateGroups.map((g) => ({ rowIds: g.rowIds, reasons: g.reasons })),
    exclusions: plan.excluded.map((e) => ({
      rowId: e.rowId,
      sourceRowNumber: rowNumber.get(e.rowId) ?? e.sourceRowNumber,
      reason: e.reason,
    })),
    summary: {
      exportedRows: plan.counts.included,
      excludedByUser: plan.counts.excludedByUser,
      excludedForErrors: plan.counts.excludedForErrors,
      exportedWithWarnings: plan.counts.includedWithWarnings,
      exportedWithErrors: plan.counts.includedWithErrors,
      valuesChanged: changes.length,
      duplicateGroups: report.duplicateGroups.length,
    },
  };
}

export type ExportReport = ReturnType<typeof buildExportReport>;
