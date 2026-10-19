import { buildDataset } from "@/domain/dataset/build";
import { formatBytes, LIMITS } from "@/domain/dataset/limits";
import type { DatasetError, DatasetResult, SourceDataset } from "@/domain/dataset/types";
import { parseCsvText } from "./csv";
import { readWorkbook, type WorkbookSheet } from "./xlsx";

export interface SheetChoice {
  name: string;
  nonEmptyRows: number;
}

export type ParseOutcome =
  | { kind: "dataset"; dataset: SourceDataset }
  | {
      kind: "choose-sheet";
      fileName: string;
      sheets: SheetChoice[];
      /** Build the dataset from one sheet. The workbook is parsed once and kept in this closure. */
      pick: (sheetName: string) => DatasetResult;
    }
  | { kind: "error"; error: DatasetError };

export type DetectedType = "csv" | "xlsx" | "xls" | "unknown";

export function detectFileType(fileName: string): DetectedType {
  const name = fileName.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(name)) return "csv";
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".xls")) return "xls";
  return "unknown";
}

/** Checks that need no parsing. Used by the dropzone before reading the file. */
export function precheckFile(file: { name: string; size: number }): DatasetError | null {
  const type = detectFileType(file.name);
  if (type === "xls") {
    return {
      code: "unsupported-type",
      message: "Legacy .xls files are not supported. Save the file as .xlsx or .csv and try again.",
    };
  }
  if (type === "unknown") {
    return { code: "unsupported-type", message: "Use a .csv or .xlsx file." };
  }
  if (file.size > LIMITS.maxFileBytes) {
    return {
      code: "file-too-large",
      message: `The file is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.maxFileBytes)}.`,
    };
  }
  if (file.size === 0) return { code: "empty-file", message: "The file is empty." };
  return null;
}

function fromSheet(
  id: string,
  fileName: string,
  sheet: WorkbookSheet,
  sheetCount: number,
): DatasetResult {
  return buildDataset({
    id,
    fileName,
    fileType: "xlsx",
    sheetName: sheet.name,
    matrix: sheet.matrix,
    extraWarnings:
      sheetCount > 1
        ? [
            {
              code: "multiple-sheets",
              message: `Imported sheet “${sheet.name}”. The workbook has ${sheetCount} sheets.`,
            },
          ]
        : [],
  });
}

/**
 * Parse a file in the browser. Nothing is uploaded. Returns a dataset, a sheet choice for
 * multi-sheet workbooks, or an error a person can act on.
 */
export async function parseFile(
  file: Blob & { name: string },
  id: string = crypto.randomUUID(),
): Promise<ParseOutcome> {
  const precheck = precheckFile(file);
  if (precheck) return { kind: "error", error: precheck };

  if (detectFileType(file.name) === "csv") {
    const parsed = parseCsvText(await file.text());
    if (!parsed.ok) return { kind: "error", error: parsed.error };
    const result = buildDataset({
      id,
      fileName: file.name,
      fileType: "csv",
      matrix: parsed.matrix,
      extraWarnings: parsed.warnings,
    });
    return result.ok
      ? { kind: "dataset", dataset: result.dataset }
      : { kind: "error", error: result.error };
  }

  const workbook = await readWorkbook(await file.arrayBuffer());
  if (!workbook.ok) return { kind: "error", error: workbook.error };

  const usable = workbook.sheets.filter((s) => s.nonEmptyRows > 0);
  if (usable.length === 0) {
    return {
      kind: "error",
      error: { code: "empty-file", message: "Every sheet in the workbook is empty." },
    };
  }
  if (usable.length === 1) {
    const result = fromSheet(id, file.name, usable[0]!, workbook.sheets.length);
    return result.ok
      ? { kind: "dataset", dataset: result.dataset }
      : { kind: "error", error: result.error };
  }
  return {
    kind: "choose-sheet",
    fileName: file.name,
    sheets: usable.map((s) => ({ name: s.name, nonEmptyRows: s.nonEmptyRows })),
    pick: (sheetName) => {
      const sheet = usable.find((s) => s.name === sheetName);
      if (!sheet)
        return {
          ok: false,
          error: { code: "no-sheets", message: `Sheet “${sheetName}” not found.` },
        };
      return fromSheet(id, file.name, sheet, workbook.sheets.length);
    },
  };
}
