# Bench Harness

## Purpose
Provide reproducible, evidence-oriented measurements for extraction behavior without provider non-determinism by default.

## Dataset Format
Datasets are JSONL files under `bench/datasets/`.
Current smoke dataset includes short token cases and one deterministic long-text token case.

Each record includes:
- `caseId`
- `documentText`
- `instructions`
- `targetSchema`
- `providerResponseText`
- `goldSpans` (`extractionClass`, `quote`, `charStart`, `charEnd`)

## Deterministic Protocol
Default mode uses `FakeProvider` with recorded responses.

Run:
```bash
npm run bench:run
npm run bench:score
```

Result file:
- `bench/results/latest.json`

## Reported Metrics
- `successRate`: case-level runs with zero shard failures.
- `schemaValidityRate`: extraction shape validity.
- `quoteInvariantPassRate`: quote/span invariant pass rate.
- `coverageRate`: matched gold spans / total gold spans.
- `extractionCountMean` and `extractionCountVariance`.

## Variance-aware Mode
Run multiple trials:
```bash
npm run bench:run -- --mode variance --trials 5
npm run bench:score -- --result bench/results/latest.json
```

Variance mode aggregates metrics across trials and reports extraction-count variance.

## Limitations
- Deterministic mode does not measure provider/model stochastic variance.
- Current dataset is small and synthetic; expand datasets before drawing production conclusions.
- Coverage metrics are span-based and do not score semantic attribute correctness.
