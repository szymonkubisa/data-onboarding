# ADR 0004: Zustand for source state, everything else derived

- Status: accepted
- Date: 2026-10-17

## Context

The workflow has four steps that depend on each other: a new file invalidates the mapping, a changed mapping invalidates corrections for fields that are no longer mapped, corrections change validation results, validation results change what is exported. Storing derived results (issues, quality report, export preview) next to their inputs is the usual way these apps drift into inconsistent states.

## Decision

- One Zustand store (`src/application/workflow/store.ts`) holds only **source state**: the dataset, the schema id, a copy of the AI session result, the user's mapping decisions, the approved mapping, and three overlays (cell corrections, accepted fix ids, excluded row ids), plus export options.
- Every state change goes through a pure function in `transitions.ts`. Invariants live there and are unit-tested without React: a new dataset resets everything downstream; any change to the mapping clears the approval and drops corrections for fields that are no longer mapped; changing the sample-consent toggle discards the current suggestions.
- Mapping issues, the quality report and the export preview are **derived** in `selectors.ts` with reference-equality memoization. They are never stored.
- The original dataset is never mutated. Corrections and fixes are overlays keyed by `rowId:field` and issue id.
- Table sorting, filters, pagination and dialog state stay in component state.

## Consequences

- One place to read to understand what can change and what it resets.
- Undo of a correction is just removing a key from the overlay; "revert to original" is always possible.
- The quality pipeline re-runs when an overlay changes. At 20 000 rows × 11 fields this takes tens of milliseconds, which is fine for a click-driven UI.
- No persistence across reloads, by design (data can be sensitive). A confirmation dialog protects against replacing work by dropping a new file.
