import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { supplierSchema } from "../schema/supplier";
import {
  buildApprovedMapping,
  confidenceBucket,
  hasBlockingIssues,
  initialDecisions,
  normalizeSuggestions,
  summarizeMapping,
  validateMapping,
} from "./rules";
import type { MappingDecisionSchema, MappingIssueSchema, MappingSuggestionSchema } from "./schemas";
import { buildLlmOutputJsonSchema } from "./schemas";
import type { MappingDecision, MappingIssue, MappingSuggestion } from "./types";

const columnIds = ["c-001", "c-002", "c-003", "c-004"];
const fieldKeys = supplierSchema.fields.map((f) => f.key);
const ctx = { columnIds, fieldKeys, origin: "llm" as const };

const entry = (sourceColumnId: string, targetField: string | null, confidence = 0.9) => ({
  sourceColumnId,
  targetField,
  confidence,
  reasoning: "because",
});

describe("zod schemas match domain types", () => {
  it("suggestion, decision, issue", () => {
    expectTypeOf<z.infer<typeof MappingSuggestionSchema>>().toEqualTypeOf<MappingSuggestion>();
    expectTypeOf<z.infer<typeof MappingDecisionSchema>>().toEqualTypeOf<MappingDecision>();
    expectTypeOf<z.infer<typeof MappingIssueSchema>>().toEqualTypeOf<MappingIssue>();
  });
});

describe("confidenceBucket", () => {
  it.each([
    [0.95, "high"],
    [0.8, "high"],
    [0.79, "medium"],
    [0.5, "medium"],
    [0.49, "low"],
    [0, "low"],
  ])("%s → %s", (value, bucket) => {
    expect(confidenceBucket(value)).toBe(bucket);
  });
});

describe("normalizeSuggestions", () => {
  it("rejects output that does not match the shape, with readable problems", () => {
    const result = normalizeSuggestions({ mappings: [{ sourceColumnId: 1 }] }, ctx);
    expect(result.valid).toBe(false);
    expect(result.problems.join("\n")).toMatch(/mappings\.0\.sourceColumnId/);
    expect(normalizeSuggestions("nope", ctx).valid).toBe(false);
    expect(normalizeSuggestions({ mappings: [] }, ctx).valid).toBe(false);
  });

  it("treats output covering too few known columns as invalid", () => {
    const result = normalizeSuggestions(
      { mappings: [entry("c-001", "email"), entry("zzz", "phone"), entry("yyy", "city")] },
      ctx,
    );
    expect(result.valid).toBe(false);
    expect(result.problems[0]).toMatch(/Only 1 of 4/);
  });

  it("repairs usable output", () => {
    const result = normalizeSuggestions(
      {
        mappings: [
          entry("c-001", "companyName", 0.9),
          entry("c-002", "email", 0.7),
          entry("c-003", "email", 0.95),
          entry("c-004", "favouriteColour", 0.8),
          entry("c-999", "city"),
        ],
      },
      { ...ctx, columnNames: { "c-003": "Mail" } },
    );
    expect(result.valid).toBe(true);
    expect(result.suggestions.map((s) => [s.sourceColumnId, s.targetField])).toEqual([
      ["c-001", "companyName"],
      ["c-002", null],
      ["c-003", "email"],
      ["c-004", null],
    ]);
    expect(result.suggestions[1]?.reasoning).toMatch(/Conflict.*Mail/);
    expect(result.suggestions[3]?.reasoning).toMatch(/favouriteColour/);
    expect(result.repairs).toEqual(
      expect.arrayContaining([
        'dropped unknown column "c-999"',
        'nulled unknown field "favouriteColour"',
        'resolved duplicate target "email"',
      ]),
    );
  });

  it("fills missing columns and clamps confidence (including percent answers)", () => {
    const result = normalizeSuggestions(
      {
        mappings: [
          entry("c-001", "companyName", 92),
          entry("c-002", "email", -1),
          entry("c-003", null, 2000),
        ],
      },
      ctx,
    );
    expect(result.suggestions.map((s) => s.confidence)).toEqual([0.92, 0, 1, 0]);
    expect(result.suggestions[3]).toMatchObject({ sourceColumnId: "c-004", targetField: null });
  });

  it("keeps the most confident of duplicate entries for one column", () => {
    const result = normalizeSuggestions(
      {
        mappings: [
          entry("c-001", "city", 0.4),
          entry("c-001", "companyName", 0.9),
          entry("c-002", null),
        ],
      },
      { ...ctx, columnIds: ["c-001", "c-002"] },
    );
    expect(result.suggestions[0]).toMatchObject({ targetField: "companyName", confidence: 0.9 });
  });

  it("stamps the origin", () => {
    const result = normalizeSuggestions(
      { mappings: columnIds.map((id) => entry(id, null)) },
      { ...ctx, origin: "heuristic" },
    );
    expect(result.suggestions.every((s) => s.origin === "heuristic")).toBe(true);
  });
});

