import Papa from "papaparse";
import type { ExportOptions, ExportPlan } from "@/domain/export/build-export";
import { FORMULA_TRIGGER } from "@/domain/export/formula";

/**
 * Serialize an export plan as RFC 4180 CSV. Cells that a spreadsheet would evaluate as a
 * formula are prefixed with a quote (see domain/export/formula.ts for the exact rule).
 */
export function serializeCsv(
  plan: ExportPlan,
  options: Pick<ExportOptions, "delimiter" | "includeBom">,
): string {
  const csv = Papa.unparse(
    { fields: plan.columns, data: plan.rows },
    {
      delimiter: options.delimiter,
      newline: "\r\n",
      quotes: false,
      escapeFormulae: FORMULA_TRIGGER,
    },
  );
  return `${options.includeBom ? "﻿" : ""}${csv.replace(/(\r\n)+$/, "")}\r\n`;
}
