/**
 * Generates the demo data: a messy but realistic customer export.
 *
 *   pnpm generate:sample
 *
 * Outputs (deterministic, seeded RNG):
 *   public/samples/customers-messy.csv   184 rows, the "Try with sample data" file
 *   test/fixtures/customers.xlsx         2 sheets, used by parser tests and e2e
 *
 * All data is synthetic. Domains use reserved TLD-like suffixes per country but the
 * company names are generated, not real.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Papa from "papaparse";
import writeXlsxFile from "write-excel-file/node";

const ROOT = join(import.meta.dirname, "..");

/** mulberry32: tiny, fast, deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20261017);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const chance = (p: number) => random() < p;
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 10)).join("");

interface CountrySpec {
  code: string;
  variants: string[];
  legal: string;
  tld: string;
  cities: string[];
  postal: () => string;
  phone: () => string;
  taxId: () => string;
  messyTaxId: (clean: string) => string;
}

const COUNTRIES: CountrySpec[] = [
  {
    code: "GB",
    variants: ["United Kingdom", "UK", "GB", "GBR", " United Kingdom ", "Great Britain", "england"],
    legal: "Ltd",
    tld: "co.uk",
    cities: ["London", "Manchester", "Leeds", "Bristol", "Glasgow"],
    postal: () =>
      `${pick(["M1", "LS2", "BS1", "EC1A", "G2"])} ${digits(1)}${pick(["AE", "BB", "XZ", "PL"])}`,
    phone: () =>
      pick([`+44 20 7946 0${digits(3)}`, `020 7946 0${digits(3)}`, `+44 161 496 0${digits(3)}`]),
    taxId: () => `GB${digits(9)}`,
    messyTaxId: (c) =>
      `${c.slice(0, 2).toLowerCase()} ${c.slice(2, 5)} ${c.slice(5, 8)} ${c.slice(8)}`,
  },
  {
    code: "DE",
    variants: ["Germany", "DE", "Deutschland", "GERMANY"],
    legal: "GmbH",
    tld: "de",
    cities: ["Berlin", "Hamburg", "München", "Köln", "Leipzig"],
    postal: () => `${1 + Math.floor(random() * 9)}${digits(4)}`,
    phone: () => pick([`+49 30 ${digits(6)}`, `030 ${digits(7)}`]),
    taxId: () => `DE${digits(9)}`,
    messyTaxId: (c) => `${c.slice(0, 2)} ${c.slice(2)}`,
  },
  {
    code: "PL",
    variants: ["Poland", "PL", "Polska", "POL"],
    legal: "Sp. z o.o.",
    tld: "pl",
    cities: ["Warszawa", "Kraków", "Łódź", "Wrocław", "Gdańsk"],
    postal: () => `${digits(2)}-${digits(3)}`,
    phone: () =>
      pick([
        `+48 22 ${digits(3)} ${digits(2)} ${digits(2)}`,
        `${digits(3)}-${digits(3)}-${digits(3)}`,
      ]),
    taxId: () => `PL${digits(10)}`,
    messyTaxId: (c) => `${c.slice(2, 5)}-${c.slice(5, 8)}-${c.slice(8, 10)}-${c.slice(10)}`,
  },
  {
    code: "US",
    variants: ["United States", "USA", "US", "U.S.A.", "United States of America"],
    legal: "Inc.",
    tld: "com",
    cities: ["Chicago", "Austin", "Denver", "Seattle", "Boston"],
    postal: () => digits(5),
    phone: () => pick([`(312) 555-0${digits(3)}`, `+1 512 555 0${digits(3)}`]),
    taxId: () => `${digits(2)}-${digits(7)}`,
    messyTaxId: (c) => c.replace("-", " "),
  },
  {
    code: "NL",
    variants: ["Netherlands", "NL", "Holland", "The Netherlands"],
    legal: "B.V.",
    tld: "nl",
    cities: ["Amsterdam", "Rotterdam", "Utrecht", "Eindhoven"],
    postal: () => `${1000 + Math.floor(random() * 8999)} ${pick(["AB", "CD", "KL", "XR"])}`,
    phone: () => `+31 20 ${digits(3)} ${digits(4)}`,
    taxId: () => `NL${digits(9)}B01`,
    messyTaxId: (c) => c.toLowerCase(),
  },
  {
    code: "FR",
    variants: ["France", "FR"],
    legal: "SAS",
    tld: "fr",
    cities: ["Paris", "Lyon", "Lille", "Nantes"],
    postal: () => `${digits(5)}`,
    phone: () => `+33 1 ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`,
    taxId: () => `FR${digits(11)}`,
    messyTaxId: (c) => `${c.slice(0, 4)} ${c.slice(4, 7)} ${c.slice(7)}`,
  },
  {
    code: "ES",
    variants: ["Spain", "ES", "España"],
    legal: "S.L.",
    tld: "es",
    cities: ["Madrid", "Barcelona", "Valencia", "Sevilla"],
    postal: () => digits(5),
    phone: () => `+34 91 ${digits(3)} ${digits(2)} ${digits(2)}`,
    taxId: () => `ESB${digits(8)}`,
    messyTaxId: (c) => `${c.slice(0, 3)}-${c.slice(3)}`,
  },
  {
    code: "CZ",
    variants: ["Czechia", "Czech Republic", "CZ"],
    legal: "s.r.o.",
    tld: "cz",
    cities: ["Praha", "Brno", "Ostrava"],
    postal: () => `${digits(3)} ${digits(2)}`,
    phone: () => `+420 ${digits(3)} ${digits(3)} ${digits(3)}`,
    taxId: () => `CZ${digits(8)}`,
    messyTaxId: (c) => c.toLowerCase(),
  },
];

const NAME_A = [
  "Acme",
  "Baltic",
  "Northwind",
  "Vistula",
  "Granite",
  "Harbor",
  "Summit",
  "Blue Fern",
  "Iron Oak",
  "Copperleaf",
  "Silverline",
  "Redwood",
  "Polar",
  "Meridian",
  "Oakridge",
  "Sunrise",
  "Atlas",
  "Nordic",
  "Cobalt",
  "Riverbend",
  "Highland",
  "Pioneer",
  "Evergreen",
  "Keystone",
  "Lakeside",
  "Crescent",
  "Falcon",
  "Juniper",
  "Orchid",
  "Quarry",
];
const NAME_B = [
  "Components",
  "Logistics",
  "Packaging",
  "Supplies",
  "Metals",
  "Textiles",
  "Foods",
  "Plastics",
  "Tools",
  "Chemicals",
  "Electronics",
  "Print",
  "Freight",
  "Timber",
];
const FIRST = [
  "Anna",
  "Tom",
  "Maria",
  "Jan",
  "Sofia",
  "Lukas",
  "Emma",
  "Piotr",
  "Olivia",
  "Marek",
  "Chloé",
  "Diego",
  "Eva",
  "Noah",
];
const LAST = [
  "Nowak",
  "Smith",
  "Müller",
  "García",
  "Dubois",
  "Jansen",
  "Kowalski",
  "Novák",
  "Brown",
  "Rossi",
  "Fischer",
  "Wójcik",
];
const SEGMENTS = [
  "Manufacturing",
  "Logistics",
  "Retail",
  "Software",
  "Professional services",
  "Hospitality",
  "Food & beverage",
];
const TERMS = ["30 days", "60 days", "Net 45", "Prepaid", "14 days"];
const NOTES = ["", "", "", "Key account", "Check credit limit", "New in 2026", "On hold"];

const slug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const HEADERS = [
  "Customer Name",
  "VAT No.",
  "E-mail",
  "Tel.",
  "Web",
  "Contact Person",
  "Street",
  "Town",
  "Zip",
  "Country",
  "Segment",
  "E-mail",
  "",
  "Payment terms",
];

type Row = string[];

function makeRow(): Row {
  const country = pick(COUNTRIES);
  const base = `${pick(NAME_A)} ${pick(NAME_B)}`;
  const company = `${base} ${country.legal}`;
  const domain = `${slug(base)}.${country.tld}`;
  const first = pick(FIRST);
  const last = pick(LAST);

  const cleanTax = country.taxId();
  const taxId = chance(0.25) ? country.messyTaxId(cleanTax) : chance(0.08) ? "" : cleanTax;

  let email = pick([
    `orders@${domain}`,
    `sales@${domain}`,
    `${slug(first)}.${slug(last)}@${domain}`,
  ]);
  if (chance(0.08)) email = email.replace(/@.*/, (d) => d.toUpperCase());
  if (chance(0.05)) email = ` ${email} `;
  if (chance(0.03)) email = `mailto:${email.trim()}`;

  let website = pick([`https://www.${domain}`, `https://${domain}`, `http://${domain}`]);
  if (chance(0.2)) website = pick([domain, `www.${domain}`]);
  if (chance(0.06)) website = "";

  let phone = country.phone();
  if (chance(0.06)) phone = "";

  let name = company;
  if (chance(0.08)) name = `  ${company.replace(" ", "   ")} `;

  let countryValue = pick(country.variants);
  if (chance(0.03)) countryValue = pick(["Europe", "Narnia"]);

  const street = `${1 + Math.floor(random() * 220)} ${pick(["Market Street", "High Street", "Hauptstraße", "ul. Prosta", "Main St", "Rue de la Paix", "Calle Mayor", "Industrial Park"])}`;

  return [
    name,
    taxId,
    email,
    phone,
    website,
    chance(0.1) ? "" : `${first} ${last}`,
    chance(0.15) ? `Unit ${1 + Math.floor(random() * 9)}, ${street}` : street,
    pick(country.cities),
    country.postal(),
    countryValue,
    chance(0.1) ? "" : pick(SEGMENTS),
    chance(0.4) ? `billing@${domain}` : "",
    pick(NOTES),
    pick(TERMS),
  ];
}

