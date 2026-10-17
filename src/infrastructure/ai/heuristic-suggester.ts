import { suggestByHeuristics } from "@/domain/mapping/heuristics";
import type { RawMappingOutput } from "@/domain/mapping/schemas";
import type { MappingSuggester, SuggestInput } from "./suggester";

/**
 * Demo-mode and fallback suggester. Deterministic, no network. Its output has the same
 * raw shape as the LLM's and goes through the same validation.
 */
export class HeuristicSuggester implements MappingSuggester {
  readonly origin = "heuristic" as const;
  readonly model = null;

  async suggest(input: SuggestInput): Promise<RawMappingOutput> {
    const suggestions = suggestByHeuristics(
      input.columns.map((c) => ({ id: c.id, name: c.name, profile: c.profile })),
      input.schema.fields,
    );
    return {
      mappings: suggestions.map(({ sourceColumnId, targetField, confidence, reasoning }) => ({
        sourceColumnId,
        targetField,
        confidence,
        reasoning,
      })),
    };
  }
}
