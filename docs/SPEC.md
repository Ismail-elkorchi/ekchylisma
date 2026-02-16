# ekchylisma Spec

This file is the implementation-facing spec derived from `MASTER_SPEC.md`.

## Prompt-01 anti-drift summary (5 bullets)

- Core contracts are required: `Program`, grounded `Extraction`, and auditable
  `EvidenceBundle`.
- Quote invariant is mandatory: `document.slice(charStart, charEnd) === quote`.
- Core code must stay web-API-first and avoid Node-only APIs.
- Runtime dependencies are forbidden; `package.json` keeps `dependencies` empty.
- Docs, contracts, and tests must evolve together and pass `npm run check`.

## Prompt-02 anti-drift summary (5 bullets)

- Schema DSL is dependency-free and implemented with local builders only.
- `validate()` returns deterministic structured errors with JSON pointer paths.
- JSON Schema generation is constrained to the documented project subset.
- Optional fields are represented explicitly and compile-time inference is
  preserved.
- Every new schema API is mirrored in docs, contracts, and tests.

## Prompt-03 anti-drift summary (5 bullets)

- JSON extraction must deterministically find the first complete object/array
  payload in mixed text.
- Repair operations are bounded and explicitly allow-listed.
- Every applied (or skipped) repair step is logged in a `RepairLog`.
- JSON parsing is strict and returns rich structured diagnostics on failure.
- JSONL is detected heuristically, but JSONL streaming IO remains out of scope
  until the IO prompt.

## Prompt-04 anti-drift summary (5 bullets)

- Chunking is char-based and overlap-aware to preserve deterministic shard
  boundaries.
- Shards carry `start`/`end` offsets and text slices for global mapping.
- `shardId` is derived from hash material containing `programHash`,
  `documentId`, shard parameters, shard range, and shard text slice.
- Shard-local spans must map back to global document offsets without ambiguity.
- Overlap tradeoffs are documented for recall-vs-cost behavior.

## Prompt-05 anti-drift summary (5 bullets)

- Checkpoint persistence is abstracted behind a runtime-agnostic
  `CheckpointStore` interface.
- Checkpoint keys are deterministic and include run identity for idempotent
  resume behavior.
- Retry policy functions are pure and deterministic from explicit inputs.
- Executor skips completed shards and only retries transient failures.
- Fault-injection tests must prove eventual completion after transient shard
  failures.

## Prompt-06 anti-drift summary (5 bullets)

- Provider integration uses a runtime-agnostic interface with fetch-like
  request/response contracts.
- `FakeProvider` deterministically maps request hash to response text for
  offline tests.
- Provider errors are explicitly classified as transient or permanent.
- Engine can run end-to-end with `FakeProvider`, producing grounded extractions.
- Quote invariants remain enforced after provider payload mapping.

## Prompt-07 anti-drift summary (5 bullets)

- Real providers are implemented with `fetch` plus explicit config objects only.
- Providers never read `process.env` directly; callers pass credentials/config.
- OpenAI and Gemini support JSON schema controlled generation when schema is
  provided.
- Ollama uses `/api/chat` with JSON mode/schema where available.
- Integration tests are present and intentionally skipped when credentials are
  absent.

## Prompt-08 anti-drift summary (5 bullets)

- Prompt compiler output is deterministic and schema-aware.
- Prompt format uses explicit trusted instructions and untrusted document
  boundaries.
- Raw shard text is included verbatim between fixed markers.
- Compiler output is consumed by provider request generation to avoid orphaned
  logic.
- Threat model docs map OWASP risks to concrete mitigations.

## Prompt-09 anti-drift summary (5 bullets)

- JSONL encode/decode logic lives in core without filesystem APIs.
- Decoder accepts string or `ReadableStream` input and yields async iterable
  bundles.
- Node filesystem helpers are isolated behind `ekchylisma/node` subpath export.
- Core and Node adapter boundaries stay explicit to preserve portability.
- Roundtrip tests validate JSONL codec determinism.

## Prompt-10 anti-drift summary (5 bullets)

- Visualization output is a single self-contained HTML string.
- HTML embeds CSS, JS, and serialized data payload for offline viewing.
- UI supports filtering by extraction class.
- Highlights are rendered from grounded span indices.
- A Node example writes the generated HTML file through node adapter utilities.

## Prompt-11 anti-drift summary (5 bullets)

- Evaluation harness supports deterministic fake-provider mode for drift
  detection.
- Optional real-provider mode is explicitly configured, not implicit.
- Core metrics include schema validity, quote invariant adherence, and stability
  across runs.
- Variance reporting quantifies extraction-count spread between runs.
- CI always executes deterministic suite paths.

## Prompt-12 anti-drift summary (5 bullets)

