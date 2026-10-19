/**
 * Hard limits. One place, used by parsers, profiling, the API request schemas
 * and the UI copy. Changing a number here changes it everywhere.
 */
export const LIMITS = {
  /** Largest file accepted by the import step. */
  maxFileBytes: 10 * 1024 * 1024,
  /** Data rows kept after the header. Extra rows are dropped with a warning. */
  maxRows: 20_000,
  /** Columns kept. Extra columns are dropped with a warning. */
  maxColumns: 150,
  /** Header names are cut to this length. */
  maxHeaderLength: 200,
  /** Sample values per column sent to the AI, only with explicit consent. */
  sampleValuesPerColumn: 3,
  /** Each sample value is cut to this length. */
  sampleValueMaxLength: 60,
  /** Rows scanned when profiling columns. Enough for stable ratios, cheap on large files. */
  profileRowSample: 5_000,
} as const;

export const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt", ".xlsx"] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
