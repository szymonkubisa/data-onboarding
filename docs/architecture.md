# Architecture

## Principles

1. **AI suggests, a person approves, deterministic code executes.** The LLM only proposes a column mapping. See [ADR 0003](adr/0003-ai-suggests-deterministic-executes.md).
2. **The file stays in the browser.** The server sees a column profile, never rows. See [ADR 0001](adr/0001-client-side-parsing.md).
3. **Framework-free domain.** `src/domain` is plain TypeScript and Zod.
4. **Zod at every boundary.** Request bodies, API responses, LLM output, interrupt resume values, the record contract.
5. **Derived state is never stored.** See [ADR 0004](adr/0004-zustand-and-derived-state.md).

## Layers

```
src/
  domain/          dataset · schema · mapping · quality · export          pure TS + zod
  contracts/       request/response schemas for /api/mapping/*            zod + domain
  infrastructure/
    parsers/       CSV (Papa Parse), XLSX (read-excel-file), shared limits  browser
    exporters/     CSV with formula-injection guard                        browser
    ai/            config, suggester port + adapters, LangGraph graph      server-only
  application/     workflow store, transitions, selectors, API client      browser
  features/        import · mapping · validation · export (components + hooks)
  components/      ui (shadcn) · layout (shell, stepper, footer, guard) · shared
  app/             routes; app/api/mapping/* is the only consumer of infrastructure/ai
```

Dependency direction:

```
app/(workspace) ─► features, components ─► application ─► contracts ─► domain
                                     └──► infrastructure/parsers, exporters ─► domain
app/api ─► contracts, infrastructure/ai ─► domain
```

The rules live in [`eslint.boundaries.mjs`](../eslint.boundaries.mjs) as `no-restricted-imports` blocks (to be spread into `eslint.config.mjs`; the current code passes them): `domain/` may not import React, Next, LangChain, parsers, Zustand or any outer layer; `infrastructure/` may not import React or UI; `application/`, `features/` and `components/` may not import `infrastructure/ai` (which additionally starts with `import "server-only"`).

## Request flow

```
Browser                                                 Server (route handlers)
───────                                                 ───────────────────────
File ─► parseFile (Papa / read-excel-file) ─► buildDataset ─► SourceDataset (in memory)
          │
          ├─► profileColumns  ─── names + ratios ────────► POST /api/mapping/suggest
          │   (+ samples only with consent)                 graph: analyse → generate → validate
          │                                                        (retry once / fallback)
          │   ◄────────────── suggestions, origin ──────── interrupt at humanReview
          │
          ├─ person accepts / changes / ignores
          │                                                 POST /api/mapping/review
          │   ─── decisions (+ echoed suggestions, profile) ─► resume (or rehydrate + resume)
          │   ◄── approved | needs-changes (re-interrupt) ── validateApprovedMapping
          │
          ├─► runQualityPipeline (memoized selector)
          │     projection → corrections → auto transforms → accepted fixes
          │     → field rules → required + Zod record contract → duplicates → status
          │
          └─► buildExport ─► serializeCsv (formula-escaped) + buildExportReport (JSON)
```

## AI graph

```
START → analyseSource → generateSuggestions ─(provider error)──────────────► heuristicFallback ─┐
                              ▲                                                                  │
                              └─(invalid, attempt < 2)── validateOutput ─(ok)─► humanReview ◄────┘
                                                              │                  │  ▲
                                         (invalid, exhausted) ▼                  ▼  │ (blocking issues)
                                                     heuristicFallback   validateApprovedMapping ─(ok)─► END
```

| Node                      | Kind              | What it does                                                                                                                  |
| ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `analyseSource`           | deterministic     | Cleans headers, enforces the column limit, attaches consented samples, finds exact synonym hits passed to the model as hints. |
| `generateSuggestions`     | LLM or heuristics | Calls the injected `MappingSuggester` with the profile, hints and, on retry, the previous validation problems.                |
| `validateOutput`          | deterministic     | Zod parse of the raw output, then domain repair (`normalizeSuggestions`). Garbage → retry once.                               |
| `heuristicFallback`       | deterministic     | Heuristic suggestions, labelled with the reason (`provider-error` / `invalid-output`).                                        |
| `humanReview`             | interrupt         | Pauses with `{ suggestions, issues }`. The resume value is parsed with Zod.                                                   |
| `validateApprovedMapping` | deterministic     | `validateMapping`; blocking issues send the thread back to `humanReview`.                                                     |

Checkpointing, rehydration and the production path are in [ADR 0002](adr/0002-langgraph-memorysaver-rehydration.md).

## Quality pipeline

`runQualityPipeline({ dataset, schema, mapping, corrections, acceptedFixes, excludedRowIds })` is pure. For each row and mapped field:

1. **Projection**: the mapped column's raw value. Unmapped fields are empty; nothing is invented.
2. **Corrections**: a value typed by the person replaces the raw one (recorded as `manual`).
3. **Auto transforms**, applied and recorded with `from`/`to`: whitespace, placeholder tokens (`N/A`, `null`, `-`) to empty, lowercase email domain, canonical country name.
4. **Suggested fixes**, applied only when accepted: `https://` for bare domains, compact tax IDs.
5. **Field rules** by kind: email, URL (http/https, dotted host), phone (letters, too few digits), country (ISO 3166 table, `NA` treated as ambiguous).
6. **Record rules**: required fields, then the schema's Zod contract as the final word.
7. **Duplicates** across rows that are not excluded: union-find over tax ID, email, and company name + country. Never merged.

## State

| State                                                                                                                  | Owner                            |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| dataset, schema, AI session copy, decisions, approved mapping, corrections, accepted fixes, exclusions, export options | Zustand store (one per provider) |
| mapping issues, mapping summary, quality report, export plan, column profile                                           | memoized selectors               |
| profile, attempts, raw model output, review issues                                                                     | LangGraph thread (server)        |
| filters, pagination, open popovers and dialogs                                                                         | component state                  |

## Limits

| Limit                       | Value                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| File size                   | 10 MB                                                                                     |
| Rows                        | 20 000                                                                                    |
| Columns                     | 150                                                                                       |
| Header length               | 200 characters                                                                            |
| Samples sent to AI (opt-in) | 3 per column, 60 characters each                                                          |
| Request body                | 256 KB                                                                                    |
| Model attempt               | 30 s, at most 2 attempts within a 50 s request budget; a timeout falls back to heuristics |
