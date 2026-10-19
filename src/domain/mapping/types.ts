import type { ColumnId } from "../dataset/types";
import type { FieldKey } from "../schema/types";

export type SuggestionOrigin = "llm" | "heuristic";

/** A proposal from the LLM or from heuristics. Advisory only. */
export interface MappingSuggestion {
  sourceColumnId: ColumnId;
  /** null = leave this column unmapped. */
  targetField: FieldKey | null;
  /** Model estimate in [0, 1]. Not a calibrated probability. */
  confidence: number;
  reasoning: string;
  origin: SuggestionOrigin;
}

/**
 * - pending: shown as suggested, not touched by the person yet
 * - accepted: the person confirmed the suggestion
 * - modified: the person picked a different target
 * - ignored: the person chose to leave the column out
 */
export type DecisionStatus = "pending" | "accepted" | "modified" | "ignored";

export interface MappingDecision {
  sourceColumnId: ColumnId;
  targetField: FieldKey | null;
  status: DecisionStatus;
}

/** The mapping the person approved and the server re-validated. Input to the quality pipeline. */
export interface ApprovedMapping {
  schemaId: string;
  /** Each mapped target field → the column that feeds it. */
  fieldToColumn: Readonly<Record<FieldKey, ColumnId>>;
  /** Final decisions, pending ones resolved to accepted. Kept for the export report. */
  decisions: MappingDecision[];
}

export type MappingIssueSeverity = "error" | "warning";

export type MappingIssue =
  | { kind: "missing-required"; severity: "error"; field: FieldKey }
  | { kind: "duplicate-target"; severity: "error"; field: FieldKey; columnIds: ColumnId[] }
  | { kind: "unknown-column"; severity: "error"; columnId: ColumnId }
  | { kind: "unknown-field"; severity: "error"; columnId: ColumnId; field: FieldKey }
  | {
      kind: "low-confidence";
      severity: "warning";
      columnId: ColumnId;
      field: FieldKey;
      confidence: number;
    };

export type ConfidenceBucket = "high" | "medium" | "low";
