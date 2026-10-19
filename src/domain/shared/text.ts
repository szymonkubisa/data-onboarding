/**
 * Text helpers shared by the domain. Pure, locale-independent, deterministic:
 * the same input gives the same output in Node and in every browser.
 */

// \s covers most Unicode spaces; zero-width characters and BOM need to be added explicitly.
const WHITESPACE = /[\s​-‍⁠﻿]+/g;

/** Trim and collapse every run of whitespace (including NBSP and zero-width) to one space. */
export function collapseWhitespace(value: string): string {
  return value.replace(WHITESPACE, " ").trim();
}

// Letters that NFKD does not decompose into base + combining mark.
const SPECIAL_LETTERS: Record<string, string> = {
  ł: "l",
  Ł: "L",
  ø: "o",
  Ø: "O",
  đ: "d",
  Đ: "D",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  þ: "th",
  Þ: "TH",
  ı: "i",
};

/** Remove diacritics: "Łódź" → "Lodz", "Côte" → "Cote". */
export function stripDiacritics(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[łŁøØđĐßæÆœŒþÞı]/g, (ch) => SPECIAL_LETTERS[ch] ?? ch);
}

/**
 * Comparison key for loose matching of labels and headers:
 * lowercase ASCII words separated by single spaces. "E-Mail  Address" → "e mail address".
 */
export function normalizeKey(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Cut a string to `max` characters, adding an ellipsis when it was cut. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Round to two decimals. Used for compact, stable ratios in profiles and payloads. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
