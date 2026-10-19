"use client";

import { CircleHelp } from "lucide-react";
import type { AiInfo } from "@/contracts/ai-info";
import { formatBytes, LIMITS } from "@/domain/dataset/limits";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const STEPS = [
  {
    title: "Import",
    body: "Your file is parsed in this browser tab. It is never uploaded.",
  },
  {
    title: "Map",
    body: "An AI model suggests which column feeds which field, with a confidence estimate and a reason. You accept, change or ignore each one. The server re-checks the result before you continue.",
  },
  {
    title: "Validate",
    body: "Deterministic rules clean and check every value. Safe changes (whitespace, country spelling) are applied and shown. Changes that alter meaning are only suggested. You can edit cells and exclude rows.",
  },
  {
    title: "Export",
    body: "Download a CSV in the schema's column order and a JSON report of every mapping decision, change, open issue and excluded row.",
  },
];

export function HelpSheet({ ai }: { ai: AiInfo }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="How it works">
          <CircleHelp />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>How it works</SheetTitle>
          <SheetDescription>
            AI suggests. You approve. Deterministic code does the rest.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6 text-sm">
          <ol className="space-y-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="space-y-1.5">
            <h3 className="font-medium">What the AI sees</h3>
            <p className="text-muted-foreground">
              Column names and statistics such as “82% of values look like email addresses”. No row
              values. If you turn on sample sharing, up to {LIMITS.sampleValuesPerColumn} example
              values per column (each cut to {LIMITS.sampleValueMaxLength} characters) are sent too.
            </p>
            <p className="text-muted-foreground">
              {ai.mode === "live"
                ? `This deployment uses ${ai.model} through OpenRouter.`
                : "This deployment has no API key, so it runs in demo mode: suggestions come from heuristics and nothing is sent to an LLM."}
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-medium">Confidence</h3>
            <p className="text-muted-foreground">
              High (≥ 80%), Medium (≥ 50%) and Low. It is the model’s own estimate, not a calibrated
              probability, so treat it as a hint about where to look first.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-medium">Limits</h3>
            <p className="text-muted-foreground">
              CSV or XLSX, up to {formatBytes(LIMITS.maxFileBytes)},{" "}
              {LIMITS.maxRows.toLocaleString("en-US")} rows and {LIMITS.maxColumns} columns. Nothing
              is saved: reloading the page starts over.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
