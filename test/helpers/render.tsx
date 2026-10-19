import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { WorkflowProvider } from "@/application/workflow/react";
import type { WorkflowState } from "@/application/workflow/state";
import { TooltipProvider } from "@/components/ui/tooltip";

/** Render inside the same providers the app shell uses, with an optional preloaded store. */
export function renderWithWorkflow(
  ui: ReactElement,
  { initialState, ...options }: { initialState?: Partial<WorkflowState> } & RenderOptions = {},
) {
  const user = userEvent.setup({ applyAccept: false });
  const result = render(
    <TooltipProvider delayDuration={0}>
      <WorkflowProvider initialState={initialState}>{ui}</WorkflowProvider>
    </TooltipProvider>,
    options,
  );
  return { user, ...result };
}
