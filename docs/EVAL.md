# Evaluation

## Deterministic suite

- `npm test` already includes deterministic eval tests.
- Explicit run command: `node tests/run.ts`.
- Seeded property invariants are included in
  `tests/core/property-invariants.test.ts`:
  - hash determinism over generated corpora,
  - quote/offset invariant stability over generated spans,
  - span mapping stability over generated shards.
- Property runs use fixed seed labels (`property-core-invariants-seed-01..03`)
  through `createDeterministicPrng(seed)` from `src/core/prng.ts`, so reruns in
  Node/Deno/Bun produce identical sequences.

## Optional real-provider eval mode

- Use `runSuite({ providerMode: "real", realProvider })` with configured
  provider instances.
- This mode is optional and intended for manual evaluation when credentials
  exist.

## Bench harness

- Dataset files live under `bench/datasets/`.
- `bench/datasets/smoke.jsonl` includes deterministic short-text and long-text
  cases.
- `bench/datasets/regression.jsonl` stores committed regression records from
  validated regression datasets.
- Deterministic benchmark run:
  - `npm run bench:run`
  - `npm run bench:score`
- Variance-aware run:
  - `npm run bench:run -- --mode variance --trials 5`
  - `npm run bench:score -- --max-case-outcome-drift-rate 0.1 --max-success-rate-stddev 0.05`

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

The bench runner validates every regression record before trials execute and
exits non-zero if any record is malformed.

## Contributor workflow for regression records

1. Add new regression entries directly to `bench/datasets/regression.jsonl`.
2. For each new entry, include `sourceUrl`, `sourceQuote`, `expected`, and a
   deterministic `caseId`.
3. Add or update a matching regression test file under `tests/regression/` so
   the new records execute in `npm test`.
4. Run the regression runner:
   - `npm run bench:run`
   - `npm run bench:score`
5. Run the full repository matrix before opening a PR:
   - `npm run test:deno`
   - `npm run test:bun`
   - `npm run test:workers`
   - `npm run test:browser`
   - `npm run bench`
   - `npm run check`

## Metrics

- `schemaValidRate`: fraction of extracted records with valid structural shape.
- `quoteInvariantRate`: fraction of extracted records that satisfy quote/offset
  invariant.
- `uniqueExtractionStability`: pairwise Jaccard stability of unique extraction
  keys across runs.
- `variance`: run-level extraction count statistics (`min`, `max`, `mean`,
  `stability`).
- Bench aggregate variance diagnostics:
  - `extractionCountVariance` and `extractionCountStdDev`
  - `successRateStdDev`
  - `caseOutcomeDriftRate` (fraction of cases whose result signature changes
    across trials)
- Bench breadth diagnostics:
  - `breadth.totalCaseCount`
  - `breadth.regressionCategoryCount`

## Interpretation

- Deterministic fake-mode suite should remain at `1.0` for
  schema/quote/stability.
- Drops in `quoteInvariantRate` indicate grounding regressions.
- Drops in `uniqueExtractionStability` indicate output drift across repeated
  runs.
- Increases in `caseOutcomeDriftRate` indicate unstable trial outcomes.
- Low `breadth.regressionCategoryCount` indicates eval breadth erosion even when
  headline rates stay high.
