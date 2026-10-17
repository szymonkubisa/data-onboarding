import type { FieldDefinition, FieldKey } from "../schema/types";
import { findDuplicateGroups } from "./duplicates";
import {
  countryStep,
  emailStep,
  nullTokenStep,
  taxIdFix,
  urlSchemeFix,
  whitespaceStep,
  type TransformStep,
} from "./transforms";
import {
  correctionKey,
  issueId,
  type AppliedTransform,
  type FixProposal,
  type IssueCode,
  type ProcessedRecord,
  type QualityInput,
  type QualityIssue,
  type QualityReport,
  type QualitySummary,
  type RecordStatus,
  type Severity,
  type TransformCode,
} from "./types";
import { validateField } from "./validators";

interface FieldResult {
  value: string;
  applied: AppliedTransform[];
  issues: QualityIssue[];
}

function autoSteps(field: FieldDefinition): ((value: string) => TransformStep | null)[] {
  const steps = [whitespaceStep, nullTokenStep];
  if (field.kind === "email") steps.push(emailStep);
  if (field.kind === "country") steps.push(countryStep);
  return steps;
}

interface SuggestionRule {
  code: IssueCode;
  transform: TransformCode;
  /** error when the unfixed value breaks the schema contract, warning when it is only untidy. */
  severity: Severity;
  propose: (value: string) => FixProposal | null;
  message: (fix: FixProposal) => string;
}

const SUGGESTIONS: Partial<Record<FieldDefinition["kind"], SuggestionRule>> = {
  url: {
    code: "url-missing-scheme",
    transform: "url-add-scheme",
    severity: "error",
    propose: urlSchemeFix,
    message: (fix) => `Website has no http(s) scheme. Use “${fix.to}”?`,
  },
  identifier: {
    code: "tax-id-format",
    transform: "tax-id-compact",
    severity: "warning",
    propose: taxIdFix,
    message: (fix) => `Remove spaces and punctuation: “${fix.to}”?`,
  },
};

/**
 * One field of one row: auto transforms → suggested fix (applied only if accepted) →
 * validation of the resulting value. Every change is recorded with from/to.
 */
function processField(
  field: FieldDefinition,
  input: string,
  rowId: string,
  acceptedFixes: QualityInput["acceptedFixes"],
): FieldResult {
  const applied: AppliedTransform[] = [];
  const issues: QualityIssue[] = [];
  let value = input;

  for (const step of autoSteps(field)) {
    const result = step(value);
    if (!result) continue;
    applied.push({ field: field.key, kind: "auto", code: result.code, from: value, to: result.to });
    value = result.to;
  }

  if (value === "") return { value, applied, issues };

  const rule = SUGGESTIONS[field.kind];
  const fix = rule?.propose(value);
  if (rule && fix) {
    const id = issueId(rowId, field.key, rule.code);
    if (!acceptedFixes[id]) {
      // Reported once, as the fixable issue; not again by the validator below.
      issues.push({
        id,
        rowId,
        field: field.key,
        severity: rule.severity,
        code: rule.code,
        message: rule.message(fix),
        fix,
      });
      return { value, applied, issues };
    }
    applied.push({
      field: field.key,
      kind: "suggested",
      code: rule.transform,
      from: value,
      to: fix.to,
    });
    value = fix.to;
  }

  const problem = validateField(field, value);
  if (problem) {
    issues.push({
      id: issueId(rowId, field.key, problem.code),
      rowId,
      field: field.key,
      ...problem,
    });
  }
  return { value, applied, issues };
}

function statusOf(issues: readonly QualityIssue[]): RecordStatus {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.length > 0) return "warning";
  return "valid";
}

/**
 * The deterministic quality pipeline. Pure: same inputs, same report.
 *
 * Per row: project mapped columns onto fields → overlay manual corrections → auto
 * transforms → accepted suggested fixes → field validation → record validation (required
 * fields, then the schema's Zod contract) → status. Then, across rows that are not
 * excluded: duplicate detection.
 *
 * The source dataset is never modified. Missing data is never invented.
 */
