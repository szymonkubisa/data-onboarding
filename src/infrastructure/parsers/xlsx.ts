import readXlsxFile from "read-excel-file/universal";
import type { DatasetError } from "@/domain/dataset/types";

export interface WorkbookSheet {
  name: string;
  matrix: unknown[][];
  /** Non-empty rows, header included. For the sheet picker. */
  nonEmptyRows: number;
}

export type WorkbookOutcome =
  { ok: true; sheets: WorkbookSheet[] } | { ok: false; error: DatasetError };

const isBlankRow = (row: readonly unknown[]) =>
  row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");

/**
 * Read every sheet of an .xlsx workbook. The `universal` build runs on the main thread
 * (no Web Worker), which keeps bundling simple and works in Node tests too. Numbers are
 * kept as the string Excel stored; dates come back as Date objects.
 */
export async function readWorkbook(input: Blob | ArrayBuffer): Promise<WorkbookOutcome> {
  try {
    const sheets = await readXlsxFile<string>(input, {
      trim: false,
      parseNumber: (value) => value,
    });
    if (sheets.length === 0) {
      return { ok: false, error: { code: "no-sheets", message: "The workbook has no sheets." } };
    }
    return {
      ok: true,
      sheets: sheets.map((sheet) => ({
        name: sheet.sheet,
        matrix: sheet.data as unknown[][],
        nonEmptyRows: sheet.data.filter((row) => !isBlankRow(row)).length,
      })),
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "parse-failed",
        message: "This .xlsx file could not be read. It may be corrupted or password-protected.",
      },
    };
  }
}
