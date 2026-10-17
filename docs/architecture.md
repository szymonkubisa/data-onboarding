# Architecture

> v1, written before implementation. Updated as slices land; the final version is at the end of the build.

## Principles

1. **AI suggests, a person approves, deterministic code executes.** The LLM only proposes a column mapping. See [ADR 0003](adr/0003-ai-suggests-deterministic-executes.md).
2. **The file stays in the browser.** The server sees a column profile, never rows. See [ADR 0001](adr/0001-client-side-parsing.md).
3. **Framework-free domain.** `src/domain` is plain TypeScript and Zod. Lint rules enforce it.
4. **Zod at every boundary.** Request bodies, API responses, LLM output, interrupt resume values.
5. **Derived state is never stored.** See [ADR 0004](adr/0004-zustand-and-derived-state.md).

## Layers

```
src/
  domain/          dataset, schema, mapping, quality, export   (pure TS + zod)
  contracts/       API request/response schemas shared by route handlers and the client
  infrastructure/  parsers (CSV, XLSX), exporters (CSV), ai (server-only: LLM adapter, LangGraph)
  application/     workflow store, transitions, selectors, API client      (client)
  features/        import, mapping, validation, export: components + hooks (client)
  components/      ui (shadcn), layout (shell, stepper, footer), shared
  app/             routes; app/api is the only consumer of infrastructure/ai
```

Allowed dependency direction (enforced by `no-restricted-imports`, see `eslint.boundaries.mjs`):

- `domain` imports nothing from the app and no framework or IO library.
- `infrastructure` imports `domain`, never React or UI layers.
- `application` imports `domain`, `contracts` and client-safe `infrastructure` (parsers, exporters).
- `features` and `components` never import `infrastructure/ai` (additionally guarded by `server-only`).

## Flow

```
Browser                                              Server (route handlers)
───────                                              ───────────────────────
File ─► parse (Papa / read-excel-file) ─► SourceDataset
                       │
                       ├─► profileColumns ──────────► POST /api/mapping/suggest
                       │                              LangGraph: analyse → generate → validate
                       │                                         (retry / fallback) → interrupt
                       │   ◄──────── suggestions ─────
                       │
  person edits decisions ─────────────────────────► POST /api/mapping/review
                       │                              resume → validateApprovedMapping
                       │   ◄── approved | needs-changes (re-interrupt)
                       │
                       ├─► runQualityPipeline (transform, validate, dedupe)
                       │     + corrections, accepted fixes, exclusions (overlays)
                       │
                       └─► buildExport ─► CSV (formula-escaped) + JSON report
```

## AI graph

See [ADR 0002](adr/0002-langgraph-memorysaver-rehydration.md) for the graph, checkpointing and rehydration.

## Limits

| Limit                       | Value                            |
| --------------------------- | -------------------------------- |
| File size                   | 10 MB                            |
| Rows                        | 20 000                           |
| Columns                     | 150                              |
| Header length               | 200 characters                   |
| Samples sent to AI (opt-in) | 3 per column, 60 characters each |
