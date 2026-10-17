"use client";

import {
  CircleAlert,
  CornerDownLeft,
  Pencil,
  Undo2,
  WandSparkles,
  TriangleAlert,
} from "lucide-react";
import { useId, useState } from "react";
import { useWorkflowActions } from "@/application/workflow/react";
import type { AppliedTransform, ProcessedRecord, QualityIssue } from "@/domain/quality/types";
import type { FieldDefinition } from "@/domain/schema/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const CHANGE_LABEL: Record<AppliedTransform["code"], string> = {
  whitespace: "Trimmed whitespace",
  "null-token": "Placeholder treated as empty",
  "email-normalize": "Lowercased email domain",
  "country-canonical": "Recognised country",
  "url-add-scheme": "Added https://",
  "tax-id-compact": "Removed spaces and punctuation",
  "manual-edit": "Edited by you",
};

export function show(value: string) {
  return value === "" ? <span className="text-muted-foreground italic">empty</span> : value;
}

function IssueLine({ issue, onAccept }: { issue: QualityIssue; onAccept: () => void }) {
  const Icon = issue.severity === "error" ? CircleAlert : TriangleAlert;
  return (
    <li className="space-y-1.5">
      <p className="flex items-start gap-2 text-sm">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            issue.severity === "error" ? "text-destructive" : "text-warning",
          )}
          aria-hidden
        />
        <span>
          <span className="sr-only">{issue.severity === "error" ? "Error: " : "Warning: "}</span>
          {issue.message}
        </span>
      </p>
      {issue.fix?.kind === "suggested" && (
        <Button size="sm" variant="outline" className="ml-6" onClick={onAccept}>
          <WandSparkles data-icon="inline-start" />
          Apply: <span className="max-w-48 truncate font-mono">{issue.fix.to}</span>
        </Button>
      )}
    </li>
  );
}

/**
 * Popover content for one cell: what is wrong, what was changed automatically, a one-click
 * fix when there is one, and a manual edit (Enter saves, Escape cancels). The original value
 * is always visible and always restorable.
 */
export function CellEditor({
  record,
  field,
  onDone,
}: {
  record: ProcessedRecord;
  field: FieldDefinition;
  onDone: () => void;
}) {
  const { setCorrection, revertCorrection, acceptFixes } = useWorkflowActions();
  const value = record.values[field.key] ?? "";
  const original = record.original[field.key] ?? "";
  const issues = record.issues.filter((i) => i.field === field.key);
  const changes = record.applied.filter((t) => t.field === field.key);
  const corrected = changes.some((c) => c.kind === "manual");
  const [draft, setDraft] = useState(value);
  const inputId = useId();

  const save = () => {
    if (draft !== value) setCorrection(record.rowId, field.key, draft);
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{field.label}</p>
        <p className="text-xs text-muted-foreground">
          Row {record.sourceRowNumber} · <span className="font-mono">{record.rowId}</span>
        </p>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-2" aria-label="Issues">
          {issues.map((issue) => (
            <IssueLine
              key={issue.id}
              issue={issue}
              onAccept={() => {
                acceptFixes([issue.id]);
                onDone();
              }}
            />
          ))}
        </ul>
      )}

      {changes.length > 0 && (
        <div className="space-y-1 rounded-md bg-muted/60 p-2 text-xs">
          <p className="font-medium text-muted-foreground">Changes applied</p>
          <ul className="space-y-1">
            {changes.map((change, i) => (
              <li key={i}>
                {CHANGE_LABEL[change.code]}:{" "}
                <span className="font-mono">“{show(change.from)}”</span> →{" "}
                <span className="font-mono">“{show(change.to)}”</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Original: <span className="font-mono text-foreground">“{show(original)}”</span>
          </p>
        </div>
      )}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label
          htmlFor={inputId}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <Pencil className="size-3" aria-hidden />
          Edit value
        </label>
        <Input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>{" "}
            save · <Kbd>Esc</Kbd> cancel
          </p>
          <div className="flex gap-1.5">
            {corrected && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  revertCorrection(record.rowId, field.key);
                  onDone();
                }}
              >
                <Undo2 data-icon="inline-start" />
                Revert to original
              </Button>
            )}
            <Button type="submit" size="sm">
              Save
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
