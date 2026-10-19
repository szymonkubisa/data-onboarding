import type { ColumnProfile } from "@/domain/dataset/profile";
import type { SuggestionOrigin } from "@/domain/mapping/types";
import type { FieldDefinition } from "@/domain/schema/types";

/** A source column as the suggester sees it: name, statistics, and samples only with consent. */
export interface SuggestColumn {
  id: string;
  name: string;
  profile: ColumnProfile;
  samples?: string[];
}

export interface SuggestInput {
  schema: { id: string; label: string; fields: readonly FieldDefinition[] };
  columns: readonly SuggestColumn[];
  /** Exact header matches found deterministically, passed to the model as hints. */
  hints: readonly { columnId: string; field: string }[];
  /** Validation problems with the previous attempt. Empty on the first attempt. */
  previousProblems: readonly string[];
}

/**
 * Port for anything that proposes a column mapping. Returns raw output: the graph's
 * validateOutput node parses and repairs it, for every implementation alike.
 */
export interface MappingSuggester {
  readonly origin: SuggestionOrigin;
  /** Model id for live suggesters, null for heuristics. */
  readonly model: string | null;
  suggest(input: SuggestInput, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export type SuggesterErrorKind = "timeout" | "provider" | "invalid-output";

export class SuggesterError extends Error {
  constructor(
    readonly kind: SuggesterErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SuggesterError";
  }
}
