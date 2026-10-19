# ADR 0002: LangGraph with MemorySaver and client-driven rehydration

- Status: accepted
- Date: 2026-10-17

## Context

Column mapping is a human-in-the-loop flow: the model proposes, a person reviews and edits, the result is checked, and the person may have to fix it again. The flow also has real branching: the model output can be invalid (retry with the validation errors), the provider can fail (fall back to heuristics), and an approved mapping can still be incomplete (send it back for review).

The demo runs on Vercel without a database. Serverless instances are short-lived and requests for the same session can land on different instances.

## Decision

The flow is one LangGraph `StateGraph` on the server:

```
START → analyseSource → generateSuggestions → validateOutput → humanReview ⇄ validateApprovedMapping → END
                              ↑     │ error         │ invalid, retries left
                              └─────┼───────────────┘
                                    ↓ error / retries exhausted
                             heuristicFallback → humanReview
```

- `humanReview` calls `interrupt()`. The `/api/mapping/review` request resumes it with `Command({ resume: decisions })`. The resume value is validated with Zod (`responseSchema`).
- `validateApprovedMapping` routes back to `humanReview` when required fields are missing or a target is used twice. That is a real cycle, not a linear chain.
- The suggester is injected through the run's `context` (LangGraph runtime context, not `configurable`), so it is never copied into checkpoint metadata. Tests and demo mode swap the LLM for a fake or for heuristics without touching the graph.

Checkpoints are stored in `MemorySaver` (bounded: oldest threads are evicted). When `/review` arrives at an instance that does not have the thread, the route **rehydrates** it: the client sends back the suggestions and column profile it got from `/suggest`, the route runs `analyseSource` on the profile, re-validates the suggestions with the same domain rules, writes them with `graph.updateState(config, values, "validateOutput")`, and resumes. If the echoed suggestions do not survive validation, heuristics stand in and the state is written as `heuristicFallback`'s output. Either way the next node is `humanReview`. The rehydrated state is the state the graph would have had, because the client only ever holds a copy of graph output.

Verified by integration tests (`src/infrastructure/ai/graph/graph.test.ts`): after `updateState`, a single `invoke(new Command({ resume }))` runs `humanReview`, which consumes the resume value immediately. The two-step fallback considered during planning (`invoke(null)` to reach the interrupt, then resume) was not needed.

## Consequences

- Works on Vercel without any infrastructure, and the code path for "thread found" and "thread lost" ends in the same resume call.
- The server does not pretend to be durable. A production deployment would swap `MemorySaver` for `@langchain/langgraph-checkpoint-postgres` (one line in `checkpointer.ts`) and drop rehydration.
- The client is trusted to send back suggestions it received. That is acceptable because the suggestions are only advisory: the approved mapping is re-validated on the server against the schema and the column list, and the data itself never leaves the browser.
- LangGraph is used for what it is good at (cycles, conditional edges, interrupts, checkpoints). A single LLM call wrapped in a graph would not justify the dependency.
