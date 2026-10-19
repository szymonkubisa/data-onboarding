import type { FallbackReason } from "@/contracts/mapping-api";
import type { ColumnId, RowId, SourceDataset } from "@/domain/dataset/types";
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "@/domain/export/build-export";
import type {
  ApprovedMapping,
  MappingDecision,
  MappingIssue,
  MappingSuggestion,
  SuggestionOrigin,
} from "@/domain/mapping/types";
import { DEFAULT_SCHEMA_ID, type SchemaId } from "@/domain/schema/registry";

/** A copy of the AI graph's output. Not the graph state: that lives on the server. */
export interface AiSession {
  status: "idle" | "loading" | "ready" | "error";
  /** Increments per request so late responses to superseded requests are ignored. */
  requestId: number;
  threadId: string | null;
  suggestions: MappingSuggestion[];
  origin: SuggestionOrigin | null;
  model: string | null;
  fallbackReason: FallbackReason | null;
  error: string | null;
}

export interface ReviewState {
  status: "idle" | "submitting" | "error";
  /** Issues returned by the server's validateApprovedMapping node. */
  issues: MappingIssue[];
  error: string | null;
}

/**
 * Source state only. Everything derived (mapping issues, quality report, export plan)
 * is computed in selectors.ts and never stored.
 */
export interface WorkflowState {
  dataset: SourceDataset | null;
  schemaId: SchemaId;
  sampleConsent: boolean;
  ai: AiSession;
  decisions: Record<ColumnId, MappingDecision>;
  review: ReviewState;
  approvedMapping: ApprovedMapping | null;
  /** `${rowId}:${field}` → value typed by the person. Overlay; the dataset is untouched. */
  corrections: Record<string, string>;
  /** Issue ids of suggested fixes the person accepted. */
  acceptedFixes: Record<string, true>;
  excludedRowIds: Record<RowId, true>;
  exportOptions: ExportOptions;
}

export const IDLE_AI: AiSession = {
  status: "idle",
  requestId: 0,
  threadId: null,
  suggestions: [],
  origin: null,
  model: null,
  fallbackReason: null,
  error: null,
};

export const IDLE_REVIEW: ReviewState = { status: "idle", issues: [], error: null };

export function initialState(): WorkflowState {
  return {
    dataset: null,
    schemaId: DEFAULT_SCHEMA_ID,
    sampleConsent: false,
    ai: IDLE_AI,
    decisions: {},
    review: IDLE_REVIEW,
    approvedMapping: null,
    corrections: {},
    acceptedFixes: {},
    excludedRowIds: {},
    exportOptions: DEFAULT_EXPORT_OPTIONS,
  };
}
