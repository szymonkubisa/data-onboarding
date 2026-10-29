import { describe, expect, it } from "vitest";
import { datasetFrom } from "../../../test/helpers/factories";
import type { SuggestResponse } from "@/contracts/mapping-api";
import { buildApprovedMapping } from "@/domain/mapping/rules";
import type { MappingSuggestion } from "@/domain/mapping/types";
import { selectExportPlan, selectMappingIssues, selectQualityReport } from "./selectors";
import { initialState, type WorkflowState } from "./state";
import { canEnter, stepBlocker } from "./steps";
import * as t from "./transitions";

const dataset = datasetFrom([
  ["Name", "Mail", "Land", "Notes"],
  ["Acme", "a@acme.example", "UK", "x"],
  ["Beta", "broken", "DE", ""],
]);

const suggestion = (
  sourceColumnId: string,
  targetField: string | null,
  confidence: number,
): MappingSuggestion => ({
  sourceColumnId,
  targetField,
  confidence,
  reasoning: "",
  origin: "heuristic",
});

const response: SuggestResponse = {
  threadId: "thread-1",
  origin: "heuristic",
  model: null,
  fallbackReason: "demo-mode",
  suggestions: [
    suggestion("c-001", "companyName", 0.95),
    suggestion("c-002", "email", 0.9),
    suggestion("c-003", "country", 0.6),
    suggestion("c-004", null, 0),
  ],
};

function withSuggestions(): WorkflowState {
  const loaded = t.loadDataset(initialState(), dataset);
  const started = t.suggestStarted(loaded);
  return t.suggestSucceeded(started, started.ai.requestId, response);
}

function approved(): WorkflowState {
  const state = withSuggestions();
  return t.reviewApproved(state, buildApprovedMapping(Object.values(state.decisions), "customer"));
}

describe("import transitions", () => {
  it("a new dataset resets everything downstream but keeps schema and consent", () => {
    const busy = t.setCorrection(approved(), "r-0001", "email", "x@y.example");
    const consented = { ...busy, sampleConsent: true };
    const next = t.loadDataset(consented, datasetFrom([["A"], ["1"]]));
    expect(next).toEqual({
      ...initialState(),
      sampleConsent: true,
      dataset: next.dataset,
      ai: { ...initialState().ai, requestId: busy.ai.requestId },
    });
  });

  it("keeps the AI request counter growing across file changes and resets", () => {
    const first = t.suggestStarted(t.loadDataset(initialState(), dataset));
    const replaced = t.suggestStarted(t.loadDataset(first, datasetFrom([["A"], ["1"]])));
    expect(replaced.ai.requestId).toBeGreaterThan(first.ai.requestId);
    expect(t.suggestSucceeded(replaced, first.ai.requestId, response)).toBe(replaced);
    expect(t.reset(replaced).ai.requestId).toBe(replaced.ai.requestId);
    expect(t.setSchema({ ...replaced, schemaId: "x" as never }, "customer").ai.requestId).toBe(
      replaced.ai.requestId,
    );
  });
});

describe("suggestion transitions", () => {
  it("starts every decision as pending with the suggested target", () => {
    const state = withSuggestions();
    expect(state.ai).toMatchObject({
      status: "ready",
      threadId: "thread-1",
      fallbackReason: "demo-mode",
    });
    expect(state.decisions["c-001"]).toEqual({
      sourceColumnId: "c-001",
      targetField: "companyName",
      status: "pending",
    });
  });

  it("ignores responses to superseded requests", () => {
    const loaded = t.loadDataset(initialState(), dataset);
    const first = t.suggestStarted(loaded);
    const second = t.suggestStarted(first);
    expect(t.suggestSucceeded(second, first.ai.requestId, response)).toBe(second);
    expect(t.suggestFailed(second, first.ai.requestId, "late")).toBe(second);
  });

  it("changing sample consent discards suggestions and the approval", () => {
    const next = t.setSampleConsent(approved(), true);
    expect(next.ai.status).toBe("idle");
    expect(next.decisions).toEqual({});
    expect(next.approvedMapping).toBeNull();
  });
});

