import Papa from "papaparse";
import type { DatasetError, DatasetWarning } from "@/domain/dataset/types";

export type CsvParseOutcome =
  | { ok: true; matrix: string[][]; delimiter: string; warnings: DatasetWarning[] }
  | { ok: false; error: DatasetError };

/**
 * Parse CSV text into a matrix of strings. Delimiter is detected (comma, semicolon,
 * tab, pipe). Values are kept raw: no trimming, no type coercion.
 */
export function parseCsvText(text: string): CsvParseOutcome {
  const input = text.replace(/^﻿/, "");
  if (input.trim() === "") {
    return { ok: false, error: { code: "empty-file", message: "The file is empty." } };
  }

  // Guess the delimiter on a preview without blank lines: Papa's guess requires a consistent
  // field count, and a trailing or stray blank line breaks that for narrow files.
  const guessed = Papa.parse<string[]>(input, {
    delimiter: "",
    delimitersToGuess: [",", ";", "\t", "|"],
    skipEmptyLines: "greedy",
    preview: 100,
  }).meta.delimiter;

  // Full parse keeps blank lines so the importer can report how many it skipped.
  const result = Papa.parse<string[]>(input, {
    header: false,
    delimiter: guessed || ",",
    skipEmptyLines: false,
    dynamicTyping: false,
  });

  const unclosed = result.errors.find((e) => e.code === "MissingQuotes");
  if (unclosed) {
    const row = typeof unclosed.row === "number" ? ` near row ${unclosed.row + 1}` : "";
    return {
      ok: false,
      error: {
        code: "parse-failed",
        message: `The file has an unclosed quote${row}. Check that quoted values end with a quote.`,
      },
    };
  }

  const warnings: DatasetWarning[] = [];
  if (input.includes("�")) {
    warnings.push({
      code: "encoding-suspect",
      message:
        "Some characters could not be decoded. The file may not be UTF-8; re-save it as “CSV UTF-8” if names look wrong.",
    });
  }

  return { ok: true, matrix: result.data, delimiter: result.meta.delimiter, warnings };
}
