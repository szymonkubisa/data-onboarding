# ADR 0005: read-excel-file for XLSX

- Status: accepted
- Date: 2026-10-17

## Context

The app needs to read `.xlsx` files in the browser. It never writes them.

- `xlsx` (SheetJS) on npm is frozen at 0.18.5 with known advisories (prototype pollution, ReDoS). Newer builds are distributed only from the vendor's CDN, outside the npm audit trail.
- `exceljs` covers reading and writing, is much larger, and its last release was in December 2024.
- `read-excel-file` reads only, is actively maintained, works in the browser, and has a small dependency tree (`fflate`, `saxen`).

## Decision

Use `read-excel-file/browser`. Read all cells as strings (dates and numbers are rendered the way the parser reports them, then trimmed), let the user pick a sheet when the workbook has more than one, and feed the resulting matrix into the same `buildDataset` function the CSV parser uses.

## Consequences

- Small bundle, no known advisories, one code path for CSV and XLSX after the matrix stage.
- Legacy `.xls` (BIFF) files are not supported. The dropzone rejects them with a message asking for `.xlsx` or `.csv`.
- Formula cells are read as their cached values, which is what a person sees in Excel.
