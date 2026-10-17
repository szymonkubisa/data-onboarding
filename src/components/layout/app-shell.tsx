"use client";

import { Cpu, FlaskConical, TableProperties } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useWorkflow } from "@/application/workflow/react";
import type { AiInfo } from "@/contracts/ai-info";
import { getSchema } from "@/domain/schema/registry";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HelpSheet } from "./help-sheet";
import { StepGuard } from "./step-guard";
import { Stepper } from "./stepper";

function Logo() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2 rounded-md"
      aria-label="Data Onboarding, home"
    >
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <TableProperties className="size-4" aria-hidden />
      </span>
      <span className="hidden text-sm font-semibold tracking-tight sm:inline">Data Onboarding</span>
    </Link>
  );
}

function DatasetChip() {
  const dataset = useWorkflow((s) => s.dataset);
  const schemaId = useWorkflow((s) => s.schemaId);
  if (!dataset) return null;
  return (
    <div
      className="hidden min-w-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground md:flex"
      aria-label="Current file"
    >
      <span className="truncate font-mono text-foreground">{dataset.fileName}</span>
      <span aria-hidden>·</span>
      <span className="shrink-0 tabular-nums">
        {dataset.rows.length.toLocaleString("en-US")} rows
      </span>
      <span aria-hidden>·</span>
      <span className="shrink-0">{getSchema(schemaId).label}</span>
    </div>
  );
}

export function AiModeBadge({ ai }: { ai: AiInfo }) {
  const live = ai.mode === "live";
  const model = ai.model?.split("/").pop() ?? null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
            live
              ? "border-primary/25 bg-primary-soft text-primary-soft-foreground"
              : "bg-card text-muted-foreground",
          )}
        >
          {live ? (
            <Cpu className="size-3.5" aria-hidden />
          ) : (
            <FlaskConical className="size-3.5" aria-hidden />
          )}
          {live ? (
            <>
              Live AI<span className="hidden font-normal sm:inline"> · {model}</span>
            </>
          ) : (
            "Demo mode"
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 text-pretty">
        {live
          ? `Column names and statistics are sent to ${ai.model} via OpenRouter. Row values are not, unless you opt in to samples.`
          : "No API key configured. Mapping suggestions come from deterministic heuristics; nothing is sent to an LLM."}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ ai, children }: { ai: AiInfo; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <DatasetChip />
          <div className="ml-auto flex items-center gap-1.5">
            <AiModeBadge ai={ai} />
            <HelpSheet ai={ai} />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Stepper />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-32 sm:px-6">
        <StepGuard>{children}</StepGuard>
      </main>
    </div>
  );
}
