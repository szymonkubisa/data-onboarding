import type { SuggestResponse } from "@/contracts/mapping-api";
import type { ColumnId, RowId, SourceDataset } from "@/domain/dataset/types";
import type { ExportOptions } from "@/domain/export/build-export";
import { CONFIDENCE_THRESHOLDS, effectiveTarget, initialDecisions } from "@/domain/mapping/rules";
import type { ApprovedMapping, MappingDecision, MappingIssue } from "@/domain/mapping/types";
import { correctionKey } from "@/domain/quality/types";
import type { SchemaId } from "@/domain/schema/registry";
import type { FieldKey } from "@/domain/schema/types";
import { IDLE_AI, IDLE_REVIEW, initialState, type WorkflowState } from "./state";

/**
 * Every state change is a pure function here. Invariants (what a change resets) live in
 * one place and are tested without React.
 */

/* ------------------------------------------------------------------------------------------------
 * Invariants
 * --------------------------------------------------------------------------------------------- */

function mappedFields(decisions: Record<ColumnId, MappingDecision>): Set<FieldKey> {
  const fields = new Set<FieldKey>();
  for (const decision of Object.values(decisions)) {
    const field = effectiveTarget(decision);
    if (field !== null) fields.add(field);
  }
  return fields;
}

function keepFields<T>(
  record: Record<string, T>,
  fields: Set<FieldKey>,
  fieldOf: (key: string) => string,
) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => fields.has(fieldOf(key))));
}

/** `${rowId}:${field}` and `${rowId}:${field}:${code}` both carry the field second. */
const fieldOfKey = (key: string) => key.split(":")[1] ?? "";

/**
 * Any change to the mapping: approval is void, server review issues are stale, and
 * overlays for fields that are no longer mapped are dropped.
 */
