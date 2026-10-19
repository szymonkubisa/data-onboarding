import { FakeListChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import { datasetFrom } from "../../../../test/helpers/factories";
import type { SuggestRequest } from "@/contracts/mapping-api";
import { profileColumns } from "@/domain/dataset/profile";
import type { MappingDecision } from "@/domain/mapping/types";
import { HeuristicSuggester } from "../heuristic-suggester";
import { OpenRouterSuggester } from "../openrouter-suggester";
import { SuggesterError, type MappingSuggester, type SuggestInput } from "../suggester";
import { BoundedMemorySaver } from "./checkpointer";
import { buildMappingGraph } from "./graph";
import { resumeMapping, startMapping } from "./run";

const dataset = datasetFrom([
  ["Supplier", "Mail", "Land", "Internal ref"],
  ["Acme Ltd", "a@acme.example", "UK", "X1"],
  ["Beta GmbH", "b@beta.example", "DE", "X2"],
]);
const request: SuggestRequest = { schemaId: "supplier", profile: profileColumns(dataset) };

const good = {
  mappings: [
    {
      sourceColumnId: "c-001",
      targetField: "companyName",
      confidence: 0.94,
      reasoning: "Header says supplier.",
    },
    {
      sourceColumnId: "c-002",
      targetField: "email",
      confidence: 0.97,
      reasoning: "100% of values are emails.",
    },
    {
      sourceColumnId: "c-003",
      targetField: "country",
      confidence: 0.88,
      reasoning: "Values are countries.",
    },
    {
      sourceColumnId: "c-004",
      targetField: null,
      confidence: 0.7,
      reasoning: "Internal reference.",
    },
  ],
};

/** Scripted suggester: each call returns (or throws) the next item. Records its inputs. */
function scripted(...steps: (unknown | Error)[]) {
  const inputs: SuggestInput[] = [];
  const suggester: MappingSuggester = {
    origin: "llm",
    model: "test/model",
    async suggest(input) {
      inputs.push(input);
      const step = steps[Math.min(inputs.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      return step;
    },
  };
  return { suggester, inputs };
}

const freshGraph = () => buildMappingGraph(new BoundedMemorySaver());

const decisionsFrom = (targets: Record<string, string | null>): MappingDecision[] =>
  Object.entries(targets).map(([sourceColumnId, targetField]) => ({
    sourceColumnId,
    targetField,
    status: targetField ? "accepted" : "ignored",
  }));

const complete = decisionsFrom({
  "c-001": "companyName",
  "c-002": "email",
  "c-003": "country",
  "c-004": null,
});

describe("mapping graph", () => {
  it("happy path: suggest, pause for review, approve", async () => {
    const graph = freshGraph();
    const { suggester, inputs } = scripted(good);
    const { response, stats } = await startMapping({
      request,
      suggester,
      graph,
      threadId: "t-happy",
    });

    expect(response).toMatchObject({
      threadId: "t-happy",
      origin: "llm",
      model: "test/model",
      fallbackReason: null,
    });
    expect(response.suggestions.map((s) => s.targetField)).toEqual([
      "companyName",
      "email",
      "country",
      null,
    ]);
    expect(stats).toEqual({ attempts: 1, repairs: 0, providerError: null });
    expect(inputs[0]?.hints).toEqual([
      { columnId: "c-001", field: "companyName" },
      { columnId: "c-002", field: "email" },
      { columnId: "c-003", field: "country" },
    ]);
    expect((await graph.getState({ configurable: { thread_id: "t-happy" } })).next).toEqual([
      "humanReview",
    ]);

    const review = await resumeMapping({
      graph,
      request: {
        threadId: "t-happy",
        schemaId: "supplier",
        decisions: complete,
        suggestions: response.suggestions,
        profile: request.profile,
      },
    });
    expect(review).toMatchObject({ status: "approved", rehydrated: false });
    if (review.status === "approved") {
      expect(review.approvedMapping.fieldToColumn).toEqual({
        companyName: "c-001",
        email: "c-002",
        country: "c-003",
      });
    }
  });

  it("never sends row values unless samples were shared", async () => {
    const graph = freshGraph();
    const { suggester, inputs } = scripted(good);
    await startMapping({ request, suggester, graph });
    expect(JSON.stringify(inputs[0])).not.toContain("a@acme.example");

    const withSamples = scripted(good);
    await startMapping({
      request: { ...request, samples: { "c-002": ["a@acme.example"] } },
      suggester: withSamples.suggester,
      graph,
    });
    expect(withSamples.inputs[0]?.columns[1]?.samples).toEqual(["a@acme.example"]);
  });

  it("retries once with the validation problems, then succeeds", async () => {
    const graph = freshGraph();
    const { suggester, inputs } = scripted({ mappings: [] }, good);
    const { response, stats } = await startMapping({ request, suggester, graph });
    expect(stats.attempts).toBe(2);
    expect(inputs[0]?.previousProblems).toEqual([]);
    expect(inputs[1]?.previousProblems.join(" ")).toMatch(/at least one entry/);
    expect(response).toMatchObject({ origin: "llm", fallbackReason: null });
  });

  it("falls back to heuristics when retries are exhausted", async () => {
    const graph = freshGraph();
    const { suggester, inputs } = scripted({ nonsense: true });
    const { response, stats } = await startMapping({ request, suggester, graph });
    expect(inputs).toHaveLength(2);
    expect(stats.attempts).toBe(2);
    expect(response).toMatchObject({
      origin: "heuristic",
      fallbackReason: "invalid-output",
      model: null,
    });
    expect(response.suggestions.every((s) => s.origin === "heuristic")).toBe(true);
    expect(response.suggestions.find((s) => s.sourceColumnId === "c-002")?.targetField).toBe(
      "email",
    );
  });

  it("falls back to heuristics immediately on a provider error", async () => {
    const graph = freshGraph();
    const { suggester, inputs } = scripted(
      new SuggesterError("provider", "Model provider error: APIError (502)."),
    );
    const { response, stats } = await startMapping({ request, suggester, graph });
    expect(inputs).toHaveLength(1);
    expect(response).toMatchObject({ origin: "heuristic", fallbackReason: "provider-error" });
    expect(stats.providerError).toBe("Model provider error: APIError (502).");
  });

  it("repairs usable output instead of retrying", async () => {
    const graph = freshGraph();
    const { suggester, inputs } = scripted({
      mappings: [
        ...good.mappings.slice(0, 3),
        { sourceColumnId: "c-004", targetField: "email", confidence: 0.4, reasoning: "?" },
      ],
    });
    const { response, stats } = await startMapping({ request, suggester, graph });
    expect(inputs).toHaveLength(1);
    expect(stats.repairs).toBeGreaterThan(0);
    expect(response.suggestions[3]).toMatchObject({ targetField: null });
  });

  it("sends an incomplete mapping back for review, then approves the fix", async () => {
    const graph = freshGraph();
    const { suggester } = scripted(good);
    const { response } = await startMapping({ request, suggester, graph, threadId: "t-loop" });
    const base = {
      threadId: "t-loop",
      schemaId: "supplier",
      suggestions: response.suggestions,
      profile: request.profile,
    };

    const first = await resumeMapping({
      graph,
      request: {
        ...base,
        decisions: decisionsFrom({
          "c-001": "companyName",
          "c-002": "email",
          "c-003": null,
          "c-004": null,
        }),
      },
    });
    expect(first).toEqual({
      status: "needs-changes",
      rehydrated: false,
      issues: [{ kind: "missing-required", severity: "error", field: "country" }],
    });
    expect((await graph.getState({ configurable: { thread_id: "t-loop" } })).next).toEqual([
      "humanReview",
    ]);

    const second = await resumeMapping({ graph, request: { ...base, decisions: complete } });
    expect(second.status).toBe("approved");
  });

  it("rehydrates a thread this instance has never seen (serverless cold start)", async () => {
    const { suggester } = scripted(good);
    const { response } = await startMapping({
      request,
      suggester,
      graph: freshGraph(),
      threadId: "t-cold",
    });

    const coldGraph = freshGraph();
    const review = await resumeMapping({
      graph: coldGraph,
      request: {
        threadId: "t-cold",
        schemaId: "supplier",
        decisions: complete,
        suggestions: response.suggestions,
        profile: request.profile,
      },
    });
    expect(review).toMatchObject({ status: "approved", rehydrated: true });

    const incomplete = await resumeMapping({
      graph: freshGraph(),
      request: {
        threadId: "t-cold-2",
        schemaId: "supplier",
        decisions: decisionsFrom({
          "c-001": "companyName",
          "c-002": null,
          "c-003": "country",
          "c-004": null,
        }),
        suggestions: response.suggestions,
        profile: request.profile,
      },
    });
    expect(incomplete).toMatchObject({ status: "needs-changes", rehydrated: true });
  });

  it("rejects a malformed resume value", async () => {
    const graph = freshGraph();
    const { suggester } = scripted(good);
    const { response } = await startMapping({ request, suggester, graph, threadId: "t-bad" });
    await expect(
      resumeMapping({
        graph,
        request: {
          threadId: "t-bad",
          schemaId: "supplier",
          decisions: [
            { sourceColumnId: "c-001", targetField: "email", status: "maybe" },
          ] as unknown as MappingDecision[],
          suggestions: response.suggestions,
          profile: request.profile,
        },
      }),
    ).rejects.toThrow();
  });

  it("demo mode: heuristic suggester, labelled as such", async () => {
    const { response } = await startMapping({
      request,
      suggester: new HeuristicSuggester(),
      graph: freshGraph(),
    });
    expect(response).toMatchObject({
      origin: "heuristic",
      fallbackReason: "demo-mode",
      model: null,
    });
    expect(response.suggestions.map((s) => s.targetField)).toEqual([
      "companyName",
      "email",
      "country",
      null,
    ]);
  });

  it("works end to end with a LangChain chat model (FakeListChatModel)", async () => {
    const chatModel = new FakeListChatModel({
      responses: ["this is not json", JSON.stringify(good)],
    });
    const suggester = new OpenRouterSuggester({
      apiKey: "test",
      model: "fake/model",
      baseURL: "http://localhost",
      chatModel,
    });
    const { response, stats } = await startMapping({ request, suggester, graph: freshGraph() });
    expect(stats.attempts).toBe(2);
    expect(response).toMatchObject({ origin: "llm", model: "fake/model", fallbackReason: null });
    expect(response.suggestions[0]?.targetField).toBe("companyName");
  });
});

describe("BoundedMemorySaver", () => {
  it("evicts the oldest threads beyond the cap", async () => {
    const saver = new BoundedMemorySaver(2);
    const graph = buildMappingGraph(saver);
    for (const id of ["a", "b", "c"]) {
      await startMapping({ request, suggester: new HeuristicSuggester(), graph, threadId: id });
    }
    expect(saver.threadCount()).toBe(2);
    expect((await graph.getState({ configurable: { thread_id: "a" } })).next).toEqual([]);
    expect((await graph.getState({ configurable: { thread_id: "c" } })).next).toEqual([
      "humanReview",
    ]);
  });
});

describe("model time budget", () => {
  /** Never answers; rejects like the OpenRouter adapter when its signal aborts. */
  const silent: MappingSuggester = {
    origin: "llm",
    model: "slow/model",
    suggest: (_input, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new SuggesterError("timeout", "The model did not answer in time.")),
        );
      }),
  };

  it("falls back to heuristics when the model is too slow, instead of failing the request", async () => {
    const { response, stats } = await startMapping({
      request,
      suggester: silent,
      graph: freshGraph(),
      budget: { attemptMs: 50, minAttemptMs: 10, reserveMs: 0 },
    });
    expect(response).toMatchObject({ origin: "heuristic", fallbackReason: "timeout" });
    expect(response.suggestions.find((s) => s.sourceColumnId === "c-002")?.targetField).toBe(
      "email",
    );
    expect(stats).toMatchObject({
      attempts: 1,
      providerError: "The model did not answer in time.",
    });
  });

  it("skips a retry that would not fit before the deadline", async () => {
    const calls: number[] = [];
    const slowGarbage: MappingSuggester = {
      origin: "llm",
      model: "slow/model",
      suggest: async () => {
        calls.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { nonsense: true };
      },
    };
    const { response, stats } = await startMapping({
      request,
      suggester: slowGarbage,
      graph: freshGraph(),
      deadline: Date.now() + 500,
      budget: { attemptMs: 1_000, minAttemptMs: 300, reserveMs: 0 },
    });
    expect(calls).toHaveLength(1);
    expect(stats.attempts).toBe(2);
    expect(response).toMatchObject({ origin: "heuristic", fallbackReason: "timeout" });
  });
});
