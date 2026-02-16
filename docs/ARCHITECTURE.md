# Architecture

## Current Modules

- `src/core/types.ts`: shared contracts and ledgers.
- `src/core/hash.ts`: cross-runtime SHA-256 via WebCrypto.
- `src/core/normalize.ts`: deterministic normalization and ledgering.
- `src/core/invariants.ts`: quote/offset invariant enforcement.
- `src/engine/chunk.ts`: character-window chunking with overlap and
  deterministic shard IDs.
- `src/engine/mapSpan.ts`: shard-local to global span mapping validation.
- `src/engine/checkpoint.ts`: checkpoint store interface and in-memory
  implementation.
- `src/engine/retry.ts`: pure retry/backoff/jitter policy helpers.
- `src/engine/execute.ts`: resumable shard executor with checkpoint skip +
  transient retries.
- `src/engine/run.ts`: provider-driven end-to-end extraction orchestration.
- `src/engine/promptCompiler.ts`: deterministic boundary-safe prompt
  construction.
- `src/eval/runSuite.ts`: deterministic and variance-aware evaluation harness.
- `src/io/jsonl.ts`: runtime-agnostic JSONL encode/decode for evidence bundles.
- `src/viz/html.ts`: self-contained HTML visualization generator for grounded
  spans.
- `src/json/extractJson.ts`: deterministic first-JSON extraction and
  JSON-vs-JSONL detection.
- `src/json/repair.ts`: bounded repair pipeline with forensic step logs.
- `src/json/parse.ts`: strict parser with structured error details.
- `src/providers/types.ts`: provider request/response interfaces and run
  metadata contract.
- `src/providers/errors.ts`: transient/permanent classification helpers.
- `src/providers/requestHash.ts`: deterministic request-hash helper for provider
  harnesses.
- `src/providers/fake.ts`: deterministic fake provider for tests and offline
  runs.
- `src/providers/openai.ts`: OpenAI Chat Completions adapter with optional
  structured output mode.
- `src/providers/gemini.ts`: Gemini `generateContent` adapter with optional
  response schema.
- `src/providers/ollama.ts`: Ollama `/api/chat` adapter with JSON/schema format
  mode.
- `src/node/fs.ts`: Node-only JSONL file adapter exposed via `ekchylisma/node`.
- `examples/node/render-viz.ts`: Node example that writes visualization HTML
  output.
- `examples/shared/scenario.ts`: shared portability scenario used by
  Node/Deno/Bun/Workers.
- `examples/node/basic.ts`, `examples/deno/basic.ts`, `examples/bun/basic.ts`:
  runtime portability examples.
- `examples/workers/worker.ts`: minimal Worker handler running fake-provider
  extraction path.
- `.github/workflows/ci.yml`: deterministic CI checks across Node, Deno, and
  Bun.
- `scripts/orphan-check.ts`: repository-check entrypoint for
  docs/contracts/exports coherence and runtime example smoke checks.
- `src/schema/schemaCue.ts`: dependency-free schema DSL with TypeScript
  inference.
- `src/schema/validate.ts`: deterministic validator with JSON pointer errors.
- `src/schema/toJsonSchema.ts`: limited JSON Schema subset generator.
- `contracts/`: JSON Schema representations of external contracts.
- `scripts/*`: canonical script entrypoints; each forwards to `tools/*`
  implementation modules for backward compatibility.

## Boundary Rules

- Core modules are runtime-agnostic and web-API-first.
- Node-specific APIs are not used in core.
- External docs and contract schemas are versioned with code.

## Canonical Layout

- `src/core`, `src/engine`, `src/json`, `src/providers`, `src/schema`,
  `src/eval`, `src/evidence`, `src/io`, `src/viz`: runtime-agnostic library
  modules.
- `src/node`: Node-only adapters exposed through `ekchylisma/node`.
- `scripts`: canonical repository check entrypoints used by `package.json`
  scripts and CI.
- `tools`: implementation modules used by script entrypoints for compatibility
  and test reuse.
