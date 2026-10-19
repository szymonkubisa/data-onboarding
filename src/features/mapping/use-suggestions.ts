"use client";

import { useEffect } from "react";
import { requestSuggestions } from "@/application/workflow/commands";
import { useWorkflow, useWorkflowStoreApi } from "@/application/workflow/react";

/**
 * Ask for suggestions as soon as the mapping step has a dataset and no suggestions.
 * Only the column profile is sent; samples only after consent. Responses to superseded
 * requests are dropped by request id, so no abort handling is needed here.
 */
export function useAutoSuggestions() {
  const store = useWorkflowStoreApi();
  const hasDataset = useWorkflow((s) => s.dataset !== null);
  const status = useWorkflow((s) => s.ai.status);

  useEffect(() => {
    if (hasDataset && status === "idle") void requestSuggestions(store);
  }, [hasDataset, status, store]);

  return { retry: () => void requestSuggestions(store) };
}
