import { createStore, type StoreApi } from "zustand/vanilla";
import type { SuggestResponse } from "@/contracts/mapping-api";
import type { ColumnId, RowId, SourceDataset } from "@/domain/dataset/types";
import type { ExportOptions } from "@/domain/export/build-export";
import type { ApprovedMapping, MappingIssue } from "@/domain/mapping/types";
import type { SchemaId } from "@/domain/schema/registry";
import type { FieldKey } from "@/domain/schema/types";
import { initialState, type WorkflowState } from "./state";
import * as t from "./transitions";

export interface WorkflowActions {
  loadDataset: (dataset: SourceDataset) => void;
  setSchema: (schemaId: SchemaId) => void;
  reset: () => void;
  setSampleConsent: (consent: boolean) => void;
  /** Returns the request id to pass back to suggestSucceeded / suggestFailed. */
  suggestStarted: () => number;
  suggestSucceeded: (requestId: number, response: SuggestResponse) => void;
  suggestFailed: (requestId: number, message: string) => void;
  setDecisionTarget: (columnId: ColumnId, field: FieldKey | null) => void;
  acceptSuggestion: (columnId: ColumnId) => void;
  ignoreColumn: (columnId: ColumnId) => void;
  acceptAllHighConfidence: () => void;
  reviewStarted: () => void;
  reviewNeedsChanges: (issues: MappingIssue[]) => void;
  reviewApproved: (mapping: ApprovedMapping) => void;
  reviewFailed: (message: string) => void;
  setCorrection: (rowId: RowId, field: FieldKey, value: string) => void;
  revertCorrection: (rowId: RowId, field: FieldKey) => void;
  acceptFixes: (issueIds: readonly string[]) => void;
  revokeFix: (issueId: string) => void;
  setExcluded: (rowIds: readonly RowId[], excluded: boolean) => void;
  setExportOptions: (patch: Partial<ExportOptions>) => void;
}

export type WorkflowStore = WorkflowState & { actions: WorkflowActions };
export type WorkflowStoreApi = StoreApi<WorkflowStore>;

/**
 * Vanilla store (one per provider, not a module singleton) so tests and multiple
 * mounts never share state. Actions are thin: each delegates to a pure transition.
 */
export function createWorkflowStore(preloaded: Partial<WorkflowState> = {}): WorkflowStoreApi {
  return createStore<WorkflowStore>()((set, get) => {
    const apply =
      <A extends unknown[]>(transition: (state: WorkflowState, ...args: A) => WorkflowState) =>
      (...args: A) =>
        set((state) => transition(state, ...args));

    return {
      ...initialState(),
      ...preloaded,
      actions: {
        loadDataset: apply(t.loadDataset),
        setSchema: apply(t.setSchema),
        reset: apply(t.reset),
        setSampleConsent: apply(t.setSampleConsent),
        suggestStarted: () => {
          set((state) => t.suggestStarted(state));
          return get().ai.requestId;
        },
        suggestSucceeded: apply(t.suggestSucceeded),
        suggestFailed: apply(t.suggestFailed),
        setDecisionTarget: apply(t.setDecisionTarget),
        acceptSuggestion: apply(t.acceptSuggestion),
        ignoreColumn: apply(t.ignoreColumn),
        acceptAllHighConfidence: apply(t.acceptAllHighConfidence),
        reviewStarted: apply(t.reviewStarted),
        reviewNeedsChanges: apply(t.reviewNeedsChanges),
        reviewApproved: apply(t.reviewApproved),
        reviewFailed: apply(t.reviewFailed),
        setCorrection: apply(t.setCorrection),
        revertCorrection: apply(t.revertCorrection),
        acceptFixes: apply(t.acceptFixes),
        revokeFix: apply(t.revokeFix),
        setExcluded: apply(t.setExcluded),
        setExportOptions: apply(t.setExportOptions),
      },
    };
  });
}
