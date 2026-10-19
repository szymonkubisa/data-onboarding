import type { RowId } from "../dataset/types";
import type { ProcessedRecord, QualityReport } from "../quality/types";
import type { FieldKey, TargetSchema } from "../schema/types";

export type CsvDelimiter = "," | ";" | "\t";

export interface ExportOptions {
  /** Rows with errors are left out unless the person explicitly includes them. */
  includeErrorRows: boolean;
  delimiter: CsvDelimiter;
  /** UTF-8 byte order mark, so Excel opens non-ASCII text correctly. */
  includeBom: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeErrorRows: false,
  delimiter: ",",
  includeBom: true,
};

export type ExclusionReason = "user-excluded" | "has-errors";

export interface ExportExclusion {
  rowId: RowId;
  sourceRowNumber: number;
  reason: ExclusionReason;
}

export interface ExportPlan {
  /** Column order = schema field order. Header = field key. */
  columns: FieldKey[];
  rows: string[][];
  includedRowIds: RowId[];
  excluded: ExportExclusion[];
  counts: {
    included: number;
    excludedByUser: number;
    excludedForErrors: number;
    includedWithWarnings: number;
    includedWithErrors: number;
  };
}

/**
 * Decide which rows go into the export and in what shape. Pure; the CSV serializer
 * only formats what this returns. Every row left out is listed with a reason:
 * nothing disappears silently.
 */
export function buildExport(
  report: QualityReport,
  schema: TargetSchema,
  options: ExportOptions,
): ExportPlan {
  const columns = schema.fields.map((f) => f.key);
  const rows: string[][] = [];
  const includedRowIds: RowId[] = [];
  const excluded: ExportExclusion[] = [];
  let includedWithWarnings = 0;
  let includedWithErrors = 0;

  const exclusion = (record: ProcessedRecord): ExclusionReason | null => {
    if (record.excluded) return "user-excluded";
    if (record.status === "error" && !options.includeErrorRows) return "has-errors";
    return null;
  };

  for (const record of report.records) {
    const reason = exclusion(record);
    if (reason) {
      excluded.push({ rowId: record.rowId, sourceRowNumber: record.sourceRowNumber, reason });
      continue;
    }
    rows.push(columns.map((key) => record.values[key] ?? ""));
    includedRowIds.push(record.rowId);
    if (record.status === "warning") includedWithWarnings += 1;
    if (record.status === "error") includedWithErrors += 1;
  }

  return {
    columns,
    rows,
    includedRowIds,
    excluded,
    counts: {
      included: rows.length,
      excludedByUser: excluded.filter((e) => e.reason === "user-excluded").length,
      excludedForErrors: excluded.filter((e) => e.reason === "has-errors").length,
      includedWithWarnings,
      includedWithErrors,
    },
  };
}
