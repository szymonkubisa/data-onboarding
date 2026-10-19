import { collectSamples } from "@/domain/dataset/profile";
import { ApiError, postReview, postSuggest } from "./api-client";
import { selectDecisionList, selectProfile } from "./selectors";
import type { WorkflowStoreApi } from "./store";

/**
 * Async workflows that talk to the server. They read the store, call the API, and
 * dispatch transitions. Kept out of components so they can be tested with a fake fetch.
 */

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Try again.";

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export async function requestSuggestions(
  store: WorkflowStoreApi,
  signal?: AbortSignal,
): Promise<void> {
  const { dataset, schemaId, sampleConsent, actions } = store.getState();
  if (!dataset) return;
  const requestId = actions.suggestStarted();
  const profile = selectProfile(store.getState());
  const samples = sampleConsent
    ? Object.fromEntries(dataset.columns.map((c) => [c.id, collectSamples(dataset, c.id)]))
    : undefined;

  try {
    const response = await postSuggest(
      { schemaId, profile, ...(samples ? { samples } : {}) },
      signal,
    );
    store.getState().actions.suggestSucceeded(requestId, response);
  } catch (error) {
    if (isAbort(error)) return;
    store.getState().actions.suggestFailed(requestId, messageOf(error));
  }
}

export type ReviewOutcome = "approved" | "needs-changes" | "stale" | "error";

/**
 * Send the person's decisions to the graph's review step. If the decisions change while
 * the request is in flight, the answer is about a mapping that no longer exists: drop it.
 */
export async function submitReview(store: WorkflowStoreApi): Promise<ReviewOutcome> {
  const state = store.getState();
  if (!state.dataset || !state.ai.threadId) return "error";
  state.actions.reviewStarted();
  const decisionsAtSubmit = state.decisions;

  try {
    const response = await postReview({
      threadId: state.ai.threadId,
      schemaId: state.schemaId,
      decisions: selectDecisionList(state),
      suggestions: state.ai.suggestions,
      profile: selectProfile(state),
    });
    const current = store.getState();
    if (current.decisions !== decisionsAtSubmit) return "stale";
    if (response.status === "approved") {
      current.actions.reviewApproved(response.approvedMapping);
      return "approved";
    }
    current.actions.reviewNeedsChanges(response.issues);
    return "needs-changes";
  } catch (error) {
    store.getState().actions.reviewFailed(messageOf(error));
    return "error";
  }
}
