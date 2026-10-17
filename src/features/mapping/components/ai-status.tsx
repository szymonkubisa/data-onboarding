"use client";

import {
  CircleAlert,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useId } from "react";
import { useWorkflow, useWorkflowActions } from "@/application/workflow/react";
import { LIMITS } from "@/domain/dataset/limits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function OriginLine() {
  const ai = useWorkflow((s) => s.ai);
  const columns = useWorkflow((s) => s.dataset?.columns.length ?? 0);

  if (ai.status === "loading" || ai.status === "idle") {
    return (
      <p className="flex items-center gap-2 text-sm" role="status">
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
        Analysing {columns} columns and drafting suggestions…
      </p>
    );
  }
  if (ai.status === "error") return null;

  const model = ai.model?.split("/").pop();
  const lines = {
    "demo-mode": {
      icon: FlaskConical,
      tone: "text-foreground",
      text: "Demo mode: heuristic suggestions, no LLM involved.",
    },
    "provider-error": {
      icon: TriangleAlert,
      tone: "text-warning",
      text: "The AI provider did not answer, so these suggestions come from heuristics.",
    },
    "invalid-output": {
      icon: TriangleAlert,
      tone: "text-warning",
      text: "The AI’s answer failed validation twice, so these suggestions come from heuristics.",
    },
  } as const;
  const line = ai.fallbackReason ? lines[ai.fallbackReason] : null;
  const Icon = line?.icon ?? Sparkles;
  return (
    <p className="flex items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", line?.tone ?? "text-primary")} aria-hidden />
      <span>
        {line
          ? line.text
          : `Suggested by ${model}. Review each row; nothing is applied until you approve.`}
      </span>
    </p>
  );
}

/** Top card: where the suggestions came from, and the sample-sharing consent. */
export function AiStatusCard({ onRetry }: { onRetry: () => void }) {
  const ai = useWorkflow((s) => s.ai);
  const consent = useWorkflow((s) => s.sampleConsent);
  const { setSampleConsent } = useWorkflowActions();
  const switchId = useId();
  const busy = ai.status === "loading" || ai.status === "idle";

  return (
    <section
      aria-label="Suggestion source"
      className="flex flex-col gap-4 rounded-card border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="min-w-0 space-y-1">
        {ai.status === "error" ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CircleAlert className="size-4 text-destructive" aria-hidden />
            <span>{ai.error}</span>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw data-icon="inline-start" />
              Retry
            </Button>
          </div>
        ) : (
          <OriginLine />
        )}
      </div>
      <div className="flex shrink-0 items-start gap-3 sm:max-w-sm">
        <Switch
          id={switchId}
          checked={consent}
          disabled={busy}
          onCheckedChange={(checked) => setSampleConsent(checked)}
          aria-describedby={`${switchId}-hint`}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <label htmlFor={switchId} className="text-sm font-medium">
            Share sample values with the AI
          </label>
          <p id={`${switchId}-hint`} className="text-xs text-muted-foreground">
            Up to {LIMITS.sampleValuesPerColumn} values per column, {LIMITS.sampleValueMaxLength}{" "}
            characters each. Changing this regenerates the suggestions.
          </p>
        </div>
      </div>
    </section>
  );
}
