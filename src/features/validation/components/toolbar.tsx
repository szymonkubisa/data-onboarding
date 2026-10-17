"use client";

import { Copy, Search, WandSparkles, X } from "lucide-react";
import type { IssueCode } from "@/domain/quality/types";
import type { FieldDefinition } from "@/domain/schema/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_FILTERS, ISSUE_LABELS, type RecordFilters } from "../filter";

export function ValidationToolbar({
  filters,
  onChange,
  fields,
  codes,
  pendingFixes,
  onApplyFixes,
  duplicateGroups,
  onShowDuplicates,
}: {
  filters: RecordFilters;
  onChange: (patch: Partial<RecordFilters>) => void;
  fields: readonly FieldDefinition[];
  codes: IssueCode[];
  pendingFixes: number;
  onApplyFixes: () => void;
  duplicateGroups: number;
  onShowDuplicates: () => void;
}) {
  const filtered =
    filters.query !== "" ||
    filters.field !== "any" ||
    filters.code !== "any" ||
    filters.status !== "all";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Search values or row"
          aria-label="Search rows"
          className="bg-card pl-8"
        />
      </div>
      <Select value={filters.field} onValueChange={(field) => onChange({ field })}>
        <SelectTrigger className="min-w-36 bg-card" aria-label="Filter by field with issues">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any field</SelectItem>
          {fields.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              Issues in {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.code}
        onValueChange={(code) => onChange({ code: code as RecordFilters["code"] })}
      >
        <SelectTrigger className="min-w-40 bg-card" aria-label="Filter by issue type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any issue type</SelectItem>
          {codes.map((code) => (
            <SelectItem key={code} value={code}>
              {ISSUE_LABELS[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filtered && (
        <Button variant="ghost" onClick={() => onChange(DEFAULT_FILTERS)}>
          <X data-icon="inline-start" />
          Clear
        </Button>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="outline" onClick={onShowDuplicates} disabled={duplicateGroups === 0}>
          <Copy data-icon="inline-start" />
          Duplicates ({duplicateGroups})
        </Button>
        <Button
          variant="outline"
          onClick={onApplyFixes}
          disabled={pendingFixes === 0}
          className="border-primary/40"
        >
          <WandSparkles data-icon="inline-start" className="text-primary" />
          Apply {pendingFixes} suggested fix{pendingFixes === 1 ? "" : "es"}
        </Button>
      </div>
    </div>
  );
}
