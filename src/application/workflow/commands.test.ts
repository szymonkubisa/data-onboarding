import { afterEach, describe, expect, it, vi } from "vitest";
import { datasetFrom } from "../../../test/helpers/factories";
import type { SuggestResponse } from "@/contracts/mapping-api";
import { requestSuggestions, submitReview } from "./commands";
import { createWorkflowStore } from "./store";

/** Captures fetch calls and lets the test decide when (and with what) each one answers. */
function controlledFetch() {
  const calls: { url: string; resolve: (response: Response) => void }[] = [];
  vi.stubGlobal(
    "fetch",
    (url: string) => new Promise<Response>((resolve) => calls.push({ url, resolve })),
  );
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function suggestBody(threadId: string, fields: (string | null)[]): SuggestResponse {
  return {
    threadId,
    origin: "heuristic",
    model: null,
    fallbackReason: "demo-mode",
    suggestions: fields.map((targetField, i) => ({
      sourceColumnId: `c-00${i + 1}`,
      targetField,
      confidence: 0.9,
      reasoning: threadId,
      origin: "heuristic",
    })),
  };
}

// Same column ids (c-001, c-002), different meaning: a late answer would fit silently.
const fileA = datasetFrom(
  [
    ["Name", "Email"],
    ["Acme", "a@acme.example"],
  ],
  "a.csv",
);
const fileB = datasetFrom(
  [
    ["Kraj", "Telefon"],
    ["PL", "+48 22 123 45 67"],
  ],
  "b.csv",
);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("replacing the file while the AI is answering", () => {
  it("ignores a late suggestion for the previous file", async () => {
    const calls = controlledFetch();
    const store = createWorkflowStore();
    store.getState().actions.loadDataset(fileA);
    const forA = requestSuggestions(store);

    store.getState().actions.loadDataset(fileB);
    const forB = requestSuggestions(store);

    calls[0]!.resolve(json(suggestBody("thread-A", ["companyName", "email"])));
    await forA;
    expect(store.getState().ai).toMatchObject({ status: "loading", threadId: null });
    expect(store.getState().decisions).toEqual({});

    calls[1]!.resolve(json(suggestBody("thread-B", ["country", "phone"])));
    await forB;
    expect(store.getState().ai).toMatchObject({ status: "ready", threadId: "thread-B" });
    expect(store.getState().decisions["c-001"]?.targetField).toBe("country");
  });

  it("ignores a late failure for the previous file", async () => {
    const calls = controlledFetch();
    const store = createWorkflowStore();
    store.getState().actions.loadDataset(fileA);
    const forA = requestSuggestions(store);
    store.getState().actions.loadDataset(fileB);
    void requestSuggestions(store);

    calls[0]!.resolve(json({ error: { code: "suggest-failed", message: "old failure" } }, 500));
    await forA;
    expect(store.getState().ai).toMatchObject({ status: "loading", error: null });
  });

  it("does the same after a schema change or a reset", async () => {
    const calls = controlledFetch();
    const store = createWorkflowStore();
    store.getState().actions.loadDataset(fileA);
    const forA = requestSuggestions(store);

    store.getState().actions.reset();
    store.getState().actions.loadDataset(fileB);
    void requestSuggestions(store);

    calls[0]!.resolve(json(suggestBody("thread-A", ["companyName", "email"])));
    await forA;
    expect(store.getState().ai.threadId).toBeNull();
  });

  it("does not show a late review error from the previous file", async () => {
    const calls = controlledFetch();
    const store = createWorkflowStore();
    store.getState().actions.loadDataset(fileA);
    const suggested = requestSuggestions(store);
    calls[0]!.resolve(json(suggestBody("thread-A", ["companyName", "email"])));
    await suggested;

    const review = submitReview(store);
    await flush();
    store.getState().actions.loadDataset(fileB);
    calls[1]!.resolve(json({ error: { code: "review-failed", message: "old failure" } }, 500));

    await expect(review).resolves.toBe("stale");
    expect(store.getState().review).toMatchObject({ status: "idle", error: null });
  });
});
