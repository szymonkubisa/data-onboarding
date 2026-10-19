"use client";

import {
  Ban,
  CircleAlert,
  CircleCheck,
  Copy,
  Rows3,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusCounts, StatusFilter } from "../filter";

const ITEMS: { key: StatusFilter; label: string; icon: LucideIcon; tone: string }[] = [
  { key: "all", label: "All rows", icon: Rows3, tone: "text-foreground" },
  { key: "valid", label: "Valid", icon: CircleCheck, tone: "text-success" },
  { key: "warning", label: "Warnings", icon: TriangleAlert, tone: "text-warning" },
  { key: "error", label: "Errors", icon: CircleAlert, tone: "text-destructive" },
  { key: "duplicates", label: "Duplicates", icon: Copy, tone: "text-warning" },
  { key: "excluded", label: "Excluded", icon: Ban, tone: "text-muted-foreground" },
];

/** Summary numbers that double as status filters. */
export function KpiStrip({
  counts,
  active,
  onSelect,
}: {
  counts: StatusCounts;
  active: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter rows by status"
      className="grid grid-cols-3 gap-2 sm:grid-cols-6"
    >
      {ITEMS.map(({ key, label, icon: Icon, tone }) => {
        const selected = active === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected && key !== "all" ? "all" : key)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-card border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
              selected &&
                "border-primary/50 bg-primary-soft/60 ring-1 ring-primary/30 hover:bg-primary-soft/60",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={cn("size-3.5", tone)} aria-hidden />
              {label}
            </span>
            <span className="text-xl font-semibold tabular-nums">
              {counts[key].toLocaleString("en-US")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
