# Evaluation

## Deterministic suite
- `npm test` already includes deterministic eval tests.
- Explicit run command: `node tests/run.ts`.

## Optional real-provider eval mode
- Use `runSuite({ providerMode: "real", realProvider })` with configured provider instances.
- This mode is optional and intended for manual evaluation when credentials exist.

## Bench harness
- Dataset files live under `bench/datasets/`.
- `bench/datasets/smoke.jsonl` includes deterministic short-text and long-text cases.
- `bench/datasets/regression.jsonl` stores committed regression records from validated public packs.
- Deterministic benchmark run:
  - `npm run bench:run`
  - `npm run bench:score`
- Variance-aware run:
  - `npm run bench:run -- --mode variance --trials 5`

## Regression dataset format
Each line in `bench/datasets/regression.jsonl` is one JSON object with:

- `caseId` (string, unique in file)
- `category` (string)
- `documentText` (string)
- `instructions` (string)
- `targetSchema` (object)
- `providerResponseText` (string)
- `expected` object:
  - `emptyResultKind` (`non_empty` | `empty_by_evidence` | `empty_by_failure`)
  - `minExtractions` (integer, >= 0)
  - `maxExtractions` (integer, >= `minExtractions`)
- `sourceUrl` (URL string)
- `packId` (string)

The bench runner validates every regression record before trials execute and exits non-zero if any record is malformed.

## Contributor workflow for regression records
1. Prepare a public pack in the workbench and validate it with workbench validators.
2. Append the pack's `regressions.jsonl` records to `bench/datasets/regression.jsonl`.
3. Run:
   - `npm run bench:run`
   - `npm run bench:score`
4. Run the full repository matrix before opening a PR.

## Metrics
- `schemaValidRate`: fraction of extracted records with valid structural shape.
- `quoteInvariantRate`: fraction of extracted records that satisfy quote/offset invariant.
- `uniqueExtractionStability`: pairwise Jaccard stability of unique extraction keys across runs.
- `variance`: run-level extraction count statistics (`min`, `max`, `mean`, `stability`).

## Interpretation
- Deterministic fake-mode suite should remain at `1.0` for schema/quote/stability.
- Drops in `quoteInvariantRate` indicate grounding regressions.
- Drops in `uniqueExtractionStability` indicate output drift across repeated runs.
