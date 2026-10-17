"use client";

import { CheckCheck, CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { submitReview } from "@/application/workflow/commands";
import { useWorkflow, useWorkflowActions, useWorkflowStoreApi } from "@/application/workflow/react";
import {
  selectDecisionList,
  selectMappingIssues,
  selectMappingSummary,
  selectSchema,
} from "@/application/workflow/selectors";
import { CONFIDENCE_THRESHOLDS, describeMappingIssue } from "@/domain/mapping/rules";
import type { MappingIssue } from "@/domain/mapping/types";
import { StepFooter } from "@/components/layout/step-footer";
import { StepHeader } from "@/components/layout/step-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoSuggestions } from "../use-suggestions";
import { AiStatusCard } from "./ai-status";
import { DecisionTable } from "./decision-table";
import { FieldCoverage } from "./field-coverage";

function useIssueLabels() {
  const schema = useWorkflow(selectSchema);
  const dataset = useWorkflow((s) => s.dataset);
  return useMemo(() => {
    const fields = new Map(schema.fields.map((f) => [f.key, f.label]));
    const columns = new Map(dataset?.columns.map((c) => [c.id, c.name]) ?? []);
    return {
      field: (key: string) => fields.get(key) ?? key,
      column: (id: string) => columns.get(id) ?? id,
    };
  }, [schema, dataset]);
}

function SummaryBar() {
  const summary = useWorkflow(selectMappingSummary);
  const decisions = useWorkflow(selectDecisionList);
  const suggestions = useWorkflow((s) => s.ai.suggestions);
  const ready = useWorkflow((s) => s.ai.status === "ready");
  const { acceptAllHighConfidence } = useWorkflowActions();
  const labels = useIssueLabels();

  const highPending = decisions.filter((d) => {
    const s = suggestions.find((x) => x.sourceColumnId === d.sourceColumnId);
    return (
      d.status === "pending" &&
      s?.targetField != null &&
      s.targetField === d.targetField &&
      s.confidence >= CONFIDENCE_THRESHOLDS.high
    );
  }).length;

  if (!ready) return null;
  const missing = summary.requiredMissing.length;
  const conflicts = summary.conflicts.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm" aria-live="polite">
        <span className="font-medium tabular-nums">
          {summary.mappedFields} of {summary.totalFields}
        </span>{" "}
        fields mapped
        {missing > 0 && (
          <span className="text-destructive">
            {" "}
            · {missing} required missing ({summary.requiredMissing.map(labels.field).join(", ")})
          </span>
        )}
        {conflicts > 0 && (
          <span className="text-warning">
            {" "}
            · {conflicts} conflict{conflicts === 1 ? "" : "s"}
          </span>
        )}
      </p>
      <Button variant="outline" onClick={acceptAllHighConfidence} disabled={highPending === 0}>
        <CheckCheck data-icon="inline-start" />
        Accept all high-confidence{highPending > 0 ? ` (${highPending})` : ""}
      </Button>
    </div>
  );
}

function ReviewIssues({ issues }: { issues: MappingIssue[] }) {
  const labels = useIssueLabels();
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === "error");
  return (
    <Alert
      id="review-issues"
      tabIndex={-1}
      variant={errors.length > 0 ? "destructive" : "default"}
      className={cn(
        errors.length > 0
          ? "border-destructive/30 bg-destructive-soft"
          : "border-warning/30 bg-warning-soft",
      )}
    >
      <CircleAlert />
      <AlertTitle>
        {errors.length > 0
          ? "The mapping needs changes before it can be approved"
          : "Check these before approving"}
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {issues.map((issue, i) => (
            <li key={i}>{describeMappingIssue(issue, labels)}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function MappingStep() {
  const router = useRouter();
  const store = useWorkflowStoreApi();
  const { retry } = useAutoSuggestions();
  const ai = useWorkflow((s) => s.ai);
  const review = useWorkflow((s) => s.review);
  const approved = useWorkflow((s) => s.approvedMapping !== null);
  const localIssues = useWorkflow(selectMappingIssues);

  const flagged = useMemo(() => {
    const ids = new Set<string>();
    for (const issue of [...localIssues, ...review.issues]) {
      if (issue.kind === "duplicate-target") issue.columnIds.forEach((id) => ids.add(id));
      if (issue.kind === "low-confidence") ids.add(issue.columnId);
    }
    return ids;
  }, [localIssues, review.issues]);

  const approve = async () => {
    if (approved) {
      router.push("/validate");
      return;
    }
    const outcome = await submitReview(store);
    if (outcome === "approved") {
      toast.success("Mapping approved");
      router.push("/validate");
    } else if (outcome === "needs-changes") {
      // Move focus to the explanation so keyboard and screen reader users hear it.
      requestAnimationFrame(() => {
        const alert = document.getElementById("review-issues");
        alert?.focus({ preventScroll: true });
        alert?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } else if (outcome === "stale") {
      toast.info("The mapping changed while it was being checked. Approve again.");
    }
  };

  const warnings = localIssues.filter((i) => i.severity === "warning");

  return (
    <>
      <StepHeader
        title="Map columns to fields"
        description="Each source column gets a suggested target field, a confidence estimate and a reason. Accept, change or ignore them; nothing is applied until you approve."
      />
      <div className="space-y-4">
        <AiStatusCard onRetry={retry} />
        {review.error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive-soft">
            <CircleAlert />
            <AlertTitle>Could not check the mapping</AlertTitle>
            <AlertDescription>{review.error}</AlertDescription>
          </Alert>
        )}
        <ReviewIssues issues={review.issues.length > 0 ? review.issues : warnings} />
        <SummaryBar />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <DecisionTable flaggedColumns={flagged} />
          <FieldCoverage />
        </div>
      </div>
      <StepFooter
        back={{ href: "/" }}
        status={approved ? "Mapping approved" : ai.origin === "llm" ? "AI suggestions" : undefined}
        next={{
          label: approved ? "Continue to validation" : "Approve mapping",
          onClick: () => void approve(),
          loading: review.status === "submitting",
          disabledReason: ai.status === "ready" ? null : "Wait for the suggestions to finish.",
        }}
      />
    </>
  );
}
