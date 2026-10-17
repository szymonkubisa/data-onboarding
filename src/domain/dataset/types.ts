export type ColumnId = string;
export type RowId = string;
export type FileType = "csv" | "xlsx";

export interface SourceColumn {
  /** Stable id, independent of the header text: "c-001". */
  id: ColumnId;
  /** Position in the source file, 0-based. */
  index: number;
  /** Display name after cleanup and de-duplication: "Email (2)", "Column 7". */
  name: string;
  /** Header exactly as it appeared in the file. */
  originalName: string;
}

export interface SourceRow {
  /** Stable id: "r-0001". Sequential over kept rows. */
  id: RowId;
  /** 1-based row number in the source sheet, so people can find the row in their file. */
  sourceRowNumber: number;
  /** Raw cell values as strings. Never mutated; corrections are overlays. */
  values: Readonly<Record<ColumnId, string>>;
}

export type DatasetWarningCode =
  | "header-renamed"
  | "header-generated"
  | "header-truncated"
  | "empty-rows-skipped"
  | "empty-columns-removed"
  | "rows-truncated"
  | "columns-truncated"
  | "extra-cells"
  | "multiple-sheets";

export interface DatasetWarning {
  code: DatasetWarningCode;
  message: string;
  count?: number;
}

export interface SourceDataset {
  id: string;
  fileName: string;
  fileType: FileType;
  sheetName?: string;
  columns: readonly SourceColumn[];
  rows: readonly SourceRow[];
  warnings: readonly DatasetWarning[];
}

export type DatasetErrorCode =
  | "empty-file"
  | "no-data-rows"
  | "file-too-large"
  | "unsupported-type"
  | "parse-failed"
  | "no-sheets";

export interface DatasetError {
  code: DatasetErrorCode;
  message: string;
}

export type DatasetResult =
  { ok: true; dataset: SourceDataset } | { ok: false; error: DatasetError };
