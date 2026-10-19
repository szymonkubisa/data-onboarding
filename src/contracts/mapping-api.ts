import { z } from "zod";
import { LIMITS } from "@/domain/dataset/limits";
import {
  ApprovedMappingSchema,
  MappingDecisionListSchema,
  MappingIssueSchema,
  MappingSuggestionListSchema,
  SuggestionOriginSchema,
} from "@/domain/mapping/schemas";

/**
 * Wire contracts for /api/mapping/*. Shared by the route handlers (request parsing) and the
 * browser client (response parsing), so both sides fail loudly on drift.
 */

const Ratio = z.number().min(0).max(1);

export const ColumnProfileSchema = z.object({
  columnId: z.string().min(1).max(32),
  name: z
    .string()
    .min(1)
    .max(LIMITS.maxHeaderLength + 16),
  nonEmptyRatio: Ratio,
  distinctRatio: Ratio,
  avgLength: z.number().min(0).max(1_000_000),
  patterns: z.object({
    email: Ratio,
    url: Ratio,
    numeric: Ratio,
    phoneLike: Ratio,
    countryLike: Ratio,
  }),
});

const ProfileListSchema = z
  .array(ColumnProfileSchema)
  .min(1)
  .max(LIMITS.maxColumns)
  .refine((list) => new Set(list.map((c) => c.columnId)).size === list.length, {
    message: "columnId values must be unique",
  });

const SamplesSchema = z
  .record(
    z.string().max(32),
    z.array(z.string().max(LIMITS.sampleValueMaxLength)).max(LIMITS.sampleValuesPerColumn),
  )
  .refine((record) => Object.keys(record).length <= LIMITS.maxColumns, {
    message: "too many columns",
  });

export const SuggestRequestSchema = z.object({
  schemaId: z.string().min(1).max(64),
  profile: ProfileListSchema,
  /** Only present when the person opted in to sharing sample values. */
  samples: SamplesSchema.optional(),
});

export const FallbackReasonSchema = z.enum([
  "demo-mode",
  "provider-error",
  "timeout",
  "invalid-output",
]);

export const SuggestResponseSchema = z.object({
  threadId: z.string().min(1),
  suggestions: MappingSuggestionListSchema,
  origin: SuggestionOriginSchema,
  model: z.string().nullable(),
  fallbackReason: FallbackReasonSchema.nullable(),
});

export const ReviewRequestSchema = z.object({
  threadId: z.string().min(1).max(64),
  schemaId: z.string().min(1).max(64),
  decisions: MappingDecisionListSchema,
  /** Echo of the /suggest result, used to rebuild the thread on a cold instance. */
  suggestions: MappingSuggestionListSchema,
  profile: ProfileListSchema,
});

export const ReviewResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("approved"),
    approvedMapping: ApprovedMappingSchema,
    rehydrated: z.boolean(),
  }),
  z.object({
    status: z.literal("needs-changes"),
    issues: z.array(MappingIssueSchema),
    rehydrated: z.boolean(),
  }),
]);

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type ColumnProfilePayload = z.infer<typeof ColumnProfileSchema>;
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;
export type SuggestResponse = z.infer<typeof SuggestResponseSchema>;
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
export type FallbackReason = z.infer<typeof FallbackReasonSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

/** Largest request body the mapping routes accept. Profiles are small; this is generous. */
export const MAX_REQUEST_BYTES = 256 * 1024;
