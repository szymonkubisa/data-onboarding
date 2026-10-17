import { z } from "zod";
import type { FieldDefinition } from "../schema/types";
import { resolveCountry } from "./countries";
import type { IssueCode, Severity } from "./types";

export interface FieldProblem {
  code: IssueCode;
  severity: Severity;
  message: string;
}

const EmailSchema = z.email();

export function validateEmail(value: string): FieldProblem | null {
  if (EmailSchema.safeParse(value).success) return null;
  return {
    code: "invalid-email",
    severity: "error",
    message: `“${value}” is not a valid email address.`,
  };
}

/** Accepts only absolute http(s) URLs with a dotted hostname. */
export function validateUrl(value: string): FieldProblem | null {
  const invalid: FieldProblem = {
    code: "invalid-url",
    severity: "error",
    message: `“${value}” is not a valid website URL.`,
  };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ...invalid, message: `Only http and https links are allowed, got “${url.protocol}”.` };
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname)) return invalid;
  return null;
}

const PHONE_EXTENSION = /\s*(?:ext\.?|x)\s*\d+$/i;

export function validatePhone(value: string): FieldProblem | null {
  const base = value.replace(PHONE_EXTENSION, "");
  if (/\p{L}/u.test(base)) {
    return {
      code: "phone-has-letters",
      severity: "warning",
      message: `Phone “${value}” contains letters.`,
    };
  }
  const digits = base.replace(/\D/g, "").length;
  if (digits < 6) {
    return {
      code: "phone-too-short",
      severity: "warning",
      message: `Phone “${value}” has only ${digits} digit${digits === 1 ? "" : "s"}.`,
    };
  }
  return null;
}

export function validateCountry(value: string): FieldProblem | null {
  const resolved = resolveCountry(value);
  if (resolved.status === "match") return null;
  if (resolved.status === "ambiguous") {
    return { code: "ambiguous-country", severity: "warning", message: resolved.reason };
  }
  return {
    code: "unknown-country",
    severity: "warning",
    message: `“${value}” is not a recognised country. Kept as is.`,
  };
}

/** Validate a non-empty, already transformed value according to the field kind. */
export function validateField(field: FieldDefinition, value: string): FieldProblem | null {
  switch (field.kind) {
    case "email":
      return validateEmail(value);
    case "url":
      return validateUrl(value);
    case "phone":
      return validatePhone(value);
    case "country":
      return validateCountry(value);
    case "text":
    case "identifier":
      return null;
  }
}
