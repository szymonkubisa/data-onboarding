"use client";

import { confidenceBucket } from "@/domain/mapping/rules";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LABEL = { high: "High", medium: "Medium", low: "Low" } as const;
const FILLED = { high: 3, medium: 2, low: 1 } as const;
const COLOR = { high: "bg-primary", medium: "bg-warning", low: "bg-destructive/70" } as const;

/**
 * Confidence in three buckets. The tooltip says what it is: the model's own estimate,
 * not a calibrated probability.
 */
export function ConfidenceIndicator({ value, className }: { value: number; className?: string }) {
  const bucket = confidenceBucket(value);
  const percent = Math.round(value * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex items-center gap-2 rounded-sm text-xs whitespace-nowrap",
            className,
          )}
          aria-label={`${LABEL[bucket]} confidence, ${percent}%. Model estimate, not a calibrated probability.`}
        >
          <span className="flex items-end gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn("w-1 rounded-full", i < FILLED[bucket] ? COLOR[bucket] : "bg-border")}
                style={{ height: 6 + i * 3 }}
              />
            ))}
          </span>
          <span className="font-medium">{LABEL[bucket]}</span>
          <span className="text-muted-foreground tabular-nums">{percent}%</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>Model estimate, not a calibrated probability.</TooltipContent>
    </Tooltip>
  );
}