- Portability is demonstrated with runnable examples, not only documentation
  claims.
- Node/Deno/Bun examples execute the same extraction scenario through core APIs.
- Workers example runs the same fake-provider path without secrets.
- Commands for each runtime are documented in `docs/PORTABILITY.md`.
- Example outputs are expected to match across runtimes.

## Prompt-13 anti-drift summary (5 bullets)

- Orphan checks validate contracts, exports-to-doc coverage, and runtime example
  smoke tests.
- Coherence checks fail fast when docs or contracts drift from code exports.
- Roadmap and non-goal docs are explicit and versioned with the codebase.
- Portability examples are treated as executable artifacts, not prose-only docs.
- System-wide consistency is enforced as part of default check workflow.

## Invariants

- Offsets use UTF-16 code unit indexing with inclusive `charStart` and exclusive
  `charEnd`.
- Final extraction records must include top-level `offsetMode`, `charStart`, and
  `charEnd` fields and a mirrored `span` view.
- `assertQuoteInvariant` validates supported offset mode, top-level/span
  consistency, bounds, and exact quote matching.
- Normalization emits a ledger entry per step with explicit mapping strategy.

## Portability Constraints

- Core uses `crypto.subtle` for hashing.
- Core does not require filesystem access.
- Runtime-specific adapters are isolated behind dedicated entrypoints.

## Schema Subset Rules

- Supported builders: `string`, `number`, `boolean`, `literal`, `enum`, `array`,
  `object`, `union`, `optional`.
- Validator is strict on object properties by default and rejects unexpected
  keys.
- Error paths follow JSON Pointer escaping (`~` to `~0`, `/` to `~1`).
- Validator caps recursion depth and error volume for deterministic bounded
  execution.

## JSON Pipeline Rules

- `extractFirstJson()` scans text left-to-right and returns the first complete
  JSON object or array slice.
- Allowed repairs: strip BOM, remove disallowed ASCII control chars, trim
  wrapper junk around the first extracted JSON slice, remove trailing commas
  before `]` or `}`.
- Repair order is fixed and one-pass per step to preserve bounded behavior.
- Parse failures must surface a structured `JsonParseError` object, not a raw
  uncaught exception.

## Chunking Semantics

- `chunkDocument()` uses fixed-size character windows and fixed overlap.
- `start` is inclusive and `end` is exclusive for every shard.
- Empty input still emits one shard (`start=0`, `end=0`) to preserve
  deterministic execution flow.
- `mapShardSpanToDocument()` validates local span bounds before translating to
  global offsets.

## Overlap Tradeoffs

- Higher overlap increases cross-boundary recall but raises provider calls and
  duplicate candidates.
- Lower overlap is cheaper but risks missing entities split at shard boundaries.

## Resume and Retry Rules

- Checkpoint key format: `ckpt:v1:<runId>:<shardId>`.
- `executeShardsWithCheckpoint()` first checks checkpoints and bypasses
  completed shards.
- Retry policy is explicit (`attempts`, `baseDelayMs`, `maxDelayMs`,
  `jitterRatio`) and bounded.
- Non-transient failures are surfaced immediately without additional retries.
- Run diagnostics must classify emptiness (`empty_by_evidence` vs
  `empty_by_failure`) and run completeness (`complete_success`,
  `partial_success`, `complete_failure`).

## Provider Contract Rules

- Providers implement `generate(request)` and return deterministic `runRecord`
  metadata.
- Provider config is explicit through request/config objects; provider code does
  not read secrets implicitly.
- `FakeProvider` is the default deterministic harness for end-to-end tests
  without network access.
- Real providers expose minimal fetch adapters for OpenAI/Gemini/Ollama with
  consistent `ProviderResponse` shape.

## Prompt Compiler Rules

- Trusted instructions and schema excerpt are emitted before document content.
- Document text is wrapped with `BEGIN_UNTRUSTED_DOCUMENT` and
  `END_UNTRUSTED_DOCUMENT`.
- Compiler output is deterministic for identical `(program, shard, options)`
  input.

## IO Portability Rules

- Core JSONL codec must not import `node:*` APIs.
- Node file IO lives only under `src/node/*` and is exposed through `./node`
  export.
- JSONL line type is `EvidenceBundle` and UTF-8 encoded.

## Visualization Rules

- `visualizeEvidenceBundle()` output must contain embedded styles, script
  payload, and rendering logic.
- Initial server-rendered HTML includes span index markers for basic no-JS
  inspection.

## Evaluation Rules

- `runSuite()` must run deterministically in fake-provider mode and report
  stable metrics.
- `uniqueExtractionStability` uses run-to-run deduped extraction-key overlap.
- Variance report includes run count and extraction count distribution stats.
