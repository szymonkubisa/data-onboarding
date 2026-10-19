"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { WorkflowState } from "./state";
import { createWorkflowStore, type WorkflowStore, type WorkflowStoreApi } from "./store";

const WorkflowContext = createContext<WorkflowStoreApi | null>(null);

export function WorkflowProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: Partial<WorkflowState>;
}) {
  const [store] = useState(() => createWorkflowStore(initialState));
  return <WorkflowContext value={store}>{children}</WorkflowContext>;
}

export function useWorkflowStoreApi(): WorkflowStoreApi {
  const store = use(WorkflowContext);
  if (!store) throw new Error("useWorkflow* hooks must be used inside <WorkflowProvider>.");
  return store;
}

export function useWorkflow<T>(selector: (state: WorkflowStore) => T): T {
  return useStore(useWorkflowStoreApi(), selector);
}

export function useWorkflowActions() {
  return useWorkflow((state) => state.actions);
}
