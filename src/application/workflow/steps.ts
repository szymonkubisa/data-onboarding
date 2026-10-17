import type { WorkflowState } from "./state";

export type StepId = "import" | "map" | "validate" | "export";

export interface StepDefinition {
  id: StepId;
  label: string;
  href: "/" | "/map" | "/validate" | "/export";
  description: string;
}

export const STEPS: readonly StepDefinition[] = [
  { id: "import", label: "Import", href: "/", description: "Load a CSV or Excel file" },
  { id: "map", label: "Map", href: "/map", description: "Match columns to fields" },
  { id: "validate", label: "Validate", href: "/validate", description: "Review and fix values" },
  { id: "export", label: "Export", href: "/export", description: "Download clean data" },
];

export function stepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id);
}

export function stepForPath(pathname: string): StepDefinition {
  return STEPS.find((s) => s.href === pathname) ?? STEPS[0]!;
}

/**
 * Why a step cannot be entered yet, or null when it can. The same text explains a disabled
 * Continue button and drives the redirect guard.
 */
export function stepBlocker(
  state: Pick<WorkflowState, "dataset" | "approvedMapping">,
  step: StepId,
): string | null {
  switch (step) {
    case "import":
      return null;
    case "map":
      return state.dataset ? null : "Import a file first.";
    case "validate":
    case "export":
      if (!state.dataset) return "Import a file first.";
      return state.approvedMapping ? null : "Approve the column mapping first.";
  }
}

export function canEnter(
  state: Pick<WorkflowState, "dataset" | "approvedMapping">,
  step: StepId,
): boolean {
  return stepBlocker(state, step) === null;
}
