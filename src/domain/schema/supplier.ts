import { z } from "zod";
import type { FieldDefinition, TargetSchema } from "./types";

/**
 * A supplier record as the downstream system expects it.
 * Empty optional fields are absent (not empty strings).
 */
export const SupplierSchema = z.object({
  companyName: z.string().min(1),
  taxId: z.string().min(1).optional(),
  email: z.email(),
  phone: z.string().min(1).optional(),
  website: z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).optional(),
  contactName: z.string().min(1).optional(),
  addressLine: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  country: z.string().min(1),
  category: z.string().min(1).optional(),
});

export type Supplier = z.infer<typeof SupplierSchema>;
export type SupplierFieldKey = keyof Supplier;

/**
 * Field metadata. `satisfies Record<SupplierFieldKey, …>` makes the compiler reject a field
 * that is missing here or that does not exist in the Zod schema. A unit test checks that
 * `required` matches the schema's optionality.
 *
 * Insertion order is the export column order.
 */
const FIELDS = {
  companyName: {
    label: "Company name",
    description: "Registered or trading name of the supplier.",
    required: true,
    kind: "text",
    synonyms: [
      "company",
      "company name",
      "supplier",
      "supplier name",
      "vendor",
      "vendor name",
      "name",
      "business name",
      "legal name",
      "organisation",
      "organization",
      "account name",
      "firma",
      "nazwa firmy",
      "nazwa",
      "razon social",
    ],
    example: "Acme Components Ltd",
  },
  taxId: {
    label: "Tax ID",
    description: "VAT number or other tax identifier (NIP, EIN, USt-IdNr).",
    required: false,
    kind: "identifier",
    synonyms: [
      "tax id",
      "tax number",
      "vat",
      "vat id",
      "vat number",
      "vat no",
      "vat reg",
      "nip",
      "tin",
      "ein",
      "ust idnr",
      "steuernummer",
      "nif",
      "cif",
      "fiscal code",
      "tax code",
    ],
    example: "GB123456789",
  },
  email: {
    label: "Email",
    description: "Primary contact email address.",
    required: true,
    kind: "email",
    synonyms: [
      "email",
      "e mail",
      "email address",
      "mail",
      "contact email",
      "e mail address",
      "adres email",
      "adres e mail",
      "correo",
    ],
    example: "orders@acme.example",
  },
  phone: {
    label: "Phone",
    description: "Primary phone number, any format.",
    required: false,
    kind: "phone",
    synonyms: [
      "phone",
      "telephone",
      "tel",
      "phone number",
      "mobile",
      "cell",
      "contact phone",
      "telefon",
      "nr telefonu",
      "telefono",
    ],
    example: "+44 20 7946 0000",
  },
  website: {
    label: "Website",
    description: "Company website URL.",
    required: false,
    kind: "url",
    synonyms: [
      "website",
      "web site",
      "url",
      "web",
      "homepage",
      "home page",
      "site",
      "www",
      "strona www",
      "strona",
    ],
    example: "https://acme.example",
  },
  contactName: {
    label: "Contact name",
    description: "Person to contact at the supplier.",
    required: false,
    kind: "text",
    synonyms: [
      "contact",
      "contact name",
      "contact person",
      "representative",
      "rep",
      "account manager",
      "attention",
      "attn",
      "osoba kontaktowa",
      "ansprechpartner",
    ],
    example: "Jane Doe",
  },
  addressLine: {
    label: "Address",
    description: "Street address, including building number.",
    required: false,
    kind: "text",
    synonyms: [
      "address",
      "street",
      "street address",
      "address line 1",
      "address 1",
      "address1",
      "adres",
      "ulica",
      "strasse",
    ],
    example: "12 Market Street",
  },
  city: {
    label: "City",
    description: "City or town.",
    required: false,
    kind: "text",
    synonyms: ["city", "town", "locality", "miasto", "ort", "ciudad"],
    example: "Manchester",
  },
  postalCode: {
    label: "Postal code",
    description: "Postal or ZIP code.",
    required: false,
    kind: "text",
    synonyms: [
      "postal code",
      "postcode",
      "post code",
      "zip",
      "zip code",
      "kod pocztowy",
      "plz",
      "cp",
    ],
    example: "M1 1AE",
  },
  country: {
    label: "Country",
    description: "Country of the supplier's registered address.",
    required: true,
    kind: "country",
    synonyms: ["country", "country code", "country region", "nation", "kraj", "land", "pais"],
    example: "United Kingdom",
  },
  category: {
    label: "Category",
    description: "What the supplier provides, e.g. Packaging, Logistics.",
    required: false,
    kind: "text",
    synonyms: [
      "category",
      "supplier category",
      "type",
      "segment",
      "industry",
      "sector",
      "kategoria",
      "branza",
    ],
    example: "Packaging",
  },
} satisfies Record<SupplierFieldKey, Omit<FieldDefinition<SupplierFieldKey>, "key">>;

export const SUPPLIER_FIELDS: readonly FieldDefinition<SupplierFieldKey>[] = (
  Object.keys(FIELDS) as SupplierFieldKey[]
).map((key) => ({ key, ...FIELDS[key] }));

export const supplierSchema: TargetSchema<SupplierFieldKey> = {
  id: "supplier",
  label: "Supplier",
  description: "Vendor master data: identity, contact, address.",
  fields: SUPPLIER_FIELDS,
  recordSchema: SupplierSchema,
  duplicateKeys: [
    { id: "tax-id", label: "Same tax ID", fields: ["taxId"] },
    { id: "email", label: "Same email", fields: ["email"] },
    { id: "name-country", label: "Same name and country", fields: ["companyName", "country"] },
  ],
};
