import type { IssueCode, ProcessedRecord, QualityReport } from "@/domain/quality/types";
import type { FieldKey } from "@/domain/schema/types";

export type StatusFilter = "all" | "valid" | "warning" | "error" | "duplicates" | "excluded";

export interface RecordFilters {
  status: StatusFilter;
  /** Only rows with an issue on this field. */
  field: FieldKey | "any";
  code: IssueCode | "any";
  query: string;
}

export const DEFAULT_FILTERS: RecordFilters = {
  status: "all",
  field: "any",
  code: "any",
  query: "",
};

const isDuplicate = (r: ProcessedRecord) => r.issues.some((i) => i.code === "possible-duplicate");

function matchesStatus(record: ProcessedRecord, status: StatusFilter): boolean {
  switch (status) {
    case "all":
      return true;
    case "excluded":
      return record.excluded;
    case "duplicates":
      return !record.excluded && isDuplicate(record);
    default:
      return !record.excluded && record.status === status;
  }
}

/** Pure filter for the validation grid. Search matches values, row id and row number. */
export function filterRecords(
  records: readonly ProcessedRecord[],
  filters: RecordFilters,
): ProcessedRecord[] {
  const query = filters.query.trim().toLowerCase();
  return records.filter((record) => {
    if (!matchesStatus(record, filters.status)) return false;
    if (filters.field !== "any" && !record.issues.some((i) => i.field === filters.field))
      return false;
    if (filters.code !== "any" && !record.issues.some((i) => i.code === filters.code)) return false;
    if (query === "") return true;
    return (
      record.rowId.includes(query) ||
      String(record.sourceRowNumber) === query ||
      Object.values(record.values).some((v) => v.toLowerCase().includes(query))
    );
  });
}

export type StatusCounts = Record<StatusFilter, number>;

export function statusCounts(report: QualityReport): StatusCounts {
  const counts: StatusCounts = {
    all: 0,
    valid: 0,
    warning: 0,
    error: 0,
    duplicates: 0,
    excluded: 0,
  };
  for (const record of report.records) {
    counts.all += 1;
    for (const status of ["valid", "warning", "error", "duplicates", "excluded"] as const) {
      if (matchesStatus(record, status)) counts[status] += 1;
    }
  }
  return counts;
}

export const ISSUE_LABELS: Record<IssueCode, string> = {
  "required-missing": "Required value missing",
  "invalid-email": "Invalid email",
  "invalid-url": "Invalid website",
  "url-missing-scheme": "Website without https://",
  "unknown-country": "Unrecognised country",
  "ambiguous-country": "Ambiguous country",
  "phone-has-letters": "Phone contains letters",
  "phone-too-short": "Phone too short",
  "tax-id-format": "Tax ID formatting",
  "possible-duplicate": "Possible duplicate",
  "schema-invalid": "Schema violation",
};
