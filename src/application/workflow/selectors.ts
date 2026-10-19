import type { ColumnProfilePayload } from "@/contracts/mapping-api";
import { profileColumns } from "@/domain/dataset/profile";
import type { SourceDataset } from "@/domain/dataset/types";
import { buildExport, type ExportOptions } from "@/domain/export/build-export";
import { summarizeMapping, validateMapping } from "@/domain/mapping/rules";
import type { ApprovedMapping, MappingDecision, MappingSuggestion } from "@/domain/mapping/types";
import { runQualityPipeline } from "@/domain/quality/pipeline";
import type { QualityReport } from "@/domain/quality/types";
import { getSchema, type SchemaId } from "@/domain/schema/registry";
import type { WorkflowState } from "./state";

/**
 * Derived state. Each selector memoizes on the identity of its inputs, so components
 * re-render only when a real input changed and expensive work (the quality pipeline)
 * runs once per change.
 */
function memo<A extends readonly unknown[], R>(compute: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | null = null;
  let lastResult: R;
  return (...args: A) => {
    if (
      lastArgs &&
      args.length === lastArgs.length &&
      args.every((a, i) => Object.is(a, lastArgs![i]))
    ) {
      return lastResult;
    }
    lastResult = compute(...args);
    lastArgs = args;
    return lastResult;
  };
}

export const selectSchema = (state: WorkflowState) => getSchema(state.schemaId);

const decisionList = memo(
  (decisions: Record<string, MappingDecision>, dataset: SourceDataset | null): MappingDecision[] =>
    dataset
      ? dataset.columns.map((c) => decisions[c.id]).filter((d): d is MappingDecision => Boolean(d))
      : [],
);
export const selectDecisionList = (state: WorkflowState) =>
  decisionList(state.decisions, state.dataset);

const profile = memo((dataset: SourceDataset | null): ColumnProfilePayload[] =>
  dataset ? profileColumns(dataset) : [],
);
export const selectProfile = (state: WorkflowState) => profile(state.dataset);

const mappingIssues = memo(
  (
    decisions: MappingDecision[],
    schemaId: SchemaId,
    dataset: SourceDataset | null,
    suggestions: MappingSuggestion[],
  ) =>
    dataset && decisions.length > 0
      ? validateMapping(
          decisions,
          getSchema(schemaId),
          dataset.columns.map((c) => c.id),
          suggestions,
        )
      : [],
);
export const selectMappingIssues = (state: WorkflowState) =>
  mappingIssues(selectDecisionList(state), state.schemaId, state.dataset, state.ai.suggestions);

const mappingSummary = memo((decisions: MappingDecision[], schemaId: SchemaId) =>
  summarizeMapping(decisions, getSchema(schemaId)),
);
export const selectMappingSummary = (state: WorkflowState) =>
  mappingSummary(selectDecisionList(state), state.schemaId);

const qualityReport = memo(
  (
    dataset: SourceDataset | null,
    schemaId: SchemaId,
    mapping: ApprovedMapping | null,
    corrections: Record<string, string>,
    acceptedFixes: Record<string, true>,
    excludedRowIds: Record<string, true>,
  ): QualityReport | null =>
    dataset && mapping
      ? runQualityPipeline({
          dataset,
          schema: getSchema(schemaId),
          mapping,
          corrections,
          acceptedFixes,
          excludedRowIds,
        })
      : null,
);
export const selectQualityReport = (state: WorkflowState) =>
  qualityReport(
    state.dataset,
    state.schemaId,
    state.approvedMapping,
    state.corrections,
    state.acceptedFixes,
    state.excludedRowIds,
  );

const exportPlan = memo(
  (report: QualityReport | null, schemaId: SchemaId, options: ExportOptions) =>
    report ? buildExport(report, getSchema(schemaId), options) : null,
);
export const selectExportPlan = (state: WorkflowState) =>
  exportPlan(selectQualityReport(state), state.schemaId, state.exportOptions);
