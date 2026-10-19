import { z } from "zod";
import { LIMITS } from "../dataset/limits";

/**
 * Zod schemas for mapping data crossing a boundary: LLM output, interrupt resume values,
 * API payloads. Types in types.ts are the source of truth; these schemas are checked
 * against them in rules.test.ts.
 */

const ColumnIdSchema = z.string().min(1).max(32);
const FieldKeySchema = z.string().min(1).max(64);

export const SuggestionOriginSchema = z.enum(["llm", "heuristic"]);

export const MappingSuggestionSchema = z.object({
  sourceColumnId: ColumnIdSchema,
  targetField: FieldKeySchema.nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(600),
  origin: SuggestionOriginSchema,
});

export const MappingSuggestionListSchema = z.array(MappingSuggestionSchema).max(LIMITS.maxColumns);

export const DecisionStatusSchema = z.enum(["pending", "accepted", "modified", "ignored"]);

export const MappingDecisionSchema = z.object({
  sourceColumnId: ColumnIdSchema,
  targetField: FieldKeySchema.nullable(),
  status: DecisionStatusSchema,
});

export const MappingDecisionListSchema = z.array(MappingDecisionSchema).max(LIMITS.maxColumns);

export const MappingIssueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("missing-required"),
    severity: z.literal("error"),
    field: z.string(),
  }),
  z.object({
    kind: z.literal("duplicate-target"),
    severity: z.literal("error"),
    field: z.string(),
    columnIds: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("unknown-column"),
    severity: z.literal("error"),
    columnId: z.string(),
  }),
  z.object({
    kind: z.literal("unknown-field"),
    severity: z.literal("error"),
    columnId: z.string(),
    field: z.string(),
  }),
  z.object({
    kind: z.literal("low-confidence"),
    severity: z.literal("warning"),
    columnId: z.string(),
    field: z.string(),
    confidence: z.number(),
  }),
]);

export const ApprovedMappingSchema = z.object({
  schemaId: z.string(),
  fieldToColumn: z.record(z.string(), z.string()),
  decisions: MappingDecisionListSchema,
});

/**
 * Shape a suggester must return before domain repair. Deliberately loose on values
 * (any string field, any number confidence): unknown fields, unknown columns and
 * out-of-range confidence are repaired by `normalizeSuggestions`, not rejected here.
 */
export const RawMappingOutputSchema = z.object({
  mappings: z
    .array(
      z.object({
        sourceColumnId: z.string(),
        targetField: z.string().nullable(),
        confidence: z.number(),
        reasoning: z.string(),
      }),
    )
    .min(1, "mappings must contain at least one entry"),
});

export type RawMappingOutput = z.infer<typeof RawMappingOutputSchema>;

/**
 * Schema handed to the LLM for structured output. Tighter than the raw schema: column ids
 * and field keys are enums, so a provider that enforces the schema cannot invent them.
 * Providers that do not enforce it are caught by validation.
 *
 * Shaped for strict structured-output modes (OpenAI / Azure `strict: true`): closed objects,
 * every property required, no numeric bounds (some providers reject them; the 0..1 range is
 * stated in the description and enforced by `normalizeSuggestions`). Passed to LangChain as
 * Zod, not JSON Schema: LangChain's JSON Schema path drops `additionalProperties: false`,
 * which strict mode rejects.
 */
export function buildLlmOutputSchema(columnIds: readonly string[], fieldKeys: readonly string[]) {
  return z.strictObject({
    mappings: z
      .array(
        z.strictObject({
          sourceColumnId: z.enum(columnIds as [string, ...string[]]),
          targetField: z.enum(fieldKeys as [string, ...string[]]).nullable(),
          confidence: z.number().describe("Estimate from 0 to 1 that the mapping is right."),
          reasoning: z.string(),
        }),
      )
      .describe("One entry per source column."),
  });
}
