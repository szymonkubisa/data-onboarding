import { looksLikeUrl } from "../dataset/profile";
import { collapseWhitespace } from "../shared/text";
import { resolveCountry } from "./countries";
import type { FixProposal, TransformCode } from "./types";

/**
 * Field transforms. Each returns the new value, or null when it does not apply.
 *
 * Auto transforms are safe and lossless in meaning (whitespace, case of an email domain,
 * the canonical spelling of a recognised country). They are applied and recorded.
 * Suggested transforms change what the value says (adding a URL scheme, reformatting an
 * identifier). They are proposed and applied only when the person accepts them.
 */

export interface TransformStep {
  code: TransformCode;
  label: string;
  to: string;
}

/** Placeholder spellings for "no value". "NA" is not here: it is also a country code. */
export const NULL_TOKENS = new Set([
  "n/a",
  "#n/a",
  "null",
  "nil",
  "none",
  "-",
  "--",
  "—",
  "–",
  "?",
  "(blank)",
]);

export function isNullToken(value: string): boolean {
  return NULL_TOKENS.has(value.trim().toLowerCase());
}

export function whitespaceStep(value: string): TransformStep | null {
  const to = collapseWhitespace(value);
  return to === value ? null : { code: "whitespace", label: "Trimmed whitespace", to };
}

export function nullTokenStep(value: string): TransformStep | null {
  return value !== "" && isNullToken(value)
    ? { code: "null-token", label: `Treated “${value}” as empty`, to: "" }
    : null;
}

/** Strip a mailto: prefix and lowercase the domain. The local part is case-sensitive by spec. */
export function emailStep(value: string): TransformStep | null {
  let to = value.replace(/^mailto:/i, "");
  const at = to.lastIndexOf("@");
  if (at > 0) to = `${to.slice(0, at)}@${to.slice(at + 1).toLowerCase()}`;
  return to === value ? null : { code: "email-normalize", label: "Normalized email domain", to };
}

export function countryStep(value: string): TransformStep | null {
  const resolved = resolveCountry(value);
  if (resolved.status !== "match" || resolved.country.name === value) return null;
  return {
    code: "country-canonical",
    label: `Recognised as ${resolved.country.name}`,
    to: resolved.country.name,
  };
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function urlSchemeFix(value: string): FixProposal | null {
  if (value === "" || HAS_SCHEME.test(value) || !looksLikeUrl(value)) return null;
  return { kind: "suggested", from: value, to: `https://${value}` };
}

export function taxIdFix(value: string): FixProposal | null {
  const to = value.replace(/[\s.\-/]/g, "").toUpperCase();
  return to === "" || to === value ? null : { kind: "suggested", from: value, to };
}
