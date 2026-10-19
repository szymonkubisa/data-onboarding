import "server-only";
import { Command, isInterrupted } from "@langchain/langgraph";
import type {
  ReviewRequest,
  ReviewResponse,
  SuggestRequest,
  SuggestResponse,
} from "@/contracts/mapping-api";
import { normalizeSuggestions } from "@/domain/mapping/rules";
import { getSchema, isSchemaId } from "@/domain/schema/registry";
import type { MappingSuggester } from "../suggester";
import { BoundedMemorySaver } from "./checkpointer";
import { buildMappingGraph, type MappingGraph } from "./graph";
import { analyseSource, heuristicFallback, type AttemptBudget } from "./nodes";
import type { MappingStateType } from "./state";

/** One graph per server instance. Threads live in memory; see checkpointer.ts. */
let defaultGraph: MappingGraph | null = null;
function graph(): MappingGraph {
  defaultGraph ??= buildMappingGraph(new BoundedMemorySaver());
  return defaultGraph;
}

const threadConfig = (threadId: string) => ({ configurable: { thread_id: threadId } });

/** Counters for logs. Never values, samples or headers. */
export interface RunStats {
  attempts: number;
  repairs: number;
  /** Why the provider call failed (class, status, provider code), when it did. */
  providerError: string | null;
}

export async function startMapping(args: {
  request: SuggestRequest;
  suggester: MappingSuggester;
  threadId?: string;
  /** Aborts the whole run (the client went away). Not a timeout: see `deadline`. */
  signal?: AbortSignal;
  /** Epoch ms by which the answer is due; model attempts are budgeted against it. */
  deadline?: number;
  budget?: AttemptBudget;
  graph?: MappingGraph;
}): Promise<{ response: SuggestResponse; stats: RunStats }> {
  const g = args.graph ?? graph();
  const threadId = args.threadId ?? crypto.randomUUID();
  const config = {
    ...threadConfig(threadId),
    context: { suggester: args.suggester, deadline: args.deadline, budget: args.budget },
    signal: args.signal,
  };

  await g.invoke(
    {
      schemaId: args.request.schemaId,
      profile: args.request.profile,
      samples: args.request.samples ?? null,
    },
    config,
  );
  const state = (await g.getState(config)).values as MappingStateType;
  return {
    response: {
      threadId,
      suggestions: state.suggestions,
      origin: state.origin ?? "heuristic",
      model: state.origin === "llm" ? state.model : null,
      fallbackReason: state.fallbackReason,
    },
    stats: { attempts: state.attempt, repairs: state.repairs, providerError: state.providerError },
  };
}

/**
 * Resume the graph at humanReview with the person's decisions.
 *
 * If this instance does not have the thread (serverless cold start, eviction), rebuild it
 * from what the client echoed back: run analyseSource on the profile, re-validate the
 * suggestions with the same domain rules, and write the result as if validateOutput had
 * just produced it. The conditional edge then leads to humanReview, which consumes the
 * resume value. The rebuilt state is the state the graph would have had.
 */
export async function resumeMapping(args: {
  request: ReviewRequest;
  graph?: MappingGraph;
}): Promise<ReviewResponse> {
  const g = args.graph ?? graph();
  const { request } = args;
  const config = threadConfig(request.threadId);

  const snapshot = await g.getState(config);
  let rehydrated = false;
  if (!snapshot.next.includes("humanReview")) {
    await rehydrate(g, config, request);
    rehydrated = true;
  }

  const result = await g.invoke(new Command({ resume: request.decisions }), config);
  const state = (await g.getState(config)).values as MappingStateType;

  if (isInterrupted(result) || !state.approvedMapping) {
    return { status: "needs-changes", issues: state.reviewIssues, rehydrated };
  }
  // The thread is finished; free the memory.
  if (typeof g.checkpointer === "object") await g.checkpointer.deleteThread(request.threadId);
  return { status: "approved", approvedMapping: state.approvedMapping, rehydrated };
}

/**
 * Write the state a fresh thread would have right before humanReview. Valid echoed
 * suggestions are written as validateOutput's result; if they do not survive validation,
 * heuristics stand in, written as heuristicFallback's result. Either way the next node is
 * humanReview, which consumes the resume value.
 */
async function rehydrate(
  g: MappingGraph,
  config: ReturnType<typeof threadConfig>,
  request: ReviewRequest,
): Promise<void> {
  if (!isSchemaId(request.schemaId)) throw new Error("Unknown schema");
  const base = {
    schemaId: request.schemaId,
    profile: request.profile,
    samples: null,
  } as MappingStateType;
  const analysed = { ...base, ...analyseSource(base) } as MappingStateType;
  const origin = request.suggestions[0]?.origin ?? "heuristic";
  const repaired = normalizeSuggestions(
    {
      mappings: request.suggestions.map(
        ({ sourceColumnId, targetField, confidence, reasoning }) => ({
          sourceColumnId,
          targetField,
          confidence,
          reasoning,
        }),
      ),
    },
    {
      columnIds: analysed.columns.map((c) => c.id),
      fieldKeys: getSchema(request.schemaId).fields.map((f) => f.key),
      origin,
    },
  );
  if (repaired.valid) {
    await g.updateState(
      config,
      { ...analysed, suggestions: repaired.suggestions, origin, problems: [] },
      "validateOutput",
    );
  } else {
    await g.updateState(
      config,
      { ...analysed, ...heuristicFallback(analysed) },
      "heuristicFallback",
    );
  }
}
