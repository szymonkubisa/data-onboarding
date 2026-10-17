"use client";

import { Ban, Copy } from "lucide-react";
import { toast } from "sonner";
import { useWorkflowActions } from "@/application/workflow/react";
import type { ProcessedRecord, QualityReport } from "@/domain/quality/types";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const SHOWN_FIELDS = ["companyName", "taxId", "email", "country"] as const;

/** Groups of possible duplicates. Nothing is merged; the person excludes what is redundant. */
export function DuplicatesSheet({
  report,
  open,
  onOpenChange,
}: {
  report: QualityReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setExcluded } = useWorkflowActions();
  const byId = new Map(report.records.map((r) => [r.rowId, r]));

  const exclude = (record: ProcessedRecord) => {
    setExcluded([record.rowId], true);
    toast(`Row ${record.sourceRowNumber} excluded from the export`, {
      action: { label: "Undo", onClick: () => setExcluded([record.rowId], false) },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Possible duplicates</SheetTitle>
          <SheetDescription>
            Rows that share a tax ID, an email, or a company name and country. Nothing is merged
            automatically: exclude the rows you do not want to export.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {report.duplicateGroups.length === 0 ? (
            <EmptyState
              icon={Copy}
              title="No duplicates left"
              description="Excluded rows are not compared."
            />
          ) : (
            report.duplicateGroups.map((group) => (
              <section
                key={group.id}
                className="rounded-card border"
                aria-label={`Duplicate group ${group.rowIds.join(", ")}`}
              >
                <p className="border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {group.reasons.join(" · ")}
                </p>
                <ul className="divide-y">
                  {group.rowIds.map((rowId) => {
                    const record = byId.get(rowId);
                    if (!record) return null;
                    return (
                      <li key={rowId} className="flex items-start gap-3 px-3 py-2.5">
                        <span className="w-10 pt-0.5 text-xs text-muted-foreground tabular-nums">
                          Row {record.sourceRowNumber}
                        </span>
                        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                          {SHOWN_FIELDS.map((key) => (
                            <div key={key} className="min-w-0">
                              <dt className="sr-only">{key}</dt>
                              <dd className="truncate font-mono">{record.values[key] || "—"}</dd>
                            </div>
                          ))}
                        </dl>
                        <Button size="sm" variant="outline" onClick={() => exclude(record)}>
                          <Ban data-icon="inline-start" />
                          Exclude
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