describe("decision transitions", () => {
  it("records accepted, modified and ignored", () => {
    let state = withSuggestions();
    state = t.setDecisionTarget(state, "c-001", "companyName");
    state = t.setDecisionTarget(state, "c-003", "city");
    state = t.ignoreColumn(state, "c-002");
    expect([
      state.decisions["c-001"]?.status,
      state.decisions["c-003"]?.status,
      state.decisions["c-002"]?.status,
    ]).toEqual(["accepted", "modified", "ignored"]);
  });

  it("accepts all high-confidence suggestions only", () => {
    const state = t.acceptAllHighConfidence(withSuggestions());
    expect(Object.values(state.decisions).map((d) => d.status)).toEqual([
      "accepted",
      "accepted",
      "pending",
      "pending",
    ]);
  });

  it("any mapping change voids the approval and drops overlays for unmapped fields", () => {
    let state = approved();
    state = t.setCorrection(state, "r-0002", "email", "fixed@beta.example");
    state = t.setCorrection(state, "r-0001", "companyName", "ACME");
    state = t.acceptFixes(state, ["r-0001:email:invalid-email", "r-0002:companyName:x"]);
    expect(Object.keys(state.corrections)).toHaveLength(2);

    const next = t.ignoreColumn(state, "c-002");
    expect(next.approvedMapping).toBeNull();
    expect(next.corrections).toEqual({ "r-0001:companyName": "ACME" });
    expect(next.acceptedFixes).toEqual({ "r-0002:companyName:x": true });
  });

  it("server review issues are cleared by the next edit", () => {
    let state = t.reviewNeedsChanges(withSuggestions(), [
      { kind: "missing-required", severity: "error", field: "country" },
    ]);
    expect(state.review.issues).toHaveLength(1);
    state = t.setDecisionTarget(state, "c-003", "country");
    expect(state.review.issues).toEqual([]);
  });
});

describe("overlay transitions", () => {
  it("typing the original value back removes the correction", () => {
    let state = t.setCorrection(approved(), "r-0002", "email", "fixed@beta.example");
    expect(state.corrections).toEqual({ "r-0002:email": "fixed@beta.example" });
    state = t.setCorrection(state, "r-0002", "email", "broken");
    expect(state.corrections).toEqual({});
  });

  it("ignores corrections for fields that are not mapped", () => {
    const state = approved();
    expect(t.setCorrection(state, "r-0001", "phone", "123")).toBe(state);
  });

  it("excludes and restores rows", () => {
    let state = t.setExcluded(approved(), ["r-0001", "r-0002"], true);
    state = t.setExcluded(state, ["r-0001"], false);
    expect(state.excludedRowIds).toEqual({ "r-0002": true });
  });
});

describe("steps", () => {
  it("guards steps by prerequisites, with a reason", () => {
    expect(stepBlocker(initialState(), "map")).toBe("Import a file first.");
    expect(canEnter(withSuggestions(), "map")).toBe(true);
    expect(stepBlocker(withSuggestions(), "validate")).toBe("Approve the column mapping first.");
    expect(canEnter(approved(), "export")).toBe(true);
  });
});

describe("selectors", () => {
  it("derive issues, report and export plan and memoize them", () => {
    const state = approved();
    expect(selectMappingIssues(withSuggestions())).toEqual([]);
    const report = selectQualityReport(state);
    expect(report?.summary).toMatchObject({ total: 2, errors: 1 });
    expect(selectQualityReport(state)).toBe(report);
    expect(selectExportPlan(state)?.counts.included).toBe(1);

    const corrected = t.setCorrection(state, "r-0002", "email", "ok@beta.example");
    expect(selectQualityReport(corrected)).not.toBe(report);
    expect(selectExportPlan(corrected)?.counts.included).toBe(2);
  });
});
