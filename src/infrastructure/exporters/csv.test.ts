import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import type { ExportPlan } from "@/domain/export/build-export";
import { serializeCsv } from "./csv";

const plan = (rows: string[][]): ExportPlan => ({
  columns: ["companyName", "phone"],
  rows,
  includedRowIds: rows.map((_, i) => `r-${i}`),
  excluded: [],
  counts: {
    included: rows.length,
    excludedByUser: 0,
    excludedForErrors: 0,
    includedWithWarnings: 0,
    includedWithErrors: 0,
  },
});

describe("serializeCsv", () => {
  it("writes a header of field keys, CRLF line endings and an optional BOM", () => {
    const csv = serializeCsv(plan([["Acme", "+44 20 7946 0000"]]), {
      delimiter: ",",
      includeBom: true,
    });
    expect(csv).toBe("﻿companyName,phone\r\nAcme,+44 20 7946 0000\r\n");
    expect(serializeCsv(plan([]), { delimiter: ";", includeBom: false })).toBe(
      "companyName;phone\r\n",
    );
  });

  it("neutralizes formula injection but leaves numbers and phone numbers alone", () => {
    const csv = serializeCsv(
      plan([
        ['=HYPERLINK("http://evil","x")', "-12.5"],
        ["+Plus Supplies Ltd", "+44 20 7946 0000"],
        ["@Home GmbH", "-cmd|' /C calc'!A0"],
      ]),
      { delimiter: ",", includeBom: false },
    );
    const parsed = Papa.parse<string[]>(csv.trim()).data;
    expect(parsed.slice(1)).toEqual([
      ['\'=HYPERLINK("http://evil","x")', "-12.5"],
      ["'+Plus Supplies Ltd", "+44 20 7946 0000"],
      ["'@Home GmbH", "'-cmd|' /C calc'!A0"],
    ]);
  });

  it("quotes values containing delimiters, quotes and newlines", () => {
    const csv = serializeCsv(plan([['Acme "Blue", Ltd', "a\nb"]]), {
      delimiter: ",",
      includeBom: false,
    });
    expect(csv).toContain('"Acme ""Blue"", Ltd","a\nb"');
  });
});
