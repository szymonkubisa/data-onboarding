import type { RowId } from "../dataset/types";
import type { FieldDefinition, FieldKey, TargetSchema } from "../schema/types";
import { normalizeKey } from "../shared/text";
import { resolveCountry } from "./countries";
import type { DuplicateGroup } from "./types";

/** Trailing tokens that do not distinguish companies: "Acme Ltd" = "ACME Limited". */
const LEGAL_SUFFIX_TOKENS = new Set([
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "llc",
  "llp",
  "plc",
  "gmbh",
  "ag",
  "kg",
  "ug",
  "sa",
  "sas",
  "sarl",
  "srl",
  "spa",
  "bv",
  "nv",
  "oy",
  "ab",
  "as",
  "co",
  "corp",
  "corporation",
  "company",
  "sp",
  "z",
  "o",
  "group",
]);

export function companyKey(value: string): string {
  const tokens = normalizeKey(value).split(" ").filter(Boolean);
  if (tokens[0] === "the" && tokens.length > 1) tokens.shift();
  while (tokens.length > 1 && LEGAL_SUFFIX_TOKENS.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(" ");
}

/** Comparison key for one field value, by kind. Empty string = no key. */
export function duplicateKeyPart(field: FieldDefinition, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  switch (field.kind) {
    case "identifier":
      return trimmed.replace(/[^0-9a-z]/gi, "").toUpperCase();
    case "email":
      return trimmed.toLowerCase();
    case "country": {
      const resolved = resolveCountry(trimmed);
      return resolved.status === "match" ? resolved.country.alpha2 : normalizeKey(trimmed);
    }
    case "url":
      return trimmed
        .toLowerCase()
        .replace(/^https?:\/\/(www\.)?/, "")
        .replace(/\/+$/, "");
    case "phone":
      return trimmed.replace(/\D/g, "");
    case "text":
      return companyKey(trimmed);
  }
}

class UnionFind {
  private parent = new Map<RowId, RowId>();
  find(x: RowId): RowId {
    let root = x;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    let node = x;
    while (node !== root) {
      const next = this.parent.get(node) ?? root;
      this.parent.set(node, root);
      node = next;
    }
    if (!this.parent.has(root)) this.parent.set(root, root);
    return root;
  }
  union(a: RowId, b: RowId): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

export interface DuplicateCandidate {
  rowId: RowId;
  values: Readonly<Record<FieldKey, string>>;
}

/**
 * Group rows that share any duplicate key (union-find, so A~B and B~C put A, B, C together).
 * Nothing is merged; groups are reported so the person can decide.
 */
export function findDuplicateGroups(
  records: readonly DuplicateCandidate[],
  schema: TargetSchema,
): DuplicateGroup[] {
  const fieldsByKey = new Map(schema.fields.map((f) => [f.key, f]));
  const uf = new UnionFind();
  const reasonsByPair = new Map<RowId, Set<string>>();
  const order = new Map(records.map((r, i) => [r.rowId, i]));

  for (const key of schema.duplicateKeys) {
    const firstByValue = new Map<string, RowId>();
    for (const record of records) {
      const parts = key.fields.map((k) => {
        const field = fieldsByKey.get(k);
        return field ? duplicateKeyPart(field, record.values[k] ?? "") : "";
      });
      if (parts.some((p) => p === "")) continue;
      const composite = parts.join("\u0000");
      const first = firstByValue.get(composite);
      if (first === undefined) {
        firstByValue.set(composite, record.rowId);
        continue;
      }
      uf.union(first, record.rowId);
      for (const id of [first, record.rowId]) {
        const reasons = reasonsByPair.get(id) ?? new Set<string>();
        reasons.add(key.label);
        reasonsByPair.set(id, reasons);
      }
    }
  }

  const groups = new Map<RowId, RowId[]>();
  for (const rowId of reasonsByPair.keys()) {
    const root = uf.find(rowId);
    groups.set(root, [...(groups.get(root) ?? []), rowId]);
  }

  return [...groups.values()]
    .map((rowIds) => rowIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)))
    .sort((a, b) => (order.get(a[0]!) ?? 0) - (order.get(b[0]!) ?? 0))
    .map((rowIds) => {
      const reasons = new Set<string>();
      for (const id of rowIds) for (const r of reasonsByPair.get(id) ?? []) reasons.add(r);
      return { id: `dup-${rowIds[0]}`, rowIds, reasons: [...reasons] };
    });
}
