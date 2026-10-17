import { describe, expect, it } from "vitest";
import { normalizeKey } from "../shared/text";
import { getSchema, isSchemaId, SCHEMA_IDS } from "./registry";
import { SUPPLIER_FIELDS, SupplierSchema } from "./supplier";

describe("supplier schema", () => {
  it("has field metadata for exactly the Zod schema keys, in a stable order", () => {
    expect(SUPPLIER_FIELDS.map((f) => f.key)).toEqual(Object.keys(SupplierSchema.shape));
  });

  it("marks a field required exactly when the Zod schema does", () => {
    for (const field of SUPPLIER_FIELDS) {
      const optional = SupplierSchema.shape[field.key].safeParse(undefined).success;
      expect({ key: field.key, required: field.required }).toEqual({
        key: field.key,
        required: !optional,
      });
    }
  });

  it("has unique synonyms across fields after normalization", () => {
    const seen = new Map<string, string>();
    for (const field of SUPPLIER_FIELDS) {
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
    expect(SupplierSchema.safeParse(valid).success).toBe(true);
    expect(SupplierSchema.safeParse({ ...valid, website: "acme.com" }).success).toBe(false);
    expect(SupplierSchema.safeParse({ ...valid, website: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(SupplierSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
});

describe("schema registry", () => {
  it("resolves known ids only", () => {
    expect(SCHEMA_IDS).toEqual(["supplier"]);
    expect(isSchemaId("supplier")).toBe(true);
    expect(isSchemaId("toString")).toBe(false);
    expect(getSchema("supplier").fields.length).toBe(11);
  });
});
