# ADR 0001: Parse files in the browser

- Status: accepted
- Date: 2026-10-17

## Context

Customer files contain personal and commercial data: contact names, emails, phone numbers, tax IDs. The app has to run as a demo on Vercel without a database. Vercel serverless functions cap request bodies at 4.5 MB, and anything uploaded to a function also passes through its logs, memory and any observability tooling attached to it.

The only server-side step that needs to see the file at all is the AI mapping suggestion, and that step needs to know what the columns _are_, not what they _contain_.

## Decision

CSV and XLSX files are parsed in the browser (Papa Parse, read-excel-file). The parsed dataset lives only in client memory. The server receives a **column profile**: header name plus aggregate statistics (share of email-like, URL-like, numeric, phone-like and country-like values, empty ratio, distinct ratio, average length). Up to three sample values per column (each cut to 60 characters) are sent only after an explicit opt-in toggle on the mapping screen.

Validation, corrections and export also run in the browser.

## Consequences

- No upload endpoint, no body-size limit to work around, no file storage to secure.
- The privacy claim is simple to state and to verify: open the network tab, there is no file in it.
- The whole dataset must fit in browser memory. Limits are enforced in one place (`src/domain/dataset/limits.ts`): 10 MB, 20 000 rows, 150 columns.
- Large files block the main thread while parsing. Acceptable at these limits; a Web Worker is the next step if limits grow.
- There is no server-side record of the data, so a reload loses work. This is intentional (see README, Known limitations).
