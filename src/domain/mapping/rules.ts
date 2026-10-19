import type { ColumnId } from "../dataset/types";
import type { FieldKey, TargetSchema } from "../schema/types";
import { RawMappingOutputSchema } from "./schemas";
import type {
  ApprovedMapping,
  ConfidenceBucket,
  MappingDecision,
  MappingIssue,
  MappingSuggestion,
  SuggestionOrigin,
} from "./types";

export const CONFIDENCE_THRESHOLDS = { high: 0.8, medium: 0.5 } as const;

export function confidenceBucket(confidence: number): ConfidenceBucket {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

/* ------------------------------------------------------------------------------------------------
 * Suggestion validation and repair
 * --------------------------------------------------------------------------------------------- */

export interface NormalizeContext {
  columnIds: readonly ColumnId[];
  fieldKeys: readonly FieldKey[];
  origin: SuggestionOrigin;
  /** For readable conflict messages. */
  columnNames?: Readonly<Record<ColumnId, string>>;
}

export interface NormalizeResult {
  /** One suggestion per column, in column order. Empty when `valid` is false. */
  suggestions: MappingSuggestion[];
  /** Problems that make the output unusable. Fed back to the model on retry. */
  problems: string[];
  /** Fixes applied to otherwise usable output. Logged as counts, shown nowhere else. */
  repairs: string[];
  valid: boolean;
}

/** Below this share of known columns, the output is treated as garbage and retried. */
const MIN_COVERAGE = 0.5;
const MAX_REASONING = 300;

function formatZodIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string[] {
  return issues.slice(0, 10).map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Parse raw suggester output and repair what can be repaired:
 * unknown columns dropped, unknown fields nulled, duplicate entries for a column collapsed,
 * duplicate targets resolved in favour of the highest confidence, missing columns added as
 * unmapped, confidence clamped to [0, 1]. Runs on LLM and heuristic output alike.
 */
export function normalizeSuggestions(raw: unknown, ctx: NormalizeContext): NormalizeResult {
  const parsed = RawMappingOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      suggestions: [],
      problems: formatZodIssues(parsed.error.issues),
      repairs: [],
      valid: false,
    };
  }

  const knownColumns = new Set(ctx.columnIds);
  const knownFields = new Set(ctx.fieldKeys);
  const name = (id: ColumnId) => ctx.columnNames?.[id] ?? id;
  const repairs: string[] = [];
  const byColumn = new Map<ColumnId, MappingSuggestion>();

  for (const entry of parsed.data.mappings) {
    if (!knownColumns.has(entry.sourceColumnId)) {
      repairs.push(`dropped unknown column "${entry.sourceColumnId}"`);
      continue;
    }
    let confidence = Number.isFinite(entry.confidence) ? entry.confidence : 0;
    if (confidence < 0 || confidence > 1) {
      // Some models answer in percent.
      confidence =
        confidence > 1 && confidence <= 100
          ? confidence / 100
          : Math.min(1, Math.max(0, confidence));
      repairs.push(`clamped confidence for ${entry.sourceColumnId}`);
    }
    let targetField = entry.targetField;
    let reasoning = entry.reasoning.trim().slice(0, MAX_REASONING);
    if (targetField !== null && !knownFields.has(targetField)) {
      repairs.push(`nulled unknown field "${targetField}"`);
      reasoning = `Suggested “${targetField}”, which is not a field in this schema.`;
      targetField = null;
      confidence = 0;
    }
    const previous = byColumn.get(entry.sourceColumnId);
    if (previous) {
      repairs.push(`collapsed duplicate entries for ${entry.sourceColumnId}`);
      if (previous.confidence >= confidence) continue;
    }
    byColumn.set(entry.sourceColumnId, {
      sourceColumnId: entry.sourceColumnId,
      targetField,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
      origin: ctx.origin,
    });
  }

  const coverage = ctx.columnIds.length === 0 ? 1 : byColumn.size / ctx.columnIds.length;
  if (coverage < MIN_COVERAGE) {
    return {
      suggestions: [],
      problems: [
        `Only ${byColumn.size} of ${ctx.columnIds.length} source columns have a valid entry. Return one entry for every sourceColumnId.`,
      ],
      repairs,
      valid: false,
    };
  }

  // One column per target field: keep the most confident, unmap the rest.
  const winners = new Map<FieldKey, MappingSuggestion>();
  for (const suggestion of byColumn.values()) {
    if (suggestion.targetField === null) continue;
    const current = winners.get(suggestion.targetField);
    if (!current || suggestion.confidence > current.confidence) {
      winners.set(suggestion.targetField, suggestion);
    }
  }
  for (const suggestion of byColumn.values()) {
    const field = suggestion.targetField;
    if (field === null) continue;
    const winner = winners.get(field);
    if (winner && winner !== suggestion) {
      repairs.push(`resolved duplicate target "${field}"`);
      byColumn.set(suggestion.sourceColumnId, {
        ...suggestion,
        targetField: null,
        confidence: 0,
        reasoning: `Conflict: “${field}” is a better match for “${name(winner.sourceColumnId)}”.`,
      });
    }
  }

  const suggestions = ctx.columnIds.map((columnId) => {
    const suggestion = byColumn.get(columnId);
    if (suggestion) return suggestion;
    repairs.push(`added missing column ${columnId}`);
    return {
      sourceColumnId: columnId,
      targetField: null,
      confidence: 0,
      reasoning: "No suggestion was returned for this column.",
      origin: ctx.origin,
    } satisfies MappingSuggestion;
  });

  return { suggestions, problems: [], repairs, valid: true };
}

