# Decisions (ADR Log)

## ADR-0001: Bootstrap main directly for initial commit
- Date: 2026-02-14
- Context: Repository had no `HEAD` and no remote `main`, but the prompt suite requires PR-only workflow with `main` as base.
- Decision: Created the root commit directly on `main` with `MASTER_SPEC.md`, `.gitignore`, and `README.md`, then pushed `main`.
- Rationale: This is the only explicit exception allowed by the seed instructions before PR workflow can begin.
- Consequence: All substantive changes from prompt `01` onward are PR-only.

## ADR-0002: Normalization mapping strategy is explicitly non-reversible in prompt 01
- Date: 2026-02-14
- Context: Prompt 01 requires each normalization step to record a mapping strategy even if only non-reversible.
- Decision: `normalizeNewlines` and `trimTrailingWhitespacePerLine` both emit `mappingStrategy: "not_reversible"`.
- Rationale: This is the smallest compliant implementation while preserving ledger auditability.
- Consequence: Later prompts can upgrade to reversible mappings without breaking the ledger contract.

## ADR-0003: Schema generator targets a strict JSON Schema subset
- Date: 2026-02-14
- Context: Prompt 02 requires a JSON Schema generator without external dependencies while preserving portability.
- Decision: Generate only a strict subset (`type`, `properties`, `items`, `enum`, `const`, `required`, `additionalProperties`, `anyOf`).
- Rationale: A subset keeps provider integration deterministic and avoids broad, runtime-specific schema behavior.
- Consequence: Unsupported keywords are intentionally not generated.

## ADR-0004: JSON repair policy is bounded and allow-listed
- Date: 2026-02-14
- Context: Prompt 03 requires deterministic extraction+repair+parse while avoiding unbounded or speculative rewrites.
- Decision: Repairs are limited to four one-pass transforms in fixed order: `stripBOM`, `removeAsciiControlChars`, `trimOuterJunk`, `fixTrailingCommas`.
- Rationale: Bounded transforms improve auditability and reduce the risk of hidden semantic mutations.
- Consequence: Inputs requiring broader mutation fail with structured parse diagnostics instead of silent coercion.

## ADR-0005: Shard identity uses program hash + normalized shard text
- Date: 2026-02-14
- Context: Prompt 04 requires resumable chunk execution with deterministic shard IDs.
- Decision: `shardId = sha256(programHash + normalizedTextSlice)` and chunk boundaries are char-based with inclusive `start`, exclusive `end`.
- Rationale: Pairing program and content isolates shards across extraction programs while keeping IDs portable.
- Consequence: Changing normalization or chunk options changes shard IDs by design.

## ADR-0006: Checkpoint key format and idempotent resume behavior
- Date: 2026-02-14
- Context: Prompt 05 requires survivable partial failure and deterministic resume semantics.
- Decision: Checkpoints are addressed by `ckpt:v1:<runId>:<shardId>` and executor reuses existing checkpoint values before invoking shard work.
- Rationale: Explicit run+shard scoping prevents collisions and preserves idempotent reruns.
- Consequence: Re-running with the same `runId` skips completed shards; changing `runId` creates an isolated checkpoint namespace.

## ADR-0007: Provider core uses deterministic request hashing and explicit error classes
- Date: 2026-02-14
- Context: Prompt 06 requires provider abstraction and offline deterministic testing.
- Decision: Define `Provider` request/response contracts, classify provider failures (`transient`/`permanent`), and use `FakeProvider` mapping by request hash.
- Rationale: Deterministic provider behavior is required for reproducible engine tests without network I/O.
- Consequence: End-to-end tests can run locally and still enforce quote invariants using realistic provider contracts.

## ADR-0008: Real providers are explicit fetch adapters without implicit env access
- Date: 2026-02-14
- Context: Prompt 07 requires OpenAI/Gemini/Ollama implementations with portable, dependency-free boundaries.
- Decision: Implement provider classes that accept config objects (`apiKey`, `baseUrl`, etc.), use `fetch` exclusively, and never read `process.env` internally.
- Rationale: Explicit config keeps core portable and testable across Node, Deno, Bun, and Workers.
- Consequence: Integration tests require caller-provided credentials and are skipped when env vars are missing.

## ADR-0009: Prompt compiler enforces trusted/untrusted boundary markers
- Date: 2026-02-14
- Context: Prompt 08 requires boundary-safe deterministic prompt formatting.
- Decision: Compiler always emits trusted program section first, then wraps shard text in fixed markers: `BEGIN_UNTRUSTED_DOCUMENT` / `END_UNTRUSTED_DOCUMENT`.
- Rationale: Explicit boundaries mitigate prompt-injection confusion and keep format stable for testing.
- Consequence: Provider request builders rely on compiler output rather than ad-hoc string templates.

## ADR-0010: Core JSONL codec with isolated Node file adapter
- Date: 2026-02-14
- Context: Prompt 09 requires JSONL IO without introducing filesystem coupling in core.
- Decision: Implement codec in `src/io/jsonl.ts` and isolate filesystem helpers in `src-node/fs.ts` under `./node` export.
- Rationale: Keeps core portable across Node, Deno, Bun, and Workers while preserving ergonomic Node file utilities.
- Consequence: Consumers must import `ekchylisma/node` for fs-backed helpers.