export function runQualityPipeline(input: QualityInput): QualityReport {
  const { dataset, schema, mapping, corrections, acceptedFixes, excludedRowIds } = input;

  const records: ProcessedRecord[] = dataset.rows.map((row) => {
    const values: Record<FieldKey, string> = {};
    const original: Record<FieldKey, string> = {};
    const applied: AppliedTransform[] = [];
    const issues: QualityIssue[] = [];

    for (const field of schema.fields) {
      const columnId = mapping.fieldToColumn[field.key];
      const raw = columnId ? (row.values[columnId] ?? "") : "";
      original[field.key] = raw;

      let current = raw;
      const correction = corrections[correctionKey(row.id, field.key)];
      if (correction !== undefined && correction !== raw) {
        applied.push({
          field: field.key,
          kind: "manual",
          code: "manual-edit",
          from: raw,
          to: correction,
        });
        current = correction;
      }
      if (!columnId && correction === undefined) {
        values[field.key] = "";
        continue;
      }

      const result = processField(field, current, row.id, acceptedFixes);
      values[field.key] = result.value;
      applied.push(...result.applied);
      issues.push(...result.issues);
    }

    for (const field of schema.fields) {
      if (field.required && (values[field.key] ?? "") === "") {
        issues.push({
          id: issueId(row.id, field.key, "required-missing"),
          rowId: row.id,
          field: field.key,
          severity: "error",
          code: "required-missing",
          message: `${field.label} is required.`,
        });
      }
    }

    // The schema's Zod contract is the last word on validity. Field rules above give
    // specific messages; this catches anything they do not cover.
    const flagged = new Set(issues.filter((i) => i.severity === "error").map((i) => i.field));
    const candidate = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
    const parsed = schema.recordSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const zodIssue of parsed.error.issues) {
        const field = String(zodIssue.path[0] ?? "");
        if (flagged.has(field)) continue;
        flagged.add(field);
        const definition = schema.fields.find((f) => f.key === field);
        issues.push({
          id: issueId(row.id, field || undefined, "schema-invalid"),
          rowId: row.id,
          ...(field ? { field } : {}),
          severity: "error",
          code: "schema-invalid",
          message: `${definition?.label ?? field}: ${zodIssue.message}`,
        });
      }
    }

    return {
      rowId: row.id,
      sourceRowNumber: row.sourceRowNumber,
      values,
      original,
      applied,
      issues,
      status: statusOf(issues),
      excluded: Boolean(excludedRowIds[row.id]),
    };
  });

  const included = records.filter((r) => !r.excluded);
  const duplicateGroups = findDuplicateGroups(included, schema);
  const recordById = new Map(records.map((r) => [r.rowId, r]));
  for (const group of duplicateGroups) {
    for (const rowId of group.rowIds) {
      const record = recordById.get(rowId);
      if (!record) continue;
      const others = group.rowIds.filter((id) => id !== rowId);
      const issue: QualityIssue = {
        id: issueId(rowId, undefined, "possible-duplicate"),
        rowId,
        severity: "warning",
        code: "possible-duplicate",
        message: `Possible duplicate of ${others.join(", ")} (${group.reasons.join("; ").toLowerCase()}).`,
        relatedRowIds: others,
      };
      const issues = [...record.issues, issue];
      recordById.set(rowId, { ...record, issues, status: statusOf(issues) });
    }
  }

  const finalRecords = records.map((r) => recordById.get(r.rowId) ?? r);
  return { records: finalRecords, summary: summarize(finalRecords), duplicateGroups };
}

function summarize(records: readonly ProcessedRecord[]): QualitySummary {
  const summary: QualitySummary = {
    total: records.length,
    valid: 0,
    warnings: 0,
    errors: 0,
    duplicates: 0,
    excluded: 0,
    pendingFixes: 0,
    issuesByCode: {},
  };
  for (const record of records) {
    if (record.excluded) {
      summary.excluded += 1;
      continue;
    }
    if (record.status === "valid") summary.valid += 1;
    else if (record.status === "warning") summary.warnings += 1;
    else summary.errors += 1;
    for (const issue of record.issues) {
      summary.issuesByCode[issue.code] = (summary.issuesByCode[issue.code] ?? 0) + 1;
      if (issue.fix?.kind === "suggested") summary.pendingFixes += 1;
      if (issue.code === "possible-duplicate") summary.duplicates += 1;
    }
  }
  return summary;
}

/** Ids of suggested fixes not yet accepted, over rows that are not excluded. */
export function pendingFixIds(report: QualityReport, field?: FieldKey): string[] {
  const ids: string[] = [];
  for (const record of report.records) {
    if (record.excluded) continue;
    for (const issue of record.issues) {
      if (issue.fix?.kind === "suggested" && (field === undefined || issue.field === field))
        ids.push(issue.id);
    }
  }
  return ids;
}
