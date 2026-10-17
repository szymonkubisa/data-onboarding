import { describe, expect, it } from "vitest";
import {
  countryStep,
  emailStep,
  isNullToken,
  nullTokenStep,
  taxIdFix,
  urlSchemeFix,
  whitespaceStep,
} from "./transforms";
import { validateCountry, validateEmail, validatePhone, validateUrl } from "./validators";

describe("auto transforms", () => {
  it.each([
    ["  Acme  ", "Acme"],
    ["Acme  Ltd", "Acme Ltd"],
    ["Acme", null],
  ])("whitespace: %j → %j", (input, expected) => {
    expect(whitespaceStep(input)?.to ?? null).toBe(expected);
  });

  it.each(["N/A", "n/a", "null", "-", "—", "None", "#N/A"])("null token: %s", (input) => {
    expect(isNullToken(input)).toBe(true);
    expect(nullTokenStep(input)?.to).toBe("");
  });

  it.each(["NA", "0", "Nil Industries", ""])("not a null token: %j", (input) => {
    expect(nullTokenStep(input)).toBeNull();
  });

  it.each([
    ["Orders@ACME.Example", "Orders@acme.example"],
    ["mailto:a@b.co", "a@b.co"],
    ["a@b.co", null],
  ])("email: %s → %s", (input, expected) => {
    expect(emailStep(input)?.to ?? null).toBe(expected);
  });

  it.each([
    ["UK", "United Kingdom"],
    ["gbr", "United Kingdom"],
    ["Deutschland", "Germany"],
    ["United Kingdom", null],
    ["Narnia", null],
    ["NA", null],
  ])("country: %s → %s", (input, expected) => {
    expect(countryStep(input)?.to ?? null).toBe(expected);
  });
});

describe("suggested fixes", () => {
  it.each([
    ["acme.com", "https://acme.com"],
    ["www.acme.co.uk/contact", "https://www.acme.co.uk/contact"],
    ["https://acme.com", null],
    ["ftp://acme.com", null],
    ["not a url", null],
    ["", null],
  ])("url: %j → %j", (input, expected) => {
    expect(urlSchemeFix(input)?.to ?? null).toBe(expected);
  });

  it.each([
    ["gb 123 456 789", "GB123456789"],
    ["PL-526-000-12-46", "PL5260001246"],
    ["DE123456789", null],
  ])("tax id: %j → %j", (input, expected) => {
    expect(taxIdFix(input)?.to ?? null).toBe(expected);
  });
});

describe("validators", () => {
  it.each([
    ["orders@acme.example", null],
    ["a.b+tag@sub.acme.co.uk", null],
    ["orders@acme", "invalid-email"],
    ["orders(at)acme.com", "invalid-email"],
    ["two@@acme.com", "invalid-email"],
  ])("email %j → %s", (input, code) => {
    expect(validateEmail(input)?.code ?? null).toBe(code);
  });

  it.each([
    ["https://acme.com", null],
    ["http://www.acme.co.uk/path?q=1", null],
    ["https://localhost", "invalid-url"],
    ["javascript:alert(1)", "invalid-url"],
    ["ftp://acme.com", "invalid-url"],
    ["https://", "invalid-url"],
    ["asdf", "invalid-url"],
  ])("url %j → %s", (input, code) => {
    expect(validateUrl(input)?.code ?? null).toBe(code);
  });

  it.each([
    ["+44 20 7946 0000", null],
    ["(020) 7946-0000 ext. 12", null],
    ["555-1234 x99", null],
    ["call Tom", "phone-has-letters"],
    ["+44 20 FLOWERS", "phone-has-letters"],
    ["123", "phone-too-short"],
  ])("phone %j → %s", (input, code) => {
    expect(validatePhone(input)?.code ?? null).toBe(code);
  });

  it.each([
    ["United Kingdom", null],
    ["Narnia", "unknown-country"],
    ["NA", "ambiguous-country"],
  ])("country %j → %s", (input, code) => {
    expect(validateCountry(input)?.code ?? null).toBe(code);
  });
});
