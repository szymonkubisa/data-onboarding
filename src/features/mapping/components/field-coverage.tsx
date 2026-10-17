"use client";

import { Circle, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useWorkflow } from "@/application/workflow/react";
import { selectMappingSummary, selectSchema } from "@/application/workflow/selectors";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Right-hand panel: every target field, whether it is fed, and by which column. */
export function FieldCoverage() {
  const schema = useWorkflow(selectSchema);
  const summary = useWorkflow(selectMappingSummary);
  const dataset = useWorkflow((s) => s.dataset);
  const nameOf = new Map(dataset?.columns.map((c) => [c.id, c.name]) ?? []);

  return (
    <aside
      aria-labelledby="coverage-title"
      className="rounded-card border bg-card p-4 lg:sticky lg:top-32"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="coverage-title" className="text-sm font-medium">
          {schema.label} fields
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {summary.mappedFields}/{summary.totalFields} mapped
        </span>
      </div>
      <Progress
        value={(summary.mappedFields / summary.totalFields) * 100}
        className="mt-2 h-1.5"
        aria-label={`${summary.mappedFields} of ${summary.totalFields} fields mapped`}
      />
      <ul className="mt-4 space-y-1">
        {schema.fields.map((field) => {
          const columns = summary.columnsByField[field.key] ?? [];
          const state =
            columns.length > 1
              ? "conflict"
              : columns.length === 1
                ? "mapped"
                : field.required
                  ? "missing"
                  : "unmapped";
          const Icon = {
            conflict: TriangleAlert,
            mapped: CircleCheck,
            missing: CircleAlert,
            unmapped: Circle,
          }[state];
          return (
            <li key={field.key} className="flex items-start gap-2 rounded-md px-1.5 py-1.5 text-sm">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  state === "mapped" && "text-primary",
                  state === "missing" && "text-destructive",
                  state === "conflict" && "text-warning",
                  state === "unmapped" && "text-muted-foreground/50",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                  <span className={cn(state === "unmapped" && "text-muted-foreground")}>
                    {field.label}
                  </span>
                  {field.required && (
                    <span className="rounded-sm bg-muted px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      Required
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    "truncate text-xs",
                    state === "missing"
                      ? "text-destructive"
                      : state === "conflict"
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                >
                  {state === "missing" ? (
                    "Missing: map a column"
                  ) : state === "unmapped" ? (
                    "Not mapped"
                  ) : state === "conflict" ? (
                    `Conflict: ${columns.map((id) => nameOf.get(id)).join(", ")}`
                  ) : (
                    <span className="font-mono">← {nameOf.get(columns[0]!)}</span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
