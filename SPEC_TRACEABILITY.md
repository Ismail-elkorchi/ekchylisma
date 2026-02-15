# SPEC_TRACEABILITY

This matrix maps each `REQ-*` in `MASTER_SPEC.md` to implementation evidence in code, tests, and CI.

Legend:
- `implemented`: mapped to code + tests + CI signal.
- `partial`: partially covered; follow-up needed.
- `gap`: not yet implemented; rationale explicitly stated.

| REQ | Code Location(s) | Test(s) | CI Job(s) | Status | Gap / Rationale |
| --- | --- | --- | --- | --- | --- |
| REQ-2.3.1 | `package.json` | `tools/orphan-check.ts` | `node` | implemented | `dependencies` is `{}`. |
| REQ-2.3.2 | `docs/DEVDEPS.md`, `docs/DECISIONS.md`, `package.json` (`devDependencies.miniflare`) | `tests/workers/harness.test.ts` | `workers` | implemented | `miniflare` is documented with explicit debt rationale in ADR-0015. |
| REQ-2.3.3 | `docs/PORTABILITY.md`, `examples/*`, `tests/workers/harness.test.ts` | `tests/run.ts`, `tests/workers/harness.test.ts` | `node`, `deno`, `bun`, `workers` | implemented | Required runtime targets are covered; browser remains best-effort. |
| REQ-4.1.1 | `src/core/*`, `src/providers/*` | `tests/core/*`, `tests/providers/*` | `node`, `deno`, `bun` | implemented | Core uses Web APIs (`fetch`, `crypto.subtle`, streams). |
| REQ-4.1.2 | `src/index.ts`, `src-node/fs.ts`, `package.json` exports | `tests/io/jsonl.test.ts` | `node` | implemented | Node-only fs isolated under `./node` subpath. |
| REQ-4.2.1 | `.github/workflows/ci.yml` | `tests/run.ts` | `node`, `deno`, `bun` | implemented | Multi-runtime CI matrix exists. |
| REQ-4.2.2 | `examples/workers/worker.ts`, `tests/workers/harness.test.ts`, `package.json` (`test:workers`) | `tests/workers/harness.test.ts` | `workers` | implemented | Workers compatibility validated by Miniflare harness in CI. |
| REQ-4.2.3 | n/a | n/a | n/a | gap | Browser harness not yet implemented. |
| REQ-6.1.1 | `src/core/types.ts` (`DocumentInput`), `src/engine/run.ts` (`runWithEvidence`) | `tests/engine/run-with-evidence.test.ts` | `node`, `deno`, `bun` | implemented | Document input is explicit and run through public API. |
| REQ-6.2.1 | `src/core/types.ts` (`Program`) | `tests/providers/fake-e2e.test.ts` | `node`, `deno`, `bun` | partial | Program is structured but does not yet mirror full master-spec shape. |
| REQ-6.3.1 | `src/schema/s.ts`, `src/schema/validate.ts`, `src/schema/toJsonSchema.ts`, `contracts/json-schema-subset.schema.json` | `tests/schema/*` | `node`, `deno`, `bun` | implemented | Subset documented + validated + generated. |
| REQ-6.4.1 | `src/core/types.ts` (`Extraction`) | `tests/core/invariants.test.ts` | `node`, `deno`, `bun` | partial | Fields present via nested `span`; top-level char offsets differ from master example. |
| REQ-6.5.1 | `src/core/types.ts` (`EvidenceBundle`, `RunDiagnostics`, `ShardOutcome`), `src/engine/run.ts` (`runWithEvidence`), `contracts/evidence-bundle.schema.json` | `tests/engine/run-with-evidence.test.ts`, `tests/io/jsonl.test.ts` | `node`, `deno`, `bun` | implemented | Run path now emits evidence bundles with provenance, normalization ledger, shard outcomes, and failures. |
| REQ-7.1.1 | `src/core/invariants.ts` | `tests/core/invariants.test.ts` | `node`, `deno`, `bun` | implemented | Quote/offset invariant enforced. |
| REQ-7.1.2 | `src/core/invariants.ts` | `tests/core/invariants.test.ts` | `node`, `deno`, `bun` | partial | Rejection exists; repair logging path not fully represented in run diagnostics yet. |
| REQ-7.2.1 | `src/core/normalize.ts`, `src/core/types.ts` | `tests/core/normalize.test.ts` | `node`, `deno`, `bun` | partial | Explicit lossy flag exists; reversible mapping currently absent by design. |
| REQ-7.3.1 | `src/providers/*` | `tests/providers/real-providers.test.ts` | `node`, `deno`, `bun` | implemented | Model IDs treated opaquely. |
| REQ-7.4.1 | `src/engine/run.ts` (`runWithEvidence`) | `tests/engine/run-with-evidence.test.ts` | `node`, `deno`, `bun` | implemented | Diagnostics classify `non_empty`, `empty_by_evidence`, and `empty_by_failure` explicitly. |
| REQ-8.1.1 | `src/engine/chunk.ts` | `tests/engine/chunk-map-span.test.ts` | `node`, `deno`, `bun` | implemented | Chunk size, overlap, deterministic IDs. |
| REQ-8.1.2 | `src/engine/chunk.ts` | `tests/engine/chunk-map-span.test.ts` | `node`, `deno`, `bun` | partial | Hash currently uses `programHash + shardText`; missing documentId + shard params in hash input. |
| REQ-8.2.1 | n/a | n/a | n/a | gap | Multi-pass execution model not yet implemented. |
| REQ-8.3.1 | `src/engine/execute.ts`, `src/engine/run.ts` | `tests/engine/checkpoint-retry-executor.test.ts` | `node`, `deno`, `bun` | partial | Partial execution works at shard executor level; evidence classification still limited. |
| REQ-8.3.2 | `src/engine/checkpoint.ts`, `src/engine/execute.ts`, `src-node/fs.ts` | `tests/engine/checkpoint-retry-executor.test.ts` | `node`, `deno`, `bun` | implemented | In-memory + node adapter pathways exist. |
| REQ-9.1.1 | `src/providers/types.ts`, `src/providers/openai.ts`, `src/providers/gemini.ts`, `src/providers/ollama.ts` | `tests/providers/real-providers.test.ts` | `node`, `deno`, `bun` | partial | Interface provides `generate`; no dedicated `generateStructured` split yet. |
| REQ-9.1.2 | `src/providers/*` | `tests/providers/real-providers.test.ts` | `node`, `deno`, `bun` | implemented | Base URL + header support without model rewriting. |
| REQ-9.2.1 | `src/json/extractJson.ts`, `src/json/repair.ts`, `src/json/parse.ts`, `src/json/pipeline.ts`, `src/engine/run.ts` | `tests/json/*`, `tests/engine/json-pipeline-run.test.ts` | `node`, `deno`, `bun` | implemented | Engine run path uses bounded extract+repair+strict parse pipeline with explicit logs. |
| REQ-9.2.2 | `src/json/repair.ts` | `tests/json/repair.test.ts` | `node`, `deno`, `bun` | partial | Repair is bounded by fixed steps; explicit attempt/time/token budgets not surfaced. |
| REQ-10.1 | `src/engine/promptCompiler.ts`, `src/providers/*` | `tests/engine/prompt-compiler.test.ts` | `node`, `deno`, `bun` | partial | No eval/shell execution paths; explicit allowlist utilities can be expanded. |
| REQ-10.2 | `src/engine/promptCompiler.ts` | `tests/engine/prompt-compiler.test.ts` | `node`, `deno`, `bun` | gap | Safe interpolation helper + prompt hash logging not explicit API yet. |
| REQ-10.3 | `src/viz/html.ts` | `tests/viz/html.test.ts` | `node`, `deno`, `bun` | implemented | HTML escaping is default behavior. |
| REQ-11.1.1 | `src/core/*`, `src/engine/*`, `src/json/*`, `src/providers/*` | `tests/core/*`, `tests/engine/*`, `tests/json/*`, `tests/providers/*` | `node`, `deno`, `bun` | partial | Model-id opacity and parser tolerance covered; property tests not yet present. |
| REQ-11.2.1 | `src/eval/runSuite.ts` | `tests/eval/run-suite.test.ts` | `node`, `deno`, `bun` | partial | Variance harness exists; seed/temperature/prompt-variant controls limited. |
| REQ-11.3.1 | n/a | n/a | n/a | gap | Long-text fixture suite absent. |
| REQ-12.1 | GitHub PR workflow + branch protections (process) | n/a | `pull_request` workflows | implemented | Enforced by process in this repository workflow. |
| REQ-12.2 | `.github/workflows/ci.yml`, `.github/dependabot.yml`, `tools/oss-check.ts` | CI status checks, `npm run oss-check` | `node`, `deno`, `bun`, `workers` | implemented | CI runs on `pull_request`, uses least-privilege permissions, and pins actions by SHA. |
| REQ-12.3 | `tools/orphan-check.ts`, `tools/oss-check.ts`, `docs/OSS_PRACTICES.md`, `package.json` (`check`) | `npm run orphan-check`, `npm run oss-check` | `node` | implemented | Export/contract/doc coherence and OSS operations checks are enforced in default validation. |
| REQ-13.1 | `LICENSE`, `NOTICE` | n/a | n/a | implemented | Apache-2.0 license text and project notice are present at repo root. |
| REQ-14.1 | `src/*`, `src-node/*`, `contracts/*`, `docs/*`, `tests/*`, `tools/*` | `npm run orphan-check` | `node` | partial | Layout is close; differs from exact `/src/node` and `/scripts` naming convention. |

## Explicit Known Gaps

These gaps are intentionally tracked and should be resolved in follow-up implementation work:
- REQ-11.3.1 long-text regression fixtures.
