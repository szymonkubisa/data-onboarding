import type { RowId, SourceDataset } from "../dataset/types";
import type { ApprovedMapping } from "../mapping/types";
import type { FieldKey, TargetSchema } from "../schema/types";

export type Severity = "error" | "warning";

export type IssueCode =
  | "required-missing"
  | "invalid-email"
  | "invalid-url"
  | "url-missing-scheme"
  | "unknown-country"
  | "ambiguous-country"
  | "phone-has-letters"
  | "phone-too-short"
  | "tax-id-format"
  | "possible-duplicate"
  | "schema-invalid";

export interface FixProposal {
  kind: "auto" | "suggested";
  from: string;
  to: string;
}

export interface QualityIssue {
  /** Stable across runs: `${rowId}:${field ?? "*"}:${code}`. Used to accept fixes. */
  id: string;
  rowId: RowId;
  field?: FieldKey;
  severity: Severity;
  code: IssueCode;
  message: string;
  fix?: FixProposal;
  relatedRowIds?: RowId[];
}

export type TransformCode =
  | "whitespace"
  | "null-token"
  | "email-normalize"
  | "country-canonical"
  | "url-add-scheme"
  | "tax-id-compact"
  | "manual-edit";

export interface AppliedTransform {
  field: FieldKey;
  /** auto: applied by the pipeline; suggested: accepted by the person; manual: typed by the person. */
  kind: "auto" | "suggested" | "manual";
  code: TransformCode;
  from: string;
  to: string;
}

export type RecordStatus = "valid" | "warning" | "error";

export interface ProcessedRecord {
  rowId: RowId;
  sourceRowNumber: number;
  /** Final values after corrections, transforms and accepted fixes. */
  values: Readonly<Record<FieldKey, string>>;
  /** Values as projected from the source columns, before anything was applied. */
  original: Readonly<Record<FieldKey, string>>;
  applied: readonly AppliedTransform[];
  issues: readonly QualityIssue[];
  status: RecordStatus;
  excluded: boolean;
}

export interface DuplicateGroup {
  id: string;
  rowIds: RowId[];
  /** Labels of the duplicate keys that linked the rows, e.g. "Same tax ID". */
  reasons: string[];
}

export interface QualitySummary {
  total: number;
  /** Counts over rows that are not excluded. */
  valid: number;
  warnings: number;
  errors: number;
  duplicates: number;
  excluded: number;
  /** Suggested fixes not yet accepted. */
  pendingFixes: number;
  issuesByCode: Partial<Record<IssueCode, number>>;
}

export interface QualityReport {
  records: readonly ProcessedRecord[];
  summary: QualitySummary;
  duplicateGroups: readonly DuplicateGroup[];
}

export interface QualityInput {
  dataset: SourceDataset;
  schema: TargetSchema;
  mapping: ApprovedMapping;
  /** `${rowId}:${field}` → corrected value. */
  corrections: Readonly<Record<string, string>>;
  /** Issue ids of suggested fixes the person accepted. */
  acceptedFixes: Readonly<Record<string, true>>;
  excludedRowIds: Readonly<Record<RowId, true>>;
}

export const correctionKey = (rowId: RowId, field: FieldKey) => `${rowId}:${field}`;

export const issueId = (rowId: RowId, field: FieldKey | undefined, code: IssueCode) =>
  `${rowId}:${field ?? "*"}:${code}`;
