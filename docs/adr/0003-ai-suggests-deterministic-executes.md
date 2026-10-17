# ADR 0003: AI suggests, a person approves, deterministic code executes

- Status: accepted
- Date: 2026-10-17

## Context

An LLM is good at reading `"E-mail addr."`, `"Kontakt"` and `"VAT No"` and guessing which target field each one means. It is not a reliable way to transform 20 000 rows: it is slow, costly, non-deterministic, and when it is wrong it is wrong silently.

## Decision

The LLM has exactly one job: propose a mapping from source columns to schema fields, with a confidence estimate and a one-sentence reason. Everything else is plain TypeScript in `src/domain`:

- Model output is parsed with Zod and then repaired by domain rules (unknown columns dropped, unknown fields nulled, duplicate targets resolved by confidence, missing columns added as unmapped, confidence clamped). The same code validates the heuristic suggester's output.
- A person accepts, changes or ignores each suggestion. Nothing is applied until they approve.
- Transformations and validation (trim, email, URL, country normalization, tax ID formatting, duplicate detection) are pure functions with table-driven tests. Each change is recorded with `from` and `to`; nothing is invented.
- Without an API key, the app runs a deterministic heuristic suggester (synonyms, string similarity, value patterns) and says so in the UI.

Confidence is shown in three buckets (High ≥ 0.8, Medium ≥ 0.5, Low < 0.5) and labelled as a model estimate, not a calibrated probability.

## Consequences

- Same input, same output, for everything except the suggestion step.
- The suggestion step can be tested without a live model: a fake suggester and `FakeListChatModel` cover the retry, fallback and re-review paths.
- The demo is fully usable without a key, which also makes it reviewable in CI.
