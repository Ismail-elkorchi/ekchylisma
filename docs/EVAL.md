# Evaluation

## Deterministic suite
- `npm test` already includes deterministic eval tests.
- Explicit run command: `node tests/run.ts`.

## Optional real-provider eval mode
- Use `runSuite({ providerMode: "real", realProvider })` with configured provider instances.
- This mode is optional and intended for manual evaluation when credentials exist.

## Metrics
- `schemaValidRate`: fraction of extracted records with valid structural shape.
- `quoteInvariantRate`: fraction of extracted records that satisfy quote/offset invariant.
- `uniqueExtractionStability`: pairwise Jaccard stability of unique extraction keys across runs.
- `variance`: run-level extraction count statistics (`min`, `max`, `mean`, `stability`).

## Interpretation
- Deterministic fake-mode suite should remain at `1.0` for schema/quote/stability.
- Drops in `quoteInvariantRate` indicate grounding regressions.
- Drops in `uniqueExtractionStability` indicate output drift across repeated runs.