describe("validateMapping", () => {
  const decision = (
    sourceColumnId: string,
    targetField: string | null,
    status: MappingDecision["status"] = "accepted",
  ): MappingDecision => ({ sourceColumnId, targetField, status });

  it("passes a complete mapping", () => {
    const issues = validateMapping(
      [decision("c-001", "companyName"), decision("c-002", "email"), decision("c-003", "country")],
      supplierSchema,
      columnIds,
    );
    expect(issues).toEqual([]);
  });

  it("reports missing required fields, duplicates, unknown columns and fields", () => {
    const issues = validateMapping(
      [
        decision("c-001", "email"),
        decision("c-002", "email"),
        decision("c-003", "nope"),
        decision("c-404", "city"),
      ],
      supplierSchema,
      columnIds,
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        {
          kind: "duplicate-target",
          severity: "error",
          field: "email",
          columnIds: ["c-001", "c-002"],
        },
        { kind: "unknown-field", severity: "error", columnId: "c-003", field: "nope" },
        { kind: "unknown-column", severity: "error", columnId: "c-404" },
        { kind: "missing-required", severity: "error", field: "companyName" },
        { kind: "missing-required", severity: "error", field: "country" },
      ]),
    );
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("ignored columns do not count as mapped", () => {
    const issues = validateMapping(
      [decision("c-001", "companyName", "ignored")],
      supplierSchema,
      columnIds,
    );
    expect(issues).toContainEqual({
      kind: "missing-required",
      severity: "error",
      field: "companyName",
    });
  });

  it("warns, without blocking, about untouched low-confidence suggestions", () => {
    const suggestions: MappingSuggestion[] = [
      {
        sourceColumnId: "c-001",
        targetField: "companyName",
        confidence: 0.3,
        reasoning: "",
        origin: "llm",
      },
    ];
    const decisions = [
      decision("c-001", "companyName", "pending"),
      decision("c-002", "email"),
      decision("c-003", "country"),
    ];
    const issues = validateMapping(decisions, supplierSchema, columnIds, suggestions);
    expect(issues).toEqual([
      {
        kind: "low-confidence",
        severity: "warning",
        columnId: "c-001",
        field: "companyName",
        confidence: 0.3,
      },
    ]);
    expect(hasBlockingIssues(issues)).toBe(false);

    const accepted = validateMapping(
      [decision("c-001", "companyName", "accepted"), ...decisions.slice(1)],
      supplierSchema,
      columnIds,
      suggestions,
    );
    expect(accepted).toEqual([]);
  });
});

describe("decisions → approved mapping", () => {
  it("starts every decision as pending with the suggested target", () => {
    const decisions = initialDecisions([
      {
        sourceColumnId: "c-001",
        targetField: "email",
        confidence: 1,
        reasoning: "",
        origin: "llm",
      },
    ]);
    expect(decisions).toEqual({
      "c-001": { sourceColumnId: "c-001", targetField: "email", status: "pending" },
    });
  });

  it("resolves pending to accepted and builds the field index", () => {
    const approved = buildApprovedMapping(
      [
        { sourceColumnId: "c-001", targetField: "email", status: "pending" },
        { sourceColumnId: "c-002", targetField: "city", status: "ignored" },
        { sourceColumnId: "c-003", targetField: "country", status: "modified" },
      ],
      "supplier",
    );
    expect(approved.fieldToColumn).toEqual({ email: "c-001", country: "c-003" });
    expect(approved.decisions.map((d) => d.status)).toEqual(["accepted", "ignored", "modified"]);
  });

  it("summarizes coverage", () => {
    const summary = summarizeMapping(
      [
        { sourceColumnId: "c-001", targetField: "email", status: "pending" },
        { sourceColumnId: "c-002", targetField: "email", status: "accepted" },
        { sourceColumnId: "c-003", targetField: "city", status: "accepted" },
      ],
      supplierSchema,
    );
    expect(summary).toMatchObject({
      mappedFields: 2,
      totalFields: 11,
      requiredMissing: ["companyName", "country"],
      conflicts: ["email"],
    });
  });
});

describe("buildLlmOutputJsonSchema", () => {
  it("constrains column ids and field keys to enums", () => {
    const schema = JSON.stringify(buildLlmOutputJsonSchema(["c-001", "c-002"], ["email", "city"]));
    expect(schema).toContain('"enum":["c-001","c-002"]');
    expect(schema).toContain('"email"');
  });
});
