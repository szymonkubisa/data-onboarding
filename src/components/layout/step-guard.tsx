"use client";

import { LoaderCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useWorkflow } from "@/application/workflow/react";
import { stepBlocker, stepForPath } from "@/application/workflow/steps";

/**
 * Steps depend on earlier ones. Opening /validate directly (or after a reload, since
 * nothing is persisted) sends the person back to the furthest step they can use.
 */
export function StepGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dataset = useWorkflow((s) => s.dataset);
  const approvedMapping = useWorkflow((s) => s.approvedMapping);
  const step = stepForPath(pathname);
  const blocker = stepBlocker({ dataset, approvedMapping }, step.id);
  const fallback = dataset ? "/map" : "/";

  useEffect(() => {
    if (blocker) router.replace(fallback);
  }, [blocker, fallback, router]);

  if (blocker) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        {blocker} Redirecting…
      </div>
    );
  }
  return children;
}
