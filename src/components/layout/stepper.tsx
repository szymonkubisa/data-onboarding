"use client";

import { Check, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkflow } from "@/application/workflow/react";
import { canEnter, stepForPath, stepIndex, STEPS } from "@/application/workflow/steps";
import { cn } from "@/lib/utils";

type StepStatus = "done" | "current" | "reachable" | "locked";

export function Stepper() {
  const pathname = usePathname();
  const dataset = useWorkflow((s) => s.dataset);
  const approvedMapping = useWorkflow((s) => s.approvedMapping);
  const current = stepIndex(stepForPath(pathname).id);

  return (
    <nav aria-label="Progress" className="-mx-1 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 py-2">
        {STEPS.map((step, index) => {
          const reachable = canEnter({ dataset, approvedMapping }, step.id);
          const status: StepStatus =
            index === current
              ? "current"
              : !reachable
                ? "locked"
                : index < current
                  ? "done"
                  : "reachable";

          const content = (
            <>
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors",
                  status === "current" && "bg-primary text-primary-foreground",
                  status === "done" && "bg-primary-soft text-primary-soft-foreground",
                  status === "reachable" && "border border-primary/40 text-primary",
                  status === "locked" && "border text-muted-foreground",
                )}
                aria-hidden
              >
                {status === "done" ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  status === "current"
                    ? "font-medium text-foreground"
                    : "sr-only text-muted-foreground sm:not-sr-only",
                )}
              >
                {step.label}
              </span>
              {status === "locked" && (
                <Lock className="size-3 text-muted-foreground/70" aria-hidden />
              )}
              <span className="sr-only">
                {status === "done" ? " (completed)" : status === "locked" ? " (locked)" : ""}
              </span>
            </>
          );

          return (
            <li key={step.id} className="flex items-center gap-1">
              {index > 0 && (
                <span
                  className={cn(
                    "h-px w-6 sm:w-10",
                    index <= current ? "bg-primary/40" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              {status === "current" ? (
                <span aria-current="step" className="flex items-center gap-2 rounded-md px-2 py-1">
                  {content}
                </span>
              ) : status === "locked" ? (
                <span
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1"
                >
                  {content}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