function withDecisions(
  state: WorkflowState,
  decisions: Record<ColumnId, MappingDecision>,
): WorkflowState {
  const fields = mappedFields(decisions);
  return {
    ...state,
    decisions,
    approvedMapping: null,
    review: IDLE_REVIEW,
    corrections: keepFields(state.corrections, fields, fieldOfKey),
    acceptedFixes: keepFields(state.acceptedFixes, fields, fieldOfKey),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Import
 * --------------------------------------------------------------------------------------------- */

/** A new dataset resets everything downstream. Schema choice and consent are kept. */
export function loadDataset(state: WorkflowState, dataset: SourceDataset): WorkflowState {
  return {
    ...initialState(),
    schemaId: state.schemaId,
    sampleConsent: state.sampleConsent,
    dataset,
  };
}

export function setSchema(state: WorkflowState, schemaId: SchemaId): WorkflowState {
  if (schemaId === state.schemaId) return state;
  return { ...loadDatasetOrReset(state), schemaId };
}

function loadDatasetOrReset(state: WorkflowState): WorkflowState {
  return state.dataset
    ? loadDataset(state, state.dataset)
    : { ...initialState(), sampleConsent: state.sampleConsent };
}

export function reset(): WorkflowState {
  return initialState();
}

/* ------------------------------------------------------------------------------------------------
 * AI suggestions
 * --------------------------------------------------------------------------------------------- */

/** Changing consent changes what the AI sees, so current suggestions are discarded. */
export function setSampleConsent(state: WorkflowState, consent: boolean): WorkflowState {
  if (consent === state.sampleConsent) return state;
  return {
    ...withDecisions(state, {}),
    sampleConsent: consent,
    ai: { ...IDLE_AI, requestId: state.ai.requestId },
  };
}

export function suggestStarted(state: WorkflowState): WorkflowState {
  return {
    ...withDecisions(state, {}),
    ai: { ...IDLE_AI, status: "loading", requestId: state.ai.requestId + 1 },
  };
}

export function suggestSucceeded(
  state: WorkflowState,
  requestId: number,
  response: SuggestResponse,
): WorkflowState {
  if (requestId !== state.ai.requestId) return state;
  return {
    ...withDecisions(state, initialDecisions(response.suggestions)),
    ai: {
      status: "ready",
      requestId,
      threadId: response.threadId,
      suggestions: response.suggestions,
      origin: response.origin,
      model: response.model,
      fallbackReason: response.fallbackReason,
      error: null,
    },
  };
}

export function suggestFailed(
  state: WorkflowState,
  requestId: number,
  message: string,
): WorkflowState {
  if (requestId !== state.ai.requestId) return state;
  return { ...state, ai: { ...IDLE_AI, status: "error", requestId, error: message } };
}

/* ------------------------------------------------------------------------------------------------
 * Decisions
 * --------------------------------------------------------------------------------------------- */

function suggestionFor(state: WorkflowState, columnId: ColumnId) {
  return state.ai.suggestions.find((s) => s.sourceColumnId === columnId);
}

/** Pick a target for a column. Picking the suggested target counts as accepting it. */
export function setDecisionTarget(
  state: WorkflowState,
  columnId: ColumnId,
  field: FieldKey | null,
): WorkflowState {
  if (!state.decisions[columnId]) return state;
  const suggested = suggestionFor(state, columnId)?.targetField ?? null;
  const status: MappingDecision["status"] =
    field === null ? "ignored" : field === suggested ? "accepted" : "modified";
  return withDecisions(state, {
    ...state.decisions,
    [columnId]: { sourceColumnId: columnId, targetField: field, status },
  });
}

export function acceptSuggestion(state: WorkflowState, columnId: ColumnId): WorkflowState {
  const suggestion = suggestionFor(state, columnId);
  if (!suggestion || !state.decisions[columnId]) return state;
  return withDecisions(state, {
    ...state.decisions,
    [columnId]: {
      sourceColumnId: columnId,
      targetField: suggestion.targetField,
      status: suggestion.targetField === null ? "ignored" : "accepted",
    },
  });
}

export function ignoreColumn(state: WorkflowState, columnId: ColumnId): WorkflowState {
  return setDecisionTarget(state, columnId, null);
}

/** Accept every untouched suggestion at or above the high-confidence threshold. */
export function acceptAllHighConfidence(state: WorkflowState): WorkflowState {
  let changed = false;
  const decisions = { ...state.decisions };
  for (const suggestion of state.ai.suggestions) {
    const decision = decisions[suggestion.sourceColumnId];
    if (
      decision?.status === "pending" &&
      suggestion.targetField !== null &&
      decision.targetField === suggestion.targetField &&
      suggestion.confidence >= CONFIDENCE_THRESHOLDS.high
    ) {
      decisions[suggestion.sourceColumnId] = { ...decision, status: "accepted" };
      changed = true;
    }
  }
  return changed ? withDecisions(state, decisions) : state;
}

/* ------------------------------------------------------------------------------------------------
 * Review (server round trip)
 * --------------------------------------------------------------------------------------------- */

export function reviewStarted(state: WorkflowState): WorkflowState {
  return { ...state, review: { status: "submitting", issues: [], error: null } };
}

export function reviewNeedsChanges(state: WorkflowState, issues: MappingIssue[]): WorkflowState {
  return { ...state, review: { status: "idle", issues, error: null } };
}

export function reviewApproved(
  state: WorkflowState,
  approvedMapping: ApprovedMapping,
): WorkflowState {
  return { ...state, approvedMapping, review: IDLE_REVIEW };
}

export function reviewFailed(state: WorkflowState, message: string): WorkflowState {
  return { ...state, review: { status: "error", issues: [], error: message } };
}

/* ------------------------------------------------------------------------------------------------
 * Validation overlays
 * --------------------------------------------------------------------------------------------- */

function rawValue(state: WorkflowState, rowId: RowId, field: FieldKey): string | undefined {
  const columnId = state.approvedMapping?.fieldToColumn[field];
  if (!columnId || !state.dataset) return undefined;
  return state.dataset.rows.find((r) => r.id === rowId)?.values[columnId];
}

/** Set a cell correction. Typing the original value back removes the correction. */
export function setCorrection(
  state: WorkflowState,
  rowId: RowId,
  field: FieldKey,
  value: string,
): WorkflowState {
  if (!state.approvedMapping?.fieldToColumn[field]) return state;
  const key = correctionKey(rowId, field);
  const corrections = { ...state.corrections };
  if (value === rawValue(state, rowId, field)) delete corrections[key];
  else corrections[key] = value;
  return { ...state, corrections };
}

export function revertCorrection(
  state: WorkflowState,
  rowId: RowId,
  field: FieldKey,
): WorkflowState {
  const key = correctionKey(rowId, field);
  if (!(key in state.corrections)) return state;
  const corrections = { ...state.corrections };
  delete corrections[key];
  return { ...state, corrections };
}

export function acceptFixes(state: WorkflowState, issueIds: readonly string[]): WorkflowState {
  if (issueIds.length === 0) return state;
  const acceptedFixes = { ...state.acceptedFixes };
  for (const id of issueIds) acceptedFixes[id] = true;
  return { ...state, acceptedFixes };
}

export function revokeFix(state: WorkflowState, issueId: string): WorkflowState {
  if (!state.acceptedFixes[issueId]) return state;
  const acceptedFixes = { ...state.acceptedFixes };
  delete acceptedFixes[issueId];
  return { ...state, acceptedFixes };
}

export function setExcluded(
  state: WorkflowState,
  rowIds: readonly RowId[],
  excluded: boolean,
): WorkflowState {
  const excludedRowIds = { ...state.excludedRowIds };
  for (const id of rowIds) {
    if (excluded) excludedRowIds[id] = true;
    else delete excludedRowIds[id];
  }
  return { ...state, excludedRowIds };
}

/* ------------------------------------------------------------------------------------------------
 * Export
 * --------------------------------------------------------------------------------------------- */

export function setExportOptions(
  state: WorkflowState,
  patch: Partial<ExportOptions>,
): WorkflowState {
  return { ...state, exportOptions: { ...state.exportOptions, ...patch } };
}
