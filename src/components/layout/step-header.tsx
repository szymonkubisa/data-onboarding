"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The first step shown after page load should not steal focus from the browser.
let hasNavigated = false;

/**
 * Step title. After a step change, focus moves to the heading so screen reader and
 * keyboard users land at the start of the new content.
 */
export function StepHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (hasNavigated) ref.current?.focus({ preventScroll: false });
    hasNavigated = true;
  }, []);

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1
          ref={ref}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight outline-none sm:text-2xl"
        >
          {title}
        </h1>
        <div className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">
          {description}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
