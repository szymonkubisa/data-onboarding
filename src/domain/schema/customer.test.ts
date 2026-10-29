import { describe, expect, it } from "vitest";
import { normalizeKey } from "../shared/text";
import { getSchema, isSchemaId, SCHEMA_IDS } from "./registry";
import { CUSTOMER_FIELDS, CustomerSchema } from "./customer";

describe("customer schema", () => {
  it("has field metadata for exactly the Zod schema keys, in a stable order", () => {
    expect(CUSTOMER_FIELDS.map((f) => f.key)).toEqual(Object.keys(CustomerSchema.shape));
  });

  it("marks a field required exactly when the Zod schema does", () => {
    for (const field of CUSTOMER_FIELDS) {
      const optional = CustomerSchema.shape[field.key].safeParse(undefined).success;
      expect({ key: field.key, required: field.required }).toEqual({
        key: field.key,
        required: !optional,
      });
    }
  });

  it("has unique synonyms across fields after normalization", () => {
    const seen = new Map<string, string>();
    for (const field of CUSTOMER_FIELDS) {
      for (const synonym of field.synonyms) {
        const key = normalizeKey(synonym);
        expect(
          seen.get(key),
          `"${synonym}" is used by ${seen.get(key)} and ${field.key}`,
        ).toBeUndefined();
        seen.set(key, field.key);
      }
    }
  });

  it("accepts a complete valid record and rejects bad website and email", () => {
    const valid = {
      companyName: "Acme",
      email: "a@acme.com",
      country: "United Kingdom",
      website: "https://acme.com",
    };
    expect(CustomerSchema.safeParse(valid).success).toBe(true);
    expect(CustomerSchema.safeParse({ ...valid, website: "acme.com" }).success).toBe(false);
    expect(CustomerSchema.safeParse({ ...valid, website: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(CustomerSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
});

describe("schema registry", () => {
  it("resolves known ids only", () => {
    expect(SCHEMA_IDS).toEqual(["customer"]);
    expect(isSchemaId("customer")).toBe(true);
    expect(isSchemaId("toString")).toBe(false);
    expect(getSchema("customer").fields.length).toBe(11);
  });
});
