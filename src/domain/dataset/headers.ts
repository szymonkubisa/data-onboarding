import { collapseWhitespace } from "../shared/text";
import { LIMITS } from "./limits";

export interface NormalizedHeader {
  name: string;
  originalName: string;
  /** Name differs from the cleaned original because it was a duplicate. */
  renamed: boolean;
  /** Original was empty; a "Column N" name was generated. */
  generated: boolean;
  /** Original was longer than the limit and was cut. */
  truncated: boolean;
}

/**
 * Turn raw header cells into unique, readable column names.
 *
 * - whitespace trimmed and collapsed, BOM removed
 * - empty header → "Column N" (N = 1-based position)
 * - duplicates (case-insensitive) → "Email (2)", "Email (3)"
 * - generated and suffixed names never collide with a real header elsewhere in the row
 */
export function normalizeHeaders(
  raw: readonly string[],
  maxLength: number = LIMITS.maxHeaderLength,
): NormalizedHeader[] {
  const bases = raw.map((original, index) => {
    let name = collapseWhitespace(original ?? "");
    const truncated = name.length > maxLength;
    if (truncated) name = name.slice(0, maxLength).trimEnd();
    const generated = name === "";
    if (generated) name = `Column ${index + 1}`;
    return { name, originalName: original ?? "", truncated, generated };
  });

  // Real headers own their names; generated or suffixed names must route around them.
  const reserved = new Set(bases.filter((b) => !b.generated).map((b) => b.name.toLowerCase()));
  const used = new Set<string>();

  return bases.map((base) => {
    let name = base.name;
    const key = name.toLowerCase();
    const collides = used.has(key) || (base.generated && reserved.has(key));
    if (collides) {
      let n = 2;
      while (used.has(`${key} (${n})`) || reserved.has(`${key} (${n})`)) n += 1;
      name = `${base.name} (${n})`;
    }
    used.add(name.toLowerCase());
    return {
      name,
      originalName: base.originalName,
      renamed: collides && !base.generated,
      generated: base.generated,
      truncated: base.truncated,
    };
  });
}