// 172 generated + 12 hand-placed = 184 data rows.
const rows: Row[] = Array.from({ length: 172 }, makeRow);

// Hand-placed cases the tests and the demo rely on. Positions are 0-based data rows.
const special: [number, Row][] = [
  // r-0005: invalid email the e2e test corrects.
  [
    4,
    [
      "Northwind Packaging Ltd",
      "GB 123 456 789",
      "sales(at)northwind-packaging.co.uk",
      "+44 20 7946 0123",
      "northwind-packaging.co.uk",
      "Anna Smith",
      "12 Market Street",
      "Manchester",
      "M1 1AE",
      "UK",
      "Manufacturing",
      "",
      "Key account",
      "30 days",
    ],
  ],
  // Duplicate of r-0005 by tax ID and by name + country.
  [
    9,
    [
      "NORTHWIND PACKAGING LIMITED",
      "gb123456789",
      "orders@northwind-packaging.co.uk",
      "020 7946 0124",
      "https://northwind-packaging.co.uk",
      "Tom Brown",
      "12 Market St",
      "Manchester",
      "M1 1AE",
      "United Kingdom",
      "Manufacturing",
      "",
      "",
      "30 days",
    ],
  ],
  // Names a spreadsheet would execute as formulas.
  [
    14,
    [
      "+Plus Supplies Ltd",
      "GB987654321",
      "hello@plus-supplies.co.uk",
      "+44 161 496 0555",
      "https://plus-supplies.co.uk",
      "Emma Rossi",
      "4 High Street",
      "Leeds",
      "LS2 7EX",
      "GB",
      "Retail",
      "",
      "",
      "Net 45",
    ],
  ],
  [
    21,
    [
      '=HYPERLINK("http://example.com","Click me")',
      "",
      "info@formula-test.example",
      "",
      "",
      "",
      "",
      "",
      "",
      "Germany",
      "Professional services",
      "",
      "Check credit limit",
      "Prepaid",
    ],
  ],
  [
    27,
    [
      "@Home Interiors GmbH",
      "DE811234567",
      "kontakt@home-interiors.de",
      "+49 30 123456",
      "home-interiors.de",
      "Lukas Fischer",
      "Hauptstraße 5",
      "Berlin",
      "10115",
      "Deutschland",
      "Retail",
      "",
      "",
      "60 days",
    ],
  ],
  // Missing required values.
  [
    33,
    [
      "",
      "PL5260001246",
      "biuro@vistula-metals.pl",
      "+48 22 123 45 67",
      "vistula-metals.pl",
      "Piotr Nowak",
      "ul. Prosta 20",
      "Warszawa",
      "00-850",
      "Polska",
      "Manufacturing",
      "",
      "",
      "14 days",
    ],
  ],
  [
    41,
    [
      "Riverbend Foods B.V.",
      "NL123456789B01",
      "N/A",
      "+31 20 555 1234",
      "https://riverbend-foods.nl",
      "Eva Jansen",
      "Damrak 1",
      "Amsterdam",
      "1012 LG",
      "NL",
      "Food & beverage",
      "",
      "",
      "30 days",
    ],
  ],
  [
    48,
    [
      "Highland Timber Ltd",
      "GB555666777",
      "orders@highland-timber.co.uk",
      "ask for Tom",
      "see email",
      "Tom Smith",
      "1 Mill Lane",
      "Glasgow",
      "G2 1AA",
      "",
      "Manufacturing",
      "",
      "",
      "60 days",
    ],
  ],
  // Ambiguous and unknown countries, short phone.
  [
    56,
    [
      "Atlas Freight Inc.",
      "12-3456789",
      "dispatch@atlas-freight.com",
      "123",
      "atlas-freight.com",
      "Noah Brown",
      "500 Main St",
      "Chicago",
      "60601",
      "NA",
      "Logistics",
      "billing@atlas-freight.com",
      "",
      "Net 45",
    ],
  ],
  // Shared email between two different companies.
  [
    63,
    [
      "Cobalt Electronics s.r.o.",
      "CZ12345678",
      "accounts@shared-services.example",
      "+420 222 333 444",
      "https://cobalt-electronics.cz",
      "Eva Novák",
      "Václavské nám. 1",
      "Praha",
      "110 00",
      "Czech Republic",
      "Electronics",
      "",
      "",
      "30 days",
    ],
  ],
  [
    70,
    [
      "Keystone Tools SAS",
      "FR12345678901",
      "accounts@shared-services.example",
      "+33 1 23 45 67 89",
      "keystone-tools.fr",
      "Chloé Dubois",
      "8 Rue de la Paix",
      "Paris",
      "75002",
      "France",
      "Electronics",
      "",
      "",
      "30 days",
    ],
  ],
  // Commas and quotes inside values (CSV quoting).
  [
    77,
    [
      'Baltic "Blue" Logistics Sp. z o.o.',
      "PL7781234567",
      "info@baltic-blue.pl",
      "+48 58 123 45 67",
      "www.baltic-blue.pl",
      "Marek Wójcik",
      "Unit 3, Industrial Park",
      "Gdańsk",
      "80-001",
      "pl",
      "Logistics",
      "",
      "",
      "Prepaid",
    ],
  ],
];
for (const [index, row] of special) rows.splice(index, 0, row);
// Empty rows are skipped by the importer (and reported).
rows.splice(100, 0, Array(HEADERS.length).fill(""));

