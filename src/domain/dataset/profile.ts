import { resolveCountry } from "../quality/countries";
import { collapseWhitespace, round2, truncate } from "../shared/text";
import { LIMITS } from "./limits";
import type { ColumnId, SourceDataset } from "./types";

export interface ColumnPatternRatios {
  email: number;
  url: number;
  numeric: number;
  phoneLike: number;
  countryLike: number;
}

/**
 * What the AI sees about a column by default: its name and aggregate statistics.
 * No raw values. Ratios are over non-empty values, rounded to two decimals.
 */
export interface ColumnProfile {
  columnId: ColumnId;
  name: string;
  nonEmptyRatio: number;
  distinctRatio: number;
  avgLength: number;
  patterns: ColumnPatternRatios;
}

export const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  url: /^(https?:\/\/)?(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i,
  numeric: /^[-+]?\d+([.,]\d+)?$/,
  phoneChars: /^\+?[\d\s().\-/]+$/,
} as const;

export function looksLikeEmail(value: string): boolean {
  return PATTERNS.email.test(value);
}

export function looksLikeUrl(value: string): boolean {
  return !value.includes("@") && PATTERNS.url.test(value);
}

export function looksLikePhone(value: string): boolean {
  if (!PATTERNS.phoneChars.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15;
}

export function profileColumns(
  dataset: SourceDataset,
  sampleRows: number = LIMITS.profileRowSample,
): ColumnProfile[] {
  const rows = dataset.rows.slice(0, sampleRows);
  const total = rows.length;

  return dataset.columns.map((column) => {
    const counts = { email: 0, url: 0, numeric: 0, phoneLike: 0, countryLike: 0 };
    const distinct = new Set<string>();
    let nonEmpty = 0;
    let totalLength = 0;

    for (const row of rows) {
      const value = collapseWhitespace(row.values[column.id] ?? "");
      if (value === "") continue;
      nonEmpty += 1;
      totalLength += value.length;
      distinct.add(value.toLowerCase());
      if (looksLikeEmail(value)) counts.email += 1;
      if (looksLikeUrl(value)) counts.url += 1;
      if (PATTERNS.numeric.test(value)) counts.numeric += 1;
      if (looksLikePhone(value)) counts.phoneLike += 1;
      if (value.length <= 60 && resolveCountry(value).status === "match") counts.countryLike += 1;
    }

    const ratio = (n: number) => (nonEmpty === 0 ? 0 : round2(n / nonEmpty));
    return {
      columnId: column.id,
      name: column.name,
      nonEmptyRatio: total === 0 ? 0 : round2(nonEmpty / total),
      distinctRatio: ratio(distinct.size),
      avgLength: nonEmpty === 0 ? 0 : Math.round((totalLength / nonEmpty) * 10) / 10,
      patterns: {
        email: ratio(counts.email),
        url: ratio(counts.url),
        numeric: ratio(counts.numeric),
        phoneLike: ratio(counts.phoneLike),
        countryLike: ratio(counts.countryLike),
      },
    };
  });
}

/**
 * Up to `count` distinct, non-empty example values for a column, each cut to `maxLength`.
 * Only sent to the AI when the person opts in.
 */
export function collectSamples(
  dataset: SourceDataset,
  columnId: ColumnId,
  count: number = LIMITS.sampleValuesPerColumn,
  maxLength: number = LIMITS.sampleValueMaxLength,
): string[] {
  const seen = new Set<string>();
  const samples: string[] = [];
  for (const row of dataset.rows) {
    if (samples.length >= count) break;
    const value = collapseWhitespace(row.values[columnId] ?? "");
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    samples.push(truncate(value, maxLength));
  }
  return samples;
}

/** First non-empty values of a column, for UI previews. */
export function previewValues(dataset: SourceDataset, columnId: ColumnId, count = 5): string[] {
  const values: string[] = [];
  for (const row of dataset.rows) {
    if (values.length >= count) break;
    const value = row.values[columnId] ?? "";
    if (value.trim() !== "") values.push(value);
  }
  return values;
}
