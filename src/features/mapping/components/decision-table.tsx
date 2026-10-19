"use client";

import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useWorkflow, useWorkflowActions } from "@/application/workflow/react";
import {
  selectDecisionList,
  selectMappingSummary,
  selectSchema,
} from "@/application/workflow/selectors";
import { previewValues } from "@/domain/dataset/profile";
import type { SourceColumn, SourceDataset } from "@/domain/dataset/types";
import type { MappingDecision, MappingSuggestion } from "@/domain/mapping/types";
import { previewField } from "@/domain/quality/pipeline";
import type { FieldDefinition, TargetSchema } from "@/domain/schema/types";
import { ConfidenceIndicator } from "@/components/shared/confidence-indicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const NONE = "__none__";

const STATUS = {
  pending: { label: "Suggested", className: "border-border text-muted-foreground" },
  accepted: {
    label: "Accepted",
    className: "border-transparent bg-primary-soft text-primary-soft-foreground",
  },
  modified: { label: "Changed", className: "border-primary/40 text-primary" },
  ignored: { label: "Ignored", className: "border-transparent bg-muted text-muted-foreground" },
} as const;

function TargetSelect({
  column,
  decision,
  schema,
  usedBy,
}: {
  column: SourceColumn;
  decision: MappingDecision;
  schema: TargetSchema;
  usedBy: Record<string, string[]>;
}) {
  const { setDecisionTarget } = useWorkflowActions();
  const value =
    decision.status === "ignored" || decision.targetField === null ? NONE : decision.targetField;
  return (
    <Select
      value={value}
      onValueChange={(next) => setDecisionTarget(column.id, next === NONE ? null : next)}
    >
      <SelectTrigger
        className="w-full min-w-44 bg-background"
        aria-label={`Target field for ${column.name}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">Don’t import</span>
        </SelectItem>
        <SelectSeparator />
        {schema.fields.map((field) => {
          const others = (usedBy[field.key] ?? []).filter((name) => name !== column.name);
          return (
            <SelectItem
              key={field.key}
              value={field.key}
              hint={
                <>
                  {field.required && (
                    <span className="text-xs text-destructive" aria-label="required">
                      *
                    </span>
                  )}
                  {others.length > 0 && (
                    <span className="ml-1 truncate text-xs text-muted-foreground">
                      used by {others[0]}
                    </span>
                  )}
                </>
              }
            >
              {field.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ValuePreview({
  dataset,
  column,
  field,
}: {
  dataset: SourceDataset;
  column: SourceColumn;
  field: FieldDefinition | null;
}) {
  const values = previewValues(dataset, column.id, 5);
  if (values.length === 0)
    return <p className="text-sm text-muted-foreground">This column is empty.</p>;
  return (
    <table className="w-full text-xs">
      <caption className="sr-only">
        First values of {column.name}
        {field ? ` and what they become as ${field.label}` : ""}
      </caption>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th scope="col" className="py-1 pr-3 font-medium">
            In the file
          </th>
          {field && (
            <th scope="col" className="py-1 font-medium">
              As {field.label}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {values.map((raw, i) => {
          const preview = field ? previewField(field, raw) : null;
          return (
            <tr key={i} className="border-t border-border/60">
              <td className="max-w-48 truncate py-1 pr-3 font-mono" title={raw}>
                {raw}
              </td>
              {preview && (
                <td className="py-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("truncate font-mono", preview.changed && "text-primary")}>
                      {preview.to === "" ? (
                        <span className="text-muted-foreground">(empty)</span>
                      ) : (
                        preview.to
                      )}
                    </span>
                    {preview.issue && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          preview.issue.severity === "error" ? "text-destructive" : "text-warning",
                        )}
                        title={preview.issue.message}
                      >
                        {preview.issue.severity === "error" ? (
                          <CircleAlert className="size-3.5" aria-hidden />
                        ) : (
                          <TriangleAlert className="size-3.5" aria-hidden />
                        )}
                        <span className="sr-only">{preview.issue.message}</span>
                      </span>
                    )}
                  </span>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DecisionRow({
  dataset,
  column,
  decision,
  suggestion,
  schema,
  usedBy,
  flagged,
}: {
  dataset: SourceDataset;
  column: SourceColumn;
  decision: MappingDecision;
  suggestion: MappingSuggestion | undefined;
  schema: TargetSchema;
  usedBy: Record<string, string[]>;
  flagged: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { acceptSuggestion, ignoreColumn, setDecisionTarget } = useWorkflowActions();
  const detailsId = `details-${column.id}`;
  const target = decision.status === "ignored" ? null : decision.targetField;
  const field = target ? (schema.fields.find((f) => f.key === target) ?? null) : null;
  const followsSuggestion = suggestion !== undefined && target === suggestion.targetField;
  const samples = previewValues(dataset, column.id, 2);
  const status =
    decision.status === "pending" && target === null
      ? { label: "Unmapped", className: "border-border text-muted-foreground" }
      : STATUS[decision.status];

  return (
    <Fragment>
      <tr
        className={cn(
          "border-b align-middle transition-colors",
          open && "bg-muted/30",
          flagged && "shadow-[inset_3px_0_0_var(--warning)]",
        )}
      >
        <th scope="row" className="py-3 pr-2 pl-4 text-left font-normal">
          <span className="block font-mono text-sm font-medium">{column.name}</span>
          <span className="block max-w-56 truncate font-mono text-xs text-muted-foreground">
            {samples.length > 0 ? samples.join(" · ") : "empty"}
          </span>
        </th>
        <td className="px-1 text-muted-foreground" aria-hidden>
          <ArrowRight className="size-4" />
        </td>
        <td className="px-2 py-3">
          <TargetSelect column={column} decision={decision} schema={schema} usedBy={usedBy} />
        </td>
        <td className="px-2 py-3">
          {suggestion && suggestion.targetField !== null && followsSuggestion ? (
            <ConfidenceIndicator value={suggestion.confidence} />
          ) : decision.status === "modified" ? (
            <span className="text-xs text-muted-foreground">Your choice</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-2 py-3">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={status.className}>
              {decision.status === "accepted" && <Check data-icon="inline-start" />}
              {status.label}
            </Badge>
            {decision.status === "pending" && target !== null && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => acceptSuggestion(column.id)}
                aria-label={`Accept ${field?.label ?? "suggestion"} for ${column.name}`}
              >
                <Check />
              </Button>
            )}
            {decision.status !== "ignored" && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => ignoreColumn(column.id)}
                aria-label={`Ignore ${column.name}`}
              >
                <Ban />
              </Button>
            )}
            {(decision.status === "modified" || decision.status === "ignored") && suggestion && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setDecisionTarget(column.id, suggestion.targetField)}
                aria-label={`Reset ${column.name} to the suggestion`}
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        </td>
        <td className="py-3 pr-3 pl-1 text-right">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={`${open ? "Hide" : "Show"} details for ${column.name}`}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </td>
      </tr>
      {open && (
        <tr id={detailsId} className="border-b bg-muted/30">
          <td colSpan={6} className="px-4 pt-1 pb-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {suggestion?.origin === "llm"
                    ? "Why the AI suggested this"
                    : "Why this was suggested"}
                </p>
                <p className="text-sm text-pretty">
                  {suggestion?.reasoning || "No reasoning available."}
                </p>
              </div>
              <ValuePreview dataset={dataset} column={column} field={field} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function DecisionTable({ flaggedColumns }: { flaggedColumns: ReadonlySet<string> }) {
  const dataset = useWorkflow((s) => s.dataset);
  const ai = useWorkflow((s) => s.ai);
  const decisions = useWorkflow(selectDecisionList);
  const schema = useWorkflow(selectSchema);
  const summary = useWorkflow(selectMappingSummary);

  const suggestionByColumn = useMemo(
    () => new Map(ai.suggestions.map((s) => [s.sourceColumnId, s])),
    [ai.suggestions],
  );
  const usedBy = useMemo(() => {
    if (!dataset) return {};
    const nameOf = new Map(dataset.columns.map((c) => [c.id, c.name]));
    return Object.fromEntries(
      Object.entries(summary.columnsByField).map(([field, ids]) => [
        field,
        ids.map((id) => nameOf.get(id) ?? id),
      ]),
    );
  }, [dataset, summary.columnsByField]);

  if (!dataset) return null;
  const decisionByColumn = new Map(decisions.map((d) => [d.sourceColumnId, d]));

  return (
    <div className="overflow-hidden rounded-card border bg-card">
      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Column mapping decisions"
      >
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">Mapping of source columns to target fields</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="h-9 pl-4 text-left font-medium">
                Source column
              </th>
              <th scope="col" className="w-6">
                <span className="sr-only">maps to</span>
              </th>
              <th scope="col" className="px-2 text-left font-medium">
                Target field
              </th>
              <th scope="col" className="px-2 text-left font-medium">
                Confidence
              </th>
              <th scope="col" className="px-2 text-left font-medium">
                Decision
              </th>
              <th scope="col" className="w-12">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {dataset.columns.map((column) => {
              const decision = decisionByColumn.get(column.id);
              if (!decision) {
                return (
                  <tr key={column.id} className="border-b">
                    <th scope="row" className="py-3 pl-4 text-left font-mono text-sm font-normal">
                      {column.name}
                    </th>
                    <td colSpan={5} className="px-2 py-3">
                      <Skeleton className="h-8 w-full max-w-md" />
                    </td>
                  </tr>
                );
              }
              return (
                <DecisionRow
                  key={column.id}
                  dataset={dataset}
                  column={column}
                  decision={decision}
                  suggestion={suggestionByColumn.get(column.id)}
                  schema={schema}
                  usedBy={usedBy}
                  flagged={flaggedColumns.has(column.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
