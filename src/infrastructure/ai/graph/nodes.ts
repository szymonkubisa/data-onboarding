import { interrupt, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { LIMITS } from "@/domain/dataset/limits";
import { exactHeaderHits, suggestByHeuristics } from "@/domain/mapping/heuristics";
import {
  buildApprovedMapping,
  hasBlockingIssues,
  normalizeSuggestions,
  validateMapping,
} from "@/domain/mapping/rules";
import { MappingDecisionListSchema } from "@/domain/mapping/schemas";
import { getSchema, isSchemaId } from "@/domain/schema/registry";
import type { TargetSchema } from "@/domain/schema/types";
import { collapseWhitespace, truncate } from "@/domain/shared/text";
import { SuggesterError, type MappingSuggester } from "../suggester";
import type { MappingStateType, MappingStateUpdate, ReviewInterrupt } from "./state";

/** One retry after an invalid answer, then heuristics. */
export const MAX_ATTEMPTS = 2;

/**
 * Time budget for model attempts. Each attempt gets its own timeout, cut to what is left
 * before the request deadline. A slow model therefore ends in the heuristic fallback, never
 * in an aborted request.
 */
export interface AttemptBudget {
  /** Longest a single model attempt may take. */
  attemptMs: number;
  /** An attempt with less time than this is not started. */
  minAttemptMs: number;
  /** Kept for heuristics and the response after the last attempt. */
  reserveMs: number;
}

export const DEFAULT_BUDGET: AttemptBudget = {
  attemptMs: 30_000,
  minAttemptMs: 8_000,
  reserveMs: 2_000,
};

export interface MappingContext {
  suggester: MappingSuggester;
  /** Epoch ms by which the request must be answered. No deadline: attempts are only capped. */
  deadline?: number;
  budget?: AttemptBudget;
}

type NodeConfig = LangGraphRunnableConfig & { context?: Partial<MappingContext> };

function schemaOf(state: MappingStateType): TargetSchema {
  if (!isSchemaId(state.schemaId)) throw new Error(`Unknown schema "${state.schemaId}"`);
  return getSchema(state.schemaId);
}

const columnIds = (state: MappingStateType) => state.columns.map((c) => c.id);
const columnNames = (state: MappingStateType) =>
  Object.fromEntries(state.columns.map((c) => [c.id, c.name]));

/** Deterministic: clean headers, enforce limits, attach consented samples, find exact matches. */
export function analyseSource(state: MappingStateType): MappingStateUpdate {
  const schema = schemaOf(state);
  const columns = state.profile.slice(0, LIMITS.maxColumns).map((profile) => {
    const samples = state.samples?.[profile.columnId]
      ?.slice(0, LIMITS.sampleValuesPerColumn)
      .map((s) => truncate(s, LIMITS.sampleValueMaxLength));
    return {
      id: profile.columnId,
      name: truncate(collapseWhitespace(profile.name), LIMITS.maxHeaderLength + 16),
      profile,
      ...(samples && samples.length > 0 ? { samples } : {}),
    };
  });
  return {
    columns,
    hints: exactHeaderHits(columns, schema.fields),
    attempt: 0,
    problems: [],
    parseError: null,
    providerError: null,
    providerErrorKind: null,
  };
}

export async function generateSuggestions(
  state: MappingStateType,
  config: NodeConfig,
): Promise<MappingStateUpdate> {
  const suggester = config.context?.suggester;
  if (!suggester) throw new Error("No suggester in graph context.");
  const schema = schemaOf(state);
  const attempt = state.attempt + 1;

  const budget = config.context?.budget ?? DEFAULT_BUDGET;
  const left =
    (config.context?.deadline ?? Number.POSITIVE_INFINITY) - Date.now() - budget.reserveMs;
  const timeoutMs = Math.min(budget.attemptMs, left);
  if (timeoutMs < budget.minAttemptMs) {
    return {
      attempt,
      providerError: "No time left for another model attempt.",
      providerErrorKind: "timeout",
      model: suggester.model,
    };
  }
  // The attempt's own timeout, plus the run's signal (the client went away).
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = config.signal ? AbortSignal.any([config.signal, timeout]) : timeout;

  try {
    const raw = await suggester.suggest(
      {
        schema: { id: schema.id, label: schema.label, fields: schema.fields },
        columns: state.columns,
        hints: state.hints,
        previousProblems: state.problems,
      },
      { signal },
    );
    return {
      raw,
      attempt,
      parseError: null,
      providerError: null,
      providerErrorKind: null,
      origin: suggester.origin,
      model: suggester.model,
    };
  } catch (error) {
    if (error instanceof SuggesterError && error.kind === "invalid-output") {
      return {
        raw: null,
        attempt,
        parseError: error.message,
        providerError: null,
        providerErrorKind: null,
        model: suggester.model,
      };
    }
    const timedOut =
      (error instanceof SuggesterError && error.kind === "timeout") || timeout.aborted;
    return {
      attempt,
      providerError: error instanceof Error ? error.message : "Unknown error",
      providerErrorKind: timedOut ? "timeout" : "provider",
      model: suggester.model,
    };
  }
}

export function routeAfterGenerate(
  state: MappingStateType,
): "validateOutput" | "heuristicFallback" {
  return state.providerError ? "heuristicFallback" : "validateOutput";
}

/** Zod parse plus domain repair. The same code checks LLM and heuristic output. */
export function validateOutput(state: MappingStateType): MappingStateUpdate {
  const schema = schemaOf(state);
  if (state.parseError) {
    return { suggestions: [], problems: [state.parseError], repairs: 0 };
  }
  const result = normalizeSuggestions(state.raw, {
    columnIds: columnIds(state),
    fieldKeys: schema.fields.map((f) => f.key),
    origin: state.origin ?? "llm",
    columnNames: columnNames(state),
  });
  return {
    suggestions: result.suggestions,
    problems: result.problems,
    repairs: result.repairs.length,
    fallbackReason: result.valid && state.origin === "heuristic" ? "demo-mode" : null,
  };
}

export function routeAfterValidate(
  state: MappingStateType,
): "humanReview" | "generateSuggestions" | "heuristicFallback" {
  if (state.problems.length === 0 && state.suggestions.length > 0) return "humanReview";
  return state.attempt < MAX_ATTEMPTS ? "generateSuggestions" : "heuristicFallback";
}

export function heuristicFallback(state: MappingStateType): MappingStateUpdate {
  const schema = schemaOf(state);
  const raw = {
    mappings: suggestByHeuristics(state.columns, schema.fields).map(
      ({ sourceColumnId, targetField, confidence, reasoning }) => ({
        sourceColumnId,
        targetField,
        confidence,
        reasoning,
      }),
    ),
  };
  const result = normalizeSuggestions(raw, {
    columnIds: columnIds(state),
    fieldKeys: schema.fields.map((f) => f.key),
    origin: "heuristic",
    columnNames: columnNames(state),
  });
  return {
    suggestions: result.suggestions,
    origin: "heuristic",
    fallbackReason: !state.providerError
      ? "invalid-output"
      : state.providerErrorKind === "timeout"
        ? "timeout"
        : "provider-error",
    problems: [],
  };
}

/** Pause for the person. The resume value must be a valid list of decisions. */
export function humanReview(state: MappingStateType): MappingStateUpdate {
  const payload: ReviewInterrupt = { suggestions: state.suggestions, issues: state.reviewIssues };
  const decisions = interrupt(payload, { responseSchema: MappingDecisionListSchema });
  return { decisions };
}

export function validateApprovedMapping(state: MappingStateType): MappingStateUpdate {
  const schema = schemaOf(state);
  const issues = validateMapping(state.decisions, schema, columnIds(state), state.suggestions);
  if (hasBlockingIssues(issues)) return { reviewIssues: issues, approvedMapping: null };
  return {
    reviewIssues: issues,
    approvedMapping: buildApprovedMapping(state.decisions, schema.id),
  };
}

export function routeAfterApproval(state: MappingStateType): "humanReview" | "__end__" {
  return state.approvedMapping ? "__end__" : "humanReview";
}
