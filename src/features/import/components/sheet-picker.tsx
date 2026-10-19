"use client";

import { ChevronRight, Sheet } from "lucide-react";
import type { SheetChoice } from "@/infrastructure/parsers/parse-file";
import { Button } from "@/components/ui/button";

export function SheetPicker({
  fileName,
  sheets,
  onPick,
  onCancel,
}: {
  fileName: string;
  sheets: SheetChoice[];
  onPick: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <section
      aria-labelledby="sheet-picker-title"
      className="rounded-card border bg-card p-5 sm:p-6"
    >
      <h2 id="sheet-picker-title" className="text-base font-medium">
        Which sheet holds the suppliers?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-mono text-foreground">{fileName}</span> has {sheets.length} sheets
        with data.
      </p>
      <ul className="mt-4 divide-y rounded-lg border">
        {sheets.map((sheet) => (
          <li key={sheet.name}>
            <button
              type="button"
              onClick={() => onPick(sheet.name)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted"
            >
              <Sheet className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-medium">{sheet.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {sheet.nonEmptyRows.toLocaleString("en-US")} row
                {sheet.nonEmptyRows === 1 ? "" : "s"}
              </span>
              <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="mt-3" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
