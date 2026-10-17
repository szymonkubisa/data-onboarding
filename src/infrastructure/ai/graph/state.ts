import { Annotation } from "@langchain/langgraph";
import type { FallbackReason } from "@/contracts/mapping-api";
import type { ColumnProfile } from "@/domain/dataset/profile";
import type {
  ApprovedMapping,
  MappingDecision,
  MappingIssue,
  MappingSuggestion,
  SuggestionOrigin,
} from "@/domain/mapping/types";
import type { SuggestColumn } from "../suggester";

/** Last-value channel with a default, so nodes never read `undefined`. */
const value = <T>(initial: () => T) =>
  Annotation<T>({ reducer: (_previous, next) => next, default: initial });

/**
 * Server-side graph state. The client only ever receives a copy of `suggestions`,
 * `origin` and `fallbackReason`; profiles, attempts and raw model output stay here.
 */
export const MappingState = Annotation.Root({
  // Input
  schemaId: value<string>(() => ""),
  profile: value<ColumnProfile[]>(() => []),
  samples: value<Record<string, string[]> | null>(() => null),

  // analyseSource
  columns: value<SuggestColumn[]>(() => []),
  hints: value<{ columnId: string; field: string }[]>(() => []),

  // generate / validate loop
  attempt: value<number>(() => 0),
  raw: value<unknown>(() => null),
  parseError: value<string | null>(() => null),
  providerError: value<string | null>(() => null),
  problems: value<string[]>(() => []),
  repairs: value<number>(() => 0),

  // Result shown to the person
  suggestions: value<MappingSuggestion[]>(() => []),
  origin: value<SuggestionOrigin | null>(() => null),
  model: value<string | null>(() => null),
  fallbackReason: value<FallbackReason | null>(() => null),

  // Review loop
  decisions: value<MappingDecision[]>(() => []),
  reviewIssues: value<MappingIssue[]>(() => []),
  approvedMapping: value<ApprovedMapping | null>(() => null),
});

export type MappingStateType = typeof MappingState.State;
export type MappingStateUpdate = typeof MappingState.Update;

/** Payload the graph sends to the person when it pauses in humanReview. */
export interface ReviewInterrupt {
  suggestions: MappingSuggestion[];
  issues: MappingIssue[];
}