/* ------------------------------------------------------------------------------------------------
 * Decisions
 * --------------------------------------------------------------------------------------------- */

export function initialDecisions(
  suggestions: readonly MappingSuggestion[],
): Record<ColumnId, MappingDecision> {
  const decisions: Record<ColumnId, MappingDecision> = {};
  for (const suggestion of suggestions) {
    decisions[suggestion.sourceColumnId] = {
      sourceColumnId: suggestion.sourceColumnId,
      targetField: suggestion.targetField,
      status: "pending",
    };
  }
  return decisions;
}

/** Field targeted by a decision, or null when the column is ignored or unmapped. */
export function effectiveTarget(decision: MappingDecision): FieldKey | null {
  return decision.status === "ignored" ? null : decision.targetField;
}

/**
 * Check a set of decisions against the schema and the dataset's columns.
 * Errors block approval; warnings are shown but do not block.
 */
export function validateMapping(
  decisions: readonly MappingDecision[],
  schema: TargetSchema,
  columnIds: readonly ColumnId[],
  suggestions: readonly MappingSuggestion[] = [],
): MappingIssue[] {
  const issues: MappingIssue[] = [];
  const knownColumns = new Set(columnIds);
  const knownFields = new Set(schema.fields.map((f) => f.key));
  const suggestionByColumn = new Map(suggestions.map((s) => [s.sourceColumnId, s]));
  const columnsByField = new Map<FieldKey, ColumnId[]>();

  for (const decision of decisions) {
    if (!knownColumns.has(decision.sourceColumnId)) {
      issues.push({ kind: "unknown-column", severity: "error", columnId: decision.sourceColumnId });
      continue;
    }
    const field = effectiveTarget(decision);
    if (field === null) continue;
    if (!knownFields.has(field)) {
      issues.push({
        kind: "unknown-field",
        severity: "error",
        columnId: decision.sourceColumnId,
        field,
      });
      continue;
    }
    columnsByField.set(field, [...(columnsByField.get(field) ?? []), decision.sourceColumnId]);

    const suggestion = suggestionByColumn.get(decision.sourceColumnId);
    if (
      decision.status === "pending" &&
      suggestion &&
      suggestion.targetField === field &&
      confidenceBucket(suggestion.confidence) === "low"
    ) {
      issues.push({
        kind: "low-confidence",
        severity: "warning",
        columnId: decision.sourceColumnId,
        field,
        confidence: suggestion.confidence,
      });
    }
  }

  for (const [field, columns] of columnsByField) {
    if (columns.length > 1) {
      issues.push({ kind: "duplicate-target", severity: "error", field, columnIds: columns });
    }
  }
  for (const field of schema.fields) {
    if (field.required && !columnsByField.has(field.key)) {
      issues.push({ kind: "missing-required", severity: "error", field: field.key });
    }
  }
  return issues;
}

export function hasBlockingIssues(issues: readonly MappingIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/**
 * Turn validated decisions into the approved mapping. Pending decisions become accepted:
 * approving the table approves what it shows.
 */
export function buildApprovedMapping(
  decisions: readonly MappingDecision[],
  schemaId: string,
): ApprovedMapping {
  const fieldToColumn: Record<FieldKey, ColumnId> = {};
  const finalDecisions = decisions.map((decision) => {
    const field = effectiveTarget(decision);
    if (field !== null) fieldToColumn[field] = decision.sourceColumnId;
    return decision.status === "pending" ? { ...decision, status: "accepted" as const } : decision;
  });
  return { schemaId, fieldToColumn, decisions: finalDecisions };
}

export interface MappingSummary {
  mappedFields: number;
  totalFields: number;
  requiredMissing: FieldKey[];
  conflicts: FieldKey[];
  columnsByField: Record<FieldKey, ColumnId[]>;
}

export function summarizeMapping(
  decisions: readonly MappingDecision[],
  schema: TargetSchema,
): MappingSummary {
  const columnsByField: Record<FieldKey, ColumnId[]> = {};
  for (const decision of decisions) {
    const field = effectiveTarget(decision);
    if (field === null) continue;
    (columnsByField[field] ??= []).push(decision.sourceColumnId);
  }
  const keys = schema.fields.map((f) => f.key);
  return {
    mappedFields: keys.filter((k) => (columnsByField[k]?.length ?? 0) > 0).length,
    totalFields: keys.length,
    requiredMissing: schema.fields
      .filter((f) => f.required && !columnsByField[f.key])
      .map((f) => f.key),
    conflicts: keys.filter((k) => (columnsByField[k]?.length ?? 0) > 1),
    columnsByField,
  };
}

export interface IssueLabels {
  field: (key: FieldKey) => string;
  column: (id: ColumnId) => string;
}

export function describeMappingIssue(issue: MappingIssue, labels: IssueLabels): string {
  switch (issue.kind) {
    case "missing-required":
      return `${labels.field(issue.field)} is required. Map a column to it.`;
    case "duplicate-target":
      return `${labels.field(issue.field)} is mapped from ${issue.columnIds.map((id) => `“${labels.column(id)}”`).join(" and ")}. Keep one.`;
    case "unknown-column":
      return `Column ${issue.columnId} is not in this file.`;
    case "unknown-field":
      return `“${issue.field}” is not a field in this schema.`;
    case "low-confidence":
      return `“${labels.column(issue.columnId)}” → ${labels.field(issue.field)} is a low-confidence suggestion. Check it.`;
  }
}
