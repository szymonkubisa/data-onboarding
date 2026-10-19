import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import {
  analyseSource,
  generateSuggestions,
  heuristicFallback,
  humanReview,
  routeAfterApproval,
  routeAfterGenerate,
  routeAfterValidate,
  validateApprovedMapping,
  validateOutput,
} from "./nodes";
import { MappingState } from "./state";

/**
 * START → analyseSource → generateSuggestions ─(provider error)→ heuristicFallback ─┐
 *                              ↑                                                     │
 *                              └─(invalid, retries left)─ validateOutput ─(ok)→ humanReview ⇄ validateApprovedMapping → END
 *                                          (invalid, exhausted)→ heuristicFallback ──→┘
 */
export function buildMappingGraph(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(MappingState)
    .addNode("analyseSource", analyseSource)
    .addNode("generateSuggestions", generateSuggestions)
    .addNode("validateOutput", validateOutput)
    .addNode("heuristicFallback", heuristicFallback)
    .addNode("humanReview", humanReview)
    .addNode("validateApprovedMapping", validateApprovedMapping)
    .addEdge(START, "analyseSource")
    .addEdge("analyseSource", "generateSuggestions")
    .addConditionalEdges("generateSuggestions", routeAfterGenerate, [
      "validateOutput",
      "heuristicFallback",
    ])
    .addConditionalEdges("validateOutput", routeAfterValidate, [
      "humanReview",
      "generateSuggestions",
      "heuristicFallback",
    ])
    .addEdge("heuristicFallback", "humanReview")
    .addEdge("humanReview", "validateApprovedMapping")
    .addConditionalEdges("validateApprovedMapping", routeAfterApproval, ["humanReview", END])
    .compile({ checkpointer });
}

export type MappingGraph = ReturnType<typeof buildMappingGraph>;