const isData = (r: Row) => r.some((c) => c !== "");

const csv = Papa.unparse({ fields: HEADERS, data: rows }, { newline: "\r\n", quotes: false });
const csvPath = join(ROOT, "public/samples/customers-messy.csv");
mkdirSync(dirname(csvPath), { recursive: true });
writeFileSync(csvPath, `﻿${csv}\r\n`, "utf8");

// XLSX fixture: a short sheet with different headers, plus a notes sheet so the picker shows.
const xlsxHeaders = [
  "Company",
  "Tax number",
  "Email address",
  "Phone number",
  "Website",
  "Contact",
  "Address",
  "City",
  "Postcode",
  "Country code",
  "Category",
];
const xlsxRows = rows
  .filter(isData)
  .slice(0, 40)
  .map((r) => r.slice(0, 11));

const xlsxPath = join(ROOT, "test/fixtures/customers.xlsx");
mkdirSync(dirname(xlsxPath), { recursive: true });
await writeXlsxFile([
  { sheet: "Customers", data: [xlsxHeaders, ...xlsxRows] },
  {
    sheet: "Read me",
    data: [["Exported from the procurement system."], ["Do not edit the Customers sheet by hand."]],
  },
]).toFile(xlsxPath);

console.log(`Wrote ${csvPath} (${rows.filter(isData).length} data rows)`);
console.log(`Wrote ${xlsxPath} (${xlsxRows.length} data rows, 2 sheets)`);
