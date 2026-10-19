import type { ColumnProfile } from "../dataset/profile";
import type { ColumnId } from "../dataset/types";
import type { FieldDefinition, FieldKey } from "../schema/types";
import { normalizeKey } from "../shared/text";
import type { MappingSuggestion } from "./types";

/**
 * Deterministic mapping suggestions: header text against field names and synonyms,
 * reinforced (or weakened) by what the values look like. Used in demo mode and as the
 * fallback when the LLM fails. Its output goes through the same validation as the LLM's.
 */

export interface HeuristicColumn {
  id: ColumnId;
  name: string;
  profile?: ColumnProfile;
}

interface NameMatch {
  score: number;
  matched: string;
  how: "exact" | "compact" | "phrase" | "token" | "fuzzy";
}

/** Header tokens that turn "Supplier" into "Supplier ID": a different thing. */
const QUALIFIER_TOKENS = new Set([
  "id",
  "ref",
  "no",
  "nr",
  "number",
  "code",
  "key",
  "type",
  "date",
  "status",
]);

const MIN_SCORE = 0.4;

function camelToWords(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function bigrams(value: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) grams.push(value.slice(i, i + 2));
  return grams;
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (const gram of bigrams(a)) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let overlap = 0;
  for (const gram of bigrams(b)) {
    const n = counts.get(gram) ?? 0;
    if (n > 0) {
      overlap += 1;
      counts.set(gram, n - 1);
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/**
 * 1 − (optimal string alignment distance / longer length), 0..1.
 * Catches typos and transpositions ("Emial", "Adress") that bigram overlap misses.
 */
export function editSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i]!;
      const prev = d[i - 1]!;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return 1 - d[a.length]![b.length]! / longest;
}

function candidatesFor(field: FieldDefinition): string[] {
  const all = [camelToWords(field.key), field.label, ...field.synonyms].map(normalizeKey);
  return [...new Set(all.filter((c) => c !== ""))];
}

export function matchName(header: string, field: FieldDefinition): NameMatch | null {
  const key = normalizeKey(header);
  if (key === "") return null;
  const compactKey = key.replace(/ /g, "");
  const tokens = key.split(" ");
  let best: NameMatch | null = null;
  const consider = (match: NameMatch) => {
    if (!best || match.score > best.score) best = match;
  };

  for (const candidate of candidatesFor(field)) {
    const compactCandidate = candidate.replace(/ /g, "");
    if (candidate === key) {
      consider({ score: 0.95, matched: candidate, how: "exact" });
      continue;
    }
    if (compactCandidate === compactKey) {
      consider({ score: 0.9, matched: candidate, how: "compact" });
      continue;
    }
    const candidateTokens = candidate.split(" ");
    const contained = candidateTokens.every((t) => tokens.includes(t));
    if (contained) {
      const extra = tokens.filter((t) => !candidateTokens.includes(t));
      const qualified = extra.some((t) => QUALIFIER_TOKENS.has(t));
      if (candidateTokens.length > 1) {
        consider({ score: qualified ? 0.45 : 0.75, matched: candidate, how: "phrase" });
      } else {
        consider({ score: qualified ? 0.3 : 0.6, matched: candidate, how: "token" });
      }
      continue;
    }
    const similarity = Math.max(
      diceSimilarity(compactKey, compactCandidate),
      editSimilarity(compactKey, compactCandidate),
    );
    if (similarity >= 0.75 && compactCandidate.length >= 5) {
      consider({
        score: Math.round(similarity * 0.7 * 100) / 100,
        matched: candidate,
        how: "fuzzy",
      });
    }
  }
  return best;
}

/** Share of values that look like what this field kind expects, or null if the kind has no pattern. */
function patternRatio(field: FieldDefinition, profile: ColumnProfile | undefined): number | null {
  if (!profile || profile.nonEmptyRatio === 0) return null;
  switch (field.kind) {
    case "email":
      return profile.patterns.email;
    case "url":
      return profile.patterns.url;
    case "phone":
      return Math.max(0, profile.patterns.phoneLike - profile.patterns.email);
    case "country":
      return profile.patterns.countryLike;
    default:
      return null;
  }
}

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

const KIND_NOUN: Record<string, string> = {
  email: "email addresses",
  url: "web addresses",
  phone: "phone numbers",
  country: "countries",
};

export interface ScoredPair {
  columnId: ColumnId;
  field: FieldKey;
  score: number;
  reasoning: string;
}

export function scorePair(column: HeuristicColumn, field: FieldDefinition): ScoredPair | null {
  const name = matchName(column.name, field);
  const ratio = patternRatio(field, column.profile);
  let score = name?.score ?? 0;
  const reasons: string[] = [];

  if (name) {
    reasons.push(
      name.how === "exact" || name.how === "compact"
        ? `Header “${column.name}” matches “${name.matched}”.`
        : name.how === "fuzzy"
          ? `Header “${column.name}” is similar to “${name.matched}”.`
          : `Header “${column.name}” contains “${name.matched}”.`,
    );
  }

  if (ratio !== null) {
    const noun = KIND_NOUN[field.kind] ?? "matching values";
    if (ratio >= 0.6) {
      score = Math.max(score, 0.4 + 0.4 * ratio) + (name ? 0.1 : 0);
      reasons.push(`${pct(ratio)} of values look like ${noun}.`);
    } else if (ratio < 0.2 && name) {
      score *= 0.6;
      reasons.push(`Only ${pct(ratio)} of values look like ${noun}.`);
    }
  }

  score = Math.min(0.98, Math.round(score * 100) / 100);
  if (score < MIN_SCORE) return null;
  return { columnId: column.id, field: field.key, score, reasoning: reasons.join(" ") };
}

/**
 * Score every column against every field, then assign greedily by score so each column
 * gets at most one field and each field at most one column. Ties keep column order.
 */
export function suggestByHeuristics(
  columns: readonly HeuristicColumn[],
  fields: readonly FieldDefinition[],
): MappingSuggestion[] {
  const pairs: ScoredPair[] = [];
  for (const column of columns) {
    for (const field of fields) {
      const pair = scorePair(column, field);
      if (pair) pairs.push(pair);
    }
  }
  const columnOrder = new Map(columns.map((c, i) => [c.id, i]));
  const fieldOrder = new Map(fields.map((f, i) => [f.key, i]));
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      (columnOrder.get(a.columnId) ?? 0) - (columnOrder.get(b.columnId) ?? 0) ||
      (fieldOrder.get(a.field) ?? 0) - (fieldOrder.get(b.field) ?? 0),
  );

  const byColumn = new Map<ColumnId, ScoredPair>();
  const takenFields = new Set<FieldKey>();
  for (const pair of pairs) {
    if (byColumn.has(pair.columnId) || takenFields.has(pair.field)) continue;
    byColumn.set(pair.columnId, pair);
    takenFields.add(pair.field);
  }

  return columns.map((column) => {
    const pair = byColumn.get(column.id);
    if (pair) {
      return {
        sourceColumnId: column.id,
        targetField: pair.field,
        confidence: pair.score,
        reasoning: pair.reasoning,
        origin: "heuristic",
      };
    }
    return {
      sourceColumnId: column.id,
      targetField: null,
      confidence: 0,
      reasoning: "No field matched the header or the values.",
      origin: "heuristic",
    };
  });
}

/**
 * Exact or near-exact header matches. Computed before the LLM call and passed to it as
 * hints, so the model can spend its attention on the ambiguous columns.
 */
export function exactHeaderHits(
  columns: readonly HeuristicColumn[],
  fields: readonly FieldDefinition[],
): { columnId: ColumnId; field: FieldKey }[] {
  const hits: { columnId: ColumnId; field: FieldKey }[] = [];
  for (const column of columns) {
    for (const field of fields) {
      const match = matchName(column.name, field);
      if (match && match.score >= 0.9) {
        hits.push({ columnId: column.id, field: field.key });
        break;
      }
    }
  }
  return hits;
}
